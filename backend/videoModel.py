from flask import Blueprint, request, jsonify
import os
import cv2
import numpy as np
import pandas as pd
import joblib
from PIL import Image
from rembg import remove
from skimage.feature import graycomatrix, graycoprops


# Blueprint for video-related routes
video_routes = Blueprint("video_routes", __name__)

UPLOAD_FOLDER = "uploads"
PROCESSED_FOLDER = "processed"
MODEL_PATH = "models/xgb_price_predict_model.pkl"
CLASSIFICATION_MODEL_PATH = "models/videoModel.joblib"
ENCODED_FEATURES_PATH = "encoded_features.json"
TRAINING_DATA_PATH = "datafile/updated_encoded.csv"


os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)

# Load the models
price_model = joblib.load(MODEL_PATH)

training_data = pd.read_csv(TRAINING_DATA_PATH)

# Extract target column names (from index 1 to 92, representing B to CN)
target_columns = training_data.columns[1:92].tolist()


# ---------------------- Frame Extraction ----------------------

def extract_frames(video_path, output_folder):

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frames_per_second = 2
    frame_interval = int(fps / frames_per_second) if fps > 0 else 1  # Compute interval

    frame_count = 0
    success, frame = cap.read()
    os.makedirs(output_folder, exist_ok=True)

    while success:
        if frame_count % frame_interval == 0:
            frame_file = os.path.join(output_folder, f"frame_{frame_count}.jpg")
            cv2.imwrite(frame_file, frame)
        success, frame = cap.read()
        frame_count += 1

    cap.release()

# ---------------------- Preprocess the images----------------------


def process_image(image_path, output_folder="processed_images"):

    # Ensure the output folder exists
    os.makedirs(output_folder, exist_ok=True)

    # Open the image
    img = Image.open(image_path)

    left = 0
    top = (img.height - 720) / 2
    right = 720
    bottom = top + 720

    # Crop the image correctly
    cropped_img = img.crop((left, top, right, bottom))

    img_no_bg = remove(cropped_img)

    processed_image_path = os.path.join(output_folder, os.path.basename(image_path))
    processed_image_path = processed_image_path.replace(".jpg", ".png").replace(".jpeg", ".png")  # Save as PNG

    # Save the processed image with transparency
    img_no_bg.save(processed_image_path, "PNG")

    print(f" Processed image saved at: {processed_image_path}")

    return processed_image_path

# ---------------------- Color feature extraction----------------------


def extract_color_features(image_path):
    image = cv2.imread(image_path)
    if image is None:
        print(f"Error loading image: {image_path}")
        return None

    pil_img = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))

    # Remove background correctly
    img_no_bg = remove(pil_img)
    img_no_bg = np.array(img_no_bg)

    # Ensure it has 3 channels (RGB)
    if img_no_bg.shape[-1] == 4:  # If alpha channel exists, remove it
        img_no_bg = cv2.cvtColor(img_no_bg, cv2.COLOR_RGBA2RGB)

    avg_r = np.mean(img_no_bg[:, :, 0])
    avg_g = np.mean(img_no_bg[:, :, 1])
    avg_b = np.mean(img_no_bg[:, :, 2])

    return {
        "Image": os.path.basename(image_path),
        "Avg Red": avg_r,
        "Avg Green": avg_g,
        "Avg Blue": avg_b,
    }


