from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity, get_jwt
import bcrypt
import pymongo
from twilio.rest import Client
from twilio.twiml.messaging_response import MessagingResponse
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, timedelta
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
    print("✅ MongoDB connected")
except Exception as e:
    print(f"⚠️ MongoDB not available, using mock mode: {e}")
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
        'subscription': 'premium',
        'createdAt': datetime.now(),
        'loginHistory': []
    },
    {
        '_id': '2',
        'name': 'Demo NGO',
        'email': 'ngo@demo.com',
        'password': bcrypt.hashpw('password123'.encode('utf-8'), bcrypt.gensalt()),
        'role': 'ngo',
        'subscription': 'premium',
        'createdAt': datetime.now(),
        'loginHistory': []
    },
    {
        '_id': '3',
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
            item['created_at'] = datetime.utcnow()
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

def get_or_create_restaurant_profile(email, user=None):
    restaurant = restaurants_col.find_one({"email": email})
    if restaurant:
        return restaurant

    user = user or users_col.find_one({"email": email}) or {}
    restaurant = {
        "email": email,
        "name": user.get("name", email.split("@")[0]),
        "location": user.get("location", "Unknown"),
        "phone": user.get("phone", ""),
        "closing_time": user.get("closing_time", "22:00")
    }
    restaurants_col.insert_one(restaurant)
    return restaurant

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
            "last_collection_at": datetime.utcnow()
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


def predict_with_trained_surplus_model(day_of_week, food_prepared, food_sold, hour, month=None):
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
    return {
        "prediction": prediction,
        "confidence": 96 if trained_surplus_model else 62,
        "metadata": trained_surplus_model.metadata(),
    }


# -------------------------
# Authentication Routes
# -------------------------
# Authentication Routes
# -------------------------
@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    email = data.get("email")
    password = data.get("password")
    role = data.get("role")
    
    if not all([email, password, role]):
        return jsonify({"error": "Email, password, and role are required"}), 400
    
    # Find user
    user = users_col.find_one({"email": email})
    
    if not user:
        # Auto-create demo users for testing
        if email in ["restaurant@demo.com", "ngo@demo.com", "admin@demo.com"] and password == "password123":
            hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
            user_data = {
                "email": email,
                "password": hashed_password,
                "role": role,
                "name": role.title(),
                "subscription": "premium",
                "createdAt": datetime.utcnow(),
                "loginHistory": []
            }
            users_col.insert_one(user_data)
            
            # Create profile
            if role == "restaurant":
                restaurants_col.insert_one({
                    "email": email,
                    "name": "Demo Restaurant",
                    "location": "Demo Location",
                    "phone": "+917004228038",
                    "closing_time": "22:00"
                })
            elif role == "ngo":
                ngos_col.insert_one({
                    "email": email,
                    "name": "Demo NGO",
                    "location": "Demo Location",
                    "phone": "+917004228037",
                    "active": True
                })
            
            access_token = create_access_token(
                identity=email,
                additional_claims={"role": role, "name": role.title()}
            )
            
            return jsonify({
                "message": "Demo account created & logged in",
                "token": access_token,
                "role": role,
                "name": role.title(),
                "subscription": "premium"
            }), 200
        
        return jsonify({"error": "User not found"}), 404
    
    # Verify password
    if not bcrypt.checkpw(password.encode("utf-8"), user["password"]):
        return jsonify({"error": "Invalid credentials"}), 401
    
    # Verify role matches
    if user["role"] != role:
        return jsonify({"error": "Invalid role selection"}), 403
    
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
        "subscription": user.get("subscription", "free")
    }), 200


