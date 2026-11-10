import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { friendlyError } from "./Login";

const passwordProblems = (pw) => {
  const p = [];
  if (pw.length < 8) p.push("at least 8 characters");
  if (!/[A-Z]/.test(pw)) p.push("an uppercase letter");
  if (!/[a-z]/.test(pw)) p.push("a lowercase letter");
  if (!/[0-9]/.test(pw)) p.push("a number");
  return p;
};

export default function Register() {
  const { register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const problems = passwordProblems(form.password);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) return setError("Passwords don't match.");
    if (problems.length) return setError(`Password needs ${problems.join(", ")}.`);
    setBusy(true);
    try {
      await register(form.name.trim(), form.email.trim(), form.password);
      navigate("/");
    } catch (err) {
      console.error("REGISTER ERROR:", err.code, err.message);
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

  return (
    <main className="auth-wrap">
      <form onSubmit={submit} className="card">
        <p className="eyebrow">SELLWISE</p>
        <h1>Create account</h1>
        <input placeholder="Name" value={form.name} onChange={set("name")} required />
        <input type="email" placeholder="Email" value={form.email} onChange={set("email")} required />
        <input type="password" placeholder="Password" value={form.password} onChange={set("password")} required />
        {form.password && problems.length > 0 && (
          <p className="muted">Still needs: {problems.join(", ")}</p>
        )}
        <input type="password" placeholder="Confirm password" value={form.confirm} onChange={set("confirm")} required />
        {error && <p className="error">{error}</p>}
        <button disabled={busy}>{busy ? "Creating…" : "Register"}</button>
        <button type="button" className="outline" onClick={google}>Continue with Google</button>
        <p className="muted">Already have an account? <Link to="/login">Log in</Link></p>
      </form>
    </main>
  );
}