# ---------------------- Cut feature extraction----------------------
def extract_geometric_features(image_path):
    features = {}
    image = cv2.imread(image_path)
    if image is None:
        print(f"Warning: Unable to read image {image_path}. Skipping.")
        return None

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, threshold1=50, threshold2=150)
    contours, _ = cv2.findContours(edges.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return None

    contour = max(contours, key=cv2.contourArea)

    x, y, w, h = cv2.boundingRect(contour)
    aspect_ratio = float(w) / h if h != 0 else 0
    perimeter = cv2.arcLength(contour, True)
    area = cv2.contourArea(contour)
    circularity = (4 * np.pi * area) / (perimeter ** 2) if perimeter != 0 else 0

    hull = cv2.convexHull(contour)
    hull_area = cv2.contourArea(hull)
    convexity = area / hull_area if hull_area != 0 else 0
    edge_sharpness = cv2.Laplacian(gray, cv2.CV_64F).var()

    flipped_horizontal = cv2.flip(gray, 1)
    symmetry_horizontal = cv2.absdiff(gray, flipped_horizontal)
    horizontal_symmetry_score = 1 - (np.mean(symmetry_horizontal) / 255)

    flipped_vertical = cv2.flip(gray, 0)
    symmetry_vertical = cv2.absdiff(gray, flipped_vertical)
    vertical_symmetry_score = 1 - (np.mean(symmetry_vertical) / 255)

    symmetry = (horizontal_symmetry_score + vertical_symmetry_score) / 2

    features['Image'] = os.path.basename(image_path)
    features['Aspect_Ratio'] = aspect_ratio
    features['Perimeter'] = perimeter
    features['Area'] = area
    features['Circularity'] = circularity
    features['Convexity'] = convexity
    features['Edge_Sharpness'] = edge_sharpness
    features['Symmetry'] = symmetry

    return features

# ---------------------- Clarity feature extraction----------------------


def extract_clarity_features(image_path):
    features = {}
    image = cv2.imread(image_path)
    if image is None:
        return None

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    glcm = graycomatrix(gray, distances=[1], angles=[0], levels=256, symmetric=True, normed=True)
    features['Contrast'] = graycoprops(glcm, 'contrast')[0, 0]
    features['Homogeneity'] = graycoprops(glcm, 'homogeneity')[0, 0]
    features['Energy'] = graycoprops(glcm, 'energy')[0, 0]
    features['Correlation'] = graycoprops(glcm, 'correlation')[0, 0]

    edges = cv2.Canny(gray, threshold1=50, threshold2=150)
    features['Edge_Density'] = np.sum(edges) / (gray.shape[0] * gray.shape[1])
    features['Intensity_Variance'] = np.var(gray)

    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    hue_std = np.std(hsv[:, :, 0])
    saturation_std = np.std(hsv[:, :, 1])
    features['Hue_Std'] = hue_std
    features['Saturation_Std'] = saturation_std

    features['Image'] = os.path.basename(image_path)

    return features

# ---------------------- Combining all the 3 features into 1 file----------------------


def process_images(input_folder, output_folder):
    extracted_features = []  # Store feature dictionaries

    for filename in os.listdir(input_folder):
        if filename.endswith(('.png', '.jpg', '.jpeg')):
            image_path = os.path.join(input_folder, filename)

            # Dynamically check if functions exist before calling them
            color_features = globals().get("extract_color_features", lambda x: {})(image_path) or {}
            cut_features = globals().get("extract_geometric_features", lambda x: {})(image_path) or {}
            clarity_features = globals().get("extract_clarity_features", lambda x: {})(image_path) or {}

            # Combine all extracted features into a single row
            combined_features = {**color_features, **cut_features, **clarity_features}

            # Append to the list
            extracted_features.append(combined_features)

    # Convert to DataFrame
    if extracted_features:
        df = pd.DataFrame(extracted_features)
        os.makedirs(output_folder, exist_ok=True)  # Ensure output directory exists

        # Save to CSV
        output_file = os.path.join(output_folder, 'combined_features.csv')
        df.to_csv(output_file, index=False)
        print(f" Features saved to {output_file}")
    else:
        print(" No features extracted. Check image files or feature extraction functions.")

# ---------------------- Frontend and backend connection----------------------


"""
When a video is uploaded, frames are extracted, the extracted frames are preprocessed and Feature
extraction will be done for the pre-processed images and combining all the features into a
single file.
"""


@video_routes.route("/upload_video", methods=["POST"])
def upload_video():
    """API endpoint to process a video, extract frames, preprocess images, and classify them."""

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    # Save uploaded video
    video_path = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(video_path)

    # Step 1: Extract frames and store them in the "frames" folder
    frames_folder = os.path.join(PROCESSED_FOLDER, "frames")
    extract_frames(video_path, frames_folder)

    # Step 2: Process extracted frames and save preprocessed images in "preprocessed" folder
    preprocessed_folder = os.path.join(PROCESSED_FOLDER, "preprocessed")
    os.makedirs(preprocessed_folder, exist_ok=True)

    preprocessed_paths = []
    for frame in os.listdir(frames_folder):
        frame_path = os.path.join(frames_folder, frame)
        processed_path = process_image(frame_path, preprocessed_folder)  # Process and store preprocessed image
        preprocessed_paths.append(processed_path)

    # Step 3: Extract features from **preprocessed images** instead of frames
    feature_list = []
    for image_path in preprocessed_paths:
        # Extract features from preprocessed image
        color_features = extract_color_features(image_path) or {}
        cut_features = extract_geometric_features(image_path) or {}
        clarity_features = extract_clarity_features(image_path) or {}

        # Combine extracted features
        combined_features = {**color_features, **cut_features, **clarity_features}

        if combined_features:  # Avoid adding empty dictionaries
            feature_list.append(combined_features)

    # Ensure features were extracted
    if not feature_list:
        return jsonify({"error": "No features extracted from preprocessed images"}), 500

    # Convert to DataFrame and clean
    feature_df = pd.DataFrame(feature_list).fillna(0)

    # Save extracted features
    feature_output_path = os.path.join(PROCESSED_FOLDER, "feature_extraction", "combined_features.csv")
    os.makedirs(os.path.dirname(feature_output_path), exist_ok=True)
    feature_df.to_csv(feature_output_path, index=False)
    print(f" Extracted features saved to {feature_output_path}")

    # ----------------------  Reformat Dataset and Place Combined Columns ----------------------

    # Reload the original dataset
    data = feature_df.copy()

    columns = [str(i) for i in range(18)]
    data = data.drop(columns=columns, errors='ignore')

    # column order matches model expectations
    if "CO" in data.columns:
        co_index = data.columns.get_loc("CO")
        data = data.iloc[:, co_index:]
    else:
        data = pd.DataFrame()  # Reset to empty DataFrame if CO is missing

    # Remove all columns after DR
    if "DR" in data.columns:
        dr_index = data.columns.get_loc("DF") + 1
        data = data.iloc[:, :dr_index]

    # Ensure at least 92 columns before appending Combined data
    while len(data.columns) < 92:
        data[f'Placeholder_{len(data.columns)}'] = None

    data_final = pd.concat([data, feature_df], axis=1)

    # Save final structured dataset
    updated_path = os.path.join(PROCESSED_FOLDER, "feature_extraction", "fixedCombined.csv")
    data_final.to_csv(updated_path, index=False)

    # ----------------------  Load and Predict with Trained Model ----------------------

    # Load the trained model
    model = joblib.load(CLASSIFICATION_MODEL_PATH)

    data = pd.read_csv(updated_path)

    # only the 18 features used for training are selected
    expected_feature_count = 18
    data = data.iloc[:, -expected_feature_count:]

    # Make predictions using the trained model
    predictions = model.predict(data)

    # Convert predictions to DataFrame with correct target column names
    if predictions.shape[1] == len(target_columns):
        predicted_df = pd.DataFrame(predictions, columns=target_columns)
    else:
        print("Warning: Number of predicted columns does not match expected column names.")
        predicted_df = pd.DataFrame(predictions[:, :len(target_columns)], columns=target_columns[:predictions.shape[1]])

    # Save predictions
    predicted_csv = os.path.join(PROCESSED_FOLDER, "feature_extraction", "predicted_targets.csv")
    predicted_df.to_csv(predicted_csv, index=False)

    print(f"Predicted target labels saved to {predicted_csv}")

    # ----------------------  Extract Final Top Targets ----------------------

    # Load the predicted target dataset
    data = pd.read_csv(predicted_csv)

    # Define categories and their respective prefixes
    categories = {
        "Color": "Color_",
        "Shape": "Shape_",
        "Cut": "Cut_",
        "Clarity": "Clarity_",
        "Color Intensity": "Color Intensity_"
    }

    # Find the most frequent `1` column in each category
    selected_values = {}
    for category, prefix in categories.items():
        category_columns = [col for col in data.columns if col.startswith(prefix)]
        if category_columns:
            ones_count = data[category_columns].eq(1).sum()
            if ones_count.max() > 0:
                top_column = ones_count.idxmax()
                selected_values[category] = top_column.replace(prefix, "")
            else:
                selected_values[category] = "Unknown"

    # Create a single-row DataFrame with selected attributes
    final_data = pd.DataFrame([selected_values])

    # Save the final result
    final_output_csv = os.path.join(PROCESSED_FOLDER, "feature_extraction", "final_top_targets.csv")
    final_data.to_csv(final_output_csv, index=False)

    print(f"Final top target attributes saved in {final_output_csv}")

    # Return results as JSON for frontend use
    return jsonify({
        "message": "Processing complete",
        "final_output": final_output_csv,
        "predicted_attributes": selected_values
    })
