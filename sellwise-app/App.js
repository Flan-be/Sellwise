import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/AuthContext";
import AuthScreen from "./src/screens/AuthScreen";
import Dashboard from "./src/screens/Dashboard";
import Products from "./src/screens/Products";
import Sales from "./src/screens/Sales";
import Receipt from "./src/screens/Receipt";
import { colors } from "./src/theme";

const TABS = [["home", "Dashboard"], ["sales", "Sales"], ["products", "Products"]];

function Main() {
  const { user, loading, logout } = useAuth();
  const [tab, setTab] = useState("home");
  const [receipt, setReceipt] = useState(null);

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={colors.teal700} /></View>;
  }
  if (!user) return <AuthScreen />;

  return (
    <SafeAreaView style={s.root}>
      <View style={s.top}>
        <Image source={require("./assets/logo.jpg")} style={s.logo} resizeMode="contain" />
        <Pressable onPress={logout}><Text style={s.logout}>Log out</Text></Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {receipt ? <Receipt sale={receipt} onBack={() => setReceipt(null)} />
          : tab === "home" ? <Dashboard />
          : tab === "sales" ? <Sales onOpen={setReceipt} />
          : <Products />}
      </View>

      <View style={s.tabs}>
        {TABS.map(([k, label]) => (
          <Pressable key={k} style={s.tab} onPress={() => { setReceipt(null); setTab(k); }}>
            <Text style={[s.tabText, tab === k && !receipt && s.tabOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Main />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center",
         backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 6 },
  logo: { width: 110, height: 40 },
  logout: { color: colors.teal500, fontWeight: "700" },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.teal300, backgroundColor: colors.white },
  tab: { flex: 1, alignItems: "center", paddingVertical: 14 },
  tabText: { color: colors.teal500, fontWeight: "600" },
  tabOn: { color: colors.teal900, fontWeight: "800" },
});