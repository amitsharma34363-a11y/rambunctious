import json
import os
from dataclasses import dataclass


FEATURES = ["hour", "day_of_week", "month", "is_weekend", "quantity", "food_prepared"]


@dataclass
class TrainedSurplusModel:
    feature_names: list
    medians: dict
    coefficients: dict
    intercept: float
    metrics: dict
    dataset_summary: dict

    def predict(self, payload):
        total = float(self.intercept)
        for feature in self.feature_names:
            value = payload.get(feature)
            if value is None:
                value = self.medians.get(feature, 0.0)
            total += float(value) * float(self.coefficients.get(feature, 0.0))
        return max(0.0, float(total))

    def metadata(self):
        return {
            "feature_names": self.feature_names,
            "metrics": self.metrics,
            "dataset_summary": self.dataset_summary,
        }


def load_trained_surplus_model(path):
    if not os.path.exists(path):
        return None

    with open(path, "r", encoding="utf-8") as file:
        payload = json.load(file)

    return TrainedSurplusModel(
        feature_names=list(payload.get("feature_names", FEATURES)),
        medians=dict(payload.get("medians", {})),
        coefficients=dict(payload.get("coefficients", {})),
        intercept=float(payload.get("intercept", 0.0)),
        metrics=dict(payload.get("metrics", {})),
        dataset_summary=dict(payload.get("dataset_summary", {})),
    )
