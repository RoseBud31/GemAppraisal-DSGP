from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import joblib
import xgboost as xgb
import json

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})  # Allows all origins

# Load the trained model
model = joblib.load("models/xgb_price_predict_model.pkl")

# Load the JSON file
with open("encoded_features.json", "r") as file:
    encoded_features = json.load(file)

# Define the API endpoint
@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.form
        
        # Validate required fields
        required_fields = ['carat', 'cutQuality', 'shape', 'origin', 'color',
                         'colorIntensity', 'clarity', 'cut', 'treatment', 'type']
        for field in required_fields:
            if not data.get(field):
                return jsonify({"error": f"Missing required field: {field}"}), 400

        # Handle file upload
        if 'file' in request.files:
            file = request.files['file']
            if file.filename != '':
                # Add your file processing logic here
                pass

        # Convert parameters with error handling
        try:
            carat = float(data.get("carat"))
            cut_quality_encoded = float(encoded_features["cut_quality_mapping"][data.get("cutQuality")])
            shape_encoded = float(encoded_features["shape_mapping"][data.get("shape")])
            origin_encoded = float(encoded_features["origin_mapping"][data.get("origin")])
            color_encoded = float(encoded_features["color_mapping"][data.get("color")])
            color_intensity_encoded = float(encoded_features["color_intensity_mapping"][data.get("colorIntensity")])
            clarity_encoded = float(encoded_features["clarity_mapping"][data.get("clarity")])
            cut_encoded = float(encoded_features["cut_mapping"][data.get("cut")])
            treatment_encoded = float(encoded_features["treatment_mapping"][data.get("treatment")])
            type_encoded = float(encoded_features["type_mapping"][data.get("type")])
        except ValueError as e:
            return jsonify({"error": f"Invalid numeric value: {str(e)}"}), 400

        # Create model input for price prediction
        model_input = np.array([[carat, cut_quality_encoded, shape_encoded, origin_encoded,
                               color_encoded, color_intensity_encoded, clarity_encoded,
                               cut_encoded, treatment_encoded, type_encoded]])

        # Make prediction for price
        prediction = np.expm1(model.predict(model_input)[0])

        return jsonify({"price": float(prediction)})

    except ValueError as ve:
        return jsonify({"error": f"Input validation error: {str(ve)}"}), 400
    except Exception as e:
        app.logger.error(f"Prediction error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

if __name__ == "__main__":
    app.run(debug=True)