# -------------------------
# Restaurant Routes
# -------------------------
@app.route("/api/register", methods=["POST"])
def register():
    data = request.json
    email = data.get("email")
    password = data.get("password")
    role = data.get("role")
    name = data.get("name")
    location = data.get("location", "Unknown")
    phone = data.get("phone", "")
    
    if not all([email, password, role, name]):
        return jsonify({"error": "All fields are required"}), 400
    
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
        "createdAt": datetime.utcnow(),
        "loginHistory": []
    }
    
    users_col.insert_one(user)
    
    # Create profile based on role
    if role == "restaurant":
        restaurants_col.insert_one({
            "email": email,
            "name": name,
            "location": location,
            "phone": phone,
            "closing_time": "22:00"
        })
    elif role == "ngo":
        ngos_col.insert_one({
            "email": email,
            "name": name,
            "location": location,
            "phone": phone,
            "active": True
        })
    
    return jsonify({"message": "Registration successful! Please login."}), 201

@app.route("/api/restaurant/dashboard", methods=["GET"])
@role_required("restaurant")
def restaurant_dashboard():
    current_user = get_jwt_identity()
    
    restaurant = get_or_create_restaurant_profile(current_user)
    food_history = list(
        food_data_col.find({"restaurant_email": current_user}).sort("timestamp", -1).limit(20)
    )
    latest_food_data = food_history[0] if food_history else None
    chart_data = build_restaurant_weekly_chart(current_user)
    
    return jsonify({
        "restaurant": serialize_document(restaurant),
        "food_data": serialize_document(latest_food_data),
        "food_history": [serialize_document(entry) for entry in food_history],
        "chart_data": chart_data
    }), 200

