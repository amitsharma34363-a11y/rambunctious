from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity, get_jwt
import bcrypt
import pymongo
from twilio.rest import Client
from twilio.twiml.messaging_response import MessagingResponse
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, timedelta, timezone
from functools import wraps
import os
import sys
try:
    import pandas as pd
except Exception:
    pd = None
from ollama_service import (
    OllamaService,
    build_ngo_recommendations,
    build_prediction_accuracy,
    build_smart_matches,
    build_surplus_prediction,
)
from surplus_model import load_trained_surplus_model

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

app = Flask(__name__)
CORS(app)

def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)

# MongoDB Connection (Optional - will use mock data if not available)
MOCK_MODE = True  # Set to False when MongoDB is running
db = None
users_col = None
restaurants_col = None
ngos_col = None
alerts_col = None
food_data_col = None
orders_col = None
subscriptions_col = None

try:
    client_mongo = pymongo.MongoClient("mongodb://localhost:27017/", serverSelectionTimeoutMS=2000)
    client_mongo.server_info()
    db = client_mongo["lastmile_food_rescue"]
    users_col = db["users"]
    restaurants_col = db["restaurants"]
    ngos_col = db["ngos"]
    alerts_col = db["alerts"]
    food_data_col = db["food_data"]
    orders_col = db["orders"]
    subscriptions_col = db["subscriptions"]
    MOCK_MODE = False
    print("MongoDB connected")
except Exception as e:
    print(f"MongoDB not available, using mock mode: {e}")
    MOCK_MODE = True
    db = None
    users_col = None
    restaurants_col = None
    ngos_col = None
    alerts_col = None
    food_data_col = None

# Mock Data Storage (when MongoDB is not available)
mock_users = [
    {
        '_id': '1',
        'name': 'Demo Restaurant',
        'email': 'restaurant@demo.com',
        'password': bcrypt.hashpw('password123'.encode('utf-8'), bcrypt.gensalt()),
        'role': 'restaurant',
        'subscription': 'restaurant_pro',
        'createdAt': datetime.now(),
        'loginHistory': []
    },
    {
        '_id': '2',
        'name': 'Demo Hotel',
        'email': 'hotel@demo.com',
        'password': bcrypt.hashpw('password123'.encode('utf-8'), bcrypt.gensalt()),
        'role': 'hotel',
        'subscription': 'hotel_pro',
        'createdAt': datetime.now(),
        'loginHistory': []
    },
    {
        '_id': '3',
        'name': 'Demo Banquet',
        'email': 'banquet@demo.com',
        'password': bcrypt.hashpw('password123'.encode('utf-8'), bcrypt.gensalt()),
        'role': 'banquet',
        'subscription': 'banquet_pro',
        'createdAt': datetime.now(),
        'loginHistory': []
    },
    {
        '_id': '4',
        'name': 'Demo NGO',
        'email': 'ngo@demo.com',
        'password': bcrypt.hashpw('password123'.encode('utf-8'), bcrypt.gensalt()),
        'role': 'ngo',
        'subscription': 'premium',
        'createdAt': datetime.now(),
        'loginHistory': []
    },
    {
        '_id': '5',
        'name': 'Admin',
        'email': 'admin@demo.com',
        'password': bcrypt.hashpw('password123'.encode('utf-8'), bcrypt.gensalt()),
        'role': 'admin',
        'subscription': 'premium',
        'createdAt': datetime.now(),
        'loginHistory': []
    }
]
mock_restaurants = []
mock_ngos = []
mock_alerts = []
mock_food_data = []
mock_orders = []
mock_subscriptions = []
DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
PROVIDER_ROLES = ("restaurant", "hotel", "banquet")
PUBLIC_ROLES = PROVIDER_ROLES + ("ngo",)
ALL_ROLES = PUBLIC_ROLES + ("admin",)
PROVIDER_ROLE_CONFIG = {
    "restaurant": {
        "label": "Restaurant",
        "price_per_portion": 20,
        "subscription_plan": "restaurant_pro",
        "subscription_price": 199,
        "minimum_pickup": 1,
        "closing_time": "22:00",
        "available_after": "21:30",
        "daily_surplus_auto_entry": False,
        "recurring_alerts": False,
    },
    "hotel": {
        "label": "Hotel",
        "price_per_portion": 15,
        "subscription_plan": "hotel_pro",
        "subscription_price": 499,
        "minimum_pickup": 1,
        "closing_time": "23:00",
        "available_after": "22:00",
        "daily_surplus_auto_entry": True,
        "recurring_alerts": True,
    },
    "banquet": {
        "label": "Banquet",
        "price_per_portion": 10,
        "subscription_plan": "banquet_pro",
        "subscription_price": 999,
        "minimum_pickup": 20,
        "closing_time": "23:30",
        "available_after": "22:00",
        "daily_surplus_auto_entry": False,
        "recurring_alerts": False,
    },
}
PROVIDER_DISTRIBUTION_COLORS = {
    "restaurant": "#f3ad2d",
    "hotel": "#2f9d61",
    "banquet": "#1f6f78",
}
PLATFORM_EXPANSION_MESSAGE = (
    "We expanded beyond restaurants to include hotels and banquet halls, "
    "enabling large-scale food redistribution with dynamic pricing and AI-driven predictions."
)
DEMO_USER_FIXTURES = {
    "restaurant@demo.com": {
        "name": "Demo Restaurant",
        "role": "restaurant",
        "subscription": "restaurant_pro",
        "location": "Demo Location",
        "phone": "+917004228038",
    },
    "hotel@demo.com": {
        "name": "Demo Hotel",
        "role": "hotel",
        "subscription": "hotel_pro",
        "location": "Demo Location",
        "phone": "+917004228039",
    },
    "banquet@demo.com": {
        "name": "Demo Banquet",
        "role": "banquet",
        "subscription": "banquet_pro",
        "location": "Demo Location",
        "phone": "+917004228040",
    },
    "ngo@demo.com": {
        "name": "Demo NGO",
        "role": "ngo",
        "subscription": "premium",
        "location": "Demo Location",
        "phone": "+917004228037",
    },
    "admin@demo.com": {
        "name": "Admin",
        "role": "admin",
        "subscription": "premium",
        "location": "HQ",
        "phone": "",
    },
}

def matches_query(item, query):
    for key, expected in query.items():
        actual = item.get(key)

        if isinstance(expected, dict):
            if "$gte" in expected and (actual is None or actual < expected["$gte"]):
                return False
            if "$gt" in expected and (actual is None or actual <= expected["$gt"]):
                return False
            if "$lte" in expected and (actual is None or actual > expected["$lte"]):
                return False
            if "$lt" in expected and (actual is None or actual >= expected["$lt"]):
                return False
            if "$in" in expected and actual not in expected["$in"]:
                return False
        elif actual != expected:
            return False

    return True

class MockCollection:
    def __init__(self, data):
        self.data = data
    
    def find_one(self, query, projection=None):
        for item in self.data:
            if matches_query(item, query):
                # Apply projection if provided
                if projection:
                    result = {}
                    for key, value in item.items():
                        if key in projection and projection[key] == 0:
                            continue
                        result[key] = value
                    return result
                return item
        return None
    
    def insert_one(self, item):
        import uuid
        item['_id'] = str(uuid.uuid4())
        if 'created_at' not in item:
            item['created_at'] = utc_now()
        self.data.append(item)
        return type('obj', (object,), {'inserted_id': item['_id']})
    
    def count_documents(self, query):
        return len([i for i in self.data if matches_query(i, query)])
    
    def find(self, query={}, projection=None):
        results = [i for i in self.data if matches_query(i, query)]
        if projection:
            filtered_results = []
            for item in results:
                filtered_item = {}
                for key, value in item.items():
                    if key in projection and projection[key] == 0:
                        continue
                    filtered_item[key] = value
                filtered_results.append(filtered_item)
            results = filtered_results
        
        # Return a cursor-like object with sort and limit methods
        cursor_results = results[:]
        
        class MockCursor:
            def __init__(self, data):
                self.data = data
            
            def sort(self, key, direction=-1):
                self.data.sort(key=lambda x: x.get(key, datetime.min), reverse=(direction == -1))
                return self
            
            def limit(self, n):
                self.data = self.data[:n]
                return self
            
            def __iter__(self):
                return iter(self.data)
        
        return MockCursor(cursor_results)
    
    def update_one(self, query, update):
        item = self.find_one(query)
        if item:
            for k, v in update.get('$set', {}).items():
                item[k] = v
            # Handle $push for arrays
            if '$push' in update:
                for k, v in update['$push'].items():
                    if k not in item:
                        item[k] = []
                    item[k].append(v)
    
    def delete_one(self, query):
        item = self.find_one(query)
        if item:
            self.data.remove(item)

