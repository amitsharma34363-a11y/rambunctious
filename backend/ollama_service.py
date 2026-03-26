import json
import os
import urllib.error
import urllib.request


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def _to_int_confidence(value, fallback):
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return fallback

    if 0 <= numeric <= 1:
        numeric *= 100

    return clamp(round(numeric), 1, 99)


def estimate_surplus(food_prepared, food_sold, weather_score=0.7, day_of_week=0, hour=20):
    food_prepared = max(0.0, float(food_prepared or 0))
    food_sold = max(0.0, float(food_sold or 0))
    weather_score = max(0.0, min(1.0, float(weather_score or 0.7)))
    remaining = max(0.0, food_prepared - food_sold)
    sell_through = food_sold / food_prepared if food_prepared else 0.0
    weather_factor = 1.0 + ((0.75 - weather_score) * 0.35)
    closing_factor = 1.0 + max(0, int(hour or 20) - 18) * 0.04
    weekend_factor = 1.15 if int(day_of_week or 0) in (4, 5) else 0.95 if int(day_of_week or 0) == 6 else 1.0
    baseline = remaining * 0.7
    demand_buffer = food_prepared * max(0.0, 1.0 - sell_through) * 0.12
    predicted = (baseline + demand_buffer) * weather_factor * closing_factor * weekend_factor
    return max(0, round(predicted))


def _extract_json(text):
    if not text:
        return None

    cleaned = text.strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    start_positions = [pos for pos in (cleaned.find("{"), cleaned.find("[")) if pos != -1]
    if not start_positions:
        return None

    start = min(start_positions)
    end = max(cleaned.rfind("}"), cleaned.rfind("]"))
    if end <= start:
        return None

    try:
        return json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        return None


class OllamaService:
    def __init__(self):
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
        self.model = os.getenv("OLLAMA_MODEL", "mistral:latest")
        self.timeout = float(os.getenv("OLLAMA_TIMEOUT", "90"))

    def _post_json(self, path, body, timeout=None):
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=timeout or self.timeout) as response:
            return json.loads(response.read().decode("utf-8"))

    def _get_json(self, path, timeout=None):
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            headers={"Content-Type": "application/json"},
            method="GET",
        )
        with urllib.request.urlopen(request, timeout=timeout or self.timeout) as response:
            return json.loads(response.read().decode("utf-8"))

    def generate_json(self, system_prompt, payload, fallback):
        body = {
            "model": self.model,
            "stream": False,
            "format": "json",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
            ],
            "options": {
                "temperature": 0.2,
            },
        }

        try:
            raw_response = self._post_json("/api/chat", body)
            parsed = _extract_json(raw_response.get("message", {}).get("content", ""))
            if isinstance(parsed, dict):
                return parsed, {"source": "ollama", "model": self.model}
        except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError):
            pass

        return dict(fallback), {"source": "fallback", "model": self.model}

    def get_status(self):
        try:
            tags = self._get_json("/api/tags", timeout=10)
            models = tags.get("models", [])
            installed_models = [model.get("name", "") for model in models if model.get("name")]
            selected_present = any(
                name == self.model or name.startswith(f"{self.model}:")
                for name in installed_models
            )
            return {
                "reachable": True,
                "selected_model": self.model,
                "selected_model_available": selected_present,
                "installed_models": installed_models,
            }
        except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError):
            return {
                "reachable": False,
                "selected_model": self.model,
                "selected_model_available": False,
                "installed_models": [],
            }


