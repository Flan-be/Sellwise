import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import logo from "../assets/logo.jpg";

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // short cooldown so the button can't be spammed
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
      setWait(30);
        } catch (err) {
      console.error("RESET ERROR:", err.code, err.message);
      if (err.code === "auth/invalid-email") setError("That email doesn't look right.");
      else if (err.code === "auth/too-many-requests") setError("Too many attempts. Try again later.");
      else if (err.code === "auth/network-request-failed") setError("No connection. Check your internet.");
      else if (err.code === "auth/user-not-found") { setSent(true); setWait(30); }
      else setError(`Couldn't send the link (${err.code}).`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-wrap">
      <form onSubmit={submit} className="card">
        <img src={logo} alt="SellWise" className="logo" />
        <h1>Reset password</h1>
        {sent ? (
          <>
            <p className="info">
              If an account exists for <strong>{email.trim()}</strong>, a reset link is on its way.
              Check your spam folder too.
            </p>
            <button disabled={busy || wait > 0}>
              {wait > 0 ? `Send again in ${wait}s` : "Send again"}
            </button>
          </>
        ) : (
          <>
            <p className="muted">Enter your email and we'll send you a link to choose a new password.</p>
            <input type="email" placeholder="Email" value={email}
                   onChange={(e) => setEmail(e.target.value)} required />
            {error && <p className="error">{error}</p>}
            <button disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
          </>
        )}
        <p className="muted"><Link to="/login">← Back to log in</Link></p>
      </form>
    </main>
  );
}