@app.route("/api/restaurant/food-data", methods=["POST"])
@role_required("restaurant")
def submit_food_data():
    current_user = get_jwt_identity()
    data = request.json
    
    food_prepared = float(data.get("food_prepared", 0))
    food_sold = float(data.get("food_sold", 0))
    food_type = data.get("food_type", "Both")
    category = data.get("category", "Mixed")
    closing_time = data.get("closing_time", "22:00")
    price = float(data.get("price", 20))
    discount_price = float(data.get("discount_price", 20))
    
    remaining_food = calculate_surplus(food_prepared, food_sold)
    
    # Save food data
    food_entry = {
        "restaurant_email": current_user,
        "date": datetime.now().date(),
        "timestamp": datetime.utcnow(),
        "food_prepared": food_prepared,
        "food_sold": food_sold,
        "remaining_food": remaining_food,
        "donated_food": 0,
        "food_type": food_type,
        "category": category,
        "closing_time": closing_time,
        "price": price,
        "discount_price": discount_price
    }
    
    food_data_col.insert_one(food_entry)
    
    trained_result = predict_with_trained_surplus_model(
        day_of_week=datetime.now().weekday(),
        food_prepared=food_prepared,
        food_sold=food_sold,
        hour=datetime.now().hour,
        month=datetime.now().month,
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
    )
    
    return jsonify({
        "message": "Food data submitted successfully",
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
@role_required("restaurant")
def send_rescue_alert():
    current_user = get_jwt_identity()
    data = request.json
    
    # Find or create restaurant profile
    restaurant = get_or_create_restaurant_profile(current_user)
    
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
    
    # Create alert for NGOs
    alert = {
        "restaurant_email": current_user,
        "restaurant_name": restaurant.get("name", "Restaurant"),
        "location": restaurant.get("location", "Unknown"),
        "phone": restaurant.get("phone", ""),
        "food_entry_id": linked_food_entry.get("_id") if linked_food_entry else None,
        "surplus_meals": remaining_portions,
        "food_type": data.get("food_type", "Mixed"),
        "category": data.get("category", "Mixed"),
        "categories": categories,
        "items": items,
        "price": float(data.get("price", 20)),
        "pickup_time": data.get("pickup_time", "21:30"),
        "status": "pending",
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(hours=2)
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
                            f"Food Rescue Alert\n{restaurant['name']} has {surplus_meals} meals available."
                            f"\nPickup by: {data.get('pickup_time', '21:30')}\nReply YES to accept."
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
    next_status = "pending" if remaining_portions > 0 else "accepted"

    alerts_col.update_one(
        {"_id": alert_id},
        {"$set": {
            "status": next_status,
            "accepted_by": current_user,
            "accepted_at": datetime.utcnow(),
            "reserved_portions": int(alert.get("reserved_portions", 0) or 0) + total_portions,
            "surplus_meals": remaining_portions,
            "categories": updated_categories
        }}
    )

    order = {
        "ngo_email": current_user,
        "restaurant_email": alert["restaurant_email"],
        "restaurant_name": alert.get("restaurant_name", "Restaurant"),
        "alert_id": alert_id,
        "items": selected_items,
        "items_summary": summarize_order_items(selected_items),
        "total_portions": total_portions,
        "total_price": float(alert.get("price", 0)) * total_portions,
        "pickup_time": data.get("pickup_time", alert.get("pickup_time", "21:30")),
        "payment_method": data.get("payment_method", "free"),
        "notes": data.get("notes", ""),
        "status": "Accepted",
        "created_at": datetime.utcnow()
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
        "message": "Alert accepted! Restaurant notified.",
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
            "collected_at": datetime.utcnow()
        }}
    )
    orders_col.update_one(
        {"alert_id": alert_id},
        {"$set": {
            "status": "Collected",
            "collected_at": datetime.utcnow()
        }}
    )
    return jsonify({"message": "Marked as collected! Thank you! 🎉"}), 200


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
            "collected_at": datetime.utcnow()
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
                    "collected_at": datetime.utcnow()
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

    # Get statistics
    total_restaurants = restaurants_col.count_documents({})
    total_ngos = ngos_col.count_documents({})
    active_alerts_today = alerts_col.count_documents({
        "created_at": {"$gte": start_of_day}
    })
    
    # Today's food saved
    today_food_saved = 0
    collected_alerts = list(alerts_col.find({
        "status": "collected",
        "created_at": {"$gte": start_of_day}
    }))
    for alert in collected_alerts:
        today_food_saved += alert.get("surplus_meals", 0)
    
    # Recent alerts
    recent_alerts = list(alerts_col.find().sort("created_at", pymongo.DESCENDING).limit(10))
    recent_alerts = [serialize_document(alert) for alert in recent_alerts]
    
    return jsonify({
        "stats": {
            "total_restaurants": total_restaurants,
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
    return jsonify({"users": [serialize_document(user) for user in users]}), 200

@app.route("/api/admin/add-restaurant", methods=["POST"])
@role_required("admin")
def add_restaurant():
    data = request.json
    email = data.get("email")
    
    if users_col.find_one({"email": email}):
        return jsonify({"error": "User already exists"}), 400
    
    # Similar to register but admin creates it
    password = bcrypt.hashpw(data.get("password", "default123").encode("utf-8"), bcrypt.gensalt())
    
    user = {
        "email": email,
        "password": password,
        "role": "restaurant",
        "name": data.get("name"),
        "created_at": datetime.utcnow()
    }
    users_col.insert_one(user)
    
    restaurants_col.insert_one({
        "email": email,
        "name": data.get("name"),
        "location": data.get("location"),
        "phone": data.get("phone"),
        "closing_time": data.get("closing_time", "22:00")
    })
    
    return jsonify({"message": "Restaurant added successfully"}), 201

@app.route("/api/admin/remove-restaurant/<email>", methods=["DELETE"])
@role_required("admin")
def remove_restaurant(email):
    users_col.delete_one({"email": email, "role": "restaurant"})
    restaurants_col.delete_one({"email": email})
    return jsonify({"message": "Restaurant removed"}), 200

@app.route("/api/admin/add-ngo", methods=["POST"])
@role_required("admin")
def add_ngo():
    data = request.json
    email = data.get("email")
    
    if users_col.find_one({"email": email}):
        return jsonify({"error": "User already exists"}), 400
    
    password = bcrypt.hashpw(data.get("password", "default123").encode("utf-8"), bcrypt.gensalt())
    
    user = {
        "email": email,
        "password": password,
        "role": "ngo",
        "name": data.get("name"),
        "created_at": datetime.utcnow()
    }
    users_col.insert_one(user)
    
    ngos_col.insert_one({
        "email": email,
        "name": data.get("name"),
        "location": data.get("location"),
        "phone": data.get("phone"),
        "active": True
    })
    
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
def get_subscription_plans():
    plans = [
        {
            "id": "free",
            "name": "Free Plan",
            "price": 0,
            "features": [
                "Basic alerts",
                "Limited daily requests (5/day)",
                "Basic dashboard"
            ],
            "limitations": {
                "daily_requests": 5,
                "ai_predictions": False,
                "priority_matching": False
            }
        },
        {
            "id": "premium",
            "name": "⭐ Premium Plan",
            "price": 199,
            "features": [
                "Unlimited alerts",
                "Ollama forecasts",
                "Priority NGO matching",
                "Advanced analytics",
                "24/7 support"
            ],
            "limitations": {
                "daily_requests": -1,  # unlimited
                "ai_predictions": True,
                "priority_matching": True
            }
        }
    ]
    return jsonify({"plans": plans}), 200

@app.route("/api/subscription/activate", methods=["POST"])
@role_required("restaurant", "ngo")
def activate_subscription():
    current_user = get_jwt_identity()
    data = request.json
    plan_id = data.get("plan")
    payment_id = data.get("payment_id")
    
    if not plan_id:
        return jsonify({"error": "Plan ID required"}), 400
    
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
    data = request.json
    trained_result = predict_with_trained_surplus_model(
        day_of_week=int(data.get("day_of_week", datetime.now().weekday())),
        food_prepared=float(data.get("food_prepared", 100)),
        food_sold=float(data.get("food_sold", data.get("quantity", 70))),
        hour=int(data.get("hour", datetime.now().hour)),
        month=int(data.get("month", datetime.now().month)),
    )
    result = build_surplus_prediction(
        ollama_service=ollama_service,
        day_of_week=int(data.get("day_of_week", datetime.now().weekday())),
        food_prepared=float(data.get("food_prepared", 100)),
        food_sold=float(data.get("food_sold", data.get("quantity", 70))),
        weather_score=float(data.get("weather_score", 0.7)),
        hour=int(data.get("hour", datetime.now().hour)),
        historical_entries=list(food_data_col.find({"restaurant_email": get_jwt_identity()})),
        baseline_prediction=trained_result["prediction"] if trained_result else None,
        baseline_confidence=trained_result["confidence"] if trained_result else None,
    )

    return jsonify({
        **result,
        "prediction_engine": "trained_surplus_model" if trained_result else "heuristic",
        "trained_model": trained_result["metadata"] if trained_result else None,
    }), 200

    """

    return jsonify({
        "predicted_surplus": result["predicted_surplus"],
        "confidence": result["confidence"],
        "message": f"🤖 AI predicts ~{prediction} meals surplus tomorrow",
        "message": result["message"],
        "suggestions": result["suggestions"],
        "source": result["source"],
        "model": result["model"],
    }), 200
    """

@app.route("/api/ai/recommend-ngo", methods=["POST"])
@jwt_required()
def recommend_ngo():
    data = request.json
    result = build_ngo_recommendations(
        ollama_service=ollama_service,
        restaurant_location=data.get("location", "Demo Location"),
        surplus_meals=int(data.get("surplus_meals", 20)),
        food_categories=data.get("categories", ["Rice", "Curry"]),
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
        active_alerts=list(alerts_col.find({"status": "pending"}).sort("created_at", -1).limit(5)),
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
        active_alerts=list(alerts_col.find({"status": "pending"}).sort("created_at", -1).limit(5)),
        active_ngos=list(ngos_col.find({"active": True})),
        order_counts=build_order_counts(),
    )
    ollama_status = ollama_service.get_status()

    return jsonify({
        "behavior_analysis": build_behavior_analysis(),
        "predictions": prediction_result["predictions"],
        "average_accuracy": prediction_result["average_accuracy"],
        "matches": smart_match_result["matches"],
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
    app.run(debug=True, port=5000)