def build_surplus_prediction(
    ollama_service,
    day_of_week,
    food_prepared,
    food_sold,
    weather_score,
    hour,
    historical_entries,
    baseline_prediction=None,
    baseline_confidence=None,
):
    food_prepared_value = max(0.0, float(food_prepared or 0))
    food_sold_value = max(0.0, float(food_sold or 0))
    prediction = max(
        0,
        round(baseline_prediction if baseline_prediction is not None else estimate_surplus(food_prepared_value, food_sold_value, weather_score, day_of_week, hour)),
    )
    confidence = clamp(
        round(baseline_confidence if baseline_confidence is not None else (62 + (min(len(historical_entries), 10) * 3))),
        1,
        99,
    )
    remaining_now = max(0, round(food_prepared_value - food_sold_value))
    max_reasonable_prediction = max(
        round(food_prepared_value),
        round(remaining_now + max(10, remaining_now * 0.5)),
        round(prediction + max(10, prediction * 0.5)),
    )
    suggestions = [
        "Reduce prep volume by 10% for slow-moving dishes." if prediction > 20 else "Current prep looks balanced.",
        "Create an NGO alert 45-60 minutes before closing." if prediction > 12 else "No urgent rescue alert is needed yet.",
        "Bundle similar categories together to speed pickup." if remaining_now > 15 else "Keep categories separated for quick pickup.",
    ]
    fallback = {
        "predicted_surplus": prediction,
        "confidence": confidence,
        "message": f"Expected closing surplus is about {prediction} meals.",
        "suggestions": suggestions,
    }
    history_snapshot = [
        {
            "date": str(entry.get("date", "")),
            "prepared": float(entry.get("food_prepared", 0) or 0),
            "sold": float(entry.get("food_sold", 0) or 0),
            "remaining": float(entry.get("remaining_food", 0) or 0),
            "category": entry.get("category", "Mixed"),
        }
        for entry in historical_entries[-7:]
    ]
    response, meta = ollama_service.generate_json(
        (
            "You are helping a food rescue platform forecast leftover meals. "
            "Return only JSON with keys predicted_surplus, confidence, message, and suggestions. "
            "predicted_surplus must be a non-negative integer. confidence must be 1-99. "
            "Keep predicted_surplus operationally realistic for the input. "
            "It must not exceed food_prepared and should stay close to current_remaining and baseline_prediction. "
            "suggestions must be an array of 2 or 3 short operational recommendations."
        ),
        {
            "current_input": {
                "day_of_week": int(day_of_week),
                "food_prepared": food_prepared_value,
                "food_sold": food_sold_value,
                "weather_score": float(weather_score or 0.7),
                "hour": int(hour or 20),
                "current_remaining": remaining_now,
                "baseline_prediction": prediction,
            },
            "recent_history": history_snapshot,
        },
        fallback,
    )

    raw_suggestions = response.get("suggestions", fallback["suggestions"])
    if not isinstance(raw_suggestions, list):
        raw_suggestions = fallback["suggestions"]

    clean_suggestions = [str(item).strip() for item in raw_suggestions if str(item).strip()][:3]
    if not clean_suggestions:
        clean_suggestions = fallback["suggestions"]

    prediction_from_response = response.get("predicted_surplus", fallback["predicted_surplus"])
    invalid_prediction = False
    try:
        parsed_prediction = int(round(float(prediction_from_response)))
    except (TypeError, ValueError):
        parsed_prediction = fallback["predicted_surplus"]
        invalid_prediction = True

    if parsed_prediction < 0 or parsed_prediction > max_reasonable_prediction:
        parsed_prediction = fallback["predicted_surplus"]
        invalid_prediction = True

    message = str(response.get("message", fallback["message"])).strip() or fallback["message"]
    if invalid_prediction:
        message = fallback["message"]
        if meta["source"] == "ollama":
            meta = {"source": "fallback", "model": meta["model"]}

    return {
        "predicted_surplus": max(0, parsed_prediction),
        "confidence": _to_int_confidence(response.get("confidence", fallback["confidence"]), fallback["confidence"]),
        "message": message,
        "suggestions": clean_suggestions,
        "source": meta["source"],
        "model": meta["model"],
    }


