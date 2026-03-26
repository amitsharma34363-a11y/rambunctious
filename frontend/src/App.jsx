import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_HOST =
  typeof window !== "undefined" ? window.location.hostname || "127.0.0.1" : "127.0.0.1";
const API_URL = `http://${API_HOST}:5000/api`;
const PROVIDER_TYPES = ["restaurant", "hotel", "banquet"];
const ROLE_META = {
  restaurant: {
    label: "Restaurant",
    pricePerPortion: 20,
    planId: "restaurant_pro",
    color: "#f3ad2d",
  },
  hotel: {
    label: "Hotel",
    pricePerPortion: 15,
    planId: "hotel_pro",
    color: "#2f9d61",
  },
  banquet: {
    label: "Banquet",
    pricePerPortion: 10,
    planId: "banquet_pro",
    color: "#1f6f78",
  },
  ngo: {
    label: "NGO",
    color: "#2f9d61",
  },
  admin: {
    label: "Admin",
    color: "#173525",
  },
};
const ROLE_OPTIONS = [
  { value: "restaurant", label: "Restaurant" },
  { value: "hotel", label: "Hotel" },
  { value: "banquet", label: "Banquet" },
  { value: "ngo", label: "NGO" },
  { value: "admin", label: "Admin" },
];
const PROVIDER_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "restaurant", label: "Restaurants" },
  { value: "hotel", label: "Hotels" },
  { value: "banquet", label: "Banquets" },
];
const PROVIDER_DISTRIBUTION_COLORS = ["#f3ad2d", "#2f9d61", "#1f6f78"];

const DEMO_ACCOUNTS = {
  restaurant: {
    email: "restaurant@demo.com",
    password: "password123",
    label: "Restaurant",
  },
  hotel: {
    email: "hotel@demo.com",
    password: "password123",
    label: "Hotel",
  },
  banquet: {
    email: "banquet@demo.com",
    password: "password123",
    label: "Banquet",
  },
  ngo: {
    email: "ngo@demo.com",
    password: "password123",
    label: "NGO",
  },
  admin: {
    email: "admin@demo.com",
    password: "password123",
    label: "Admin",
  },
};

const LANDING_FEATURES = [
  {
    icon: StoreIcon,
    title: "Multi-Provider Network",
    description: "Coordinate restaurant, hotel, and banquet surplus from one rescue hub.",
  },
  {
    icon: HeartIcon,
    title: "NGO Network",
    description: "Browse provider type, reserve portions, and manage pickups faster.",
  },
  {
    icon: BrainIcon,
    title: "AI Predictions",
    description: "Predict banquet spikes, hotel consistency, and daily restaurant variation.",
  },
  {
    icon: AnalyticsIcon,
    title: "Live Analytics",
    description: "Track provider distribution, pricing, and rescue impact in real time.",
  },
];

const LANDING_STATS = [
  { value: "1,247", label: "Portions Rescued" },
  { value: "45", label: "Orders Completed" },
  { value: "98%", label: "Satisfaction Rate" },
];

const FALLBACK_ACCURACY = [
  { day: "6PM", actual: 42, predicted: 37 },
  { day: "7PM", actual: 55, predicted: 49 },
  { day: "8PM", actual: 67, predicted: 64 },
  { day: "9PM", actual: 75, predicted: 71 },
  { day: "10PM", actual: 82, predicted: 79 },
];

const DAY_KEYS = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

const NGO_USAGE_COLORS = ["#2f9d61", "#f3ad2d", "#1f6f78", "#7aab82", "#4d8cc8"];

function safeStorageRead(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageWrite(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in restricted environments.
  }
}

function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage failures in restricted environments.
  }
}

function getStoredAuth() {
  const token = safeStorageRead("token");
  const rawUser = safeStorageRead("user");

  if (!token || !rawUser) {
    return { token: null, user: null };
  }

  try {
    return { token, user: JSON.parse(rawUser) };
  } catch {
    safeStorageRemove("token");
    safeStorageRemove("user");
    return { token: null, user: null };
  }
}

function persistAuth(user, token) {
  safeStorageWrite("token", token);
  safeStorageWrite("user", JSON.stringify(user));
}

function clearStoredAuth() {
  safeStorageRemove("token");
  safeStorageRemove("user");
}

function isProviderRole(role) {
  return PROVIDER_TYPES.includes(role);
}

function getRoleLabel(role) {
  return ROLE_META[role]?.label || role || "User";
}

function getProviderPlanId(role) {
  return ROLE_META[role]?.planId || "";
}

function getDefaultPricePerPortion(role) {
  return ROLE_META[role]?.pricePerPortion || 20;
}

function requiresSubscription(user) {
  return isProviderRole(user?.role) && user?.subscription !== getProviderPlanId(user?.role);
}

function safeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function uniqueId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safeNumber(value));
}

