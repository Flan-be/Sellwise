import { useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/AuthContext";
import AuthScreen from "./src/screens/AuthScreen";
import Dashboard from "./src/screens/Dashboard";
import Products from "./src/screens/Products";
import Sales from "./src/screens/Sales";
import SaleDetail from "./src/screens/SaleDetail";
import Receipt from "./src/screens/Receipt";
import { colors } from "./src/theme";

// left, center, right
const TABS = [
  ["home", "Dashboard", "grid-outline", "grid"],
  ["products", "Products", "cube-outline", "cube"],
  ["sales", "Sales", "receipt-outline", "receipt"],
];

function Main() {
  const { user, loading, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState("products");
  const [sale, setSale] = useState(null);       // selected sale
  const [view, setView] = useState(null);       // null | "detail" | "receipt"

  // Android back button: receipt -> detail -> list
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (view === "receipt") { setView("detail"); return true; }
      if (view === "detail") { setSale(null); setView(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, [view]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={colors.teal700} /></View>;
  }
  if (!user) return <AuthScreen />;

  const openSale = (x) => { setSale(x); setView("detail"); };
  const goTab = (k) => { setSale(null); setView(null); setTab(k); };

  let body;
  if (sale && view === "receipt") body = <Receipt sale={sale} onBack={() => setView("detail")} />;
  else if (sale && view === "detail") {
    body = <SaleDetail sale={sale} onBack={() => { setSale(null); setView(null); }}
                       onReceipt={() => setView("receipt")} />;
  }
  else if (tab === "home") body = <Dashboard />;
  else if (tab === "sales") body = <Sales onOpen={openSale} />;
  else body = <Products />;

  return (
    <View style={s.root}>
      {/* top safe area only; the tab bar handles the bottom itself */}
      <SafeAreaView edges={["top"]} style={s.topWrap}>
        <View style={s.top}>
          <Image source={require("./assets/logo.jpg")} style={s.logo} resizeMode="contain" />
          <Pressable onPress={logout} hitSlop={10}><Text style={s.logout}>Log out</Text></Pressable>
        </View>
      </SafeAreaView>

      <View style={{ flex: 1 }}>{body}</View>

      <View style={[s.tabs, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TABS.map(([k, label, off, on]) => {
          const active = tab === k;
          return (
            <Pressable key={k} style={s.tab} onPress={() => goTab(k)}>
              <Ionicons name={active ? on : off} size={24}
                        color={active ? colors.teal900 : colors.teal500} />
              <Text style={[s.tabText, active && s.tabOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
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
  topWrap: { backgroundColor: colors.white },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center",
         paddingHorizontal: 16, paddingVertical: 6 },
  logo: { width: 110, height: 40 },
  logout: { color: colors.teal500, fontWeight: "700" },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.teal300,
          backgroundColor: colors.white, paddingTop: 8 },
  tab: { flex: 1, alignItems: "center", gap: 2 },
  tabText: { fontSize: 12, color: colors.teal500, fontWeight: "600" },
  tabOn: { color: colors.teal900, fontWeight: "800" },
});