if MOCK_MODE:
    users_col = MockCollection(mock_users)
    restaurants_col = MockCollection(mock_restaurants)
    ngos_col = MockCollection(mock_ngos)
    alerts_col = MockCollection(mock_alerts)
    food_data_col = MockCollection(mock_food_data)
    orders_col = MockCollection(mock_orders)
    subscriptions_col = MockCollection(mock_subscriptions)
app.config["JWT_SECRET_KEY"] = "your-secret-key-change-in-production"
jwt = JWTManager(app)

# -------------------------
# Sample Data (for demo)
# -------------------------
restaurant_data = {
    "name": "Spice Hub",
    "avg_sales": 100,
    "today_sales": 70,
    "closing_time": "10:00 PM",
    "phone": "+917004228038"
}

ollama_service = OllamaService()
MODEL_ARTIFACT_PATH = os.path.join(os.path.dirname(__file__), "models", "surplus_model.json")
trained_surplus_model = load_trained_surplus_model(MODEL_ARTIFACT_PATH)

# -------------------------
# Helper Functions
# -------------------------
def calculate_surplus(food_prepared, food_sold):
    surplus = food_prepared - food_sold
    return surplus if surplus > 0 else 0

def serialize_value(value):
    if isinstance(value, (datetime,)):
        return value.isoformat()
    if hasattr(value, "isoformat") and not isinstance(value, (str, bytes, dict, list, tuple)):
        try:
            return value.isoformat()
        except Exception:
            pass
    return value

def serialize_document(document):
    if document is None:
        return None

    serialized = {}
    for key, value in document.items():
        if isinstance(value, dict):
            serialized[key] = serialize_document(value)
        elif isinstance(value, list):
            serialized[key] = [
                serialize_document(item) if isinstance(item, dict) else serialize_value(item)
                for item in value
            ]
        else:
            serialized[key] = serialize_value(value)

    if "_id" in serialized:
        serialized["_id"] = str(serialized["_id"])

    return serialized

