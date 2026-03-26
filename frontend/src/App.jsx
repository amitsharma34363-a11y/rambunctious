import { useState, useEffect } from "react";
import "./App.css";

const API_URL = "http://localhost:5000/api";

function getStoredAuth() {
  const savedToken = localStorage.getItem("token");
  const savedUser = localStorage.getItem("user");

  if (!savedToken || !savedUser) {
    return { token: null, user: null };
  }

  try {
    return {
      token: savedToken,
      user: JSON.parse(savedUser)
    };
  } catch {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    return { token: null, user: null };
  }
}

export default function App() {
  const [{ user, token }, setAuth] = useState(getStoredAuth);
  const [showRegister, setShowRegister] = useState(false);
  const [showSubscriptionGate, setShowSubscriptionGate] = useState(() => {
    const storedAuth = getStoredAuth();
    return Boolean(
      storedAuth.user &&
      storedAuth.user.role !== "admin" &&
      storedAuth.user.subscription !== "premium"
    );
  });

  const handleLogin = (userData, authToken) => {
    localStorage.setItem("token", authToken);
    localStorage.setItem("user", JSON.stringify(userData));
    setAuth({ token: authToken, user: userData });
    setShowSubscriptionGate(userData.role !== "admin" && userData.subscription !== "premium");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setAuth({ token: null, user: null });
    setShowSubscriptionGate(false);
  };

  const handleUserUpdate = (updatedUser) => {
    const nextUser = { ...user, ...updatedUser };
    localStorage.setItem("user", JSON.stringify(nextUser));
    setAuth({ token, user: nextUser });
    setShowSubscriptionGate(false);
  };

  // Add this to help with debugging
  console.log('API_URL:', API_URL);

  if (!user || !token) {
    return showRegister ? (
      <RegisterPage
        onRegister={() => setShowRegister(false)}
        onLoginClick={() => setShowRegister(false)}
      />
    ) : (
      <LoginPage onLogin={handleLogin} onRegisterClick={() => setShowRegister(true)} />
    );
  }

  if (showSubscriptionGate) {
    return (
      <SubscriptionPage
        user={user}
        token={token}
        onLogout={handleLogout}
        onActivate={handleUserUpdate}
      />
    );
  }

  return (
    <div className="dashboard">
      {user.role === "restaurant" && (
        <RestaurantDashboard user={user} token={token} onLogout={handleLogout} />
      )}
      {user.role === "ngo" && (
        <NGODashboard user={user} token={token} onLogout={handleLogout} />
      )}
      {user.role === "admin" && (
        <AdminDashboard user={user} token={token} onLogout={handleLogout} />
      )}
    </div>
  );
}