def build_prediction_accuracy(ollama_service, weekly_snapshot):
    fallback_predictions = []
    for item in weekly_snapshot:
        predicted = estimate_surplus(
            item["prepared"],
            max(0, item["prepared"] - item["actual"]),
            0.7,
            item["day_index"],
            20,
        )
        accuracy = 100 if item["actual"] == 0 else clamp(
            round(100 - (abs(predicted - item["actual"]) / max(item["actual"], 1) * 100)),
            60,
            98,
        )
        fallback_predictions.append(
            {
                "day": item["day"],
                "predicted": round(predicted, 1),
                "actual": round(item["actual"], 1),
                "accuracy": accuracy,
            }
        )

    fallback = {"predictions": [{"day": item["day"], "predicted": item["predicted"]} for item in fallback_predictions]}
    response, meta = ollama_service.generate_json(
        (
            "You are forecasting daily food surplus from weekly averages. "
            "Return only JSON with a predictions array. "
            "Each array item must contain day and predicted. "
            "Use the same seven days supplied in the input and keep predictions non-negative numbers."
        ),
        {"weekly_snapshot": weekly_snapshot},
        fallback,
    )

    predicted_by_day = {}
    for item in response.get("predictions", []):
        day = str(item.get("day", "")).strip()
        if not day:
            continue
        try:
            predicted_by_day[day] = max(0.0, float(item.get("predicted", 0)))
        except (TypeError, ValueError):
            continue

    predictions = []
    for item in weekly_snapshot:
        predicted = predicted_by_day.get(item["day"], next(
            fallback_item["predicted"] for fallback_item in fallback_predictions if fallback_item["day"] == item["day"]
        ))
        accuracy = 100 if item["actual"] == 0 else clamp(
            round(100 - (abs(predicted - item["actual"]) / max(item["actual"], 1) * 100)),
            60,
            98,
        )
        predictions.append(
            {
                "day": item["day"],
                "predicted": round(predicted, 1),
                "actual": round(item["actual"], 1),
                "accuracy": accuracy,
            }
        )

    average_accuracy = round(sum(item["accuracy"] for item in predictions) / len(predictions), 1) if predictions else 0.0
    return {
        "predictions": predictions,
        "average_accuracy": average_accuracy,
        "source": meta["source"],
        "model": meta["model"],
    }


def build_ngo_recommendations(ollama_service, restaurant_location, surplus_meals, food_categories, ngos, order_counts):
    fallback_recommendations = []
    for ngo in ngos:
        distance = (sum(ord(ch) for ch in ngo.get("email", "")) % 9) + 1
        pickup_count = int(order_counts.get(ngo.get("email", ""), 0))
        score = clamp(45 + (pickup_count * 8) + max(0, 30 - distance * 4), 0, 100)
        reasons = []
        reasons.append(f"{pickup_count} prior pickups" if pickup_count else "Ready for a first pickup")
        reasons.append(f"{distance} km away")
        fallback_recommendations.append(
            {
                "ngo_name": ngo.get("name", ngo.get("email", "NGO")),
                "ngo_email": ngo.get("email", ""),
                "score": score,
                "reasons": reasons,
                "distance": distance,
            }
        )

    fallback_recommendations.sort(key=lambda item: item["score"], reverse=True)
    fallback = {"recommendations": fallback_recommendations[:3]}
    response, meta = ollama_service.generate_json(
        (
            "You are matching NGOs to food rescue alerts. "
            "Return only JSON with a recommendations array. "
            "Each item must contain ngo_name, ngo_email, score, distance, and reasons. "
            "score must be 0-100. reasons must contain 1 or 2 short strings."
        ),
        {
            "restaurant_location": restaurant_location,
            "surplus_meals": int(surplus_meals),
            "food_categories": food_categories,
            "ngos": [
                {
                    "ngo_name": ngo.get("name", ngo.get("email", "NGO")),
                    "ngo_email": ngo.get("email", ""),
                    "estimated_distance_km": (sum(ord(ch) for ch in ngo.get("email", "")) % 9) + 1,
                    "past_pickups": int(order_counts.get(ngo.get("email", ""), 0)),
                }
                for ngo in ngos
            ],
        },
        fallback,
    )

    cleaned = []
    for item in response.get("recommendations", []):
        reasons = item.get("reasons", [])
        if not isinstance(reasons, list):
            reasons = []
        cleaned.append(
            {
                "ngo_name": str(item.get("ngo_name", "")).strip() or "NGO",
                "ngo_email": str(item.get("ngo_email", "")).strip(),
                "score": clamp(int(item.get("score", 0)), 0, 100),
                "reasons": [str(reason).strip() for reason in reasons if str(reason).strip()][:2]
                or ["Good fit for this rescue"],
                "distance": max(1, int(item.get("distance", 1))),
            }
        )

    if not cleaned:
        cleaned = fallback_recommendations[:3]

    cleaned.sort(key=lambda item: item["score"], reverse=True)
    return {
        "recommendations": cleaned[:3],
        "best_match": cleaned[0] if cleaned else None,
        "source": meta["source"],
        "model": meta["model"],
    }


