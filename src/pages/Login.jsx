import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export function friendlyError(err) {
  const map = {
    "auth/email-already-in-use": "That email is already registered.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/user-not-found": "Incorrect email or password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/weak-password": "Password must be at least 8 characters.",
    "auth/password-does-not-meet-requirements": "Password must be at least 8 characters and include uppercase, lowercase, and a number.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/popup-closed-by-user": "Sign-in cancelled.",
  };
  return map[err.code] || "Something went wrong. Please try again.";
}

export default function Login() {
  const { login, loginWithGoogle, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate("/");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    try {
      await loginWithGoogle();
      navigate("/");
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const forgot = async () => {
    if (!email) return setError("Enter your email first.");
    try {
      await resetPassword(email.trim());
      setError("");
      setInfo("If that email exists, a reset link has been sent.");
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  return (
  <main className="auth-wrap">
    <form onSubmit={submit} className="card">
      <p className="eyebrow">SELLWISE</p>
      <h1>Log in</h1>
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="error">{error}</p>}
      {info && <p className="info">{info}</p>}
      <button disabled={busy}>{busy ? "Signing in…" : "Log in"}</button>
      <button type="button" className="outline" onClick={google}>Continue with Google</button>
      <button type="button" className="link" onClick={forgot}>Forgot password?</button>
      <p className="muted">No account? <Link to="/register">Register</Link></p>
    </form>
  </main>
);
}