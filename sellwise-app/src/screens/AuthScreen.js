import { useState } from "react";
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, friendlyError } from "../AuthContext";
import { colors } from "../theme";

const problems = (pw) => {
  const p = [];
  if (pw.length < 8) p.push("8+ characters");
  if (!/[A-Z]/.test(pw)) p.push("an uppercase letter");
  if (!/[a-z]/.test(pw)) p.push("a lowercase letter");
  if (!/[0-9]/.test(pw)) p.push("a number");
  return p;
};

export default function AuthScreen() {
  const { login, register, reset } = useAuth();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const isLogin = mode === "login";

  const submit = async () => {
    setError(""); setInfo("");
    if (!isLogin) {
      if (!name.trim()) return setError("Enter your name.");
      if (pw !== confirm) return setError("Passwords don't match.");
      const p = problems(pw);
      if (p.length) return setError(`Password needs ${p.join(", ")}.`);
    }
    setBusy(true);
    try {
      if (isLogin) await login(email.trim(), pw);
      else await register(name.trim(), email.trim(), pw);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) return setError("Enter your email first.");
    try {
      await reset(email.trim());
      setError("");
      setInfo("If that email exists, a reset link has been sent.");
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Image source={require("../../assets/logo.jpg")} style={s.logo} resizeMode="contain" />
          <Text style={s.title}>{isLogin ? "Log in" : "Create account"}</Text>

          {!isLogin && (
            <TextInput style={s.input} placeholder="Name" placeholderTextColor={colors.teal300}
                       value={name} onChangeText={setName} />
          )}
          <TextInput style={s.input} placeholder="Email" placeholderTextColor={colors.teal300}
                     autoCapitalize="none" keyboardType="email-address"
                     value={email} onChangeText={setEmail} />
          <TextInput style={s.input} placeholder="Password" placeholderTextColor={colors.teal300}
                     secureTextEntry value={pw} onChangeText={setPw} />
          {!isLogin && (
            <TextInput style={s.input} placeholder="Confirm password" placeholderTextColor={colors.teal300}
                       secureTextEntry value={confirm} onChangeText={setConfirm} />
          )}

          {!!error && <Text style={s.error}>{error}</Text>}
          {!!info && <Text style={s.info}>{info}</Text>}

          <Pressable style={[s.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit}>
            {busy ? <ActivityIndicator color={colors.bg} />
                  : <Text style={s.btnText}>{isLogin ? "Log in" : "Register"}</Text>}
          </Pressable>

          {isLogin && (
            <Pressable onPress={forgot}><Text style={s.link}>Forgot password?</Text></Pressable>
          )}
          <Pressable onPress={() => { setMode(isLogin ? "register" : "login"); setError(""); setInfo(""); }}>
            <Text style={s.link}>{isLogin ? "No account? Register" : "Have an account? Log in"}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },   // white so the logo's background blends in
  scroll: { padding: 24, gap: 12, justifyContent: "center", flexGrow: 1 },
  logo: { width: "100%", height: 120, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: "800", color: colors.teal700, textTransform: "uppercase" },
  input: {
    borderWidth: 1, borderColor: colors.teal500, borderRadius: 999,
    paddingHorizontal: 18, paddingVertical: 12, fontSize: 16, color: colors.teal900,
  },
  btn: { backgroundColor: colors.teal700, borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  btnText: { color: colors.bg, fontWeight: "700", fontSize: 16 },
  link: { color: colors.teal500, textAlign: "center", textDecorationLine: "underline", paddingVertical: 4 },
  error: { color: colors.danger },
  info: { color: colors.teal700 },
});