def build_smart_matches(ollama_service, active_alerts, active_ngos, order_counts):
    fallback_matches = []
    for alert in active_alerts:
        best_match = None
        best_score = -1
        for ngo in active_ngos:
            order_count = int(order_counts.get(ngo.get("email", ""), 0))
            distance = (sum(ord(ch) for ch in ngo.get("email", "")) % 7) + 1
            score = clamp(45 + (order_count * 8) + max(0, 30 - distance * 3), 0, 100)
            if score > best_score:
                reasons = []
                reasons.append(f"{order_count} prior pickups" if order_count else "Ready for first pickup")
                reasons.append(f"{distance} km estimated distance")
                best_match = {
                    "restaurant": alert.get("restaurant_name", "Restaurant"),
                    "bestNgo": ngo.get("name", ngo.get("email", "NGO")),
                    "reason": " + ".join(reasons),
                    "score": score,
                }
                best_score = score

        if best_match:
            fallback_matches.append(best_match)

    if not fallback_matches:
        fallback_matches = [
            {
                "restaurant": "No active alerts",
                "bestNgo": "Waiting for new rescue requests",
                "reason": "Create a restaurant alert to generate matching suggestions",
                "score": 0,
            }
        ]

    response, meta = ollama_service.generate_json(
        (
            "You are ranking NGO matches for rescue alerts. "
            "Return only JSON with a matches array. "
            "Each item must contain restaurant, bestNgo, reason, and score. "
            "reason must be a short sentence and score must be 0-100."
        ),
        {
            "alerts": [
                {
                    "restaurant": alert.get("restaurant_name", "Restaurant"),
                    "location": alert.get("location", "Unknown"),
                    "surplus_meals": int(alert.get("surplus_meals", 0)),
                    "food_type": alert.get("food_type", "Mixed"),
                }
                for alert in active_alerts
            ],
            "ngos": [
                {
                    "name": ngo.get("name", ngo.get("email", "NGO")),
                    "email": ngo.get("email", ""),
                    "past_pickups": int(order_counts.get(ngo.get("email", ""), 0)),
                    "estimated_distance_km": (sum(ord(ch) for ch in ngo.get("email", "")) % 7) + 1,
                }
                for ngo in active_ngos
            ],
        },
        {"matches": fallback_matches},
    )

    cleaned = []
    for item in response.get("matches", []):
        cleaned.append(
            {
                "restaurant": str(item.get("restaurant", "")).strip() or "Restaurant",
                "bestNgo": str(item.get("bestNgo", "")).strip() or "NGO",
                "reason": str(item.get("reason", "")).strip() or "Recommended based on pickup readiness.",
                "score": clamp(int(item.get("score", 0)), 0, 100),
            }
        )

    if not cleaned:
        cleaned = fallback_matches

    return {
        "matches": cleaned[:5],
        "source": meta["source"],
        "model": meta["model"],
    }