function formatDate(value) {
  if (!value) return "Today";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Today";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getInitials(name) {
  if (!name) return "L";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function createInventoryRow(seed = {}) {
  return {
    id: seed.id || uniqueId(),
    name: seed.name || seed.category || "Main Course",
    prepared: safeNumber(seed.prepared ?? seed.food_prepared),
    sold: safeNumber(seed.sold ?? seed.food_sold),
    foodType: seed.foodType || seed.food_type || "Both",
  };
}

function buildInventoryRowsFromEntry(entry) {
  if (!entry) {
    return [createInventoryRow()];
  }

  return [
    createInventoryRow({
      category: entry.category || "Main Course",
      food_prepared: entry.food_prepared ?? 0,
      food_sold: entry.food_sold ?? 0,
      food_type: entry.food_type || "Both",
    }),
  ];
}

function getRowRemaining(row) {
  return Math.max(0, safeNumber(row.prepared) - safeNumber(row.sold));
}

function sumRows(rows, field) {
  return rows.reduce((total, row) => total + safeNumber(row[field]), 0);
}

function normalizePlanName(plan) {
  return (plan.name || "Plan").replace(/[^\w\s]/g, "").trim() || "Plan";
}

function buildAlertPayloadItems(rows) {
  return rows
    .map((row) => ({
      name: row.name,
      category: row.name,
      food_prepared: safeNumber(row.prepared),
      food_sold: safeNumber(row.sold),
      remaining: getRowRemaining(row),
      food_type: row.foodType || "Both",
    }))
    .filter((row) => row.remaining > 0);
}

function buildUsageSegments(behaviorAnalysis) {
  const segments = behaviorAnalysis
    .map((entry, index) => {
      const value = DAY_KEYS.reduce((total, day) => total + safeNumber(entry[day.key]), 0);
      return {
        id: entry.ngo || `ngo-${index}`,
        label: entry.ngo || `NGO ${index + 1}`,
        value,
        color: NGO_USAGE_COLORS[index % NGO_USAGE_COLORS.length],
      };
    })
    .filter((entry) => entry.value > 0);

  if (segments.length > 0) {
    return segments;
  }

  return [
    {
      id: "empty",
      label: "No NGO activity yet",
      value: 1,
      color: "#d8e6dc",
    },
  ];
}

function buildUsageBars(behaviorAnalysis) {
  return DAY_KEYS.map((day) => ({
    day: day.label,
    rescued: behaviorAnalysis.reduce((total, entry) => total + safeNumber(entry[day.key]), 0),
  }));
}

async function apiRequest(path, options = {}) {
  const { token, headers, body, ...rest } = options;
  const nextHeaders = {
    Accept: "application/json",
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...(headers || {}),
  };

  if (token) {
    nextHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: nextHeaders,
    body,
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed");
  }

  return data;
}

export default function App() {
  const [{ token, user }, setAuth] = useState(getStoredAuth);
  const [guestView, setGuestView] = useState("landing");
  const [showSubscriptionGate, setShowSubscriptionGate] = useState(() => {
    const storedAuth = getStoredAuth();
    if (!storedAuth.user || !storedAuth.token) return false;
    return requiresSubscription(storedAuth.user);
  });

  const handleLogin = (userData, authToken) => {
    persistAuth(userData, authToken);
    setAuth({ token: authToken, user: userData });
    setGuestView("landing");
    setShowSubscriptionGate(requiresSubscription(userData));
  };

  const handleLogout = () => {
    clearStoredAuth();
    setAuth({ token: null, user: null });
    setShowSubscriptionGate(false);
    setGuestView("landing");
  };

  const handleUserUpdate = (updatedUser) => {
    const nextUser = { ...user, ...updatedUser };
    persistAuth(nextUser, token);
    setAuth({ token, user: nextUser });
    setShowSubscriptionGate(requiresSubscription(nextUser));
  };

  if (!token || !user) {
    return <GuestExperience view={guestView} onViewChange={setGuestView} onLogin={handleLogin} />;
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

  if (isProviderRole(user.role)) {
    return (
      <RestaurantWorkspace
        user={user}
        token={token}
        onLogout={handleLogout}
        onUserUpdate={handleUserUpdate}
      />
    );
  }

  if (user.role === "ngo") {
    return <NGOWorkspace user={user} token={token} onLogout={handleLogout} />;
  }

  return <AdminWorkspace user={user} token={token} onLogout={handleLogout} />;
}

function GuestExperience({ view, onViewChange, onLogin }) {
  const [prefillEmail, setPrefillEmail] = useState("");
  const [preferredRole, setPreferredRole] = useState("restaurant");

  const handleRegistered = (email, role) => {
    setPrefillEmail(email);
    setPreferredRole(role);
    onViewChange("login");
  };

  if (view === "login") {
    return (
      <LoginPage
        prefillEmail={prefillEmail}
        initialRole={preferredRole}
        onLogin={onLogin}
        onRegisterClick={() => onViewChange("register")}
        onBack={() => onViewChange("landing")}
      />
    );
  }

  if (view === "register") {
    return (
      <RegisterPage
        initialRole={preferredRole}
        onRegistered={handleRegistered}
        onLoginClick={() => onViewChange("login")}
        onBack={() => onViewChange("landing")}
      />
    );
  }

  return (
    <LandingPage
      onSignIn={() => onViewChange("login")}
      onGetStarted={() => onViewChange("register")}
      onDemo={() => {
        setPreferredRole("restaurant");
        onViewChange("login");
      }}
    />
  );
}

function LandingPage({ onSignIn, onGetStarted, onDemo }) {
  return (
    <div className="landing-page">
      <div className="landing-background" />
      <header className="landing-nav">
        <div className="brand-lockup">
          <LeafIcon size={30} />
          <span>LastMile Rescue</span>
        </div>
        <div className="landing-nav__actions">
          <button type="button" className="button button--text" onClick={onSignIn}>
            Sign In
          </button>
          <button type="button" className="button button--primary" onClick={onGetStarted}>
            Get Started
          </button>
        </div>
      </header>

      <main className="landing-content">
        <section className="landing-hero">
          <div className="hero-badge">
            <LeafIcon size={18} />
            <span>Reducing food waste with AI</span>
          </div>
          <h1>
            Rescue surplus food.
            <br />
            <span>Feed communities.</span>
          </h1>
          <p>
            We expanded beyond restaurants to include hotels and banquet halls, enabling
            large-scale food redistribution with dynamic pricing and AI-driven predictions.
          </p>
          <div className="hero-actions">
            <button type="button" className="button button--primary button--large" onClick={onGetStarted}>
              Start Rescuing
              <ArrowRightIcon size={18} />
            </button>
            <button type="button" className="button button--ghost button--large" onClick={onDemo}>
              Demo Login
            </button>
          </div>
        </section>

        <section className="feature-grid">
          {LANDING_FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="feature-card">
                <div className="feature-card__icon">
                  <Icon size={24} />
                </div>
                <h2>{feature.title}</h2>
                <p>{feature.description}</p>
              </article>
            );
          })}
        </section>

        <section className="landing-stats">
          {LANDING_STATS.map((stat) => (
            <div key={stat.label} className="landing-stat">
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </section>
      </main>

      <footer className="landing-footer">© 2024 LastMile Rescue. Built to reduce food waste.</footer>
    </div>
  );
}

function LoginPage({ prefillEmail, initialRole, onLogin, onRegisterClick, onBack }) {
  const [form, setForm] = useState({
    email: prefillEmail || "",
    password: "",
    role: initialRole || "restaurant",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (prefillEmail) {
      setForm((current) => ({ ...current, email: prefillEmail }));
    }
  }, [prefillEmail]);

  useEffect(() => {
    if (initialRole) {
      setForm((current) => ({ ...current, role: initialRole }));
    }
  }, [initialRole]);

  const performLogin = async (payload) => {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      onLogin(
        {
          email: payload.email,
          role: data.role,
          name: data.name,
          subscription: data.subscription,
        },
        data.token
      );
    } catch (loginError) {
      setError(loginError.message || "Unable to sign in");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await performLogin(form);
  };

  const handleDemoLogin = async (role) => {
    const account = DEMO_ACCOUNTS[role];
    const payload = {
      email: account.email,
      password: account.password,
      role,
    };
    setForm(payload);
    await performLogin(payload);
  };

  return (
    <div className="auth-stage">
      <div className="auth-stage__glow auth-stage__glow--left" />
      <div className="auth-stage__glow auth-stage__glow--right" />
      <div className="auth-wrap">
        <div className="brand-pill">
          <LeafIcon size={22} />
          <span>LastMile Rescue</span>
        </div>
        <p className="auth-strapline">AI-powered food surplus redistribution</p>

        <section className="auth-card">
          <div className="auth-card__header">
            <h1>Welcome back</h1>
            <p>Sign in to your account</p>
          </div>

          <NoticeBanner notice={error ? { type: "error", text: error } : null} />

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder="Enter your password"
                required
              />
            </label>

            <div className="field">
              <span>Sign in as</span>
              <SegmentedControl
                value={form.role}
                onChange={(role) => setForm((current) => ({ ...current, role }))}
                options={ROLE_OPTIONS}
              />
            </div>

            <button type="submit" className="button button--primary button--block" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="auth-divider">Quick demo login</div>
          <div className="demo-grid">
            {Object.entries(DEMO_ACCOUNTS).map(([role, account]) => (
              <button
                key={role}
                type="button"
                className="button button--ghost button--block"
                onClick={() => handleDemoLogin(role)}
                disabled={loading}
              >
                {account.label}
              </button>
            ))}
          </div>

          <p className="auth-switch">
            Don&apos;t have an account?
            <button type="button" className="text-link" onClick={onRegisterClick}>
              Sign up
            </button>
          </p>
          <button type="button" className="text-link text-link--subtle" onClick={onBack}>
            Back to home
          </button>
        </section>
      </div>
    </div>
  );
}

function RegisterPage({ initialRole, onRegistered, onLoginClick, onBack }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: initialRole || "restaurant",
  });
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialRole) {
      setForm((current) => ({ ...current, role: initialRole }));
    }
  }, [initialRole]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setNotice(null);

    if (form.password.length < 6) {
      setNotice({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/register", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          location: "Unknown",
          phone: "",
        }),
      });

      setNotice({ type: "success", text: "Account created. You can sign in now." });
      onRegistered(form.email, form.role);
    } catch (registerError) {
      setNotice({ type: "error", text: registerError.message || "Unable to create account." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-stage">
      <div className="auth-stage__glow auth-stage__glow--left" />
      <div className="auth-stage__glow auth-stage__glow--right" />
      <div className="auth-wrap">
        <div className="brand-pill">
          <LeafIcon size={22} />
          <span>LastMile Rescue</span>
        </div>

        <section className="auth-card">
          <div className="auth-card__header">
            <h1>Create account</h1>
            <p>Join the food rescue movement</p>
          </div>

          <NoticeBanner notice={notice} />

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Organization Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Your organization"
                required
              />
            </label>

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder="Min 6 characters"
                required
              />
            </label>

            <div className="field">
              <span>I am a</span>
              <SegmentedControl
                value={form.role}
                onChange={(role) => setForm((current) => ({ ...current, role }))}
                options={ROLE_OPTIONS.filter((option) => option.value !== "admin")}
              />
            </div>

            <button type="submit" className="button button--primary button--block" disabled={loading}>
              {loading ? "Creating..." : "Create Account"}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account?
            <button type="button" className="text-link" onClick={onLoginClick}>
              Sign in
            </button>
          </p>
          <button type="button" className="text-link text-link--subtle" onClick={onBack}>
            Back to home
          </button>
        </section>
      </div>
    </div>
  );
}

function SubscriptionPage({ user, token, onLogout, onActivate, embedded = false }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState(
    user.subscription || getProviderPlanId(user.role)
  );
  const [processingPlan, setProcessingPlan] = useState("");
  const authToken = token || safeStorageRead("token");

  useEffect(() => {
    setSelectedPlanId(user.subscription || getProviderPlanId(user.role));
  }, [user.role, user.subscription]);

  useEffect(() => {
    let ignore = false;

    const loadPlans = async () => {
      if (!authToken) {
        if (!ignore) {
          setNotice({
            type: "error",
            text: "Sign in again to load subscription plans.",
          });
          setLoading(false);
        }
        return;
      }

      if (!ignore) {
        setLoading(true);
      }

      try {
        const data = await apiRequest("/subscription/plans", { token: authToken });
        if (!ignore) {
          setPlans(data.plans || []);
        }
      } catch (planError) {
        if (!ignore) {
          setNotice({
            type: "error",
            text: planError.message || "Unable to load subscription plans.",
          });
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
  }, [authToken]);

  useEffect(() => {
    if (!plans.length) return;
    if (!plans.some((plan) => plan.id === selectedPlanId)) {
      setSelectedPlanId(plans[0].id);
    }
  }, [plans, selectedPlanId]);

  const currentPlanId = user.subscription || "";
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || null;

  const activatePlan = async (planId) => {
    setNotice(null);
    setProcessingPlan(planId);
    try {
      const data = await apiRequest("/subscription/activate", {
        method: "POST",
        token: authToken,
        body: JSON.stringify({
          plan: planId,
          payment_id: `mock_payment_${planId}_${Date.now()}`,
        }),
      });

      onActivate({
        ...user,
        subscription: data.plan,
        ...(data.user || {}),
      });

      setNotice({
        type: "success",
        text: `${getRoleLabel(user.role)} plan activated successfully.`,
      });
    } catch (planError) {
      setNotice({
        type: "error",
        text: planError.message || "Unable to activate plan.",
      });
    } finally {
      setProcessingPlan("");
    }
  };

  const content = (
    <div className={embedded ? "subscription-pane" : "subscription-stage"}>
      {!embedded && (
        <div className="brand-pill">
          <LeafIcon size={22} />
          <span>LastMile Rescue</span>
        </div>
      )}

      <section className={`subscription-card ${embedded ? "subscription-card--embedded" : ""}`}>
        <div className="subscription-card__header">
          <div>
            <h1>Choose your {getRoleLabel(user.role)} plan</h1>
            <p>
              Welcome, {user.name}! Subscribe to unlock provider pricing, AI insights, and
              rescue coordination.
            </p>
          </div>
          {!embedded && (
            <button type="button" className="button button--ghost" onClick={onLogout}>
              Sign out
            </button>
          )}
        </div>

        <NoticeBanner notice={notice} />

        {loading ? (
          <LoadingState label="Loading plans..." />
        ) : (
          <>
            <div className={`plan-grid ${plans.length <= 2 ? "plan-grid--compact" : ""}`}>
              {plans.map((plan) => {
                const isSelected = selectedPlanId === plan.id;
                const isCurrent = currentPlanId === plan.id;
                const isPopular = Boolean(plan.price);
                return (
                  <button
                    key={plan.id}
                    type="button"
                    className={`plan-card ${isSelected ? "plan-card--selected" : ""} ${
                      isCurrent ? "plan-card--current" : ""
                    }`}
                    onClick={() => setSelectedPlanId(plan.id)}
                  >
                    {isPopular && <span className="plan-card__tag">Popular</span>}
                    <div className="plan-card__title">
                      <LeafIcon size={18} />
                      <span>{normalizePlanName(plan)}</span>
                    </div>
                    <div className="plan-card__price">
                      {plan.price === 0 ? "Free" : formatCurrency(plan.price)}
                      {plan.price > 0 && <small>/mo</small>}
                    </div>
                    <ul className="plan-feature-list">
                      {(plan.features || []).map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                    <div className="plan-card__cta">
                      {isCurrent ? "Current plan" : isPopular ? "Review payment" : "Continue with free"}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedPlan?.price > 0 && selectedPlan.id !== currentPlanId && (
              <div className="payment-card">
                <h2>Mock Razorpay Payment</h2>
                <div className="payment-card__details">
                  Card: 4111 1111 1111 1111
                  <span>Exp: 12/28</span>
                </div>
                <button
                  type="button"
                  className="button button--primary button--block"
                  onClick={() => activatePlan(selectedPlan.id)}
                  disabled={processingPlan === selectedPlan.id}
                >
                  {processingPlan === selectedPlan.id
                    ? "Processing payment..."
                    : `Pay ${formatCurrency(selectedPlan.price)}`}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="auth-stage">
      <div className="auth-stage__glow auth-stage__glow--left" />
      <div className="auth-stage__glow auth-stage__glow--right" />
      <div className="auth-wrap auth-wrap--wide">{content}</div>
    </div>
  );
}

function WorkspaceShell({ user, navItems, activeSection, onSectionChange, onLogout, children }) {
  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="workspace-sidebar__brand">
          <LeafIcon size={28} />
          <span>LastMile Rescue</span>
        </div>

        <nav className="workspace-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`workspace-nav__item ${
                  activeSection === item.id ? "workspace-nav__item--active" : ""
                }`}
                onClick={() => onSectionChange(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="workspace-sidebar__footer">
          <div className="workspace-user">
            <div className="entity-badge entity-badge--soft">{getInitials(user.name)}</div>
            <div>
              <strong>{user.name}</strong>
              <span>{getRoleLabel(user.role)}</span>
            </div>
          </div>

          <button type="button" className="workspace-signout" onClick={onLogout}>
            <LogoutIcon size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main className="workspace-main">{children}</main>
    </div>
  );
}

function PageIntro({ title, subtitle }) {
  return (
    <header className="page-intro">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );
}

function StatCard({ icon, label, value, suffix, tone = "green" }) {
  const IconComponent = icon;
  return (
    <article className="stat-card">
      <div className={`stat-card__icon stat-card__icon--${tone}`}>
        <IconComponent size={22} />
      </div>
      <div>
        <span>{label}</span>
        <strong>
          {value}
          {suffix ? <small>{suffix}</small> : null}
        </strong>
      </div>
    </article>
  );
}

function SnapshotItem({ label, value }) {
  return (
    <div className="snapshot-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <section className="surface-card">
      <div className="surface-card__header">
        <div>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function NoticeBanner({ notice }) {
  if (!notice?.text) return null;
  return <div className={`notice notice--${notice.type || "info"}`}>{notice.text}</div>;
}

function LoadingState({ label }) {
  return (
    <div className="empty-state">
      <div className="spinner" />
      <h2>{label}</h2>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="segment-control">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segment-control__button ${
            value === option.value ? "segment-control__button--active" : ""
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function normalizeAlert(alert) {
  const providerType = alert.provider_type || alert.providerType || "restaurant";
  const categories = (alert.categories?.length ? alert.categories : [
    {
      name: alert.category || "Mixed",
      available: safeNumber(alert.surplus_meals),
      food_type: alert.food_type || "Both",
    },
  ]).map((entry) => ({
    name: entry.name,
    available: safeNumber(entry.available),
    foodType: entry.food_type || "Both",
  }));

  return {
    id: alert._id,
    name: alert.provider_name || alert.restaurant_name || getRoleLabel(providerType),
    providerType,
    providerLabel: alert.provider_label || getRoleLabel(providerType),
    location: alert.location || "Unknown location",
    pickupTime: alert.pickup_time || alert.available_after || "21:30",
    availableAfter: alert.available_after || alert.pickup_time || "21:30",
    pricePerPortion: safeNumber(alert.price_per_portion ?? alert.price ?? getDefaultPricePerPortion(providerType)),
    minimumPickup: Math.max(1, safeNumber(alert.minimum_pickup || 1)),
    eventName: alert.event_name || "",
    guestCount: safeNumber(alert.guest_count),
    expectedSurplus: safeNumber(alert.expected_surplus),
    recurringAlerts: Boolean(alert.recurring_alerts),
    dailySurplusAutoEntry: Boolean(alert.daily_surplus_auto_entry),
    categories,
    totalAvailable: categories.reduce((total, entry) => total + entry.available, 0),
  };
}

function normalizeOrder(order) {
  const items = order.items || [];
  const providerType = order.provider_type || "restaurant";
  return {
    id: order._id,
    restaurantName: order.provider_name || order.restaurant_name || getRoleLabel(providerType),
    providerType,
    providerLabel: order.provider_label || getRoleLabel(providerType),
    totalPortions: safeNumber(order.total_portions),
    totalPrice: safeNumber(order.total_price),
    status: order.status || "Accepted",
    pickupTime: order.pickup_time || "21:30",
    createdAt: order.created_at,
    summary: items.length
      ? items.map((entry) => `${entry.category} ×${entry.quantity}`).join(", ")
      : "No item breakdown available",
  };
}

function RestaurantWorkspace({ user, token, onLogout, onUserUpdate }) {
  const providerLabel = getRoleLabel(user.role);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [restaurant, setRestaurant] = useState(null);
  const [history, setHistory] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [accuracyData, setAccuracyData] = useState([]);
  const [inventoryRows, setInventoryRows] = useState([createInventoryRow()]);
  const [closingTime, setClosingTime] = useState("22:00");
  const [providerSettings, setProviderSettings] = useState({
    pricePerPortion: getDefaultPricePerPortion(user.role),
    availableAfter: "21:30",
    minimumPickup: user.role === "banquet" ? 20 : 1,
    eventName: "",
    guestCount: 0,
    expectedSurplus: 0,
    dailySurplusAutoEntry: user.role === "hotel",
    recurringAlerts: user.role === "hotel",
  });
  const [rowsTouched, setRowsTouched] = useState(false);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [predictorForm, setPredictorForm] = useState({
    food_prepared: 100,
    food_sold: 70,
    hour: 18,
  });
  const [predictionResult, setPredictionResult] = useState(null);

  useEffect(() => {
    let ignore = false;

    const loadDashboard = async () => {
      try {
        const dashboard = await apiRequest("/restaurant/dashboard", { token });
        if (ignore) return;
        setRestaurant(dashboard.restaurant || dashboard.provider || null);
        setHistory(dashboard.food_history || []);
        setChartData(dashboard.chart_data || []);
      } catch (dashboardError) {
        if (!ignore) {
          setNotice({
            type: "error",
            text: dashboardError.message || `Unable to load ${providerLabel.toLowerCase()} dashboard.`,
          });
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    const loadAnalytics = async () => {
      try {
        const analytics = await apiRequest("/ai/prediction-accuracy", { token });
        if (ignore) return;
        setAccuracyData(analytics.predictions || []);
      } catch (analyticsError) {
        if (!ignore) {
          setNotice({
            type: "error",
            text: analyticsError.message || "Unable to load AI analytics.",
          });
        }
      } finally {
        if (!ignore) {
          setLoadingAnalytics(false);
        }
      }
    };

    void Promise.all([loadDashboard(), loadAnalytics()]);

    return () => {
      ignore = true;
    };
  }, [providerLabel, token]);

  useEffect(() => {
    if (rowsTouched) return;
    const latestEntry = history[0];
    setInventoryRows(buildInventoryRowsFromEntry(latestEntry));
    setClosingTime(latestEntry?.closing_time || restaurant?.closing_time || "22:00");
    setProviderSettings((current) => ({
      ...current,
      pricePerPortion: safeNumber(
        latestEntry?.price_per_portion ||
          restaurant?.price_per_portion ||
          getDefaultPricePerPortion(user.role)
      ),
      availableAfter:
        latestEntry?.available_after ||
        restaurant?.available_after ||
        latestEntry?.pickup_time ||
        restaurant?.closing_time ||
        "21:30",
      minimumPickup: Math.max(
        1,
        safeNumber(
          latestEntry?.minimum_pickup ||
            restaurant?.minimum_pickup ||
            (user.role === "banquet" ? 20 : 1)
        )
      ),
      eventName: latestEntry?.event_name || restaurant?.event_name || "",
      guestCount: safeNumber(latestEntry?.guest_count || restaurant?.guest_count),
      expectedSurplus: safeNumber(
        latestEntry?.expected_surplus || restaurant?.expected_surplus || latestEntry?.remaining_food
      ),
      dailySurplusAutoEntry:
        latestEntry?.daily_surplus_auto_entry ??
        restaurant?.daily_surplus_auto_entry ??
        user.role === "hotel",
      recurringAlerts:
        latestEntry?.recurring_alerts ?? restaurant?.recurring_alerts ?? user.role === "hotel",
    }));
  }, [history, restaurant, rowsTouched, user.role]);

  const totals = useMemo(
    () => ({
      prepared: sumRows(inventoryRows, "prepared"),
      sold: sumRows(inventoryRows, "sold"),
      surplus: inventoryRows.reduce((total, row) => total + getRowRemaining(row), 0),
    }),
    [inventoryRows]
  );

  const weeklyChartData = chartData.length > 0 ? chartData : [];
  const accuracySeries = accuracyData.length > 0 ? accuracyData : FALLBACK_ACCURACY;
  const rescuedTrend = weeklyChartData.map((entry) => ({
    day: entry.day,
    rescued:
      safeNumber(entry.donated) ||
      safeNumber(entry.remaining) ||
      Math.max(0, safeNumber(entry.prepared) - safeNumber(entry.sold)),
  }));
  const latestEntry = history[0] || null;
  const unitPrice = safeNumber(
    restaurant?.price_per_portion ||
      providerSettings.pricePerPortion ||
      getDefaultPricePerPortion(user.role)
  );

  const refreshRestaurantData = async () => {
    const [dashboard, analytics] = await Promise.all([
      apiRequest("/restaurant/dashboard", { token }),
      apiRequest("/ai/prediction-accuracy", { token }),
    ]);
    setRestaurant(dashboard.restaurant || dashboard.provider || null);
    setHistory(dashboard.food_history || []);
    setChartData(dashboard.chart_data || []);
    setAccuracyData(analytics.predictions || []);
  };

  const handleRowChange = (rowId, field, value) => {
    setRowsTouched(true);
    setInventoryRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [field]: field === "name" || field === "foodType" ? value : safeNumber(value),
            }
          : row
      )
    );
  };

  const handleProviderSettingChange = (field, value) => {
    setProviderSettings((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleAddRow = () => {
    setRowsTouched(true);
    setInventoryRows((currentRows) => [...currentRows, createInventoryRow()]);
  };

  const handleRemoveRow = (rowId) => {
    setRowsTouched(true);
    setInventoryRows((currentRows) =>
      currentRows.length === 1 ? currentRows : currentRows.filter((row) => row.id !== rowId)
    );
  };

  const buildProviderPayload = (surplusMeals) => ({
    price_per_portion: unitPrice,
    available_after: providerSettings.availableAfter || closingTime,
    minimum_pickup: Math.max(1, safeNumber(providerSettings.minimumPickup)),
    event_name: providerSettings.eventName,
    guest_count: safeNumber(providerSettings.guestCount),
    expected_surplus: safeNumber(providerSettings.expectedSurplus || surplusMeals || totals.surplus),
    daily_surplus_auto_entry: Boolean(providerSettings.dailySurplusAutoEntry),
    recurring_alerts: Boolean(providerSettings.recurringAlerts),
  });

  const submitInventory = async () => {
    if (!totals.prepared) {
      setNotice({ type: "error", text: "Add at least one prepared quantity before saving." });
      return;
    }

    setBusyAction("inventory");
    setNotice(null);
    try {
      const response = await apiRequest("/restaurant/food-data", {
        method: "POST",
        token,
        body: JSON.stringify({
          food_prepared: totals.prepared,
          food_sold: totals.sold,
          food_type: "Both",
          category: inventoryRows.map((row) => row.name).join(", "),
          closing_time: closingTime,
          discount_price: unitPrice,
          ...buildProviderPayload(totals.surplus),
        }),
      });

      await refreshRestaurantData();
      setRowsTouched(false);
      setNotice({
        type: "success",
        text:
          response.ai_message ||
          `Inventory updated. Current surplus available: ${response.remaining_food || totals.surplus}.`,
      });
    } catch (submitError) {
      setNotice({
        type: "error",
        text: submitError.message || "Unable to update inventory.",
      });
    } finally {
      setBusyAction("");
    }
  };

  const sendAlert = async () => {
    const items = buildAlertPayloadItems(inventoryRows);
    const surplusMeals = items.reduce((total, row) => total + row.remaining, 0);
    const minimumPickup = Math.max(1, safeNumber(providerSettings.minimumPickup));

    if (!surplusMeals) {
      setNotice({ type: "error", text: "There is no surplus available to alert NGOs about." });
      return;
    }

    if (user.role === "banquet" && surplusMeals < minimumPickup) {
      setNotice({
        type: "error",
        text: `Banquet alerts need at least ${minimumPickup} portions available for bulk pickup.`,
      });
      return;
    }

    setBusyAction("alert");
    setNotice(null);
    try {
      const response = await apiRequest("/restaurant/send-alert", {
        method: "POST",
        token,
        body: JSON.stringify({
          surplus_meals: surplusMeals,
          category: items.map((row) => row.name).join(", "),
          food_type: "Both",
          pickup_time: providerSettings.availableAfter || closingTime,
          items,
          ...buildProviderPayload(surplusMeals),
        }),
      });

      setNotice({
        type: "success",
        text: response.message || "Rescue alert sent to NGOs successfully.",
      });
    } catch (alertError) {
      setNotice({
        type: "error",
        text: alertError.message || "Unable to notify NGOs.",
      });
    } finally {
      setBusyAction("");
    }
  };

  const runPrediction = async () => {
    setBusyAction("predict");
    setNotice(null);
    try {
      const response = await apiRequest("/ai/predict-surplus", {
        method: "POST",
        token,
        body: JSON.stringify({
          provider_type: user.role,
          food_prepared: predictorForm.food_prepared,
          food_sold: predictorForm.food_sold,
          hour: predictorForm.hour,
        }),
      });
      setPredictionResult(response);
    } catch (predictionError) {
      setNotice({
        type: "error",
        text: predictionError.message || "Unable to generate prediction.",
      });
    } finally {
      setBusyAction("");
    }
  };

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: DashboardIcon },
    { id: "analytics", label: "Analytics", icon: AnalyticsIcon },
    { id: "subscription", label: "Subscription", icon: CardIcon },
  ];

  return (
    <WorkspaceShell
      user={user}
      navItems={navItems}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onLogout={onLogout}
    >
      <NoticeBanner notice={notice} />

      {loading ? (
        <LoadingState label={`Loading ${providerLabel.toLowerCase()} dashboard...`} />
      ) : (
        <>
          {activeSection === "dashboard" && (
            <div className="panel-stack">
              <PageIntro
                title={`${providerLabel} Dashboard`}
                subtitle={
                  user.role === "hotel"
                    ? "Track buffet leftovers, recurring alerts, and nightly rescue supply."
                    : user.role === "banquet"
                      ? "Manage event-based surplus, bulk pickups, and after-event rescue windows."
                      : "Manage daily surplus inventory and rescue alerts."
                }
              />

              <div className="stats-grid stats-grid--four">
                <StatCard icon={BoxIcon} label="Total Prepared" value={totals.prepared} />
                <StatCard icon={ArrowTrendIcon} label="Total Sold" value={totals.sold} />
                <StatCard
                  icon={ClockIcon}
                  label="Surplus Available"
                  value={totals.surplus}
                  tone="amber"
                />
                <StatCard
                  icon={CardIcon}
                  label="Price / Portion"
                  value={formatCurrency(unitPrice)}
                />
              </div>

              <section className="surface-card">
                <div className="surface-card__header">
                  <div>
                    <h2>Food Categories</h2>
                    <p>Track category-wise production and sold portions.</p>
                  </div>
                  <button type="button" className="button button--primary button--compact" onClick={handleAddRow}>
                    <PlusIcon size={16} />
                    Add Category
                  </button>
                </div>

                <div className="inventory-table">
                  <div className="inventory-table__header">
                    <span>Category Name</span>
                    <span>Prepared</span>
                    <span>Sold</span>
                    <span>Surplus</span>
                    <span />
                  </div>

                  {inventoryRows.map((row) => (
                    <div key={row.id} className="inventory-row">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(event) => handleRowChange(row.id, "name", event.target.value)}
                        placeholder="Main Course"
                      />
                      <input
                        type="number"
                        min="0"
                        value={row.prepared}
                        onChange={(event) =>
                          handleRowChange(row.id, "prepared", event.target.value)
                        }
                      />
                      <input
                        type="number"
                        min="0"
                        value={row.sold}
                        onChange={(event) => handleRowChange(row.id, "sold", event.target.value)}
                      />
                      <div className="pill pill--amber">Surplus: {getRowRemaining(row)}</div>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => handleRemoveRow(row.id)}
                        disabled={inventoryRows.length === 1}
                        aria-label="Remove row"
                      >
                        <TrashIcon size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="surface-card">
                <div className="surface-card__header">
                  <div>
                    <h2>{providerLabel} Settings</h2>
                    <p>
                      {user.role === "banquet"
                        ? "Capture event details, pickup windows, and bulk pickup rules."
                        : user.role === "hotel"
                          ? "Configure recurring hotel surplus operations."
                          : "Review rescue pricing and pickup timing."}
                    </p>
                  </div>
                </div>

                <div className="admin-form">
                  <label className="field">
                    <span>Available After</span>
                    <input
                      type="time"
                      value={providerSettings.availableAfter}
                      onChange={(event) =>
                        handleProviderSettingChange("availableAfter", event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Price Per Portion</span>
                    <input type="number" value={unitPrice} disabled readOnly />
                  </label>
                  <label className="field">
                    <span>Expected Surplus</span>
                    <input
                      type="number"
                      min="0"
                      value={providerSettings.expectedSurplus}
                      onChange={(event) =>
                        handleProviderSettingChange(
                          "expectedSurplus",
                          safeNumber(event.target.value)
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Minimum Pickup</span>
                    <input
                      type="number"
                      min="1"
                      value={providerSettings.minimumPickup}
                      onChange={(event) =>
                        handleProviderSettingChange(
                          "minimumPickup",
                          Math.max(1, safeNumber(event.target.value))
                        )
                      }
                    />
                  </label>
                  {user.role === "banquet" && (
                    <>
                      <label className="field">
                        <span>Event Name</span>
                        <input
                          type="text"
                          value={providerSettings.eventName}
                          onChange={(event) =>
                            handleProviderSettingChange("eventName", event.target.value)
                          }
                          placeholder="Wedding reception"
                        />
                      </label>
                      <label className="field">
                        <span>Guests</span>
                        <input
                          type="number"
                          min="0"
                          value={providerSettings.guestCount}
                          onChange={(event) =>
                            handleProviderSettingChange(
                              "guestCount",
                              safeNumber(event.target.value)
                            )
                          }
                        />
                      </label>
                    </>
                  )}
                  {user.role === "hotel" && (
                    <>
                      <label className="field">
                        <span>Daily Surplus Auto-Entry</span>
                        <select
                          value={providerSettings.dailySurplusAutoEntry ? "enabled" : "disabled"}
                          onChange={(event) =>
                            handleProviderSettingChange(
                              "dailySurplusAutoEntry",
                              event.target.value === "enabled"
                            )
                          }
                        >
                          <option value="enabled">Enabled</option>
                          <option value="disabled">Disabled</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Recurring Alerts</span>
                        <select
                          value={providerSettings.recurringAlerts ? "enabled" : "disabled"}
                          onChange={(event) =>
                            handleProviderSettingChange(
                              "recurringAlerts",
                              event.target.value === "enabled"
                            )
                          }
                        >
                          <option value="enabled">Enabled</option>
                          <option value="disabled">Disabled</option>
                        </select>
                      </label>
                    </>
                  )}
                </div>
              </section>

              <section className="inventory-footer">
                <label className="field field--inline">
                  <span>Closing Time</span>
                  <input
                    type="time"
                    value={closingTime}
                    onChange={(event) => setClosingTime(event.target.value)}
                  />
                </label>

                <div className="inventory-footer__actions">
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={submitInventory}
                    disabled={busyAction === "inventory"}
                  >
                    {busyAction === "inventory" ? "Updating..." : "Update Inventory"}
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={sendAlert}
                    disabled={busyAction === "alert" || totals.surplus <= 0}
                  >
                    {busyAction === "alert" ? "Sending..." : "Notify NGOs"}
                  </button>
                </div>
              </section>

              {latestEntry && (
                <section className="surface-card surface-card--soft">
                  <div className="surface-card__header">
                    <div>
                      <h2>Latest Snapshot</h2>
                      <p>Last updated {formatDateTime(latestEntry.timestamp || latestEntry.date)}</p>
                    </div>
                    <div className="pill pill--success">
                      {restaurant?.name || user.name}
                    </div>
                  </div>
                  <div className="snapshot-grid">
                    <SnapshotItem label="Type" value={providerLabel} />
                    <SnapshotItem label="Category" value={latestEntry.category || "Mixed"} />
                    <SnapshotItem label="Prepared" value={safeNumber(latestEntry.food_prepared)} />
                    <SnapshotItem label="Sold" value={safeNumber(latestEntry.food_sold)} />
                    <SnapshotItem label="Remaining" value={safeNumber(latestEntry.remaining_food)} />
                    <SnapshotItem
                      label="Price / Portion"
                      value={formatCurrency(latestEntry.price_per_portion || unitPrice)}
                    />
                    <SnapshotItem
                      label="Available After"
                      value={latestEntry.available_after || providerSettings.availableAfter}
                    />
                    <SnapshotItem
                      label="Minimum Pickup"
                      value={safeNumber(latestEntry.minimum_pickup || providerSettings.minimumPickup)}
                    />
                  </div>
                </section>
              )}
            </div>
          )}

          {activeSection === "analytics" && (
            <div className="panel-stack">
              <PageIntro
                title="Analytics & AI Predictions"
                subtitle={`Track ${providerLabel.toLowerCase()} trends and forecast rescue opportunities.`}
              />

              <section className="surface-card surface-card--hero">
                <div className="surface-card__header">
                  <div>
                    <h2>AI Surplus Predictor</h2>
                    <p>Estimate likely surplus before closing time.</p>
                  </div>
                  <div className="hero-icon">
                    <BrainIcon size={24} />
                  </div>
                </div>

                <div className="predictor-grid">
                  <label className="field">
                    <span>Prepared</span>
                    <input
                      type="number"
                      min="0"
                      value={predictorForm.food_prepared}
                      onChange={(event) =>
                        setPredictorForm((current) => ({
                          ...current,
                          food_prepared: safeNumber(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Sold</span>
                    <input
                      type="number"
                      min="0"
                      value={predictorForm.food_sold}
                      onChange={(event) =>
                        setPredictorForm((current) => ({
                          ...current,
                          food_sold: safeNumber(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Hour (0-23)</span>
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={predictorForm.hour}
                      onChange={(event) =>
                        setPredictorForm((current) => ({
                          ...current,
                          hour: Math.max(0, Math.min(23, safeNumber(event.target.value))),
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="button button--primary predictor-grid__button"
                    onClick={runPrediction}
                    disabled={busyAction === "predict"}
                  >
                    {busyAction === "predict" ? "Predicting..." : "Predict Surplus"}
                  </button>
                </div>

                {predictionResult && (
                  <div className="prediction-summary">
                    <div className="prediction-summary__metric">
                      <span>Predicted surplus</span>
                      <strong>{safeNumber(predictionResult.predicted_surplus)} meals</strong>
                    </div>
                    <div className="prediction-summary__metric">
                      <span>Confidence</span>
                      <strong>{safeNumber(predictionResult.confidence)}%</strong>
                    </div>
                    <div className="prediction-summary__message">
                      <p>{predictionResult.message || "Prediction completed successfully."}</p>
                      {(predictionResult.suggestions || []).slice(0, 3).map((suggestion, index) => (
                        <span key={`${suggestion}-${index}`} className="pill pill--soft">
                          {suggestion}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {loadingAnalytics ? (
                <LoadingState label="Loading AI analytics..." />
              ) : (
                <>
                  <div className="chart-grid">
                    <ChartCard title="Weekly Prepared vs Sold">
                      <BarChart
                        data={weeklyChartData}
                        xKey="day"
                        series={[
                          { key: "prepared", label: "prepared", color: "#2f9d61" },
                          { key: "sold", label: "sold", color: "#f3ad2d" },
                        ]}
                      />
                    </ChartCard>

                    <ChartCard title="Prediction Accuracy">
                      <LineChart
                        data={accuracySeries}
                        xKey="day"
                        series={[
                          { key: "actual", label: "actual", color: "#2f9d61" },
                          {
                            key: "predicted",
                            label: "predicted",
                            color: "#f3ad2d",
                            dashed: true,
                          },
                        ]}
                      />
                    </ChartCard>
                  </div>

                  <ChartCard title="Food Rescued Over Time">
                    <AreaChart data={rescuedTrend} xKey="day" dataKey="rescued" color="#2f9d61" />
                  </ChartCard>
                </>
              )}
            </div>
          )}

          {activeSection === "subscription" && (
            <SubscriptionPage
              embedded
              user={user}
              token={token}
              onLogout={onLogout}
              onActivate={onUserUpdate}
            />
          )}
        </>
      )}
    </WorkspaceShell>
  );
}

function NGOWorkspace({ user, token, onLogout }) {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [ngo, setNgo] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [providerFilter, setProviderFilter] = useState("all");
  const [expandedAlertId, setExpandedAlertId] = useState("");
  const [cart, setCart] = useState({});
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");

  useEffect(() => {
    let ignore = false;

    const loadDashboard = async () => {
      try {
        const data = await apiRequest("/ngo/dashboard", { token });
        if (ignore) return;
        setNgo(data.ngo || null);
        setAlerts((data.alerts || []).map(normalizeAlert));
        setOrders((data.orders || []).map(normalizeOrder));
      } catch (dashboardError) {
        if (!ignore) {
          setNotice({
            type: "error",
            text: dashboardError.message || "Unable to load NGO dashboard.",
          });
        }
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

  const refreshDashboard = async () => {
    const data = await apiRequest("/ngo/dashboard", { token });
    setNgo(data.ngo || null);
    setAlerts((data.alerts || []).map(normalizeAlert));
    setOrders((data.orders || []).map(normalizeOrder));
  };

  const handleToggleAlert = (alertId) => {
    setExpandedAlertId((current) => (current === alertId ? "" : alertId));
    setCart((current) => current);
  };

  const handleQuantityChange = (alert, categoryName, delta) => {
    const category = alert.categories.find((item) => item.name === categoryName);
    if (!category) return;

    setCart((current) => {
      const alertCart = current[alert.id] || {};
      const currentValue = safeNumber(alertCart[categoryName]);
      const nextValue = Math.max(0, Math.min(category.available, currentValue + delta));
      return {
        ...current,
        [alert.id]: {
          ...alertCart,
          [categoryName]: nextValue,
        },
      };
    });
  };

  const getSelectedCount = (alertId) =>
    Object.values(cart[alertId] || {}).reduce((total, value) => total + safeNumber(value), 0);

  const filteredAlerts = alerts.filter(
    (alert) => providerFilter === "all" || alert.providerType === providerFilter
  );

  const placeOrder = async (alert) => {
    const selectedItems = cart[alert.id] || {};
    const selectedCount = getSelectedCount(alert.id);

    if (!selectedCount) {
      setNotice({ type: "error", text: "Select at least one portion before placing the order." });
      return;
    }

    if (selectedCount < alert.minimumPickup) {
      setNotice({
        type: "error",
        text: `Minimum pickup for this ${alert.providerLabel.toLowerCase()} is ${alert.minimumPickup} portions.`,
      });
      return;
    }

    setBusyAction(alert.id);
    setNotice(null);
    try {
      const response = await apiRequest(`/ngo/accept-alert/${alert.id}`, {
        method: "POST",
        token,
        body: JSON.stringify({
          pickup_time: alert.pickupTime,
          payment_method: "free",
          notes: "",
          items: selectedItems,
        }),
      });

      setOrders((current) => [normalizeOrder(response.order), ...current]);
      if (response.alert && safeNumber(response.alert.surplus_meals) > 0) {
        setAlerts((current) =>
          current.map((currentAlert) =>
            currentAlert.id === alert.id ? normalizeAlert(response.alert) : currentAlert
          )
        );
      } else {
        setAlerts((current) => current.filter((currentAlert) => currentAlert.id !== alert.id));
      }

      setCart((current) => ({
        ...current,
        [alert.id]: {},
      }));
      setExpandedAlertId("");
      setNotice({
        type: "success",
        text: response.message || "Order placed successfully.",
      });
    } catch (orderError) {
      setNotice({
        type: "error",
        text: orderError.message || "Unable to place the order.",
      });
    } finally {
      setBusyAction("");
    }
  };

  const markCollected = async (orderId) => {
    setBusyAction(orderId);
    setNotice(null);
    try {
      const response = await apiRequest(`/ngo/mark-order-collected/${orderId}`, {
        method: "POST",
        token,
      });
      await refreshDashboard();
      setNotice({
        type: "success",
        text: response.message || "Order marked as collected.",
      });
    } catch (collectionError) {
      setNotice({
        type: "error",
        text: collectionError.message || "Unable to update order status.",
      });
    } finally {
      setBusyAction("");
    }
  };

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: DashboardIcon },
  ];

  return (
    <WorkspaceShell
      user={user}
      navItems={navItems}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onLogout={onLogout}
    >
      <NoticeBanner notice={notice} />

      {loading ? (
        <LoadingState label="Loading NGO dashboard..." />
      ) : (
        <>
          {activeSection === "dashboard" && (
            <div className="panel-stack">
              <PageIntro
                title="NGO Dashboard"
                subtitle="Browse provider types, reserve portions, and coordinate rescue pickups."
              />

              <section className="surface-card surface-card--soft">
                <div className="surface-card__header">
                  <div>
                    <h2>Provider Filters</h2>
                    <p>Switch between restaurants, hotels, and banquet providers.</p>
                  </div>
                </div>
                <SegmentedControl
                  value={providerFilter}
                  onChange={setProviderFilter}
                  options={PROVIDER_FILTER_OPTIONS}
                />
              </section>

              <div className="ngo-stack">
                {filteredAlerts.length === 0 ? (
                  <EmptyState
                    title="No providers available right now"
                    description="New rescue alerts will appear here as soon as providers publish them."
                  />
                ) : (
                  filteredAlerts.map((alert) => {
                    const isExpanded = expandedAlertId === alert.id;
                    const selectedCount = getSelectedCount(alert.id);
                    return (
                      <article
                        key={alert.id}
                        className={`ngo-alert ${isExpanded ? "ngo-alert--expanded" : ""}`}
                      >
                        <button
                          type="button"
                          className="ngo-alert__summary"
                          onClick={() => handleToggleAlert(alert.id)}
                        >
                          <div className="entity-badge">{getInitials(alert.name)}</div>
                          <div className="ngo-alert__identity">
                            <h2>{alert.name}</h2>
                            <p>
                              <span className={`pill pill--role pill--role-${alert.providerType}`}>
                                {alert.providerLabel}
                              </span>
                              <MapPinIcon size={14} />
                              {alert.location}
                              <ClockIcon size={14} />
                              Available after {alert.pickupTime}
                            </p>
                          </div>
                          <div className="ngo-alert__meta">
                            <span className="pill pill--success">
                              {alert.totalAvailable} portions available
                            </span>
                            <span className="pill pill--soft">
                              {formatCurrency(alert.pricePerPortion)} / portion
                            </span>
                            <ChevronDownIcon size={18} className={isExpanded ? "rotate-180" : ""} />
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="ngo-alert__details">
                            <div className="snapshot-grid">
                              <SnapshotItem label="Type" value={alert.providerLabel} />
                              <SnapshotItem
                                label="Minimum Pickup"
                                value={`${alert.minimumPickup} portions`}
                              />
                              <SnapshotItem
                                label="Expected Surplus"
                                value={safeNumber(alert.expectedSurplus || alert.totalAvailable)}
                              />
                              <SnapshotItem label="Price" value={formatCurrency(alert.pricePerPortion)} />
                            </div>
                            {alert.eventName && (
                              <div className="pill pill--soft">Event: {alert.eventName}</div>
                            )}
                            {alert.guestCount > 0 && (
                              <div className="pill pill--soft">Guests: {alert.guestCount}</div>
                            )}
                            {alert.dailySurplusAutoEntry && (
                              <div className="pill pill--soft">Daily surplus auto-entry enabled</div>
                            )}
                            {alert.recurringAlerts && (
                              <div className="pill pill--soft">Recurring alerts enabled</div>
                            )}
                            {alert.categories.map((category) => {
                              const quantity = safeNumber(cart[alert.id]?.[category.name]);
                              return (
                                <div key={category.name} className="portion-row">
                                  <div>
                                    <h3>{category.name}</h3>
                                    <p>{category.available} available</p>
                                  </div>
                                  <div className="stepper">
                                    <button
                                      type="button"
                                      className="stepper__button"
                                      onClick={() => handleQuantityChange(alert, category.name, -1)}
                                    >
                                      −
                                    </button>
                                    <strong>{quantity}</strong>
                                    <button
                                      type="button"
                                      className="stepper__button"
                                      onClick={() => handleQuantityChange(alert, category.name, 1)}
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              );
                            })}

                            <button
                              type="button"
                              className="button button--primary button--block"
                              onClick={() => placeOrder(alert)}
                              disabled={
                                busyAction === alert.id ||
                                selectedCount === 0 ||
                                selectedCount < alert.minimumPickup
                              }
                            >
                              {busyAction === alert.id
                                ? "Placing order..."
                                : `Place Order (${selectedCount} portions, ${formatCurrency(selectedCount * alert.pricePerPortion)})`}
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </div>

              <section className="surface-card">
                <div className="surface-card__header">
                  <div>
                    <h2>My Orders</h2>
                    <p>
                      {ngo?.name || user.name} can track accepted pickups here.
                    </p>
                  </div>
                </div>

                {orders.length === 0 ? (
                  <EmptyState
                    title="No orders yet"
                    description="Browse providers above to start rescuing food."
                  />
                ) : (
                  <div className="order-list">
                    {orders.map((order) => (
                      <article key={order.id} className="order-card">
                        <div className="order-card__header">
                          <div>
                            <h3>{order.restaurantName}</h3>
                            <p>
                              {order.providerLabel} • {order.summary}
                            </p>
                          </div>
                          <div className="order-card__meta">
                            <span
                              className={`pill ${
                                order.status === "Collected" ? "pill--success" : "pill--amber"
                              }`}
                            >
                              {order.status.toLowerCase()}
                            </span>
                            <span>{order.totalPortions} portions</span>
                            <span>{formatCurrency(order.totalPrice)}</span>
                          </div>
                        </div>

                        <div className="order-card__footer">
                          <span>Pickup {order.pickupTime}</span>
                          <span>{formatDate(order.createdAt)}</span>
                          {order.status !== "Collected" && (
                            <button
                              type="button"
                              className="button button--ghost"
                              onClick={() => markCollected(order.id)}
                              disabled={busyAction === order.id}
                            >
                              {busyAction === order.id ? "Updating..." : "Mark Collected"}
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

        </>
      )}
    </WorkspaceShell>
  );
}

function AdminWorkspace({ user, token, onLogout }) {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [behaviorAnalysis, setBehaviorAnalysis] = useState([]);
  const [predictionAccuracy, setPredictionAccuracy] = useState([]);
  const [smartMatches, setSmartMatches] = useState([]);
  const [providerDistribution, setProviderDistribution] = useState([]);
  const [providerInsights, setProviderInsights] = useState([]);
  const [expansionMessage, setExpansionMessage] = useState("");
  const [aiStatus, setAiStatus] = useState(null);
  const [models, setModels] = useState({});
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "restaurant",
    location: "",
    phone: "",
    password: "default123",
  });

  useEffect(() => {
    let ignore = false;

    const loadAdminData = async () => {
      try {
        const [dashboard, usersResponse, insights] = await Promise.all([
          apiRequest("/admin/dashboard", { token }),
          apiRequest("/admin/users", { token }),
          apiRequest("/ai/admin-insights", { token }),
        ]);

        if (ignore) return;

        setStats(dashboard.stats || null);
        setUsers(usersResponse.users || []);
        setBehaviorAnalysis(insights.behavior_analysis || []);
        setPredictionAccuracy(insights.predictions || []);
        setSmartMatches(insights.matches || []);
        setProviderDistribution(insights.provider_distribution || []);
        setProviderInsights(insights.provider_insights || []);
        setExpansionMessage(insights.expansion_message || "");
        setAiStatus(insights.status || null);
        setModels(insights.models || {});
      } catch (adminError) {
        if (!ignore) {
          setNotice({
            type: "error",
            text: adminError.message || "Unable to load admin dashboard.",
          });
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    void loadAdminData();

    return () => {
      ignore = true;
    };
  }, [token]);

  const refreshAdminData = async () => {
    const [dashboard, usersResponse, insights] = await Promise.all([
      apiRequest("/admin/dashboard", { token }),
      apiRequest("/admin/users", { token }),
      apiRequest("/ai/admin-insights", { token }),
    ]);

    setStats(dashboard.stats || null);
    setUsers(usersResponse.users || []);
    setBehaviorAnalysis(insights.behavior_analysis || []);
    setPredictionAccuracy(insights.predictions || []);
    setSmartMatches(insights.matches || []);
    setProviderDistribution(insights.provider_distribution || []);
    setProviderInsights(insights.provider_insights || []);
    setExpansionMessage(insights.expansion_message || "");
    setAiStatus(insights.status || null);
    setModels(insights.models || {});
  };

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.email) {
      setNotice({ type: "error", text: "Name and email are required." });
      return;
    }

    setBusyAction("add-user");
    setNotice(null);

    try {
      const endpoint = isProviderRole(newUser.role) ? "/admin/add-restaurant" : "/admin/add-ngo";
      const response = await apiRequest(endpoint, {
        method: "POST",
        token,
        body: JSON.stringify(newUser),
      });

      await refreshAdminData();
      setShowAddForm(false);
      setNewUser({
        name: "",
        email: "",
        role: "restaurant",
        location: "",
        phone: "",
        password: "default123",
      });
      setNotice({ type: "success", text: response.message || "User added successfully." });
    } catch (createError) {
      setNotice({
        type: "error",
        text: createError.message || "Unable to add user.",
      });
    } finally {
      setBusyAction("");
    }
  };

  const handleDeleteUser = async (entry) => {
    if (entry.role === "admin") return;

    const confirmed = window.confirm(`Remove ${entry.name || entry.email}?`);
    if (!confirmed) return;

    setBusyAction(entry.email);
    setNotice(null);
    try {
      const endpoint =
        isProviderRole(entry.role)
          ? `/admin/remove-restaurant/${entry.email}`
          : `/admin/remove-ngo/${entry.email}`;
      const response = await apiRequest(endpoint, {
        method: "DELETE",
        token,
      });
      await refreshAdminData();
      setNotice({ type: "success", text: response.message || "User removed successfully." });
    } catch (deleteError) {
      setNotice({
        type: "error",
        text: deleteError.message || "Unable to remove user.",
      });
    } finally {
      setBusyAction("");
    }
  };

  const usageSegments = useMemo(
    () => buildUsageSegments(behaviorAnalysis),
    [behaviorAnalysis]
  );
  const usageBars = useMemo(() => buildUsageBars(behaviorAnalysis), [behaviorAnalysis]);
  const rescuedTotal =
    safeNumber(stats?.food_saved_today) ||
    usageSegments.reduce((total, segment) => total + segment.value, 0);
  const predictionSeries = predictionAccuracy.length > 0 ? predictionAccuracy : FALLBACK_ACCURACY;
  const distributionSegments = providerDistribution.map((entry, index) => ({
    id: entry.key || `provider-${index}`,
    label: entry.label || getRoleLabel(entry.key),
    value: safeNumber(entry.value),
    color: entry.color || PROVIDER_DISTRIBUTION_COLORS[index % PROVIDER_DISTRIBUTION_COLORS.length],
    percent: safeNumber(entry.percent),
  }));

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: DashboardIcon },
    { id: "analytics", label: "Analytics", icon: AnalyticsIcon },
  ];

  return (
    <WorkspaceShell
      user={user}
      navItems={navItems}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onLogout={onLogout}
    >
      <NoticeBanner notice={notice} />

      {loading ? (
        <LoadingState label="Loading admin dashboard..." />
      ) : (
        <>
          {activeSection === "dashboard" && (
            <div className="panel-stack">
              <PageIntro
                title="Admin Dashboard"
                subtitle="Platform overview, provider distribution, and user management."
              />

              {expansionMessage && (
                <section className="surface-card surface-card--soft">
                  <p className="lead-copy">{expansionMessage}</p>
                </section>
              )}

              <div className="stats-grid stats-grid--six">
                <StatCard icon={LeafIcon} label="Food Rescued" value={rescuedTotal} suffix="portions" />
                <StatCard
                  icon={StoreIcon}
                  label="Providers"
                  value={safeNumber(stats?.total_providers)}
                />
                <StatCard
                  icon={StoreIcon}
                  label="Restaurants"
                  value={safeNumber(stats?.total_restaurants)}
                />
                <StatCard icon={AnalyticsIcon} label="Hotels" value={safeNumber(stats?.total_hotels)} />
                <StatCard icon={BoxIcon} label="Banquets" value={safeNumber(stats?.total_banquets)} />
                <StatCard icon={UsersIcon} label="Active NGOs" value={safeNumber(stats?.total_ngos)} />
              </div>

              <div className="chart-grid">
                <ChartCard title="Food Rescue Volume (Weekly)">
                  <BarChart
                    data={usageBars}
                    xKey="day"
                    series={[{ key: "rescued", label: "rescued", color: "#2f9d61" }]}
                  />
                </ChartCard>

                <ChartCard title="AI Prediction vs Actual Surplus">
                  <LineChart
                    data={predictionSeries}
                    xKey="day"
                    series={[
                      { key: "actual", label: "actual", color: "#2f9d61" },
                      {
                        key: "predicted",
                        label: "predicted",
                        color: "#f3ad2d",
                        dashed: true,
                      },
                    ]}
                  />
                </ChartCard>
              </div>

              <section className="surface-card">
                <div className="surface-card__header">
                  <div>
                    <h2>Provider Distribution</h2>
                    <p>Track how rescued food volume is split across restaurants, hotels, and banquets.</p>
                  </div>
                </div>

                <div className="usage-layout">
                  <DonutUsage
                    segments={
                      distributionSegments.length > 0
                        ? distributionSegments
                        : [
                            {
                              id: "providers-empty",
                              label: "No provider data yet",
                              value: 1,
                              color: "#d8e6dc",
                            },
                          ]
                    }
                  />
                  <div className="usage-list">
                    {distributionSegments.map((segment) => (
                      <div key={segment.id} className="usage-list__item">
                        <span className="usage-list__bullet" style={{ backgroundColor: segment.color }} />
                        <div>
                          <strong>{segment.label}</strong>
                          <span>
                            {segment.value} portions • {segment.percent}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="surface-card">
                <div className="surface-card__header">
                  <div>
                    <h2>AI Insights</h2>
                    <p>Provider-aware intelligence generated from current rescue patterns.</p>
                  </div>
                </div>

                {providerInsights.length === 0 ? (
                  <EmptyState
                    title="No provider insights yet"
                    description="Insights will appear here as provider activity grows."
                  />
                ) : (
                  <div className="usage-list">
                    {providerInsights.map((insight, index) => (
                      <div key={`${insight}-${index}`} className="usage-list__item">
                        <span
                          className="usage-list__bullet"
                          style={{
                            backgroundColor:
                              PROVIDER_DISTRIBUTION_COLORS[index % PROVIDER_DISTRIBUTION_COLORS.length],
                          }}
                        />
                        <div>
                          <strong>Insight {index + 1}</strong>
                          <span>{insight}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="surface-card">
                <div className="surface-card__header">
                  <div>
                    <h2>NGO Usage</h2>
                    <p>Current rescue activity split across participating NGOs.</p>
                  </div>
                </div>

                <div className="usage-layout">
                  <DonutUsage segments={usageSegments} />
                  <div className="usage-list">
                    {usageSegments.map((segment) => (
                      <div key={segment.id} className="usage-list__item">
                        <span className="usage-list__bullet" style={{ backgroundColor: segment.color }} />
                        <div>
                          <strong>{segment.label}</strong>
                          <span>{segment.value} portions</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="surface-card">
                <div className="surface-card__header">
                  <div>
                    <h2>User Management</h2>
                    <p>Review providers, NGOs, and admin access from one place.</p>
                  </div>
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => setShowAddForm((current) => !current)}
                  >
                    {showAddForm ? "Cancel" : "Add User"}
                  </button>
                </div>

                {showAddForm && (
                  <div className="admin-form">
                    <label className="field">
                      <span>Name</span>
                      <input
                        type="text"
                        value={newUser.name}
                        onChange={(event) =>
                          setNewUser((current) => ({ ...current, name: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Email</span>
                      <input
                        type="email"
                        value={newUser.email}
                        onChange={(event) =>
                          setNewUser((current) => ({ ...current, email: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Role</span>
                      <select
                        value={newUser.role}
                        onChange={(event) =>
                          setNewUser((current) => ({ ...current, role: event.target.value }))
                        }
                      >
                        <option value="restaurant">Restaurant</option>
                        <option value="hotel">Hotel</option>
                        <option value="banquet">Banquet</option>
                        <option value="ngo">NGO</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Location</span>
                      <input
                        type="text"
                        value={newUser.location}
                        onChange={(event) =>
                          setNewUser((current) => ({ ...current, location: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Phone</span>
                      <input
                        type="text"
                        value={newUser.phone}
                        onChange={(event) =>
                          setNewUser((current) => ({ ...current, phone: event.target.value }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={handleAddUser}
                      disabled={busyAction === "add-user"}
                    >
                      {busyAction === "add-user" ? "Adding..." : "Create User"}
                    </button>
                  </div>
                )}

                <div className="user-list">
                  {users.map((entry) => (
                    <article key={entry._id || entry.email} className="user-row">
                      <div className="user-row__identity">
                        <div className="entity-badge entity-badge--soft">{getInitials(entry.name)}</div>
                        <div>
                          <strong>{entry.name}</strong>
                          <span>{entry.email}</span>
                        </div>
                      </div>
                      <div className="user-row__meta">
                        <span className={`pill pill--role pill--role-${entry.role}`}>
                          {getRoleLabel(entry.role)}
                        </span>
                        {isProviderRole(entry.role) && (
                          <span className="pill pill--soft">
                            {formatCurrency(entry.price_per_portion)} / portion
                          </span>
                        )}
                        <span className="pill pill--soft">{entry.subscription || "free"}</span>
                        {entry.role !== "admin" && (
                          <button
                            type="button"
                            className="icon-button icon-button--danger"
                            onClick={() => handleDeleteUser(entry)}
                            disabled={busyAction === entry.email}
                            aria-label={`Delete ${entry.email}`}
                          >
                            <TrashIcon size={16} />
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeSection === "analytics" && (
            <div className="panel-stack">
              <PageIntro
                title="Analytics & AI"
                subtitle="Ollama-backed insights and operational recommendations."
              />

              <section className="surface-card">
                <div className="surface-card__header">
                  <div>
                    <h2>Model Status</h2>
                    <p>Prediction and matching engines currently in use.</p>
                  </div>
                </div>
                <div className="snapshot-grid">
                  <SnapshotItem
                    label="Reachable"
                    value={aiStatus?.reachable ? "Yes" : "No"}
                  />
                  <SnapshotItem
                    label="Prediction Model"
                    value={models.prediction || "fallback"}
                  />
                  <SnapshotItem
                    label="Matching Model"
                    value={models.matching || "fallback"}
                  />
                  <SnapshotItem
                    label="Selected Model"
                    value={aiStatus?.selected_model || "not set"}
                  />
                </div>
              </section>

              <section className="surface-card">
                <div className="surface-card__header">
                  <div>
                    <h2>NGO Behaviour Analysis</h2>
                    <p>Weekly rescue totals grouped by NGO activity.</p>
                  </div>
                </div>

                <div className="table-shell">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>NGO</th>
                        {DAY_KEYS.map((day) => (
                          <th key={day.key}>{day.label}</th>
                        ))}
                        <th>Most Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {behaviorAnalysis.map((entry) => (
                        <tr key={entry.ngo}>
                          <td>{entry.ngo}</td>
                          {DAY_KEYS.map((day) => (
                            <td key={`${entry.ngo}-${day.key}`}>{safeNumber(entry[day.key])}</td>
                          ))}
                          <td>{entry.most_active || "N/A"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="surface-card">
                <div className="surface-card__header">
                  <div>
                    <h2>Smart Matching Suggestions</h2>
                    <p>Recommended NGO assignments for the latest rescue opportunities.</p>
                  </div>
                </div>

                {smartMatches.length === 0 ? (
                  <EmptyState
                    title="No match suggestions yet"
                    description="AI-powered matching cards will appear here when fresh alerts are available."
                  />
                ) : (
                  <div className="match-list">
                    {smartMatches.map((match, index) => (
                      <article key={`${match.restaurant}-${index}`} className="match-card">
                        <div className="match-card__header">
                          <strong>
                            {match.restaurant} → {match.bestNgo}
                          </strong>
                          <span className="pill pill--success">{safeNumber(match.score)}% match</span>
                        </div>
                        <p>{match.reason}</p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </WorkspaceShell>
  );
}

function BarChart({ data, xKey, series }) {
  if (!data?.length) {
    return <EmptyState title="No chart data yet" description="Data will appear here after activity starts." />;
  }

  const width = 640;
  const height = 300;
  const padding = { top: 24, right: 20, bottom: 42, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...data.flatMap((row) => series.map((entry) => safeNumber(row[entry.key])))
  );
  const step = chartWidth / data.length;
  const barWidth = Math.min(28, step / Math.max(2, series.length + 1));
  const ticks = Array.from({ length: 4 }, (_, index) => {
    const value = (maxValue / 4) * (4 - index);
    const y = padding.top + (chartHeight / 4) * index;
    return { value: Math.round(value), y };
  });

  return (
    <div className="chart-shell">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label="Bar chart">
        {ticks.map((tick, index) => (
          <g key={`bar-tick-${index}`}>
            <line
              x1={padding.left}
              y1={tick.y}
              x2={width - padding.right}
              y2={tick.y}
              className="chart-gridline"
            />
            <text x={padding.left - 10} y={tick.y + 4} textAnchor="end" className="chart-axis-text">
              {tick.value}
            </text>
          </g>
        ))}

        {data.map((row, rowIndex) => {
          const groupX = padding.left + rowIndex * step + step / 2;
          const totalSeriesWidth = series.length * barWidth + (series.length - 1) * 8;
          const startX = groupX - totalSeriesWidth / 2;

          return (
            <g key={`${row[xKey]}-${rowIndex}`}>
              {series.map((entry, seriesIndex) => {
                const value = safeNumber(row[entry.key]);
                const barHeight = (value / maxValue) * chartHeight;
                const x = startX + seriesIndex * (barWidth + 8);
                const y = padding.top + chartHeight - barHeight;
                return (
                  <rect
                    key={entry.key}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx="8"
                    fill={entry.color}
                  />
                );
              })}
              <text
                x={groupX}
                y={height - 14}
                textAnchor="middle"
                className="chart-axis-text chart-axis-text--x"
              >
                {row[xKey]}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="chart-legend">
        {series.map((entry) => (
          <span key={entry.key}>
            <i style={{ backgroundColor: entry.color }} />
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data, xKey, series }) {
  if (!data?.length) {
    return <EmptyState title="No line data yet" description="Data will appear here after activity starts." />;
  }

  const width = 640;
  const height = 300;
  const padding = { top: 24, right: 24, bottom: 42, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...data.flatMap((row) => series.map((entry) => safeNumber(row[entry.key])))
  );
  const ticks = Array.from({ length: 4 }, (_, index) => {
    const value = (maxValue / 4) * (4 - index);
    const y = padding.top + (chartHeight / 4) * index;
    return { value: Math.round(value), y };
  });

  const buildPoints = (key) =>
    data.map((row, index) => {
      const x =
        data.length === 1
          ? padding.left + chartWidth / 2
          : padding.left + (chartWidth / (data.length - 1)) * index;
      const value = safeNumber(row[key]);
      const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
      return { x, y, value, label: row[xKey] };
    });

  return (
    <div className="chart-shell">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label="Line chart">
        {ticks.map((tick, index) => (
          <g key={`line-tick-${index}`}>
            <line
              x1={padding.left}
              y1={tick.y}
              x2={width - padding.right}
              y2={tick.y}
              className="chart-gridline"
            />
            <text x={padding.left - 10} y={tick.y + 4} textAnchor="end" className="chart-axis-text">
              {tick.value}
            </text>
          </g>
        ))}

        {series.map((entry) => {
          const points = buildPoints(entry.key);
          const path = points
            .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
            .join(" ");

          return (
            <g key={entry.key}>
              <path
                d={path}
                fill="none"
                stroke={entry.color}
                strokeWidth="3"
                strokeDasharray={entry.dashed ? "8 8" : "0"}
              />
              {points.map((point, index) => (
                <circle
                  key={`${entry.key}-${point.label}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r="4.5"
                  fill="#ffffff"
                  stroke={entry.color}
                  strokeWidth="3"
                />
              ))}
            </g>
          );
        })}

        {data.map((row, index) => {
          const x =
            data.length === 1
              ? padding.left + chartWidth / 2
              : padding.left + (chartWidth / (data.length - 1)) * index;
          return (
            <text
              key={`${row[xKey]}-${index}`}
              x={x}
              y={height - 14}
              textAnchor="middle"
              className="chart-axis-text chart-axis-text--x"
            >
              {row[xKey]}
            </text>
          );
        })}
      </svg>

      <div className="chart-legend">
        {series.map((entry) => (
          <span key={entry.key}>
            <i style={{ backgroundColor: entry.color }} />
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function AreaChart({ data, xKey, dataKey, color }) {
  if (!data?.length) {
    return <EmptyState title="No trend data yet" description="Data will appear here after activity starts." />;
  }

  const width = 960;
  const height = 320;
  const padding = { top: 24, right: 24, bottom: 42, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...data.map((entry) => safeNumber(entry[dataKey])));
  const baselineY = padding.top + chartHeight;
  const points = data.map((entry, index) => {
    const x =
      data.length === 1
        ? padding.left + chartWidth / 2
        : padding.left + (chartWidth / (data.length - 1)) * index;
    const value = safeNumber(entry[dataKey]);
    const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
    return { x, y, label: entry[xKey] };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`;

  return (
    <div className="chart-shell">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label="Area chart">
        {Array.from({ length: 4 }, (_, index) => {
          const y = padding.top + (chartHeight / 4) * index;
          const value = (maxValue / 4) * (4 - index);
          return (
            <g key={`area-tick-${index}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                className="chart-gridline"
              />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="chart-axis-text">
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill={color} opacity="0.18" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="3" />
        {points.map((point, index) => (
          <circle
            key={`${point.label}-${index}`}
            cx={point.x}
            cy={point.y}
            r="4.5"
            fill={color}
            stroke="#ffffff"
            strokeWidth="3"
          />
        ))}
        {points.map((point, index) => (
          <text
            key={`${point.label}-label-${index}`}
            x={point.x}
            y={height - 14}
            textAnchor="middle"
            className="chart-axis-text chart-axis-text--x"
          >
            {point.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function DonutUsage({ segments }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const gradient = segments
    .map((segment, index) => {
      const start = segments
        .slice(0, index)
        .reduce((sum, item) => sum + (item.value / total) * 360, 0);
      const end = start + (segment.value / total) * 360;
      return `${segment.color} ${start}deg ${end}deg`;
    })
    .join(", ");

  return (
    <div className="usage-donut">
      <div className="usage-donut__ring" style={{ backgroundImage: `conic-gradient(${gradient})` }}>
        <div className="usage-donut__hole">
          <strong>{total}</strong>
          <span>portions</span>
        </div>
      </div>
    </div>
  );
}

function IconBase({ children, size = 20, className = "" }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function LeafIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M5 14c0-6.2 5.2-10 13-10-0.3 7.7-3.8 13-10 13-1.7 0-3-0.4-4-1.2" />
      <path d="M6 19c2.8-4.6 6.8-7.8 12-10" />
    </IconBase>
  );
}

function DashboardIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </IconBase>
  );
}

function AnalyticsIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 19.5h16" />
      <path d="M7 16V10" />
      <path d="M12 16V5" />
      <path d="M17 16v-7" />
    </IconBase>
  );
}

function CardIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
    </IconBase>
  );
}

function PlusIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </IconBase>
  );
}

function BoxIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 3 4 7.5 12 12l8-4.5L12 3Z" />
      <path d="M4 7.5V16.5L12 21l8-4.5V7.5" />
      <path d="M12 12v9" />
    </IconBase>
  );
}

function ArrowTrendIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 15l5-5 4 4 7-7" />
      <path d="M15 7h5v5" />
    </IconBase>
  );
}

function ClockIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5l3 2" />
    </IconBase>
  );
}

function BrainIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M9 4a3 3 0 0 0-3 3v1a2.5 2.5 0 0 0 0 5V14a3 3 0 0 0 3 3" />
      <path d="M15 4a3 3 0 0 1 3 3v1a2.5 2.5 0 0 1 0 5V14a3 3 0 0 1-3 3" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M12 4v12" />
    </IconBase>
  );
}

function StoreIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 9 6 4h12l2 5" />
      <path d="M5 9h14v10H5z" />
      <path d="M9 19v-5h6v5" />
    </IconBase>
  );
}

function HeartIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 20s-6.5-4.4-8.3-7.7C1.7 8.9 3.3 5 7.1 5c1.8 0 3.3 0.9 4 2.4C11.8 5.9 13.3 5 15.1 5c3.8 0 5.4 3.9 3.4 7.3C18.5 15.6 12 20 12 20Z" />
    </IconBase>
  );
}

function UsersIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M8 13a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M16.5 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M3.5 19a5.5 5.5 0 0 1 9 0" />
      <path d="M13.5 19a4.5 4.5 0 0 1 7 0" />
    </IconBase>
  );
}

function ReceiptIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M6 3.5h12v17l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5v-17Z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
    </IconBase>
  );
}

function MapPinIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 20s5-5.3 5-9a5 5 0 1 0-10 0c0 3.7 5 9 5 9Z" />
      <circle cx="12" cy="11" r="1.8" />
    </IconBase>
  );
}

function ChevronDownIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m6 9 6 6 6-6" />
    </IconBase>
  );
}

function LogoutIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H4" />
      <path d="M20 20V4" />
    </IconBase>
  );
}

function TrashIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 12h10l1-12" />
      <path d="M9 7V4h6v3" />
    </IconBase>
  );
}

function ArrowRightIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </IconBase>
  );
}
