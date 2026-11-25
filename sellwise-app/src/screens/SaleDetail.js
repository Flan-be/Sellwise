import { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../AuthContext";
import { peso } from "../money";
import { colors } from "../theme";
import { when, receiptNo } from "../receiptUtils";

const MAX_CHARS = 1_500_000;   // keeps a photo under roughly 1.1 MB

export default function SaleDetail({ sale, onBack, onReceipt }) {
  const { user } = useAuth();
  const key = `salephoto:${user.uid}:${sale.id}`;
  const [photo, setPhoto] = useState(null);
  const voided = sale.status === "voided";

  useEffect(() => {
    AsyncStorage.getItem(key).then(setPhoto).catch(() => {});
  }, [key]);

  const save = async (result) => {
    if (result.canceled) return;
    const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
    if (uri.length > MAX_CHARS) return Alert.alert("Photo too large", "Try again with a smaller photo.");
    try {
      await AsyncStorage.setItem(key, uri);
      setPhoto(uri);
    } catch {
      Alert.alert("Couldn't save the photo", "The device storage for the app may be full.");
    }
  };

  const options = { mediaTypes: ["images"], quality: 0.4, base64: true };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert("Camera access is off", "Allow the camera in your phone settings.");
    save(await ImagePicker.launchCameraAsync(options));
  };
  const choosePhoto = async () => save(await ImagePicker.launchImageLibraryAsync(options));

  const removePhoto = () =>
    Alert.alert("Remove photo?", "This only removes it from this phone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        await AsyncStorage.removeItem(key); setPhoto(null);
      } },
    ]);

  const units = sale.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Pressable onPress={onBack}><Text style={s.link}>← Sales</Text></Pressable>

      {/* 1. the recorded sale, as plain text */}
      <View style={s.card}>
        <Text style={s.kicker}>{voided ? "SALE VOIDED" : "SALE RECORDED"}</Text>
        <Text style={s.big}>{peso(sale.total_centavos)}</Text>
        <Text style={s.summary}>
          {units} {units === 1 ? "item" : "items"} paid by {sale.payment_method} on{" "}
          {when(sale).toLocaleString()}.
        </Text>
        <Text style={s.muted}>Receipt no. {receiptNo(sale)}</Text>

        <View style={s.hr} />
        {sale.items.map((i, n) => (
          <View key={n} style={s.row}>
            <Text style={s.item}>{i.quantity} × {i.name}</Text>
            <Text style={s.item}>{peso(i.quantity * i.unit_price_centavos)}</Text>
          </View>
        ))}
        {voided && <Text style={s.void}>This sale was voided and its stock was returned.</Text>}
      </View>

      {/* 2. receipt */}
      <Pressable style={s.btn} onPress={onReceipt}>
        <Text style={s.btnText}>View receipt</Text>
      </Pressable>

      {/* Photo, cancelled (free firebase not good for image)
      <View style={s.card}>
        <Text style={s.kicker}>PHOTO</Text>
        {photo ? (
          <>
            <Image source={{ uri: photo }} style={s.photo} resizeMode="cover" />
            <View style={s.row}>
              <Pressable onPress={takePhoto}><Text style={s.link}>Retake</Text></Pressable>
              <Pressable onPress={removePhoto}><Text style={[s.link, { color: colors.danger }]}>Remove</Text></Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={s.muted}>Attach a picture, for example proof of payment or the items sold.</Text>
            <View style={s.row}>
              <Pressable style={[s.btn, s.outline, { flex: 1 }]} onPress={takePhoto}>
                <Text style={s.outlineText}>Take photo</Text>
              </Pressable>
              <Pressable style={[s.btn, s.outline, { flex: 1 }]} onPress={choosePhoto}>
                <Text style={s.outlineText}>Choose photo</Text>
              </Pressable>
            </View>
          </>
        )}
        <Text style={s.note}>Saved on this phone only.</Text>
      </View>
      */}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, gap: 14 },
  link: { color: colors.teal700, fontWeight: "700", fontSize: 16 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.teal700,
          borderRadius: 20, padding: 16, gap: 8 },
  kicker: { color: colors.teal500, fontWeight: "800", fontSize: 12, letterSpacing: 1.5 },
  big: { fontSize: 34, fontWeight: "800", color: colors.teal900 },
  summary: { color: colors.teal900, fontSize: 15 },
  muted: { color: colors.teal500, fontSize: 13 },
  hr: { borderTopWidth: 1, borderColor: colors.teal100, marginVertical: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  item: { color: colors.teal900, fontSize: 15, flexShrink: 1 },
  void: { color: colors.danger, marginTop: 6 },
  btn: { backgroundColor: colors.teal700, borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  btnText: { color: colors.bg, fontWeight: "700", fontSize: 16 },
  outline: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.teal500 },
  outlineText: { color: colors.teal700, fontWeight: "700" },
  photo: { width: "100%", height: 260, borderRadius: 14 },
  note: { color: colors.teal300, fontSize: 12 },
});