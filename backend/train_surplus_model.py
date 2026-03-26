import json
import os
from datetime import datetime, UTC

import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

from surplus_model import FEATURES


DEFAULT_DATASET_PATH = r"E:\Admin\final_merged_ai_dataset.csv"
DEFAULT_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "models", "surplus_model.json")


def train_model(dataset_path, output_path):
    df = pd.read_csv(dataset_path)

    required_columns = set(FEATURES + ["surplus"])
    missing_columns = required_columns.difference(df.columns)
    if missing_columns:
        raise ValueError(f"Dataset is missing required columns: {sorted(missing_columns)}")

    X = df[FEATURES]
    y = df["surplus"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    imputer = SimpleImputer(strategy="median")
    X_train_imputed = imputer.fit_transform(X_train)
    X_test_imputed = imputer.transform(X_test)

    model = LinearRegression()
    model.fit(X_train_imputed, y_train)
    predictions = model.predict(X_test_imputed)

    artifact = {
        "trained_at": datetime.now(UTC).isoformat(),
        "dataset_path": dataset_path,
        "feature_names": FEATURES,
        "medians": {
            feature: float(value)
            for feature, value in zip(FEATURES, imputer.statistics_)
        },
        "coefficients": {
            feature: float(value)
            for feature, value in zip(FEATURES, model.coef_)
        },
        "intercept": float(model.intercept_),
        "metrics": {
            "mae": float(mean_absolute_error(y_test, predictions)),
            "r2": float(r2_score(y_test, predictions)),
            "test_rows": int(len(X_test)),
        },
        "dataset_summary": {
            "rows": int(len(df)),
            "columns": int(len(df.columns)),
            "target": "surplus",
            "note": "This dataset encodes surplus directly from operational inputs, so the trained model learns a near-exact arithmetic mapping rather than future demand behavior.",
        },
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as file:
        json.dump(artifact, file, indent=2)

    return artifact


if __name__ == "__main__":
    dataset_path = os.getenv("SURPLUS_DATASET_PATH", DEFAULT_DATASET_PATH)
    output_path = os.getenv("SURPLUS_MODEL_OUTPUT", DEFAULT_OUTPUT_PATH)
    artifact = train_model(dataset_path, output_path)

    print("Training complete")
    print(json.dumps({
        "output_path": output_path,
        "rows": artifact["dataset_summary"]["rows"],
        "mae": round(artifact["metrics"]["mae"], 8),
        "r2": round(artifact["metrics"]["r2"], 8),
    }, indent=2))
