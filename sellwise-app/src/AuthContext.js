import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, sendPasswordResetEmail, signOut,
} from "firebase/auth";
import { auth } from "./firebase";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function friendlyError(err) {
  const map = {
    "auth/email-already-in-use": "That email is already registered.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/invalid-email": "That email doesn't look right.",
    "auth/weak-password": "Password is too weak.",
    "auth/password-does-not-meet-requirements":
      "Password needs 8+ characters with uppercase, lowercase and a number.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/network-request-failed": "No connection. Check your internet.",
  };
  return map[err.code] || "Something went wrong. Please try again.";
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); }), []);

  const login = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
  const register = async (name, email, pw) => {
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    await updateProfile(cred.user, { displayName: name });
  };
  const reset = (email) => sendPasswordResetEmail(auth, email);
  const logout = () => signOut(auth);

  return (
    <Ctx.Provider value={{ user, loading, login, register, reset, logout }}>
      {children}
    </Ctx.Provider>
  );
}