// ==================== LOGIN PAGE ====================
function LoginPage({ onLogin, onRegisterClick }) {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    role: "restaurant"
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    console.log('Attempting login to:', `${API_URL}/login`);
    console.log('Login data:', { email: formData.email, role: formData.role });

    try {
      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      console.log('Response status:', res.status);

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      const userData = {
        email: formData.email,
        role: data.role,
        name: data.name,
        subscription: data.subscription
      };

      onLogin(userData, data.token);
    } catch (loginError) {
      console.error('Login error:', loginError);
      setError(loginError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>🍱 LastMile Rescue</h1>
          <p>Food Surplus Management System</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Enter password"
              required
            />
          </div>

          <div className="form-group">
            <label>Select Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            >
              <option value="restaurant">🍽️ Restaurant</option>
              <option value="ngo">🤝 NGO</option>
              <option value="admin">🛠️ Admin</option>
            </select>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <p style={{ color: '#666', fontSize: '14px' }}>Don't have an account?</p>
          <button 
            onClick={onRegisterClick}
            style={{
              background: 'none',
              border: 'none',
              color: '#667eea',
              cursor: 'pointer',
              fontSize: '14px',
              textDecoration: 'underline',
              fontWeight: '600'
            }}
          >
            Register here
          </button>
        </div>

        <div style={{ marginTop: "20px", textAlign: "center", fontSize: "13px", color: "#666" }}>
          <p style={{ fontWeight: '600', marginBottom: '10px' }}>Demo Credentials:</p>
          <p>Restaurant: restaurant@demo.com / password123</p>
          <p>NGO: ngo@demo.com / password123</p>
          <p>Admin: admin@demo.com / password123</p>
        </div>
      </div>
    </div>
  );
}

// ==================== REGISTER PAGE ====================
function RegisterPage({ onRegister, onLoginClick }) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "restaurant",
    location: "",
    phone: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match!");
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    console.log('Registering to:', `${API_URL}/register`);
    console.log('Registration data:', { 
      name: formData.name, 
      email: formData.email, 
      role: formData.role,
      location: formData.location 
    });

    try {
      const res = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          location: formData.location,
          phone: formData.phone
        })
      });

      console.log('Response status:', res.status);

      // Check if response is OK
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Registration failed");
      }

      // Try to parse response
      let data;
      try {
        data = await res.json();
      } catch (e) {
        console.error('Failed to parse response:', e);
        throw new Error("Server error - please try again");
      }

      console.log('Registration response:', data);
      alert("✅ Registration successful! Please login.");
      onRegister?.();
    } catch (registerError) {
      console.error('Registration error:', registerError);
      setError(registerError.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>🍱 LastMile Rescue</h1>
          <p>Create Your Account</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name / Organization Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Sharma Restaurant / Help NGO"
              required
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="At least 6 characters"
              required
            />
          </div>

          <div className="form-group">
            <label>Confirm Password</label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder="Re-enter password"
              required
            />
          </div>

          <div className="form-group">
            <label>I am a...</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            >
              <option value="restaurant">🍽️ Restaurant</option>
              <option value="ngo">🤝 NGO</option>
            </select>
          </div>

          <div className="form-group">
            <label>Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="e.g., Mumbai, Delhi"
              required
            />
          </div>

          <div className="form-group">
            <label>Phone Number</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="e.g., +91 9876543210"
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Registering..." : "Create Account"}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <p style={{ color: '#666', fontSize: '14px' }}>Already have an account?</p>
          <button 
            onClick={onLoginClick}
            style={{
              background: 'none',
              border: 'none',
              color: '#667eea',
              cursor: 'pointer',
              fontSize: '14px',
              textDecoration: 'underline',
              fontWeight: '600'
            }}
          >
            Login here
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== SUBSCRIPTION PAGE ====================
function SubscriptionPage({ user, token, onLogout, onActivate }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activatingPlan, setActivatingPlan] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    const loadPlans = async () => {
      try {
        const res = await fetch(`${API_URL}/subscription/plans`);
        const data = await res.json();
        if (!ignore) {
          setPlans(data.plans || []);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError.message || "Unable to load subscription plans");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    void loadPlans();

    return () => {
      ignore = true;
    };
  }, []);

  const activatePlan = async (planId) => {
    setError("");
    setActivatingPlan(planId);

    try {
      const res = await fetch(`${API_URL}/subscription/activate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          plan: planId,
          payment_id: planId === "premium" ? `demo_payment_${Date.now()}` : ""
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unable to activate plan");
      }

      onActivate({
        ...user,
        subscription: data.plan,
        ...(data.user || {})
      });
    } catch (activateError) {
      setError(activateError.message || "Unable to activate subscription");
    } finally {
      setActivatingPlan("");
    }
  };

  return (
    <div className="login-container">
      <div className="login-card" style={{ maxWidth: "960px" }}>
        <div className="dashboard-header" style={{ marginBottom: "24px", padding: 0, boxShadow: "none" }}>
          <div>
            <h1 className="dashboard-title" style={{ marginBottom: "6px" }}>Choose Your Plan</h1>
            <p style={{ color: "#666" }}>
              {user.name}, pick a plan to unlock your {user.role} dashboard.
            </p>
          </div>
          <button className="btn-logout" onClick={onLogout}>Logout</button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading">Loading subscription plans...</div>
        ) : (
          <div className="stats-grid">
            {plans.map((plan) => (
              <div key={plan.id} className="card" style={{ marginBottom: 0, border: plan.id === "premium" ? "2px solid #667eea" : "2px solid #eee" }}>
                <h2 className="card-title" style={{ borderBottom: "none", paddingBottom: 0 }}>{plan.name}</h2>
                <div style={{ fontSize: "36px", fontWeight: "bold", color: "#333", marginBottom: "16px" }}>
                  {plan.price === 0 ? "Free" : `Rs ${plan.price}`}
                </div>
                <div style={{ display: "grid", gap: "10px", marginBottom: "20px", color: "#555" }}>
                  {plan.features.map((feature) => (
                    <div key={feature}>{feature}</div>
                  ))}
                </div>
                <button
                  className="btn-primary"
                  disabled={activatingPlan === plan.id}
                  onClick={() => activatePlan(plan.id)}
                >
                  {activatingPlan === plan.id ? "Activating..." : plan.id === "premium" ? "Upgrade to Premium" : "Continue with Free"}
                </button>
                {plan.id === "premium" && (
                  <p style={{ color: "#666", fontSize: "12px", marginTop: "12px" }}>
                    Demo payment flow enabled. A sample payment id will be generated automatically.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== RESTAURANT DASHBOARD ====================
function RestaurantDashboard({ user, token, onLogout }) {
  const [restaurant, setRestaurant] = useState(null);
  const [foodItems, setFoodItems] = useState([]);
  const [currentItem, setCurrentItem] = useState({
    category: 'Rice',
    food_prepared: '',
    food_sold: '',
    food_type: 'Both',
    closing_time: '22:00',
    price: 20,
    discount_price: 20
  });
  const [message, setMessage] = useState('');
  const [showGraph, setShowGraph] = useState(false);
  const salesData = [
    { day: 'Mon', prepared: 100, sold: 75, wasted: 25 },
    { day: 'Tue', prepared: 95, sold: 80, wasted: 15 },
    { day: 'Wed', prepared: 110, sold: 85, wasted: 25 },
    { day: 'Thu', prepared: 105, sold: 90, wasted: 15 },
    { day: 'Fri', prepared: 130, sold: 95, wasted: 35 },
    { day: 'Sat', prepared: 140, sold: 100, wasted: 40 },
    { day: 'Sun', prepared: 90, sold: 70, wasted: 20 }
  ];

  const normalizeFoodItem = (item) => ({
    ...item,
    id: item.id ?? item._id ?? `${item.category ?? 'item'}-${item.timestamp ?? Date.now()}`,
    remaining:
      item.remaining ??
      item.remaining_food ??
      Math.max(0, Number(item.food_prepared ?? 0) - Number(item.food_sold ?? 0))
  });

  useEffect(() => {
    let ignore = false;

    const loadDashboard = async () => {
      try {
        const res = await fetch(`${API_URL}/restaurant/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (ignore) return;

        if (data.restaurant) {
          setRestaurant(data.restaurant);
        }
        if (data.food_data) {
          setFoodItems([normalizeFoodItem(data.food_data)]);
        }
      } catch (error) {
        console.error('Error fetching dashboard:', error);
      }
    };

    void loadDashboard();

    return () => {
      ignore = true;
    };
  }, [token]);

  const addFoodItem = () => {
    if (!currentItem.food_prepared || !currentItem.food_sold) return;
    
    const newItem = {
      ...currentItem,
      id: Date.now(),
      remaining: parseInt(currentItem.food_prepared) - parseInt(currentItem.food_sold)
    };
    
    setFoodItems([...foodItems, newItem]);
    setCurrentItem({
      category: 'Rice',
      food_prepared: '',
      food_sold: '',
      food_type: 'Both',
      closing_time: '22:00',
      price: 20,
      discount_price: 20
    });
  };

  const handleSubmit = async () => {
    if (foodItems.length === 0) {
      alert('Please add at least one item first!');
      return;
    }
    
    try {
      const totalPrepared = foodItems.reduce((sum, item) => sum + parseInt(item.food_prepared), 0);
      const totalSold = foodItems.reduce((sum, item) => sum + parseInt(item.food_sold), 0);
      const totalRemaining = foodItems.reduce((sum, item) => sum + item.remaining, 0);
      
      console.log('Submitting food data:', {
        totalPrepared,
        totalSold,
        totalRemaining,
        items: foodItems
      });
      
      const res = await fetch(`${API_URL}/restaurant/food-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          food_prepared: totalPrepared,
          food_sold: totalSold,
          food_type: 'Both',
          category: foodItems.map(i => i.category).join(', '),
          closing_time: currentItem.closing_time,
          price: currentItem.price,
          discount_price: currentItem.discount_price
        })
      });
      
      if (!res.ok) {
        throw new Error('Failed to submit data');
      }
      
      const data = await res.json();
      console.log('Response:', data);
      
      setMessage(`✅ Food data submitted! Total surplus: ${totalRemaining} meals`);
      setTimeout(() => setMessage(''), 5000);
    } catch (submitError) {
      console.error('Error:', submitError);
      setMessage('❌ Error submitting data. Please try again.');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const sendAlert = async () => {
    const totalRemaining = foodItems.reduce((sum, item) => sum + item.remaining, 0);
    if (totalRemaining <= 0) {
      alert('No surplus food to donate!');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/restaurant/send-alert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          surplus_meals: totalRemaining,
          food_type: 'Both',
          category: foodItems.map(i => i.category).join(', '),
          price: currentItem.discount_price,
          pickup_time: '21:30',
          items: foodItems
        })
      });
      const data = await res.json();
      alert(data.message || '✅ Alert sent to NGOs successfully!');
    } catch {
      alert('❌ Error sending alert');
    }
  };

  const totalRemaining = foodItems.reduce((sum, item) => sum + item.remaining, 0);

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">🍽️ Restaurant Dashboard</h1>
        <div className="user-info">
          <span className="user-name">{restaurant?.name || user?.name || 'Restaurant'}</span>
          <button className="btn-logout" onClick={onLogout}>Logout</button>
        </div>
      </div>

      {message && <div className="success-message">{message}</div>}

      {/* Sales Graph */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="card-title">📊 Weekly Sales Analytics</h2>
          <button 
            className="btn-small btn-primary" 
            onClick={() => setShowGraph(!showGraph)}
            style={{ width: 'auto' }}
          >
            {showGraph ? 'Hide' : 'Show'} Graph
          </button>
        </div>
        
        {showGraph && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', alignItems: 'flex-end', height: '200px' }}>
              {salesData.map((day) => (
                <div key={day.day} style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                    <div style={{ width: '40px', height: `${(day.prepared/140)*100}%`, background: '#667eea', borderRadius: '4px 4px 0 0' }} title={`Prepared: ${day.prepared}`}></div>
                    <div style={{ width: '40px', height: `${(day.sold/140)*100}%`, background: '#4caf50', borderRadius: '4px 4px 0 0', marginTop: '-2px' }} title={`Sold: ${day.sold}`}></div>
                    <div style={{ width: '40px', height: `${(day.wasted/140)*100}%`, background: '#f44336', borderRadius: '4px 4px 0 0', marginTop: '-2px' }} title={`Wasted: ${day.wasted}`}></div>
                  </div>
                  <div style={{ fontSize: '12px', marginTop: '5px' }}>{day.day}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '15px', fontSize: '13px' }}>
              <span><span style={{ color: '#667eea' }}>■</span> Prepared</span>
              <span><span style={{ color: '#4caf50' }}>■</span> Sold</span>
              <span><span style={{ color: '#f44336' }}>■</span> Wasted</span>
            </div>
          </div>
        )}
      </div>

      {/* Multi-Item Entry Form */}
      <div className="card">
        <h2 className="card-title">📝 Food Data Entry (Batch)</h2>
        <div className="food-form">
          <div className="form-row">
            <label>Category</label>
            <select
              value={currentItem.category}
              onChange={(e) => setCurrentItem({ ...currentItem, category: e.target.value })}
            >
              <option value="Rice">🍚 Rice</option>
              <option value="Curry">🍛 Curry</option>
              <option value="Bread">🍞 Bread</option>
              <option value="Dessert">🍰 Dessert</option>
              <option value="Mixed">🍱 Mixed</option>
            </select>
          </div>

          <div className="form-row">
            <label>Food Prepared (kg/plates)</label>
            <input
              type="number"
              value={currentItem.food_prepared}
              onChange={(e) => setCurrentItem({ ...currentItem, food_prepared: e.target.value })}
              placeholder="e.g., 50"
            />
          </div>

          <div className="form-row">
            <label>Food Sold</label>
            <input
              type="number"
              value={currentItem.food_sold}
              onChange={(e) => setCurrentItem({ ...currentItem, food_sold: e.target.value })}
              placeholder="e.g., 35"
            />
          </div>

          <div className="form-row">
            <label>Food Type</label>
            <select
              value={currentItem.food_type}
              onChange={(e) => setCurrentItem({ ...currentItem, food_type: e.target.value })}
            >
              <option value="Veg">🥬 Veg</option>
              <option value="Non-veg">🍗 Non-veg</option>
              <option value="Both">🍽️ Both</option>
            </select>
          </div>
        </div>

        <button 
          className="btn-primary" 
          onClick={addFoodItem}
          style={{ marginTop: '20px', background: '#ff9800' }}
        >
          ➕ Add Item
        </button>

        {/* Added Items List */}
        {foodItems.length > 0 && (
          <div style={{ marginTop: '25px' }}>
            <h3 style={{ marginBottom: '15px' }}>Added Items:</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Prepared</th>
                  <th>Sold</th>
                  <th>Remaining</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {foodItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.category}</td>
                    <td>{item.food_prepared}</td>
                    <td>{item.food_sold}</td>
                    <td style={{ color: item.remaining > 0 ? '#f44336' : '#4caf50', fontWeight: 'bold' }}>
                      {item.remaining}
                    </td>
                    <td>{item.food_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="auto-calc" style={{ marginTop: '20px' }}>
              <div>Total Surplus: <strong>{totalRemaining} meals</strong></div>
            </div>

            <button className="btn-alert" onClick={handleSubmit}>
              📤 Submit All Data
            </button>

            {totalRemaining > 0 && (
              <button className="btn-alert" onClick={sendAlert} style={{ marginTop: '10px' }}>
                🚨 Send Alert to NGOs
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== NGO DASHBOARD ====================
function NGODashboard({ user, token, onLogout }) {
  const [ngo, setNgo] = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [cart, setCart] = useState({});
  const [pickupTime, setPickupTime] = useState('21:30');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('free');
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('available');
  const [loading, setLoading] = useState(true);

  const mapAlertToRestaurant = (alert) => ({
    id: alert._id,
    name: alert.restaurant_name,
    location: alert.location,
    distance: 2.5,
    totalPortions: alert.surplus_meals,
    pricePerPortion: alert.price,
    closingTime: alert.pickup_time,
    categories: (alert.categories?.length ? alert.categories : [
      { name: alert.category || 'Mixed', available: alert.surplus_meals, food_type: alert.food_type }
    ]).map((category) => ({
      name: category.name,
      available: category.available,
      foodType: category.food_type || alert.food_type
    })),
    isUrgent: false,
    foodType: alert.food_type,
    phone: alert.phone,
    createdAt: alert.created_at
  });

  const mapOrder = (order) => ({
    id: order._id,
    restaurant: order.restaurant_name,
    items: order.items || [],
    totalPortions: order.total_portions,
    totalPrice: order.total_price,
    status: order.status,
    pickup_time: order.pickup_time,
    date: order.created_at ? new Date(order.created_at).toLocaleDateString() : new Date().toLocaleDateString(),
    alertId: order.alert_id
  });

  useEffect(() => {
    let ignore = false;

    const loadDashboard = async () => {
      try {
        const res = await fetch(`${API_URL}/ngo/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (ignore) return;

        setNgo(data.ngo);
        setRestaurants((data.alerts || []).map(mapAlertToRestaurant));
        setOrders((data.orders || []).map(mapOrder));
      } catch (error) {
        console.error('Error:', error);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => {
      ignore = true;
    };
  }, [token]);

  const handleCategoryChange = (categoryName, delta) => {
    if (!selectedRestaurant) return;
    
    const category = selectedRestaurant.categories.find(c => c.name === categoryName);
    if (!category) return;
    
    const currentQty = cart[categoryName] || 0;
    const newQty = Math.max(0, Math.min(category.available, currentQty + delta));
    
    setCart(prev => ({
      ...prev,
      [categoryName]: newQty
    }));
  };

  const getTotalSelected = () => {
    return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  };

  const getTotalPrice = () => {
    if (!selectedRestaurant) return 0;
    return getTotalSelected() * selectedRestaurant.pricePerPortion;
  };

  const confirmOrder = async () => {
    if (!selectedRestaurant || getTotalSelected() === 0) return;
    
    try {
      const res = await fetch(`${API_URL}/ngo/accept-alert/${selectedRestaurant.id}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          portions: getTotalSelected(),
          pickup_time: pickupTime,
          notes: notes,
          payment_method: paymentMethod,
          items: cart
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to confirm order');
      }

      alert(data.message);
      setOrders((currentOrders) => [mapOrder(data.order), ...currentOrders]);
      
      setSelectedRestaurant(null);
      setCart({});
      setRestaurants((currentRestaurants) =>
        currentRestaurants.filter((restaurant) => restaurant.id !== selectedRestaurant.id)
      );
    } catch (confirmError) {
      alert(confirmError.message || 'Error confirming order');
    }
  };

  const markCollected = async (order) => {
    try {
      const res = await fetch(`${API_URL}/ngo/mark-collected/${order.alertId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to mark collected');
      }

      alert(data.message);
      setOrders((currentOrders) =>
        currentOrders.map((currentOrder) =>
          currentOrder.id === order.id
            ? { ...currentOrder, status: 'Collected' }
            : currentOrder
        )
      );
    } catch (markError) {
      alert(markError.message || 'Error updating order');
    }
  };

  if (loading) return <div className="loading">Loading dashboard...</div>;

  // Detailed Restaurant View
  if (selectedRestaurant) {
    const totalSelected = getTotalSelected();
    const totalPrice = getTotalPrice();

    return (
      <div className="container">
        <div className="dashboard-header">
          <button 
            className="btn-reject" 
            onClick={() => setSelectedRestaurant(null)}
            style={{ padding: '10px 20px' }}
          >
            ← Back
          </button>
          <h1 className="dashboard-title">🍽️ {selectedRestaurant.name}</h1>
          <div className="user-info">
            <span className="user-name">{ngo?.name || user?.name || 'NGO'}</span>
            <button className="btn-logout" onClick={onLogout}>Logout</button>
          </div>
        </div>

        {/* Restaurant Info */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '24px', marginBottom: '10px' }}>{selectedRestaurant.name}</h2>
              <p style={{ color: '#666' }}>📍 {selectedRestaurant.location} • 🚶 {selectedRestaurant.distance} km away</p>
              <p style={{ color: '#666' }}>⏰ Pickup by: {selectedRestaurant.closingTime}</p>
            </div>
            {selectedRestaurant.isUrgent && (
              <span className="alert-badge urgent">🔥 Closing Soon</span>
            )}
          </div>

          <div style={{ background: '#e3f2fd', padding: '15px', borderRadius: '8px' }}>
            <strong>💰 Price:</strong> ₹{selectedRestaurant.pricePerPortion} per portion
          </div>
        </div>

        {/* Category Selection */}
        <div className="card">
          <h2 className="card-title">🍱 Select Portions</h2>
          
          <div style={{ display: 'grid', gap: '20px' }}>
            {selectedRestaurant.categories.map((category) => {
              const selectedQty = cart[category.name] || 0;
              
              return (
                <div key={category.name} style={{ 
                  padding: '20px', 
                  border: '2px solid #e0e0e0', 
                  borderRadius: '10px',
                  background: selectedQty > 0 ? '#f5f7fa' : 'white'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <div>
                      <h3 style={{ fontSize: '18px', marginBottom: '5px' }}>🍚 {category.name}</h3>
                      <p style={{ color: '#666', fontSize: '14px' }}>{category.available} portions available</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <button 
                        className="btn-small btn-reject"
                        onClick={() => handleCategoryChange(category.name, -1)}
                        disabled={selectedQty <= 0}
                        style={{ width: '40px', height: '40px', fontSize: '20px', padding: '0' }}
                      >
                        -
                      </button>
                      <span style={{ 
                        fontSize: '24px', 
                        fontWeight: 'bold',
                        minWidth: '60px',
                        textAlign: 'center',
                        display: 'inline-block'
                      }}>
                        {selectedQty}
                      </span>
                      <button 
                        className="btn-small btn-accept"
                        onClick={() => handleCategoryChange(category.name, 1)}
                        disabled={selectedQty >= category.available}
                        style={{ width: '40px', height: '40px', fontSize: '20px', padding: '0' }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  
                  {/* Progress bar */}
                  <div style={{ background: '#e0e0e0', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ 
                      width: `${(selectedQty / category.available) * 100}%`,
                      height: '100%',
                      background: selectedQty > 0 ? '#4caf50' : '#ccc',
                      transition: 'width 0.3s'
                    }} />
                  </div>
                  <p style={{ fontSize: '12px', color: '#666', marginTop: '5px', textAlign: 'right' }}>
                    {Math.round((selectedQty / category.available) * 100)}% of available
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Smart Summary Panel */}
        {totalSelected > 0 && (
          <div className="card" style={{ background: '#fff3e0' }}>
            <h2 className="card-title">🧮 Order Summary</h2>
            
            <div style={{ marginBottom: '15px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>Selected Items:</h3>
              {Object.entries(cart).filter((entry) => entry[1] > 0).map(([name, qty]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #ddd' }}>
                  <span>{name}</span>
                  <strong>{qty} portions</strong>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold', marginTop: '15px', paddingTop: '15px', borderTop: '2px solid #ff9800' }}>
              <span>Total Portions:</span>
              <span>{totalSelected}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', fontWeight: 'bold', color: '#ff9800', marginTop: '10px' }}>
              <span>Total Price:</span>
              <span>₹{totalPrice}</span>
            </div>
          </div>
        )}

        {/* Smart Controls */}
        <div className="card">
          <h2 className="card-title">✏️ Customize Pickup</h2>
          
          <div className="form-group">
            <label>⏰ Preferred Pickup Time</label>
            <input
              type="time"
              value={pickupTime}
              onChange={(e) => setPickupTime(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>📝 Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Need only fresh food, Will arrive early..."
              style={{ width: '100%', padding: '10px', border: '2px solid #e0e0e0', borderRadius: '8px', minHeight: '80px' }}
            />
          </div>

          <div className="form-group">
            <label>💳 Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="free">🎁 Free Donation</option>
              <option value="razorpay">💳 Pay via Razorpay (₹{totalPrice})</option>
            </select>
          </div>

          {/* AI Suggestion */}
          {totalSelected > 0 && (
            <div style={{ 
              background: '#e8f5e9', 
              padding: '15px', 
              borderRadius: '8px', 
              marginTop: '15px',
              borderLeft: '4px solid #4caf50'
            }}>
              <strong>🤖 AI Suggestion:</strong> Most NGOs pick rice + curry combo. Your selection looks great!
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button 
              className="btn-accept" 
              onClick={confirmOrder}
              disabled={totalSelected === 0}
              style={{ flex: 1, opacity: totalSelected === 0 ? 0.5 : 1 }}
            >
              ✅ Confirm Pickup
            </button>
            {paymentMethod !== 'free' && (
              <button className="btn-primary" style={{ flex: 1 }}>
                💳 Pay Now
              </button>
            )}
            <button 
              className="btn-reject" 
              onClick={() => setSelectedRestaurant(null)}
              style={{ padding: '12px 25px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Restaurant List View
  return (
    <div className="container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">🤝 NGO Dashboard</h1>
        <div className="user-info">
          <span className="user-name">{ngo?.name || user?.name || 'NGO'}</span>
          <button className="btn-logout" onClick={onLogout}>Logout</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          className={`btn-primary ${activeTab === 'available' ? '' : 'btn-reject'}`}
          onClick={() => setActiveTab('available')}
          style={{ flex: 1 }}
        >
          🍱 Available Restaurants ({restaurants.length})
        </button>
        <button 
          className={`btn-primary ${activeTab === 'orders' ? '' : 'btn-reject'}`}
          onClick={() => setActiveTab('orders')}
          style={{ flex: 1 }}
        >
          📦 Your Orders ({orders.length})
        </button>
      </div>

      {activeTab === 'available' && (
        <div className="card">
          <h2 className="card-title">📍 Nearby Restaurants</h2>
          
          {restaurants.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', padding: '40px' }}>
              No restaurants available at the moment. Check back later! 🕐
            </p>
          ) : (
            <div className="alert-list">
              {restaurants.map((restaurant) => (
                <div key={restaurant.id} className="alert-card">
                  <div className="alert-header">
                    <div>
                      <h3 className="restaurant-name">🍽️ {restaurant.name}</h3>
                      <p style={{ color: '#666', fontSize: '14px', margin: '5px 0' }}>
                        📍 {restaurant.location} • 🚶 {restaurant.distance} km away
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {restaurant.isUrgent && (
                        <span className="alert-badge urgent" style={{ display: 'block', marginBottom: '5px' }}>
                          🔥 Closing Soon
                        </span>
                      )}
                      <span className="alert-badge">
                        {restaurant.totalPortions} portions
                      </span>
                    </div>
                  </div>

                  <div className="alert-details">
                    <div className="alert-detail-item">
                      <div className="detail-label">💰 Price</div>
                      <div className="detail-value">₹{restaurant.pricePerPortion}/portion</div>
                    </div>
                    <div className="alert-detail-item">
                      <div className="detail-label">⏰ Pickup By</div>
                      <div className="detail-value">{restaurant.closingTime}</div>
                    </div>
                    <div className="alert-detail-item">
                      <div className="detail-label">🥗 Food Type</div>
                      <div className="detail-value">{restaurant.foodType}</div>
                    </div>
                  </div>

                  <div className="alert-actions">
                    <button 
                      className="btn-accept" 
                      onClick={() => setSelectedRestaurant(restaurant)}
                    >
                      👁️ View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="card">
          <h2 className="card-title">📦 Your Orders</h2>
          
          {orders.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', padding: '40px' }}>
              No orders yet. Start accepting meals! 🍱
            </p>
          ) : (
            <div className="alert-list">
              {orders.map((order) => (
                <div key={order.id} className="alert-card">
                  <div className="alert-header">
                    <h3 className="restaurant-name">{order.restaurant}</h3>
                    <span className="alert-badge" style={{ background: order.status === 'Collected' ? '#4caf50' : '#ff9800' }}>
                      {order.status === 'Collected' ? '✅ Completed' : '⏳ Active'}
                    </span>
                  </div>
                  <div className="alert-details">
                    <div className="alert-detail-item">
                      <div className="detail-label">🍱 Total Portions</div>
                      <div className="detail-value">{order.totalPortions}</div>
                    </div>
                    <div className="alert-detail-item">
                      <div className="detail-label">💰 Total Price</div>
                      <div className="detail-value">₹{order.totalPrice}</div>
                    </div>
                    <div className="alert-detail-item">
                      <div className="detail-label">⏰ Pickup Time</div>
                      <div className="detail-value">{order.pickup_time}</div>
                    </div>
                    <div className="alert-detail-item">
                      <div className="detail-label">📅 Date</div>
                      <div className="detail-value">{order.date}</div>
                    </div>
                  </div>
                  <p style={{ color: '#666', marginTop: '12px' }}>
                    <strong>Items:</strong>{' '}
                    {order.items.map((item) => `${item.category} x ${item.quantity}`).join(', ')}
                  </p>
                  {order.status !== 'Collected' && (
                    <div className="alert-actions">
                      <button className="btn-accept" onClick={() => markCollected(order)}>
                        Mark Collected
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== ADMIN DASHBOARD ====================
function AdminDashboard({ user, token, onLogout }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeTab, setActiveTab] = useState('users');
  const [ngoBehavior, setNgoBehavior] = useState([]);
  const [aiPredictions, setAiPredictions] = useState([]);
  const [smartMatches, setSmartMatches] = useState([]);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: 'default123',
    role: 'restaurant',
    location: '',
    phone: ''
  });

  useEffect(() => {
    let ignore = false;

    const loadAdminData = async () => {
      try {
        const [dashboardRes, usersRes, behaviorRes, predictionRes, smartMatchRes] = await Promise.all([
          fetch(`${API_URL}/admin/dashboard`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${API_URL}/admin/users`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${API_URL}/ai/ngo-behavior`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${API_URL}/ai/prediction-accuracy`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${API_URL}/admin/smart-matches`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);

        const [dashboardData, usersData, behaviorData, predictionData, smartMatchData] = await Promise.all([
          dashboardRes.json(),
          usersRes.json(),
          behaviorRes.json(),
          predictionRes.json(),
          smartMatchRes.json()
        ]);

        if (ignore) return;

        setStats(dashboardData.stats || null);
        setUsers(usersData.users || []);
        setNgoBehavior(behaviorData.behavior_analysis || []);
        setAiPredictions(predictionData.predictions || []);
        setSmartMatches(smartMatchData.matches || []);
      } catch (error) {
        console.error('Error:', error);
      }
    };

    void loadAdminData();

    return () => {
      ignore = true;
    };
  }, [token]);

  const fetchDashboard = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/dashboard`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setStats(data.stats);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const [behaviorRes, predictionRes, smartMatchRes] = await Promise.all([
        fetch(`${API_URL}/ai/ngo-behavior`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_URL}/ai/prediction-accuracy`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_URL}/admin/smart-matches`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const [behaviorData, predictionData, smartMatchData] = await Promise.all([
        behaviorRes.json(),
        predictionRes.json(),
        smartMatchRes.json()
      ]);

      setNgoBehavior(behaviorData.behavior_analysis || []);
      setAiPredictions(predictionData.predictions || []);
      setSmartMatches(smartMatchData.matches || []);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const addUser = async () => {
    try {
      const endpoint = newUser.role === 'restaurant' 
        ? `${API_URL}/admin/add-restaurant`
        : `${API_URL}/admin/add-ngo`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newUser)
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        setShowAddForm(false);
        fetchUsers();
        fetchDashboard();
        fetchAnalytics();
      } else {
        alert(data.error || 'Error adding user');
      }
    } catch {
      alert('Error adding user');
    }
  };

  const removeUser = async (email, role) => {
    if (!confirm(`Are you sure you want to remove this ${role}?`)) return;

    try {
      const endpoint = role === 'restaurant'
        ? `${API_URL}/admin/remove-restaurant/${email}`
        : `${API_URL}/admin/remove-ngo/${email}`;

      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      alert(data.message);
      fetchUsers();
      fetchDashboard();
      fetchAnalytics();
    } catch {
      alert('Error removing user');
    }
  };

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">🛠️ Admin Dashboard</h1>
        <div className="user-info">
          <span className="user-name">{user?.name || 'Admin'}</span>
          <button className="btn-logout" onClick={onLogout}>Logout</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          className={`btn-primary ${activeTab === 'users' ? '' : 'btn-reject'}`}
          onClick={() => setActiveTab('users')}
          style={{ flex: 1 }}
        >
          👥 Users
        </button>
        <button 
          className={`btn-primary ${activeTab === 'analytics' ? '' : 'btn-reject'}`}
          onClick={() => setActiveTab('analytics')}
          style={{ flex: 1 }}
        >
          📊 AI Analytics
        </button>
      </div>

      {activeTab === 'users' && (
        <>
          {stats && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{stats.total_restaurants}</div>
                <div className="stat-label">🍽️ Restaurants</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.total_ngos}</div>
                <div className="stat-label">🤝 NGOs</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.active_alerts_today}</div>
                <div className="stat-label">📢 Active Alerts Today</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.food_saved_today} kg</div>
                <div className="stat-label">🎉 Food Saved Today</div>
              </div>
            </div>
          )}

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="card-title">👥 User Management</h2>
              <button 
                className="btn-primary" 
                style={{ width: 'auto', padding: '10px 20px' }}
                onClick={() => setShowAddForm(!showAddForm)}
              >
                {showAddForm ? 'Cancel' : '+ Add User'}
              </button>
            </div>

            {showAddForm && (
              <div style={{ 
                background: '#f5f7fa', 
                padding: '20px', 
                borderRadius: '8px', 
                marginBottom: '20px' 
              }}>
                <h3 style={{ marginBottom: '15px' }}>Add New User</h3>
                <div className="food-form">
                  <div className="form-row">
                    <label>Name</label>
                    <input
                      type="text"
                      value={newUser.name}
                      onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                      placeholder="Enter name"
                    />
                  </div>
                  <div className="form-row">
                    <label>Email</label>
                    <input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      placeholder="Enter email"
                    />
                  </div>
                  <div className="form-row">
                    <label>Role</label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    >
                      <option value="restaurant">🍽️ Restaurant</option>
                      <option value="ngo">🤝 NGO</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label>Location</label>
                    <input
                      type="text"
                      value={newUser.location}
                      onChange={(e) => setNewUser({ ...newUser, location: e.target.value })}
                      placeholder="Enter location"
                    />
                  </div>
                  <div className="form-row">
                    <label>Phone</label>
                    <input
                      type="tel"
                      value={newUser.phone}
                      onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                      placeholder="Enter phone number"
                    />
                  </div>
                </div>
                <button 
                  className="btn-primary" 
                  style={{ marginTop: '20px' }}
                  onClick={addUser}
                >
                  Add User
                </button>
              </div>
            )}

            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <span style={{ 
                        padding: '4px 10px', 
                        borderRadius: '4px',
                        background: u.role === 'admin' ? '#9c27b0' : u.role === 'restaurant' ? '#ff9800' : '#4caf50',
                        color: 'white',
                        fontSize: '12px'
                      }}>
                        {u.role === 'admin' ? '🛠️ Admin' : u.role === 'restaurant' ? '🍽️ Restaurant' : '🤝 NGO'}
                      </span>
                    </td>
                    <td>
                      {u.role !== 'admin' && (
                        <button 
                          className="btn-small btn-delete"
                          onClick={() => removeUser(u.email, u.role)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'analytics' && (
        <>
          {/* NGO Behavior Analysis */}
          <div className="card">
            <h2 className="card-title">🧠 NGO Behavior Analysis</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>NGO</th>
                  <th>Mon</th>
                  <th>Tue</th>
                  <th>Wed</th>
                  <th>Thu</th>
                  <th>Fri</th>
                  <th>Sat</th>
                  <th>Sun</th>
                  <th>Most Active</th>
                </tr>
              </thead>
              <tbody>
                {ngoBehavior.map((ngo, idx) => (
                  <tr key={idx}>
                    <td><strong>{ngo.ngo}</strong></td>
                    <td>{ngo.monday}</td>
                    <td>{ngo.tuesday}</td>
                    <td>{ngo.wednesday}</td>
                    <td>{ngo.thursday}</td>
                    <td>{ngo.friday}</td>
                    <td>{ngo.saturday}</td>
                    <td>{ngo.sunday}</td>
                    <td>
                      <span style={{ padding: '4px 8px', background: '#ff9800', color: 'white', borderRadius: '4px', fontSize: '12px' }}>
                        {ngo.most_active}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* AI Prediction vs Actual */}
          <div className="card">
            <h2 className="card-title">📈 AI Prediction vs Actual Surplus</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', alignItems: 'flex-end', height: '200px', marginTop: '20px' }}>
              {aiPredictions.map((data, idx) => (
                <div key={idx} style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                    <div style={{ width: '35px', height: `${(data.predicted/45)*100}%`, background: '#667eea', borderRadius: '4px 4px 0 0' }} title={`Predicted: ${data.predicted}`}></div>
                    <div style={{ width: '35px', height: `${(data.actual/45)*100}%`, background: '#4caf50', borderRadius: '4px 4px 0 0', marginTop: '-2px' }} title={`Actual: ${data.actual}`}></div>
                  </div>
                  <div style={{ fontSize: '12px', marginTop: '5px' }}>{data.day}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '15px', fontSize: '13px' }}>
              <span><span style={{ color: '#667eea' }}>■</span> Predicted</span>
              <span><span style={{ color: '#4caf50' }}>■</span> Actual</span>
            </div>
          </div>

          {/* Smart Matching AI */}
          <div className="card">
            <h2 className="card-title">🤖 AI Smart Matching Suggestions</h2>
            <div className="alert-list">
              {smartMatches.map((match, idx) => (
                <div key={idx} className="alert-card" style={{ borderLeftColor: '#667eea' }}>
                  <div className="alert-header">
                    <h3 className="restaurant-name">🍽️ {match.restaurant} → 🤝 {match.bestNgo}</h3>
                    <span className="alert-badge" style={{ background: '#667eea' }}>
                      Match Score: {match.score}%
                    </span>
                  </div>
                  <p style={{ color: '#666', margin: '10px 0' }}>
                    <strong>Reason:</strong> {match.reason}
                  </p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-accept" style={{ flex: 'none', padding: '10px 20px' }}>
                      ✅ Auto-Assign
                    </button>
                    <button className="btn-reject" style={{ flex: 'none', padding: '10px 20px' }}>
                      ❌ Ignore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