def role_required(*allowed_roles):
    def decorator(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            role = claims.get("role")
            if role not in allowed_roles:
                return jsonify({"error": "Access denied for this role"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator

def safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def safe_int(value, default=0):
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return int(default)


def coerce_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    return bool(value)


def is_provider_role(role):
    return role in PROVIDER_ROLES


def get_provider_type(value):
    if isinstance(value, dict):
        role = value.get("provider_type") or value.get("role")
    else:
        role = value
    return role if role in PROVIDER_ROLES else "restaurant"


def get_provider_config(role):
    return PROVIDER_ROLE_CONFIG.get(get_provider_type(role), PROVIDER_ROLE_CONFIG["restaurant"])


def get_provider_label(role):
    return get_provider_config(role)["label"]


def get_provider_subscription_plan_id(role):
    return get_provider_config(role)["subscription_plan"]


def build_provider_subscription_plan(role):
    config = get_provider_config(role)
    provider_type = get_provider_type(role)
    return {
        "id": config["subscription_plan"],
        "name": f"{config['label']} Pro",
        "provider_type": provider_type,
        "price": config["subscription_price"],
        "price_per_portion": config["price_per_portion"],
        "minimum_pickup": config["minimum_pickup"],
        "features": [
            f"Dynamic pricing at Rs {config['price_per_portion']} per portion",
            "AI-driven surplus prediction",
            "Real-time NGO matching",
            "Advanced provider analytics",
            "Priority rescue support",
        ],
        "limitations": {
            "daily_requests": -1,
            "ai_predictions": True,
            "priority_matching": True,
        },
    }


def build_provider_profile(email, user=None, payload=None):
    payload = payload or {}
    user = user or users_col.find_one({"email": email}) or {}
    role = get_provider_type(payload.get("provider_type") or payload.get("role") or user.get("role"))
    config = get_provider_config(role)
    closing_time = payload.get("closing_time") or user.get("closing_time") or config["closing_time"]
    return {
        "email": email,
        "name": payload.get("name") or user.get("name", email.split("@")[0]),
        "role": role,
        "provider_type": role,
        "provider_label": config["label"],
        "location": payload.get("location") or user.get("location", "Unknown"),
        "phone": payload.get("phone") or user.get("phone", ""),
        "closing_time": closing_time,
        "available_after": payload.get("available_after") or user.get("available_after") or config["available_after"] or closing_time,
        "price_per_portion": safe_float(
            payload.get("price_per_portion", payload.get("price")),
            user.get("price_per_portion", config["price_per_portion"]),
        ),
        "minimum_pickup": max(
            1,
            safe_int(payload.get("minimum_pickup"), user.get("minimum_pickup", config["minimum_pickup"])),
        ),
        "daily_surplus_auto_entry": coerce_bool(
            payload.get("daily_surplus_auto_entry"),
            user.get("daily_surplus_auto_entry", config["daily_surplus_auto_entry"]),
        ),
        "recurring_alerts": coerce_bool(
            payload.get("recurring_alerts"),
            user.get("recurring_alerts", config["recurring_alerts"]),
        ),
        "event_name": payload.get("event_name") or user.get("event_name", ""),
        "guest_count": max(0, safe_int(payload.get("guest_count"), user.get("guest_count", 0))),
        "expected_surplus": max(
            0,
            safe_int(payload.get("expected_surplus"), user.get("expected_surplus", 0)),
        ),
    }


def get_or_create_provider_profile(email, user=None):
    provider = restaurants_col.find_one({"email": email})
    expected_profile = build_provider_profile(email, user=user)
    if provider:
        updates = {}
        for key, value in expected_profile.items():
            if provider.get(key) in (None, ""):
                updates[key] = value
        if updates:
            restaurants_col.update_one({"email": email}, {"$set": updates})
            provider = {**provider, **updates}
        return provider

    restaurants_col.insert_one(expected_profile)
    return expected_profile


def update_provider_profile(email, payload=None):
    payload = payload or {}
    current_user = users_col.find_one({"email": email}) or {}
    current_profile = get_or_create_provider_profile(email, current_user)
    next_profile = {**current_profile, **build_provider_profile(email, user=current_user, payload=payload)}
    restaurants_col.update_one({"email": email}, {"$set": next_profile})
    users_col.update_one(
        {"email": email},
        {"$set": {
            "price_per_portion": next_profile["price_per_portion"],
            "minimum_pickup": next_profile["minimum_pickup"],
            "available_after": next_profile["available_after"],
            "daily_surplus_auto_entry": next_profile["daily_surplus_auto_entry"],
            "recurring_alerts": next_profile["recurring_alerts"],
            "event_name": next_profile["event_name"],
            "guest_count": next_profile["guest_count"],
            "expected_surplus": next_profile["expected_surplus"],
            "closing_time": next_profile["closing_time"],
        }},
    )
    return restaurants_col.find_one({"email": email}) or next_profile


def get_or_create_restaurant_profile(email, user=None):
    return get_or_create_provider_profile(email, user=user)

def get_or_create_ngo_profile(email, user=None):
    ngo = ngos_col.find_one({"email": email})
    if ngo:
        return ngo

    user = user or users_col.find_one({"email": email}) or {}
    ngo = {
        "email": email,
        "name": user.get("name", email.split("@")[0]),
        "location": user.get("location", "Unknown"),
        "phone": user.get("phone", ""),
        "active": True
    }
    ngos_col.insert_one(ngo)
    return ngo

def build_alert_categories(items, fallback_category, fallback_food_type, surplus_meals):
    categories = []

    if isinstance(items, list) and items:
        for item in items:
            available = int(
                item.get("remaining")
                or item.get("remaining_food")
                or calculate_surplus(
                    float(item.get("food_prepared", 0) or 0),
                    float(item.get("food_sold", 0) or 0)
                )
            )
            if available <= 0:
                continue
            categories.append({
                "name": item.get("category") or item.get("name") or fallback_category or "Mixed",
                "available": available,
                "food_type": item.get("food_type") or fallback_food_type or "Mixed"
            })

    if categories:
        return categories

    return [{
        "name": fallback_category or "Mixed",
        "available": int(surplus_meals),
        "food_type": fallback_food_type or "Mixed"
    }]


def get_alert_remaining_portions(categories):
    return sum(max(0, int(category.get("available", 0) or 0)) for category in categories)

def summarize_order_items(items):
    return ", ".join(
        f"{item.get('category', item.get('name', 'Item'))}: {item.get('quantity', 0)}"
        for item in items
    )


def apply_collected_order_to_food_data(order, alert=None):
    if not order:
        return None

    food_entry = None
    if alert and alert.get("food_entry_id"):
        food_entry = food_data_col.find_one({"_id": alert.get("food_entry_id")})

    if food_entry is None:
        latest_entries = list(
            food_data_col.find({"restaurant_email": order.get("restaurant_email")}).sort("timestamp", -1).limit(1)
        )
        food_entry = latest_entries[0] if latest_entries else None

    if not food_entry:
        return None

    collected_portions = max(0, float(order.get("total_portions", 0) or 0))
    updated_remaining = max(0.0, float(food_entry.get("remaining_food", 0) or 0) - collected_portions)
    updated_donated = max(0.0, float(food_entry.get("donated_food", 0) or 0) + collected_portions)

    food_data_col.update_one(
        {"_id": food_entry["_id"]},
        {"$set": {
            "remaining_food": updated_remaining,
            "donated_food": updated_donated,
            "last_collection_at": utc_now()
        }}
    )
    return food_data_col.find_one({"_id": food_entry["_id"]})


def parse_entry_datetime(value):
    if isinstance(value, datetime):
        return value
    if hasattr(value, "year") and hasattr(value, "month") and hasattr(value, "day") and not isinstance(value, str):
        try:
            return datetime(value.year, value.month, value.day)
        except Exception:
            return None
    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized)
        except ValueError:
            return None
    return None


def load_dataset_weekly_profile():
    dataset_path = os.getenv("SURPLUS_DATASET_PATH", r"E:\Admin\final_merged_ai_dataset.csv")
    if pd is None or not os.path.exists(dataset_path):
        return {}

    try:
        df = pd.read_csv(dataset_path)
    except Exception:
        return {}

    required_columns = {"day_of_week", "quantity", "food_prepared", "surplus"}
    if not required_columns.issubset(df.columns):
        return {}

    working = df[list(required_columns)].copy()
    for column in required_columns:
        working[column] = pd.to_numeric(working[column], errors="coerce")

    working = working.dropna(subset=["day_of_week", "quantity", "food_prepared", "surplus"])
    if working.empty:
        return {}

    unique_days = set(working["day_of_week"].astype(int).unique().tolist())
    if 0 not in unique_days and unique_days.issubset({1, 2, 3, 4, 5, 6, 7}):
        working["day_of_week"] = working["day_of_week"] - 1

    grouped = working.groupby(working["day_of_week"].astype(int))
    profile = {}
    for idx in range(7):
        if idx not in grouped.groups:
            continue
        day_frame = grouped.get_group(idx)
        prepared = float(day_frame["food_prepared"].mean())
        sold = float(day_frame["quantity"].mean())
        remaining = float(day_frame["surplus"].mean())
        profile[idx] = {
            "day": DAY_LABELS[idx],
            "prepared": round(prepared, 1),
            "sold": round(sold, 1),
            "remaining": round(remaining, 1),
            "donated": 0.0,
            "entries": int(len(day_frame)),
            "source": "dataset",
        }

    return profile


DATASET_WEEKLY_PROFILE = load_dataset_weekly_profile()


def build_restaurant_weekly_chart(restaurant_email):
    restaurant_entries = list(
        food_data_col.find({"restaurant_email": restaurant_email}).sort("timestamp", -1)
    )
    grouped = {idx: {"prepared": [], "sold": [], "remaining": [], "donated": []} for idx in range(7)}

    for entry in restaurant_entries:
        entry_dt = (
            parse_entry_datetime(entry.get("timestamp"))
            or parse_entry_datetime(entry.get("date"))
        )
        day_index = entry_dt.weekday() if entry_dt else datetime.now().weekday()
        grouped[day_index]["prepared"].append(float(entry.get("food_prepared", 0) or 0))
        grouped[day_index]["sold"].append(float(entry.get("food_sold", 0) or 0))
        grouped[day_index]["remaining"].append(float(entry.get("remaining_food", 0) or 0))
        grouped[day_index]["donated"].append(float(entry.get("donated_food", 0) or 0))

    chart = []
    for idx, label in enumerate(DAY_LABELS):
        bucket = grouped[idx]
        if bucket["prepared"]:
            chart.append({
                "day": label,
                "prepared": round(sum(bucket["prepared"]) / len(bucket["prepared"]), 1),
                "sold": round(sum(bucket["sold"]) / len(bucket["sold"]), 1),
                "remaining": round(sum(bucket["remaining"]) / len(bucket["remaining"]), 1),
                "donated": round(sum(bucket["donated"]) / len(bucket["donated"]), 1),
                "entries": len(bucket["prepared"]),
                "source": "restaurant",
            })
            continue

        dataset_bucket = DATASET_WEEKLY_PROFILE.get(idx)
        if dataset_bucket:
            chart.append(dict(dataset_bucket))
            continue

        chart.append({
            "day": label,
            "prepared": 0.0,
            "sold": 0.0,
            "remaining": 0.0,
            "donated": 0.0,
            "entries": 0,
            "source": "empty",
        })

    return chart


def build_behavior_analysis():
    day_keys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    behavior_map = {}

    for order in orders_col.find():
        ngo_email = order.get("ngo_email")
        if not ngo_email:
            continue
        ngo = ngos_col.find_one({"email": ngo_email}) or {"name": ngo_email}
        created_at = order.get("created_at")
        if isinstance(created_at, str):
            try:
                created_at = datetime.fromisoformat(created_at)
            except ValueError:
                created_at = None
        day_index = created_at.weekday() if isinstance(created_at, datetime) else 0
        key = day_keys[day_index]

        if ngo_email not in behavior_map:
            behavior_map[ngo_email] = {
                "ngo": ngo.get("name", ngo_email),
                **{day: 0 for day in day_keys}
            }

        behavior_map[ngo_email][key] += int(order.get("total_portions", 0))

    behavior_data = []
    for _, stats in behavior_map.items():
        weekday_total = sum(stats[day] for day in day_keys[:5])
        weekend_total = sum(stats[day] for day in day_keys[5:])
        stats["most_active"] = "Weekends" if weekend_total > weekday_total else "Weekdays"
        behavior_data.append(stats)

    if not behavior_data:
        behavior_data = [
            {"ngo": "No NGO orders yet", **{day: 0 for day in day_keys}, "most_active": "N/A"}
        ]

    return behavior_data


def build_order_counts():
    counts = {}
    for order in orders_col.find():
        ngo_email = order.get("ngo_email")
        if not ngo_email:
            continue
        counts[ngo_email] = counts.get(ngo_email, 0) + 1
    return counts


def build_provider_distribution():
    totals = {role: 0.0 for role in PROVIDER_ROLES}

    for order in orders_col.find():
        provider_type = get_provider_type(order)
        totals[provider_type] += safe_float(order.get("total_portions", 0))

    if sum(totals.values()) <= 0:
        for alert in alerts_col.find():
            provider_type = get_provider_type(alert)
            totals[provider_type] += safe_float(alert.get("surplus_meals", 0))

    if sum(totals.values()) <= 0:
        totals = {"restaurant": 40.0, "hotel": 35.0, "banquet": 25.0}

    total_volume = sum(totals.values()) or 1.0
    return [
        {
            "key": role,
            "label": get_provider_label(role),
            "value": round(totals[role], 1),
            "percent": round((totals[role] / total_volume) * 100, 1),
            "color": PROVIDER_DISTRIBUTION_COLORS[role],
        }
        for role in PROVIDER_ROLES
    ]


def build_provider_insights():
    stats = {
        role: {
            "entries": 0,
            "surplus_total": 0.0,
            "weekend_surplus": 0.0,
            "weekday_surplus": 0.0,
            "samples": [],
        }
        for role in PROVIDER_ROLES
    }

    for entry in food_data_col.find():
        provider_type = get_provider_type(entry)
        remaining = safe_float(entry.get("remaining_food", 0))
        entry_dt = parse_entry_datetime(entry.get("timestamp")) or parse_entry_datetime(entry.get("date"))
        is_weekend = bool(entry_dt and entry_dt.weekday() >= 5)
        stats[provider_type]["entries"] += 1
        stats[provider_type]["surplus_total"] += remaining
        stats[provider_type]["samples"].append(remaining)
        if is_weekend:
            stats[provider_type]["weekend_surplus"] += remaining
        else:
            stats[provider_type]["weekday_surplus"] += remaining

    banquet_stats = stats["banquet"]
    hotel_stats = stats["hotel"]
    distribution = build_provider_distribution()
    leading_provider = max(distribution, key=lambda item: item["value"])
    hotel_average = (
        sum(hotel_stats["samples"]) / len(hotel_stats["samples"])
        if hotel_stats["samples"]
        else 0.0
    )
    hotel_spread = (
        max(hotel_stats["samples"]) - min(hotel_stats["samples"])
        if len(hotel_stats["samples"]) > 1
        else 0.0
    )

    banquet_message = (
        "Banquets generate highest surplus on weekends."
        if banquet_stats["entries"] == 0 or banquet_stats["weekend_surplus"] >= banquet_stats["weekday_surplus"]
        else "Banquet surplus is currently spreading more evenly across weekdays."
    )
    hotel_message = (
        "Hotels are most consistent donors."
        if hotel_stats["entries"] == 0 or hotel_spread <= max(10.0, hotel_average * 0.35)
        else "Hotels are steadily contributing surplus."
    )

    return [
        banquet_message,
        hotel_message,
        f"{leading_provider['label']} providers currently contribute {leading_provider['percent']}% of tracked rescue volume.",
    ]


def build_weekly_prediction_snapshot():
    day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    grouped = {i: {"prepared": [], "remaining": []} for i in range(7)}

    for entry in food_data_col.find():
        entry_date = entry.get("date")
        if isinstance(entry_date, str):
            try:
                entry_date = datetime.fromisoformat(entry_date)
            except ValueError:
                entry_date = None
        weekday = entry_date.weekday() if hasattr(entry_date, "weekday") else datetime.now().weekday()
        grouped[weekday]["prepared"].append(float(entry.get("food_prepared", 0) or 0))
        grouped[weekday]["remaining"].append(float(entry.get("remaining_food", 0) or 0))

    snapshot = []
    for idx, label in enumerate(day_labels):
        prepared_values = grouped[idx]["prepared"]
        actual_values = grouped[idx]["remaining"]
        prepared_avg = sum(prepared_values) / len(prepared_values) if prepared_values else 100
        actual_avg = sum(actual_values) / len(actual_values) if actual_values else max(5, prepared_avg * 0.2)
        snapshot.append({
            "day": label,
            "day_index": idx,
            "prepared": round(prepared_avg, 1),
            "actual": round(actual_avg, 1),
        })

    return snapshot


def predict_with_trained_surplus_model(day_of_week, food_prepared, food_sold, hour, month=None, provider_type="restaurant"):
    if trained_surplus_model is None:
        return None

    effective_month = int(month or datetime.now().month)
    effective_day = int(day_of_week)
    payload = {
        "hour": float(hour),
        "day_of_week": float(effective_day),
        "month": float(effective_month),
        "is_weekend": 1.0 if effective_day >= 5 else 0.0,
        "quantity": float(food_sold),
        "food_prepared": float(food_prepared),
    }
    prediction = trained_surplus_model.predict(payload)
    provider_type = get_provider_type(provider_type)
    multiplier = 1.0
    if provider_type == "hotel":
        multiplier = 0.9 if effective_day < 5 else 0.96
    elif provider_type == "banquet":
        multiplier = 1.32 if effective_day >= 5 else 1.12
    prediction *= multiplier
    return {
        "prediction": prediction,
        "confidence": 96 if trained_surplus_model else 62,
        "metadata": {
            **trained_surplus_model.metadata(),
            "provider_type": provider_type,
        },
    }


# -------------------------
# Authentication Routes
# -------------------------
# Authentication Routes
# -------------------------
@app.route("/api/login", methods=["POST"])
def login():
    data = request.json or {}
    email = data.get("email")
    password = data.get("password")
    role = data.get("role")
    
    if not all([email, password, role]):
        return jsonify({"error": "Email, password, and role are required"}), 400
    if role not in ALL_ROLES:
        return jsonify({"error": "Invalid role selected"}), 400
    
    # Find user
    user = users_col.find_one({"email": email})
    
    if not user:
        # Auto-create demo users for testing
        demo_user = DEMO_USER_FIXTURES.get(email)
        if demo_user and password == "password123":
            if demo_user["role"] != role:
                return jsonify({"error": "Invalid role selection"}), 403

            hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
            user_data = {
                "email": email,
                "password": hashed_password,
                "role": role,
                "name": demo_user["name"],
                "subscription": demo_user.get("subscription", "free"),
                "location": demo_user.get("location", "Demo Location"),
                "phone": demo_user.get("phone", ""),
                "createdAt": utc_now(),
                "loginHistory": []
            }
            if is_provider_role(role):
                provider_profile = build_provider_profile(email, user=user_data)
                user_data.update({
                    "price_per_portion": provider_profile["price_per_portion"],
                    "minimum_pickup": provider_profile["minimum_pickup"],
                    "available_after": provider_profile["available_after"],
                    "daily_surplus_auto_entry": provider_profile["daily_surplus_auto_entry"],
                    "recurring_alerts": provider_profile["recurring_alerts"],
                    "event_name": provider_profile["event_name"],
                    "guest_count": provider_profile["guest_count"],
                    "expected_surplus": provider_profile["expected_surplus"],
                    "closing_time": provider_profile["closing_time"],
                })
            users_col.insert_one(user_data)
            
            # Create profile
            if is_provider_role(role):
                get_or_create_provider_profile(email, user_data)
            elif role == "ngo":
                get_or_create_ngo_profile(email, user_data)
            
            access_token = create_access_token(
                identity=email,
                additional_claims={
                    "role": role,
                    "name": demo_user["name"],
                    "subscription": user_data.get("subscription", "free"),
                }
            )
            
            return jsonify({
                "message": "Demo account created & logged in",
                "token": access_token,
                "role": role,
                "name": demo_user["name"],
                "subscription": user_data.get("subscription", "free"),
                "provider_type": role if is_provider_role(role) else None,
            }), 200
        
        return jsonify({"error": "User not found"}), 404
    
    # Verify password
    if not bcrypt.checkpw(password.encode("utf-8"), user["password"]):
        return jsonify({"error": "Invalid credentials"}), 401
    
    # Verify role matches
    if user["role"] != role:
        return jsonify({"error": "Invalid role selection"}), 403

    if is_provider_role(role):
        get_or_create_provider_profile(email, user)
    elif role == "ngo":
        get_or_create_ngo_profile(email, user)
    
    # Update login history
    users_col.update_one(
        {"email": email},
        {"$push": {"loginHistory": {"date": datetime.now().strftime("%Y-%m-%d"), "time": datetime.now().strftime("%H:%M")}}}
    )
    
    # Create JWT token with role
    access_token = create_access_token(
        identity=email,
        additional_claims={"role": role, "name": user["name"], "subscription": user.get("subscription", "free")}
    )
    
    return jsonify({
        "message": "Login successful",
        "token": access_token,
        "role": role,
        "name": user["name"],
        "subscription": user.get("subscription", "free"),
        "provider_type": role if is_provider_role(role) else None,
    }), 200


# -------------------------
# Restaurant Routes
# -------------------------
@app.route("/api/register", methods=["POST"])
def register():
    data = request.json or {}
    email = data.get("email")
    password = data.get("password")
    role = data.get("role")
    name = data.get("name")
    location = data.get("location", "Unknown")
    phone = data.get("phone", "")
    
    if not all([email, password, role, name]):
        return jsonify({"error": "All fields are required"}), 400
    if role not in PUBLIC_ROLES:
        return jsonify({"error": "Invalid role selected"}), 400
    
    # Check if user exists
    if users_col.find_one({"email": email}):
        return jsonify({"error": "User already exists"}), 400
    
    # Hash password
    hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    
    # Create user with subscription
    user = {
        "email": email,
        "password": hashed_password,
        "role": role,
        "name": name,
        "location": location,
        "phone": phone,
        "subscription": "free",
        "createdAt": utc_now(),
        "loginHistory": []
    }
    if is_provider_role(role):
        provider_profile = build_provider_profile(email, user=user, payload=data)
        user.update({
            "price_per_portion": provider_profile["price_per_portion"],
            "minimum_pickup": provider_profile["minimum_pickup"],
            "available_after": provider_profile["available_after"],
            "daily_surplus_auto_entry": provider_profile["daily_surplus_auto_entry"],
            "recurring_alerts": provider_profile["recurring_alerts"],
            "event_name": provider_profile["event_name"],
            "guest_count": provider_profile["guest_count"],
            "expected_surplus": provider_profile["expected_surplus"],
            "closing_time": provider_profile["closing_time"],
        })
    
    users_col.insert_one(user)
    
    # Create profile based on role
    if is_provider_role(role):
        get_or_create_provider_profile(email, user)
    elif role == "ngo":
        get_or_create_ngo_profile(email, user)
    
    return jsonify({"message": "Registration successful! Please login."}), 201

@app.route("/api/restaurant/dashboard", methods=["GET"])
@role_required(*PROVIDER_ROLES)
def restaurant_dashboard():
    current_user = get_jwt_identity()
    
    restaurant = get_or_create_provider_profile(current_user)
    food_history = list(
        food_data_col.find({"restaurant_email": current_user}).sort("timestamp", -1).limit(20)
    )
    latest_food_data = food_history[0] if food_history else None
    chart_data = build_restaurant_weekly_chart(current_user)
    
    return jsonify({
        "restaurant": serialize_document(restaurant),
        "provider": serialize_document(restaurant),
        "food_data": serialize_document(latest_food_data),
        "food_history": [serialize_document(entry) for entry in food_history],
        "chart_data": chart_data
    }), 200

@app.route("/api/restaurant/food-data", methods=["POST"])
@role_required(*PROVIDER_ROLES)
def submit_food_data():
    current_user = get_jwt_identity()
    data = request.json or {}
    provider = update_provider_profile(current_user, data)
    provider_type = get_provider_type(provider)
    
    food_prepared = float(data.get("food_prepared", 0))
    food_sold = float(data.get("food_sold", 0))
    food_type = data.get("food_type", "Both")
    category = data.get("category", "Mixed")
    closing_time = data.get("closing_time", provider.get("closing_time", "22:00"))
    price = safe_float(data.get("price_per_portion", data.get("price")), provider.get("price_per_portion", 20))
    discount_price = safe_float(data.get("discount_price", price), price)
    
    remaining_food = calculate_surplus(food_prepared, food_sold)
    
    # Save food data
    food_entry = {
        "restaurant_email": current_user,
        "provider_email": current_user,
        "restaurant_name": provider.get("name", "Provider"),
        "provider_name": provider.get("name", "Provider"),
        "provider_type": provider_type,
        "provider_label": provider.get("provider_label", get_provider_label(provider_type)),
        "date": datetime.now().date(),
        "timestamp": utc_now(),
        "food_prepared": food_prepared,
        "food_sold": food_sold,
        "remaining_food": remaining_food,
        "donated_food": 0,
        "food_type": food_type,
        "category": category,
        "closing_time": closing_time,
        "price": price,
        "price_per_portion": price,
        "discount_price": discount_price,
        "available_after": data.get("available_after", provider.get("available_after", closing_time)),
        "minimum_pickup": max(1, safe_int(data.get("minimum_pickup"), provider.get("minimum_pickup", 1))),
        "event_name": data.get("event_name", provider.get("event_name", "")),
        "guest_count": max(0, safe_int(data.get("guest_count"), provider.get("guest_count", 0))),
        "expected_surplus": max(
            0,
            safe_int(data.get("expected_surplus"), provider.get("expected_surplus", remaining_food)),
        ),
        "daily_surplus_auto_entry": coerce_bool(
            data.get("daily_surplus_auto_entry"),
            provider.get("daily_surplus_auto_entry", False),
        ),
        "recurring_alerts": coerce_bool(
            data.get("recurring_alerts"),
            provider.get("recurring_alerts", False),
        ),
    }
    
    food_data_col.insert_one(food_entry)
    
    trained_result = predict_with_trained_surplus_model(
        day_of_week=datetime.now().weekday(),
        food_prepared=food_prepared,
        food_sold=food_sold,
        hour=datetime.now().hour,
        month=datetime.now().month,
        provider_type=provider_type,
    )
    ai_result = build_surplus_prediction(
        ollama_service=ollama_service,
        day_of_week=datetime.now().weekday(),
        food_prepared=food_prepared,
        food_sold=food_sold,
        weather_score=0.7,
        hour=datetime.now().hour,
        historical_entries=list(food_data_col.find({"restaurant_email": current_user})),
        baseline_prediction=trained_result["prediction"] if trained_result else None,
        baseline_confidence=trained_result["confidence"] if trained_result else None,
        provider_type=provider_type,
    )
    
    return jsonify({
        "message": "Food data submitted successfully",
        "provider_type": provider_type,
        "remaining_food": remaining_food,
        "ai_prediction": ai_result["predicted_surplus"],
        "ai_confidence": ai_result["confidence"],
        "ai_message": ai_result["message"],
        "ai_suggestions": ai_result["suggestions"],
        "ai_source": ai_result["source"],
        "ai_model": ai_result["model"],
        "prediction_engine": "trained_surplus_model" if trained_result else "heuristic",
        "food_entry": serialize_document(food_entry)
    }), 201

@app.route("/api/restaurant/send-alert", methods=["POST"])
@role_required(*PROVIDER_ROLES)
def send_rescue_alert():
    current_user = get_jwt_identity()
    data = request.json or {}
    
    # Find or create restaurant profile
    restaurant = update_provider_profile(current_user, data)
    provider_type = get_provider_type(restaurant)
    
    surplus_meals = int(data.get("surplus_meals", 0))
    
    if surplus_meals <= 0:
        return jsonify({"message": "No surplus to donate"}), 400

    items = data.get("items", [])
    categories = build_alert_categories(
        items,
        data.get("category", "Mixed"),
        data.get("food_type", "Mixed"),
        surplus_meals
    )
    remaining_portions = get_alert_remaining_portions(categories)
    latest_food_entries = list(
        food_data_col.find({"restaurant_email": current_user}).sort("timestamp", -1).limit(1)
    )
    linked_food_entry = latest_food_entries[0] if latest_food_entries else None
    price_per_portion = safe_float(
        data.get("price_per_portion", data.get("price")),
        restaurant.get("price_per_portion", get_provider_config(provider_type)["price_per_portion"]),
    )
    available_after = (
        data.get("available_after")
        or restaurant.get("available_after")
        or data.get("pickup_time")
        or restaurant.get("closing_time", "21:30")
    )
    minimum_pickup = max(
        1,
        safe_int(data.get("minimum_pickup"), restaurant.get("minimum_pickup", get_provider_config(provider_type)["minimum_pickup"])),
    )
    
    # Create alert for NGOs
    alert = {
        "restaurant_email": current_user,
        "restaurant_name": restaurant.get("name", "Restaurant"),
        "provider_email": current_user,
        "provider_name": restaurant.get("name", "Provider"),
        "provider_type": provider_type,
        "provider_label": restaurant.get("provider_label", get_provider_label(provider_type)),
        "location": restaurant.get("location", "Unknown"),
        "phone": restaurant.get("phone", ""),
        "food_entry_id": linked_food_entry.get("_id") if linked_food_entry else None,
        "surplus_meals": remaining_portions,
        "food_type": data.get("food_type", "Mixed"),
        "category": data.get("category", "Mixed"),
        "categories": categories,
        "items": items,
        "price": price_per_portion,
        "price_per_portion": price_per_portion,
        "pickup_time": data.get("pickup_time", available_after),
        "available_after": available_after,
        "minimum_pickup": minimum_pickup,
        "event_name": data.get("event_name", restaurant.get("event_name", "")),
        "guest_count": max(0, safe_int(data.get("guest_count"), restaurant.get("guest_count", 0))),
        "expected_surplus": max(
            0,
            safe_int(data.get("expected_surplus"), restaurant.get("expected_surplus", remaining_portions)),
        ),
        "daily_surplus_auto_entry": coerce_bool(
            data.get("daily_surplus_auto_entry"),
            restaurant.get("daily_surplus_auto_entry", False),
        ),
        "recurring_alerts": coerce_bool(
            data.get("recurring_alerts"),
            restaurant.get("recurring_alerts", False),
        ),
        "status": "pending",
        "created_at": utc_now(),
        "expires_at": utc_now() + timedelta(hours=2)
    }
    
    alerts_col.insert_one(alert)
    
    # Send SMS to NGOs (Twilio) - skip in mock mode
    try:
        if client and TWILIO_NUMBER:
            ngos = list(ngos_col.find({"active": True}))
            for ngo in ngos:
                if "phone" in ngo:
                    message = client.messages.create(
                        body=(
                            f"Food Rescue Alert\n{restaurant['name']} ({get_provider_label(provider_type)}) has {surplus_meals} meals available."
                            f"\nPickup by: {data.get('pickup_time', available_after)}\nReply YES to accept."
                        ),
                        from_=TWILIO_NUMBER,
                        to=ngo["phone"]
                    )
                    print(f"SMS sent to NGO: {message.sid}")
    except Exception as e:
        print(f"SMS error: {e}")
    return jsonify({
        "message": "Alert sent to NGOs successfully!",
        "alert_id": str(alert.get("_id", "unknown"))
    }), 200


# -------------------------
# NGO Routes
# -------------------------
@app.route("/api/ngo/dashboard", methods=["GET"])
@role_required("ngo")
def ngo_dashboard():
    current_user = get_jwt_identity()
    
    # Find or create NGO profile
    ngo = get_or_create_ngo_profile(current_user)
    
    # Get active alerts
    try:
        active_alerts = list(alerts_col.find({
            "status": {"$in": ["pending", "partially_reserved"]}
        }).sort("created_at", -1))
        
        # Convert ObjectId to string for JSON
        active_alerts = [serialize_document(alert) for alert in active_alerts]
    except Exception as e:
        print(f"Error getting alerts: {e}")
        active_alerts = []

    try:
        ngo_orders = list(orders_col.find({
            "ngo_email": current_user
        }).sort("created_at", -1))
        ngo_orders = [serialize_document(order) for order in ngo_orders]
    except Exception as e:
        print(f"Error getting orders: {e}")
        ngo_orders = []
    
    return jsonify({
        "ngo": serialize_document(ngo),
        "alerts": active_alerts,
        "orders": ngo_orders
    }), 200

@app.route("/api/ngo/accept-alert/<alert_id>", methods=["POST"])
@role_required("ngo")
def accept_alert(alert_id):
    current_user = get_jwt_identity()
    data = request.json or {}
    
    alert = alerts_col.find_one({"_id": alert_id})
    if not alert:
        return jsonify({"error": "Alert not found"}), 404

    if alert.get("status") not in {"pending", "partially_reserved"}:
        return jsonify({"error": "This alert is no longer available"}), 400

    alert_categories = [dict(category) for category in alert.get("categories", [])]
    if not alert_categories:
        alert_categories = build_alert_categories(
            alert.get("items", []),
            alert.get("category", "Mixed"),
            alert.get("food_type", "Mixed"),
            int(alert.get("surplus_meals", 0) or 0),
        )

    selected_items = []
    total_portions = 0
    selected_map = data.get("items", {})
    updated_categories = []
    for category in alert_categories:
        category_name = category.get("name", "Mixed")
        available = int(category.get("available", 0) or 0)
        quantity = int(selected_map.get(category_name, 0))
        if quantity > available:
            return jsonify({"error": f"Only {available} portions left for {category_name}"}), 400
        if quantity <= 0:
            updated_categories.append({
                **category,
                "available": available
            })
            continue
        total_portions += quantity
        selected_items.append({
            "category": category_name,
            "quantity": quantity,
            "food_type": category.get("food_type", alert.get("food_type", "Mixed"))
        })
        updated_categories.append({
            **category,
            "available": available - quantity
        })

    if total_portions <= 0:
        return jsonify({"error": "Select at least one category portion"}), 400

    remaining_portions = get_alert_remaining_portions(updated_categories)
    minimum_pickup = max(1, safe_int(alert.get("minimum_pickup", 1), 1))
    if total_portions < minimum_pickup:
        return jsonify({"error": f"Minimum pickup is {minimum_pickup} portions for this provider"}), 400

    next_status = "partially_reserved" if remaining_portions > 0 else "accepted"
    provider_type = get_provider_type(alert)
    unit_price = safe_float(alert.get("price_per_portion", alert.get("price", 0)), 0)

    alerts_col.update_one(
        {"_id": alert_id},
        {"$set": {
            "status": next_status,
            "accepted_by": current_user,
            "accepted_at": utc_now(),
            "reserved_portions": int(alert.get("reserved_portions", 0) or 0) + total_portions,
            "surplus_meals": remaining_portions,
            "categories": updated_categories
        }}
    )

    order = {
        "ngo_email": current_user,
        "restaurant_email": alert["restaurant_email"],
        "restaurant_name": alert.get("restaurant_name", "Restaurant"),
        "provider_email": alert.get("provider_email", alert["restaurant_email"]),
        "provider_name": alert.get("provider_name", alert.get("restaurant_name", "Restaurant")),
        "provider_type": provider_type,
        "provider_label": alert.get("provider_label", get_provider_label(provider_type)),
        "alert_id": alert_id,
        "items": selected_items,
        "items_summary": summarize_order_items(selected_items),
        "total_portions": total_portions,
        "unit_price": unit_price,
        "total_price": unit_price * total_portions,
        "pickup_time": data.get("pickup_time", alert.get("pickup_time", "21:30")),
        "payment_method": data.get("payment_method", "free"),
        "notes": data.get("notes", ""),
        "status": "Accepted",
        "created_at": utc_now()
    }
    inserted_order = orders_col.insert_one(order)
    updated_alert = alerts_col.find_one({"_id": alert_id}) or {
        **alert,
        "status": next_status,
        "surplus_meals": remaining_portions,
        "categories": updated_categories
    }
    
    # Notify restaurant via SMS
    try:
        restaurant = restaurants_col.find_one({"email": alert["restaurant_email"]})
        if client and TWILIO_NUMBER and restaurant and "phone" in restaurant:
            client.messages.create(
                body=(
                    f"Good News! {current_user} accepted {total_portions} portions from your donation."
                    f" {remaining_portions} portions are still available. Pickup at {alert['pickup_time']}."
                ),
                from_=TWILIO_NUMBER,
                to=restaurant["phone"]
            )
    except Exception as e:
        print(f"SMS error: {e}")
    
    return jsonify({
        "message": f"Alert accepted! {get_provider_label(provider_type)} notified.",
        "order": serialize_document({**order, "_id": inserted_order.inserted_id}),
        "alert": serialize_document(updated_alert)
    }), 200

@app.route("/api/ngo/reject-alert/<alert_id>", methods=["POST"])
@role_required("ngo")
def reject_alert(alert_id):
    alerts_col.update_one(
        {"_id": alert_id},
        {"$set": {"status": "rejected"}}
    )
    return jsonify({"message": "Alert rejected"}), 200

@app.route("/api/ngo/mark-collected/<alert_id>", methods=["POST"])
@role_required("ngo")
def mark_collected(alert_id):
    alerts_col.update_one(
        {"_id": alert_id},
        {"$set": {
            "status": "collected",
            "collected_at": utc_now()
        }}
    )
    orders_col.update_one(
        {"alert_id": alert_id},
        {"$set": {
            "status": "Collected",
            "collected_at": utc_now()
        }}
    )
    return jsonify({"message": "Marked as collected! Thank you!"}), 200


@app.route("/api/ngo/mark-order-collected/<order_id>", methods=["POST"])
@role_required("ngo")
def mark_order_collected(order_id):
    current_user = get_jwt_identity()
    order = orders_col.find_one({"_id": order_id})
    if not order:
        return jsonify({"error": "Order not found"}), 404
    if order.get("ngo_email") != current_user:
        return jsonify({"error": "You can only update your own orders"}), 403
    if order.get("status") == "Collected":
        return jsonify({"message": "Order already marked as collected"}), 200

    alert_id = order.get("alert_id")
    alert = alerts_col.find_one({"_id": alert_id})
    orders_col.update_one(
        {"_id": order_id},
        {"$set": {
            "status": "Collected",
            "collected_at": utc_now()
        }}
    )
    updated_order = orders_col.find_one({"_id": order_id}) or {**order, "status": "Collected"}
    updated_food_entry = apply_collected_order_to_food_data(updated_order, alert)

    related_orders = list(orders_col.find({"alert_id": alert_id}))
    if alert:
        remaining_portions = int(alert.get("surplus_meals", 0) or 0)
        all_collected = bool(related_orders) and all(
            current_order.get("status") == "Collected" for current_order in related_orders
        )
        if remaining_portions <= 0 and all_collected:
            alerts_col.update_one(
                {"_id": alert_id},
                {"$set": {
                    "status": "collected",
                    "collected_at": utc_now()
                }}
            )

    return jsonify({
        "message": "Marked as collected! Thank you!",
        "food_data": serialize_document(updated_food_entry)
    }), 200


# -------------------------
# Admin Routes
# -------------------------
@app.route("/api/admin/dashboard", methods=["GET"])
@role_required("admin")
def admin_dashboard():
    start_of_day = datetime.combine(datetime.now().date(), datetime.min.time())
    provider_counts = {role: 0 for role in PROVIDER_ROLES}
    for provider in restaurants_col.find():
        provider_counts[get_provider_type(provider)] += 1

    # Get statistics
    total_restaurants = provider_counts["restaurant"]
    total_hotels = provider_counts["hotel"]
    total_banquets = provider_counts["banquet"]
    total_providers = sum(provider_counts.values())
    total_ngos = ngos_col.count_documents({})
    active_alerts_today = alerts_col.count_documents({
        "created_at": {"$gte": start_of_day}
    })
    
    # Today's food saved
    today_food_saved = 0
    collected_orders = list(orders_col.find({
        "status": "Collected",
        "created_at": {"$gte": start_of_day}
    }))
    for order in collected_orders:
        today_food_saved += safe_int(order.get("total_portions", 0))
    
    # Recent alerts
    recent_alerts = list(alerts_col.find().sort("created_at", pymongo.DESCENDING).limit(10))
    recent_alerts = [serialize_document(alert) for alert in recent_alerts]
    
    return jsonify({
        "stats": {
            "total_providers": total_providers,
            "total_restaurants": total_restaurants,
            "total_hotels": total_hotels,
            "total_banquets": total_banquets,
            "total_ngos": total_ngos,
            "active_alerts_today": active_alerts_today,
            "food_saved_today": today_food_saved
        },
        "recent_alerts": recent_alerts
    }), 200

@app.route("/api/admin/users", methods=["GET"])
@role_required("admin")
def get_all_users():
    users = list(users_col.find({}, {"password": 0}))
    hydrated_users = []
    for user in users:
        if is_provider_role(user.get("role")):
            profile = restaurants_col.find_one({"email": user.get("email")}) or {}
            user = {
                **user,
                "provider_type": get_provider_type(profile or user),
                "price_per_portion": profile.get("price_per_portion", user.get("price_per_portion")),
                "minimum_pickup": profile.get("minimum_pickup", user.get("minimum_pickup")),
            }
        hydrated_users.append(user)
    return jsonify({"users": [serialize_document(user) for user in hydrated_users]}), 200

@app.route("/api/admin/add-restaurant", methods=["POST"])
@role_required("admin")
def add_restaurant():
    data = request.json or {}
    email = data.get("email")
    role = get_provider_type(data.get("role", "restaurant"))
    
    if users_col.find_one({"email": email}):
        return jsonify({"error": "User already exists"}), 400
    
    # Similar to register but admin creates it
    password = bcrypt.hashpw(data.get("password", "default123").encode("utf-8"), bcrypt.gensalt())
    
    user = {
        "email": email,
        "password": password,
        "role": role,
        "name": data.get("name"),
        "location": data.get("location", "Unknown"),
        "phone": data.get("phone", ""),
        "subscription": "free",
        "created_at": utc_now()
    }
    provider_profile = build_provider_profile(email, user=user, payload=data)
    user.update({
        "price_per_portion": provider_profile["price_per_portion"],
        "minimum_pickup": provider_profile["minimum_pickup"],
        "available_after": provider_profile["available_after"],
        "daily_surplus_auto_entry": provider_profile["daily_surplus_auto_entry"],
        "recurring_alerts": provider_profile["recurring_alerts"],
        "event_name": provider_profile["event_name"],
        "guest_count": provider_profile["guest_count"],
        "expected_surplus": provider_profile["expected_surplus"],
        "closing_time": provider_profile["closing_time"],
    })
    users_col.insert_one(user)
    
    get_or_create_provider_profile(email, user)
    
    return jsonify({"message": f"{get_provider_label(role)} added successfully"}), 201

@app.route("/api/admin/remove-restaurant/<email>", methods=["DELETE"])
@role_required("admin")
def remove_restaurant(email):
    user = users_col.find_one({"email": email})
    if not user or not is_provider_role(user.get("role")):
        return jsonify({"error": "Provider not found"}), 404
    users_col.delete_one({"email": email})
    restaurants_col.delete_one({"email": email})
    return jsonify({"message": f"{get_provider_label(user.get('role'))} removed"}), 200

@app.route("/api/admin/add-ngo", methods=["POST"])
@role_required("admin")
def add_ngo():
    data = request.json or {}
    email = data.get("email")
    
    if users_col.find_one({"email": email}):
        return jsonify({"error": "User already exists"}), 400
    
    password = bcrypt.hashpw(data.get("password", "default123").encode("utf-8"), bcrypt.gensalt())
    
    user = {
        "email": email,
        "password": password,
        "role": "ngo",
        "name": data.get("name"),
        "location": data.get("location", "Unknown"),
        "phone": data.get("phone", ""),
        "subscription": "free",
        "created_at": utc_now()
    }
    users_col.insert_one(user)
    
    get_or_create_ngo_profile(email, user)
    
    return jsonify({"message": "NGO added successfully"}), 201

@app.route("/api/admin/remove-ngo/<email>", methods=["DELETE"])
@role_required("admin")
def remove_ngo(email):
    users_col.delete_one({"email": email, "role": "ngo"})
    ngos_col.delete_one({"email": email})
    return jsonify({"message": "NGO removed"}), 200


# Twilio Setup (ADD YOUR KEYS)
ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_NUMBER = os.getenv("TWILIO_NUMBER", "")

client = Client(ACCOUNT_SID, AUTH_TOKEN) if ACCOUNT_SID and AUTH_TOKEN else None


def send_sms(surplus):
    if not client or not TWILIO_NUMBER:
        print("Twilio not configured; skipping SMS send")
        return

    try:
        message = client.messages.create(
            body=(
                f"Food Rescue Alert\nRestaurant: {restaurant_data['name']}\nSurplus Meals: {surplus}"
                "\nPickup at 9:30 PM\n\nReply YES to confirm."
            ),
            from_=TWILIO_NUMBER,
            to="+917004228037"
        )
        print("SMS Sent:", message.sid)
    except Exception as e:
        print("Error sending SMS:", e)

# -------------------------
# Legacy Routes (Keep for backward compatibility)
# -------------------------
@app.route("/")
def home():
    return "LastMile Backend is running"

@app.route("/trigger-rescue")
def trigger_rescue():
    surplus = calculate_surplus(restaurant_data["avg_sales"], restaurant_data["today_sales"])
    if surplus > 10:
        send_sms(surplus)
        return jsonify({
            "message": "Rescue triggered & SMS sent!",
            "surplus_meals": surplus
        })
    else:
        return jsonify({"message": "No surplus today"})

@app.route('/sms', methods=['POST'])
def sms_reply():
    body = request.values.get('Body', '').strip().upper()
    resp = MessagingResponse()
    if body == 'YES':
        try:
            if client and TWILIO_NUMBER:
                client.messages.create(
                    body="Pickup confirmed by NGO. Food ready for collection at 9:30 PM.",
                    from_=TWILIO_NUMBER,
                    to=restaurant_data['phone']
                )
                print("Notification sent to restaurant")
        except Exception as e:
            print("Error notifying restaurant:", e)
        resp.message("Thank you! Restaurant has been notified.")
    else:
        resp.message("Please reply YES to confirm pickup.")
    return str(resp)

@app.route('/update-sales', methods=['POST'])
def update_sales():
    data = request.get_json()
    if 'sales' in data:
        restaurant_data['today_sales'] = data['sales']
        return jsonify({"message": "Sales updated", "new_sales": data['sales']})
    return jsonify({"error": "Invalid data"}), 400


# ==================== SUBSCRIPTION ROUTES ====================
@app.route("/api/subscription/plans", methods=["GET"])
@role_required(*PROVIDER_ROLES)
def get_subscription_plans():
    current_user = get_jwt_identity()
    user = users_col.find_one({"email": current_user}) or {}
    provider_type = get_provider_type(user)
    return jsonify({
        "plans": [build_provider_subscription_plan(provider_type)],
        "provider_type": provider_type,
    }), 200

@app.route("/api/subscription/activate", methods=["POST"])
@role_required(*PROVIDER_ROLES)
def activate_subscription():
    current_user = get_jwt_identity()
    data = request.json or {}
    plan_id = data.get("plan")
    payment_id = data.get("payment_id")
    
    if not plan_id:
        return jsonify({"error": "Plan ID required"}), 400
    
    user = users_col.find_one({"email": current_user}) or {}
    provider_type = get_provider_type(user)
    expected_plan = build_provider_subscription_plan(provider_type)
    if plan_id != expected_plan["id"]:
        return jsonify({"error": f"Invalid plan for {get_provider_label(provider_type).lower()} accounts"}), 400
    
    # Update user subscription
    users_col.update_one(
        {"email": current_user},
        {"$set": {"subscription": plan_id, "payment_id": payment_id}}
    )
    updated_user = users_col.find_one({"email": current_user}, {"password": 0})
    
    return jsonify({
        "message": "Subscription activated successfully!",
        "plan": plan_id,
        "user": serialize_document(updated_user)
    }), 200


# ==================== OLLAMA ROUTES ====================
@app.route("/api/ai/predict-surplus", methods=["POST"])
@jwt_required()
def predict_surplus():
    data = request.json or {}
    current_user = get_jwt_identity()
    user = users_col.find_one({"email": current_user}) or {}
    provider_profile = restaurants_col.find_one({"email": current_user}) or {}
    provider_type = get_provider_type(data.get("provider_type") or provider_profile or user)
    trained_result = predict_with_trained_surplus_model(
        day_of_week=int(data.get("day_of_week", datetime.now().weekday())),
        food_prepared=float(data.get("food_prepared", 100)),
        food_sold=float(data.get("food_sold", data.get("quantity", 70))),
        hour=int(data.get("hour", datetime.now().hour)),
        month=int(data.get("month", datetime.now().month)),
        provider_type=provider_type,
    )
    result = build_surplus_prediction(
        ollama_service=ollama_service,
        day_of_week=int(data.get("day_of_week", datetime.now().weekday())),
        food_prepared=float(data.get("food_prepared", 100)),
        food_sold=float(data.get("food_sold", data.get("quantity", 70))),
        weather_score=float(data.get("weather_score", 0.7)),
        hour=int(data.get("hour", datetime.now().hour)),
        historical_entries=list(food_data_col.find({"restaurant_email": current_user})),
        baseline_prediction=trained_result["prediction"] if trained_result else None,
        baseline_confidence=trained_result["confidence"] if trained_result else None,
        provider_type=provider_type,
    )

    return jsonify({
        **result,
        "provider_type": provider_type,
        "prediction_engine": "trained_surplus_model" if trained_result else "heuristic",
        "trained_model": trained_result["metadata"] if trained_result else None,
    }), 200

    """

    return jsonify({
        "predicted_surplus": result["predicted_surplus"],
        "confidence": result["confidence"],
        "message": f"AI predicts ~{prediction} meals surplus tomorrow",
        "message": result["message"],
        "suggestions": result["suggestions"],
        "source": result["source"],
        "model": result["model"],
    }), 200
    """

@app.route("/api/ai/recommend-ngo", methods=["POST"])
@jwt_required()
def recommend_ngo():
    data = request.json or {}
    result = build_ngo_recommendations(
        ollama_service=ollama_service,
        restaurant_location=data.get("location", "Demo Location"),
        surplus_meals=int(data.get("surplus_meals", 20)),
        food_categories=data.get("categories", ["Rice", "Curry"]),
        provider_type=data.get("provider_type", "restaurant"),
        ngos=list(ngos_col.find({"active": True})),
        order_counts=build_order_counts(),
    )

    return jsonify(result), 200

@app.route("/api/ai/ngo-behavior", methods=["GET"])
@jwt_required()
def analyze_ngo_behavior():
    return jsonify({"behavior_analysis": build_behavior_analysis()}), 200

@app.route("/api/ai/prediction-accuracy", methods=["GET"])
@jwt_required()
def get_prediction_accuracy():
    result = build_prediction_accuracy(
        ollama_service=ollama_service,
        weekly_snapshot=build_weekly_prediction_snapshot(),
    )

    return jsonify(result), 200

@app.route("/api/admin/smart-matches", methods=["GET"])
@role_required("admin")
def get_smart_matches():
    result = build_smart_matches(
        ollama_service=ollama_service,
        active_alerts=list(alerts_col.find({"status": {"$in": ["pending", "partially_reserved"]}}).sort("created_at", -1).limit(5)),
        active_ngos=list(ngos_col.find({"active": True})),
        order_counts=build_order_counts(),
    )

    return jsonify(result), 200


@app.route("/api/ai/admin-insights", methods=["GET"])
@role_required("admin")
def get_admin_insights():
    prediction_result = build_prediction_accuracy(
        ollama_service=ollama_service,
        weekly_snapshot=build_weekly_prediction_snapshot(),
    )
    smart_match_result = build_smart_matches(
        ollama_service=ollama_service,
        active_alerts=list(alerts_col.find({"status": {"$in": ["pending", "partially_reserved"]}}).sort("created_at", -1).limit(5)),
        active_ngos=list(ngos_col.find({"active": True})),
        order_counts=build_order_counts(),
    )
    ollama_status = ollama_service.get_status()

    return jsonify({
        "behavior_analysis": build_behavior_analysis(),
        "predictions": prediction_result["predictions"],
        "average_accuracy": prediction_result["average_accuracy"],
        "matches": smart_match_result["matches"],
        "provider_distribution": build_provider_distribution(),
        "provider_insights": build_provider_insights(),
        "expansion_message": PLATFORM_EXPANSION_MESSAGE,
        "source": "ollama" if "ollama" in {prediction_result["source"], smart_match_result["source"]} else "fallback",
        "models": {
            "prediction": prediction_result["model"],
            "matching": smart_match_result["model"],
        },
        "status": ollama_status,
        "trained_model": trained_surplus_model.metadata() if trained_surplus_model else None,
    }), 200


@app.route("/api/ai/status", methods=["GET"])
@jwt_required()
def get_ai_status():
    return jsonify({
        **ollama_service.get_status(),
        "trained_model_available": trained_surplus_model is not None,
        "trained_model": trained_surplus_model.metadata() if trained_surplus_model else None,
    }), 200


# -------------------------
# Run Server
# -------------------------
if __name__ == "__main__":
    debug_enabled = os.getenv("FLASK_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"}
    app.run(host="0.0.0.0", debug=debug_enabled, port=int(os.getenv("PORT", "5000")))
