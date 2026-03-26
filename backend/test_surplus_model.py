import argparse
import json
import math
import os

import pandas as pd

from surplus_model import FEATURES, load_trained_surplus_model
from train_surplus_model import DEFAULT_DATASET_PATH, DEFAULT_OUTPUT_PATH


def build_parser():
    parser = argparse.ArgumentParser(
        description="Batch-test the trained surplus model against a CSV dataset."
    )
    parser.add_argument(
        "--dataset",
        default=os.getenv("SURPLUS_DATASET_PATH", DEFAULT_DATASET_PATH),
        help="Path to the CSV dataset to evaluate.",
    )
    parser.add_argument(
        "--model",
        default=os.getenv("SURPLUS_MODEL_OUTPUT", DEFAULT_OUTPUT_PATH),
        help="Path to the trained model artifact JSON.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional number of rows to test.",
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=5,
        help="How many sample predictions to print.",
    )
    return parser


def safe_float(value):
    if pd.isna(value):
        return None
    return float(value)


def mae(actuals, predictions):
    return sum(abs(a - p) for a, p in zip(actuals, predictions)) / len(actuals)


def rmse(actuals, predictions):
    mse = sum((a - p) ** 2 for a, p in zip(actuals, predictions)) / len(actuals)
    return math.sqrt(mse)


def r2(actuals, predictions):
    mean_actual = sum(actuals) / len(actuals)
    ss_res = sum((a - p) ** 2 for a, p in zip(actuals, predictions))
    ss_tot = sum((a - mean_actual) ** 2 for a in actuals)
    if ss_tot == 0:
        return 1.0
    return 1 - (ss_res / ss_tot)


def main():
    args = build_parser().parse_args()
    model = load_trained_surplus_model(args.model)
    if model is None:
        raise FileNotFoundError(f"Model artifact not found: {args.model}")

    df = pd.read_csv(args.dataset)
    required_columns = set(FEATURES + ["surplus"])
    missing_columns = sorted(required_columns.difference(df.columns))
    if missing_columns:
        raise ValueError(f"Dataset is missing required columns: {missing_columns}")

    if args.limit:
        df = df.head(args.limit)

    actuals = []
    predictions = []
    samples = []

    for index, row in df.iterrows():
        payload = {feature: safe_float(row.get(feature)) for feature in FEATURES}
        prediction = model.predict(payload)
        actual = safe_float(row["surplus"])
        if actual is None:
            continue

        actuals.append(actual)
        predictions.append(prediction)

        if len(samples) < max(0, args.samples):
            samples.append(
                {
                    "row_index": int(index),
                    "inputs": payload,
                    "actual_surplus": round(actual, 4),
                    "predicted_surplus": round(prediction, 4),
                    "absolute_error": round(abs(actual - prediction), 8),
                }
            )

    if not actuals:
        raise ValueError("No valid rows were available for testing.")

    summary = {
        "dataset_path": args.dataset,
        "model_path": args.model,
        "rows_tested": len(actuals),
        "metrics": {
            "mae": mae(actuals, predictions),
            "rmse": rmse(actuals, predictions),
            "r2": r2(actuals, predictions),
        },
        "trained_model": model.metadata(),
        "samples": samples,
    }

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
