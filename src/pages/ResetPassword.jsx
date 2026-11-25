import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "../firebase";
import { passwordProblems } from "../passwordRules";
import logo from "../assets/logo.jpg";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const code = params.get("oobCode");
  const mode = params.get("mode");

  const [state, setState] = useState("checking");   // checking | ready | invalid | done
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!code || (mode && mode !== "resetPassword")) return setState("invalid");
    verifyPasswordResetCode(auth, code)
      .then((e) => { setEmail(e); setState("ready"); })
      .catch(() => setState("invalid"));
  }, [code, mode]);

  const problems = passwordProblems(pw);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (pw !== confirm) return setError("Passwords don't match.");
    if (problems.length) return setError(`Password needs ${problems.join(", ")}.`);
    setBusy(true);
    try {
      await confirmPasswordReset(auth, code, pw);
      setState("done");
    } catch (err) {
      if (err.code === "auth/expired-action-code" || err.code === "auth/invalid-action-code") setState("invalid");
      else if (err.code === "auth/password-does-not-meet-requirements") setError("Password doesn't meet the requirements.");
      else setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-wrap">
      <form onSubmit={submit} className="card">
        <img src={logo} alt="SellWise" className="logo" />
        <h1>New password</h1>

        {state === "checking" && <p className="muted">Checking your link…</p>}

        {state === "invalid" && (
          <>
            <p className="error">This link is invalid or has expired. Reset links work once.</p>
            <Link to="/forgot-password"><button type="button">Request a new link</button></Link>
          </>
        )}

        {state === "ready" && (
          <>
            <p className="muted">Choose a new password for <strong>{email}</strong>.</p>
            <input type="password" placeholder="New password" value={pw}
                   onChange={(e) => setPw(e.target.value)} required />
            {pw && problems.length > 0 && <p className="muted">Still needs: {problems.join(", ")}</p>}
            <input type="password" placeholder="Confirm new password" value={confirm}
                   onChange={(e) => setConfirm(e.target.value)} required />
            {error && <p className="error">{error}</p>}
            <button disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
          </>
        )}

        {state === "done" && (
          <>
            <p className="info">Your password has been changed.</p>
            <Link to="/login"><button type="button">Log in</button></Link>
          </>
        )}
      </form>
    </main>
  );
}