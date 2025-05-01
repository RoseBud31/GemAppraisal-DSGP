import { useState, useEffect } from "react";
import axios from "axios";
import FileUpload from "./FileUpload.jsx";
import Footer from "./Footer.jsx";
import Navbar from "./Navbar.jsx";
import Disclaimer from "./Disclaimer.jsx";
import Banner from "./Banner.jsx";
import { useAuth } from "./AuthContext";
import jsonData from "./encoded_features.json";
import Loader from "./Loader.jsx";
import LoaderInfo from "./LoaderInfo.jsx";
import LoaderRound from "./LoaderRound.jsx";

// api for backend
const API_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:5000";


// Dropdown component
function Dropdown({ label, name, options, value, onChange }) {
  return (
    <div className="form-control w-full">
      <label className="form-control w-full max-w-xs block font-medium text-gray-700">{label}: </label>
      <div className="mt-2">
      <select 
        name={name} 
        value={value}
        onChange={onChange} 
        className="select shadow rounded py-2 px-3 text-gray-700 focus:outline-none focus:shadow-outline w-full"
      >
        <option value=""></option>
        {Object.entries(options).map(([key, value]) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>
      </div>
    </div>
  );
}

// Input Box component
function InputText({ label, name, value, onChange }) {
  return (
    <div className="form-control w-full">
      <label className="form-control w-full max-w-xs block font-medium text-gray-700">{label}: </label>
      <div className="mt-2">
      <input 
        name={name} 
        type='text' 
        value={value}
        onChange={onChange} 
        className="shadow rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:shadow-outline" 
      />
      </div>
    </div>
  );
}

const PriceCalculator = () => {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState(null);
  const [resetFile, setResetFile] = useState(false); // Track if file needs to be reset
  const [formError, setFormError] = useState("");
  const { user } = useAuth();
  const [selectedValues, setSelectedValues] = useState({
    carat: "",
    cutQuality: "",
    shape: "",
    origin: "",
    color: "",
    colorIntensity: "",
    clarity: "",
    treatment: "",
    cut: "",
    type: "",
  });




  // Define allowed color options for each type
  const typeColorMapping = {
    "Pink Sapphire": ["Pink", "Pinkish Purple", "Purplish Pink", "Reddish Pink", "Pinkish Brown"],
    "Blue Sapphire": ["Blue", "Bluish Green", "Bluish Grey", "Bluish Purple", "Greenish Blue", "Greyish Blue", "Purplish Blue", "Color Change"],
    "Green Sapphire": ["Green", "Bluish Green", "Greenish Blue", "Greenish Yellow", "Yellowish Green"],
    "Padparadscha Sapphire": ["Padparadscha (Pinkish-Orange / Orangish-Pink)"],
    "Ruby": ["Red", "Orangish Red", "Purplish Red", "Pinkish Red"],
    "White Sapphire": ["White"],
    "Yellow Sapphire": ["Yellow", "Greenish Yellow", "Yellowish Brown", "Yellowish Orange", "Orangish Yellow", "Yellowish Green"],
    "Purple Sapphire": ["Purple", "Pinkish Purple", "Purplish Pink", "Purplish Red", "Bluish Purple", "Violet"],
  };

    //  get Type from Color
  const getTypeFromColor = (color) => {
    for (const [type, colors] of Object.entries(typeColorMapping)) {
      if (colors.includes(color)) {
        return type;
      }
    }
    return ""; // Return empty string if no match
  };

  //  get color from tyoe
  const getColorFromType = (type) => {
  return typeColorMapping[type] ? typeColorMapping[type][0] : "";
};



   // Filter color options based on selected type
   const getFilteredColorOptions = () => {
    const selectedType = selectedValues.type;
    if (selectedType && typeColorMapping[selectedType]) {
      // Filter the full color options to only include allowed colors
      const allowedColors = typeColorMapping[selectedType];
      return Object.fromEntries(
        Object.entries(jsonData.color_mapping).filter(([key]) =>
          allowedColors.includes(key)
        )
      );
    }
    // If no type is selected or no mapping exists, return all colors
    return jsonData.color_mapping;
  };
  

  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setSelectedValues((prev) => {
      const newValues = { ...prev, [name]: value };
      // Reset color if type changes
      if (name === "color") {
            newValues.type = getTypeFromColor(value);
      }
      if (name === "type") {
      newValues.color = getColorFromType(value);
      }
      return newValues;
    });
  };

  // Validation for form
  const validateForm = () => {
    // Check if all required fields are filled
    for (const key in selectedValues) {
      if (!selectedValues[key]) {
        return false; // Field is missing
      }
    }
    // Ensure carat value is greater than 0.1
    if (selectedValues.carat < 0.1) {
      return false;
    }
    return true; // All fields are filled
  };

  const classify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setPrediction(null);
  
    if (!file) {
        setError("Please select a file before classifying.");
        setLoading(false);
        return;
    }
  
    const formData = new FormData();
    formData.append("file", file.file);
  
    // Debugging log
    console.log("Uploading file:", file.file);
  
    try {
        const response = await axios.post(`${API_URL}/classify`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });
  
        console.log("Server Response:", response.data);
  
        if (response.data.error) {
            console.error("Backend Error:", response.data.error);
            setError(response.data.error);
            setLoading(false);
            return;
        }
  
        const { predicted_class, probabilities, attributes } = response.data;
  
        setSelectedValues((prev) => ({
            ...prev,
            color: attributes?.color || "",
        }));
  
        setPrediction({ predicted_class, probabilities });
  
    } catch (err) {
        console.error("Prediction Error:", err.response ? err.response.data : err.message);
        setError("Error processing the classification. Please try again.");
    } finally {
        setLoading(false);
    }
  };
  
  
  


  // Handle video submission
  const handleSubmit = async (e) => {
      e.preventDefault();
      setLoading(true);
      setError("");
      setPrediction(null);

      if (!file) {
          setError("No file detected. Please upload a video.");
          setLoading(false);
          return;
      }

      // Check if uploaded file is a video
      const allowedVideoTypes = ["video/mp4", "video/avi", "video/mov", "video/mkv"];
      if (!allowedVideoTypes.includes(file.file.type)) {
          setError("Invalid file type. Please upload a video.");
          setLoading(false);
          return;
      }

      const formData = new FormData();
      if (file) formData.append("file", file.file);

      try {
          // Send video file to backend
          const response = await axios.post(`${API_URL}/video/upload_video`, formData, {
              headers: { "Content-Type": "multipart/form-data" },
          });

          if (response.data.error) {
              setError(response.data.error);
              return;
          }

          // Log received attributes
          console.log("Extracted attributes from backend:", response.data.predicted_attributes);

          // Get the gemstone properties predicted by backend
          const attributes = response.data.predicted_attributes;

          if (!attributes) {
              setError("Failed to extract attributes from video.");
              return;
          }

          // Auto-fill dropdowns with predicted gemstone attributes
          setSelectedValues((prev) => {
            const newValues = {
              ...prev,
              color: attributes.Color || "",  
              shape: attributes.Shape || "",  
              cut: attributes.Cut || "",  
              clarity: attributes.Clarity || "",  
              colorIntensity: attributes["Color Intensity"] || "",
            };

            // Ensure Type is updated if Color is detected
            if (newValues.color) {
              newValues.type = getTypeFromColor(newValues.color);
            }

            return newValues;
          });

        

      } catch (err) {
          setError("Error processing the video. Please try again.");
          console.error("Prediction Error:", err.message);
      } finally {
          setLoading(false);
      }
  };
  

  //Handle picture submission
  const handleImageSubmit  = async (e) => {
      e.preventDefault();
      setLoading(true);
      setError("");
      setPrediction(null);

      if (!file) {
        setError("No file detected. Please upload an image.");
        setLoading(false);
        return;
      }

      const allowedImageTypes = ["image/jpeg", "image/png", "image/jpg"];
      if (!allowedImageTypes.includes(file.file.type)) {
        setError("Invalid file type. Please upload an image (JPEG, PNG, JPG).");
        setLoading(false);
        return;
      }

      const formData = new FormData();
      if (file) formData.append("file", file.file);

      try {
        const response = await axios.post(`${API_URL}/picture/upload_image`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        if (response.data.error) {
          setError(response.data.error);
          return;
        }

        const attributes = response.data.predicted_attributes;

        if (!attributes) {
          setError("Failed to extract attributes from image.");
          return;
        }

        setSelectedValues((prev) => ({
          ...prev,
          clarity: attributes.clarity || "",
          cut: attributes.cut || "",
          shape: attributes.shape || "",
        }));

      } catch (err) {
        setError("Error processing the image. Please try again.");
        console.error("Prediction Error:", err.message);
      } finally {
        setLoading(false);
      }
  };
  const handleImageSubmit2 = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setPrediction(null);
    
    if (!file) {
      setError("No file detected. Please upload an image.");
      setLoading(false);
      return;
    }
  
    const allowedImageTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedImageTypes.includes(file.file.type)) {
      setError("Invalid file type. Please upload an image (JPEG, PNG, JPG).");
      setLoading(false);
      return;
    }
  
    // Create a FormData object for uploading the image
    const formData = new FormData();
    formData.append("file", file.file);
  
    try {
      // First, send the file for classification (Classify pipeline)
      const classifyResponse = await axios.post(`${API_URL}/image/classify`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
  
      console.log("Classify Server Response:", classifyResponse.data);
  
      if (classifyResponse.data.error) {
        console.error("Backend Error:", classifyResponse.data.error);
        setError(classifyResponse.data.error);
        setLoading(false);
        return;
      }
  
      const { predicted_class, probabilities, attributes } = classifyResponse.data;

      // Check if the predicted class is non_sapphire
      if (predicted_class === "non_sapphire") {
        setError("This image may not contain a sapphire. Please upload a viable picture.");
        setLoading(false);
        return;
      }
      
      // Otherwise, update the selected values with predicted class and attributes
      setSelectedValues((prev) => ({
        ...prev,
        color: attributes?.color || "",
      }));
  
      // use something else to display probability setPrediction({ predicted_class, probabilities });
  
      // Then, get more information about the image (Upload Image pipeline)
      const uploadImageResponse = await axios.post(`${API_URL}/picture/upload_image`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
  
      if (uploadImageResponse.data.error) {
        setError(uploadImageResponse.data.error);
        setLoading(false);
        return;
      }
  
      const imageAttributes = uploadImageResponse.data.predicted_attributes;
  
      if (!imageAttributes) {
        setError("Failed to extract attributes from image.");
        setLoading(false);
        return;
      }
  
      // Update the selected values with additional attributes (clarity, cut, shape)
      setSelectedValues((prev) => ({
        ...prev,
        clarity: imageAttributes.clarity || "",
        cut: imageAttributes.cut || "",
        shape: imageAttributes.shape || "",
      }));
  
    } catch (err) {
      console.error("Error during classification or image upload:", err.message);
      setError("Error processing the classification or image upload. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  






  // PRICE PREDICT FUNCTION HANDLE SUMBIT
  const handlePricePrediction = async (e) => {
      e.preventDefault();
      setLoading(true);
      setError("");

      console.log("Submitting data for price prediction:", selectedValues);

      if (!validateForm()) {
          setError("Please ensure all required fields are filled.");
          setLoading(false);
          return;
      }

      try {
          const formData = new FormData();
          Object.entries(selectedValues).forEach(([key, value]) => {
              if (value) formData.append(key, value);
          });
          formData.append("user_id", user.id); 

          // Send filled form data for price prediction
          const response = await axios.post(`${API_URL}/predict`, formData, {
              headers: { "Content-Type": "multipart/form-data" },
          });

          console.log("Received response:", response.data);

          if (response.data.error) {
              setError(`Error: ${response.data.error}`);
          } else {
              setPrediction(response.data.price);
          }

      } catch (err) {
          console.error("Prediction Error:", err.response ? err.response.data : err.message);
          setError(`Error predicting price: ${err.response ? err.response.data.error : err.message}`);
      } finally {
          setLoading(false);
      }
  };





  
 // Handle form clear
  const handleClear = (e) => {
    e.preventDefault();
    setSelectedValues({
      carat: "",
      cutQuality: "",
      shape: "",
      origin: "",
      color: "",
      colorIntensity: "",
      clarity: "",
      treatment: "",
      cut: "",
      type: "",
    });
    setFile(null);
    setFormError("");
    setError("");
    setPrediction(null);
    setLoading(false);
  };
  

  // Function to format price
  const formatPrice = (price) => {
    if (typeof price !== "number") {
      return "N/A"; // Handle invalid prices
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  
  return (
    <>
    <Navbar />
    <Banner />
    <div className="md:pr-[20px] bg-white rounded-xl backdrop-filter backdrop-blur-lg w-full max-w-6xl mx-auto flex flex-col mt-10 z-60  border-2 border-gray-200 shadow-xl  pb-6 ">
      {/* Instruction Section */}
      <div className="px-6 py-4 mt-6 rounded-xl ml-[45px] mr-[20px]">
        <p className="text-gray-600 mt-2 text-base text-center"><b>How to Use the Price Calculator: </b>
          Upload an image or video of your sapphire or ruby to extract its features automatically. 
          <br />Alternatively, you can manually select the attributes below. Once all fields are filled, click "Predict Price" to estimate the gemstone's value.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-5xl z-60 mx-auto flex flex-col md:flex-row gap-10 mt-12 items-center md:items-start px-4 ">
      <div className="w-3/4">
        <FileUpload file={file} setFile={setFile} />
        <div className="mt-8 flex justify-center flex-col md:grid md:grid-cols-2 md:gap-x-5  w-full space-y-4 md:space-y-0">
        <button 
            type="button" 
            onClick={handleImageSubmit2} 
            className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded"
          >Extract Feature from Image</button>
          <button 
            type="button" 
            onClick={handleSubmit} 
            className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded"
          >Extract Feature from Video</button>
        </div>
      </div>
        <div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-10 w-full min-w-[390px] md:min-w-[500px]">
        <Dropdown className="w-full min-w-[500px]"        
          label="Type"         
          name="type"         
          options={jsonData.type_mapping}      
          value={selectedValues.type}   
          onChange={handleChange}         
        />  
        <InputText
        label="Carat" 
        name="carat"  
        value={selectedValues.carat}
        onChange={handleChange} 
      />
      
        <Dropdown
          label="Color" 
          name="color"
          options={getFilteredColorOptions()} // Dynamically filtered options
          value={selectedValues.color}
          onChange={handleChange}
          disabled={!selectedValues.type} // Disable if no type is selected
        />        
        <Dropdown
          label="Color Intensity"         
          name="colorIntensity"         
          options={jsonData.color_intensity_mapping}   
          value={selectedValues.colorIntensity}      
          onChange={handleChange}
        />
        <Dropdown
          label="Shape"
          name="shape"
          options={jsonData.shape_mapping}
          value={selectedValues.shape}
          onChange={handleChange}
        />
        <Dropdown
          label="Clarity"
          name="clarity"
          options={jsonData.clarity_mapping}         
          value={selectedValues.clarity}
          onChange={handleChange}        
        />     
        <Dropdown         
          label="Cut"         
          name="cut"         
          options={jsonData.cut_mapping}         
          value={selectedValues.cut}
          onChange={handleChange}         
        />   
      <Dropdown 
        label="Cut Quality" 
        name="cutQuality" 
        options={jsonData.cut_quality_mapping} 
        value={selectedValues.cutQuality}
        onChange={handleChange} 
      />
        
        <Dropdown
          label="Origin"
          name="origin"
          options={jsonData.origin_mapping}
          value={selectedValues.origin}
          onChange={handleChange}
        />
           
        <Dropdown
          label="Treatment"         
          name="treatment"         
          options={jsonData.treatment_mapping}         
          value={selectedValues.treatment}
          onChange={handleChange}         
        />        
             
        
        </div>
        <div className="flex flex-col md:grid md:grid-cols-2 md:gap-x-10 mt-10 w-full space-y-4 md:space-y-0">
          

            {/* Predict Price (Only after attributes are filled) */}
            
            <button 
              type="button" 
              onClick={handleClear} 
              className="bg-gray-500 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded"
            >
              Reset
            </button>
            <button type="button" onClick={handlePricePrediction} className={`bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded ${!validateForm() ? "opacity-50 cursor-not-allowed" : ""}`} disabled={!validateForm()}>
                Predict Price
            </button>
        </div>
        

        <div className="visibility-hidden">
        <p className="text-red-500 mt-4 visibility-hidden">{error}</p>
        <p className="text-red-500 mt-4 visibility-hidden">{formError}</p>
        
        </div>
        

        </div>
        
      </form>
      {loading && (
            <p className="mx-auto mt-4 transition duration-500 ease-in-out">
                <LoaderRound />
            </p>
        )}
        {prediction !== null && (
          <p className="text-right text-2xl text-gray-700 font-bold mx-auto mt-4 transition duration-500 ease-in-out lg:px-[340px] lg:mr-[45px] lg:ml-[67px] lg:text-white lg:bg-gray-700 lg:p-2 lg:rounded mb-[10px]">
            Estimated Price: {formatPrice(prediction)}
          </p>
        )}
    </div>
    <Disclaimer />
    <Footer />
    </>
  );
};

export default PriceCalculator;