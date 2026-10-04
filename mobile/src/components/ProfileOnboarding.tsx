import React, { useState } from "react";
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { supabase } from "@/lib/supabase";
import * as ImagePicker from "expo-image-picker";
import { COUNTRIES } from "@/data/countries";

type Props = {
  user: any;
  initialProfile?: any;
  onComplete: () => void;
  onToggleLanguage?: () => void;
};

export default function ProfileOnboarding({ user, initialProfile, onComplete, onToggleLanguage }: Props) {
  const googleName = user?.user_metadata?.full_name || user?.user_metadata?.name || "";
  const googleAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "";
  const [firstName] = useState(initialProfile?.first_name || googleName.split(" ")[0] || "");
  const [nickname, setNickname] = useState(initialProfile?.nickname || "");
  const [gender, setGender] = useState<"male" | "female" | "">(initialProfile?.gender || "");
  const [birthDate, setBirthDate] = useState(initialProfile?.birth_date || "");
  const [country, setCountry] = useState(initialProfile?.country || "SY");
  const [avatarUrl, setAvatarUrl] = useState(initialProfile?.avatar_url || googleAvatar);
  const [bio, setBio] = useState(initialProfile?.bio || "");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [activeField, setActiveField] = useState<"nickname" | "bio" | "gender" | "country" | null>(null);
  const [draftText, setDraftText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedCountry = COUNTRIES.find((item) => item.code === country) || COUNTRIES[0];
  const today = new Date();
  const latestAllowedBirthDate = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());
  const earliestAllowedBirthDate = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());
  const parsedBirthDate = /^\d{4}-\d{2}-\d{2}$/.test(birthDate)
    ? new Date(birthDate + "T12:00:00")
    : new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  const pickerValue = Number.isNaN(parsedBirthDate.getTime())
    ? new Date(today.getFullYear() - 18, today.getMonth(), today.getDate())
    : parsedBirthDate;

  const formatBirthDate = (date: Date) =>
    date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");

  function openTextField(field: "nickname" | "bio") {
    setError("");
    setDraftText(field === "nickname" ? nickname : bio);
    setActiveField(field);
  }

  async function chooseAvatar() {
    setError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("اسمح للتطبيق بالوصول إلى الاستوديو لاختيار صورة.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        exif: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const client = supabase;
      if (!client || !user?.id) {
        setError("سجّل الدخول أولاً لاختيار الصورة.");
        return;
      }
      setAvatarBusy(true);
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error("تعذر قراءة الصورة من الاستوديو.");
      const body = await response.arrayBuffer();
      const ext = (asset.fileName?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const contentType = asset.mimeType || (ext === "png" ? "image/png" : "image/jpeg");
      const path = user.id + "/avatar-" + Date.now() + "." + ext;
      const { error: uploadError } = await client.storage.from("avatars").upload(path, body, {
        upsert: false,
        contentType,
      });
      if (uploadError) throw uploadError;
      const { data } = client.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
    } catch (e) {
      setError(e instanceof Error ? "تعذر رفع الصورة: " + e.message : "تعذر رفع الصورة. حاول مرة أخرى.");
    } finally {
      setAvatarBusy(false);
    }
  }

  function saveModalField() {
    if (activeField === "nickname") {
      if (draftText.trim().length < 2) {
        setError("اكتب الكنية أو الاسم المستعار.");
        return;
      }
      setNickname(draftText.trim());
    } else if (activeField === "bio") {
      setBio(draftText.trim().slice(0, 160));
    }
    setActiveField(null);
  }

  async function submit() {
    setError("");
    if (nickname.trim().length < 2) return setError("اكتب الكنية أو الاسم المستعار.");
    if (!gender) return setError("اختر الجنس.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return setError("اختر تاريخ الميلاد.");
    if (!country) return setError("اختر البلد.");

    const client = supabase;
    if (!client) {
      setError("الاتصال بالخدمة غير جاهز. أغلق التطبيق وافتحه وحاول مرة أخرى.");
      return;
    }

    setBusy(true);
    try {
      const { data: authData, error: authError } = await client.auth.getUser();
      const currentUser = authData.user;
      if (authError || !currentUser?.id || currentUser.id !== user?.id) {
        setError("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");
        return;
      }

      const { error: saveError } = await client.from("profiles").upsert({
        id: currentUser.id,
        first_name: firstName.trim() || nickname.trim(),
        nickname: nickname.trim(),
        display_name: nickname.trim(),
        gender,
        birth_date: birthDate,
        country: country.toUpperCase(),
        avatar_url: avatarUrl.trim() || "",
        bio: bio.trim(),
        profile_completed: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

      if (saveError) {
        if (saveError.code === "42501") setError("لا تملك صلاحية حفظ الملف الشخصي. سجّل الدخول مرة أخرى.");
        else if (saveError.code === "22007") setError("تاريخ الميلاد غير صالح.");
        else setError("تعذر حفظ الحساب: " + saveError.message);
        return;
      }

      onComplete();
    } catch (e) {
      setError(e instanceof Error ? "تعذر حفظ الحساب: " + e.message : "تعذر حفظ الحساب. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.keyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.screen}>
        <ScrollView style={s.scroll} contentContainerStyle={s.page} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.hero}>
            <Text style={s.title}>أكمل ملفك الشخصي</Text>
            <Text style={s.subtitle}>أضف صورة وتاريخ ميلاد لقباً للمتابعة</Text>
            <View style={s.avatarWrap}>
              {avatarUrl ? <Image source={{ uri: avatarUrl }} style={s.avatar} /> : <View style={[s.avatar, s.avatarEmpty]}><Text style={s.avatarLetter}>م</Text></View>}
              <Pressable disabled={avatarBusy} onPress={() => void chooseAvatar()} style={s.cameraButton} accessibilityLabel="اختيار صورة الملف الشخصي">
                <View style={s.cameraGlyph}><View style={s.cameraGlyphTop} /><View style={s.cameraLens} /></View>
              </Pressable>
            </View>
          </View>

          <View style={s.infoSection}>
            <Text style={s.sectionTitle}>المعلومات الأساسية</Text>
            <View style={s.rows}>
              <Pressable onPress={() => openTextField("nickname")} style={s.infoRow}>
                <Text style={s.valueText} numberOfLines={1}>{nickname || "اختيار"}</Text>
                <View style={s.rowEnd}><Text style={s.labelText}>اللقب</Text><Text style={s.chevron}>›</Text></View>
              </Pressable>
              <Pressable onPress={() => setActiveField("gender")} style={s.infoRow}>
                <Text style={s.valueText}>{gender === "female" ? "أنثى" : gender === "male" ? "ذكر" : "اختيار"}</Text>
                <View style={s.rowEnd}><Text style={s.labelText}>الجنس</Text><Text style={s.chevron}>›</Text></View>
              </Pressable>
              <Pressable onPress={() => setDatePickerOpen(true)} style={s.infoRow}>
                <Text style={[s.valueText, !birthDate && s.mutedValue]}>{birthDate || "اختيار"}</Text>
                <View style={s.rowEnd}><Text style={s.labelText}>تاريخ الميلاد</Text><Text style={s.chevron}>›</Text></View>
              </Pressable>
              <Pressable onPress={() => setActiveField("country")} style={s.infoRow}>
                <Text style={s.valueText}>{selectedCountry.name}</Text>
                <Text style={s.labelText}>الدولة</Text>
              </Pressable>
              <Pressable onPress={() => openTextField("bio")} style={s.infoRow}>
                <Text style={[s.valueText, !bio && s.mutedValue]} numberOfLines={1}>{bio || "—"}</Text>
                <View style={s.rowEnd}><Text style={s.labelText}>نبذة</Text><Text style={s.chevron}>›</Text></View>
              </Pressable>
            </View>

            {error ? <Text style={s.error}>{error}</Text> : null}
            <Pressable disabled={busy} onPress={() => void submit()} style={[s.primary, busy && s.primaryBusy]}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryText}>متابعة</Text>}
            </Pressable>
          </View>

          <Pressable onPress={() => onToggleLanguage?.()} style={s.languageButton}>
            <Text style={s.languageText}>العربية</Text>
          </Pressable>
        </ScrollView>

        {datePickerOpen ? <DateTimePicker
          value={pickerValue}
          mode="date"
          display={Platform.OS === "android" ? "calendar" : "spinner"}
          minimumDate={earliestAllowedBirthDate}
          maximumDate={latestAllowedBirthDate}
          onChange={(event, selectedDate) => {
            if (Platform.OS === "android") setDatePickerOpen(false);
            if (event.type === "dismissed" || !selectedDate) return;
            setBirthDate(formatBirthDate(selectedDate));
            if (Platform.OS === "ios") setDatePickerOpen(false);
          }}
        /> : null}

        <Modal visible={activeField === "nickname" || activeField === "bio"} transparent animationType="fade" onRequestClose={() => setActiveField(null)}>
          <View style={s.modalBackdrop}><View style={s.modalCard}>
            <Text style={s.modalTitle}>{activeField === "nickname" ? "اللقب" : "نبذة"}</Text>
            <TextInput autoFocus value={draftText} onChangeText={setDraftText} placeholder={activeField === "nickname" ? "اكتب لقبك" : "اكتب نبذة قصيرة"} placeholderTextColor="#9A9A9A" style={s.modalInput} maxLength={activeField === "nickname" ? 30 : 160} multiline={activeField === "bio"} />
            <View style={s.modalActions}>
              <Pressable onPress={() => setActiveField(null)} style={s.modalCancel}><Text style={s.modalCancelText}>إلغاء</Text></Pressable>
              <Pressable onPress={saveModalField} style={s.modalSave}><Text style={s.modalSaveText}>حفظ</Text></Pressable>
            </View>
          </View></View>
        </Modal>

        <Modal visible={activeField === "gender"} transparent animationType="fade" onRequestClose={() => setActiveField(null)}>
          <View style={s.modalBackdrop}><View style={s.modalCard}>
            <Text style={s.modalTitle}>الجنس</Text>
            <Pressable onPress={() => { setGender("male"); setActiveField(null); }} style={s.modalChoice}><Text style={s.modalChoiceText}>ذكر</Text></Pressable>
            <Pressable onPress={() => { setGender("female"); setActiveField(null); }} style={s.modalChoice}><Text style={s.modalChoiceText}>أنثى</Text></Pressable>
            <Pressable onPress={() => setActiveField(null)} style={s.modalCancelFull}><Text style={s.modalCancelText}>إلغاء</Text></Pressable>
          </View></View>
        </Modal>

        <Modal visible={activeField === "country"} transparent animationType="slide" onRequestClose={() => setActiveField(null)}>
          <View style={s.modalBackdrop}><View style={s.countryModal}>
            <View style={s.modalHeader}><Text style={s.modalTitle}>الدولة</Text><Pressable onPress={() => setActiveField(null)}><Text style={s.closeIcon}>×</Text></Pressable></View>
            <FlatList data={COUNTRIES} keyExtractor={(item) => item.code} showsVerticalScrollIndicator={false} renderItem={({ item }) => (
              <Pressable onPress={() => { setCountry(item.code); setActiveField(null); }} style={s.countryRow}>
                <Text style={s.countryFlag}>{item.flag}</Text><Text style={s.countryName}>{item.name}</Text>{item.code === country ? <Text style={s.checkIcon}>✓</Text> : null}
              </Pressable>
            )} />
          </View></View>
        </Modal>
      </View>
    </KeyboardAvoidingView></SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  keyboard: { flex: 1, backgroundColor: "#FFFFFF" },
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  scroll: { flex: 1, backgroundColor: "#FFFFFF" },
  page: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 44, paddingBottom: 16, backgroundColor: "#FFFFFF" },
  hero: { alignItems: "center" },
  title: { color: "#292929", fontSize: 30, lineHeight: 38, fontWeight: "800", textAlign: "center" },
  subtitle: { marginTop: 30, color: "#A5A5A5", fontSize: 19, lineHeight: 27, fontWeight: "400", textAlign: "center" },
  avatarWrap: { width: 180, height: 180, marginTop: 34, marginBottom: 54, position: "relative" },
  avatar: { width: 180, height: 180, borderRadius: 90, borderWidth: 3, borderColor: "#A6EEE6" },
  avatarEmpty: { backgroundColor: "#90766C", alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: "#FFFFFF", fontSize: 78, fontWeight: "500" },
  cameraButton: { position: "absolute", left: -2, bottom: -4, width: 60, height: 60, borderRadius: 30, backgroundColor: "#19D1AE", alignItems: "center", justifyContent: "center", shadowColor: "#000000", shadowOpacity: 0.14, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  cameraGlyph: { width: 28, height: 20, borderRadius: 4, borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", position: "relative" },
  cameraGlyphTop: { position: "absolute", width: 9, height: 4, borderRadius: 2, backgroundColor: "#FFFFFF", top: -5, left: 7 },
  cameraLens: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: "#FFFFFF" },
  infoSection: { width: "100%" },
  sectionTitle: { color: "#292929", fontSize: 29, lineHeight: 36, fontWeight: "800", textAlign: "right", marginBottom: 10 },
  rows: { width: "100%" },
  infoRow: { minHeight: 87, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EAEAEA", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  valueText: { flex: 1, color: "#292929", fontSize: 21, lineHeight: 28, fontWeight: "500", textAlign: "right" },
  mutedValue: { color: "#CFCFCF" },
  rowEnd: { flexDirection: "row", alignItems: "center", gap: 12, marginLeft: 18 },
  labelText: { color: "#A6A6A6", fontSize: 20, lineHeight: 27, fontWeight: "400", textAlign: "left" },
  error: { color: "#B33A3A", fontSize: 13, lineHeight: 19, textAlign: "right", marginTop: 12 },
  primary: { width: "100%", maxWidth: 560, minHeight: 64, marginTop: 22, borderRadius: 32, backgroundColor: "#19D1AE", alignItems: "center", justifyContent: "center", shadowColor: "#000000", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  primaryBusy: { opacity: 0.75 },
  primaryText: { color: "#FFFFFF", fontSize: 20, lineHeight: 26, fontWeight: "800" },
  languageButton: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 7, marginTop: 26, paddingVertical: 8, paddingHorizontal: 14 },
  languageText: { color: "#9A9A9A", fontSize: 15, fontWeight: "500" },
  chevron: { color: "#C9C9C9", fontSize: 26, lineHeight: 28, fontWeight: "300" },
  closeIcon: { color: "#292929", fontSize: 28, lineHeight: 28, fontWeight: "300" },
  checkIcon: { color: "#19D1AE", fontSize: 20, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.24)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 22, shadowColor: "#000000", shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  modalTitle: { color: "#292929", fontSize: 22, fontWeight: "800", textAlign: "right", marginBottom: 16 },
  modalInput: { minHeight: 54, borderBottomWidth: 1, borderBottomColor: "#DCDCDC", color: "#292929", fontSize: 18, textAlign: "right", paddingVertical: 10 },
  modalActions: { flexDirection: "row", justifyContent: "flex-start", gap: 10, marginTop: 18 },
  modalCancel: { flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: "#F3F3F3", alignItems: "center", justifyContent: "center" },
  modalSave: { flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: "#19D1AE", alignItems: "center", justifyContent: "center" },
  modalCancelText: { color: "#666666", fontSize: 16, fontWeight: "700" },
  modalSaveText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  modalChoice: { minHeight: 54, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EAEAEA", alignItems: "center", justifyContent: "center" },
  modalChoiceText: { color: "#292929", fontSize: 18, fontWeight: "600" },
  modalCancelFull: { minHeight: 50, marginTop: 8, alignItems: "center", justifyContent: "center" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  countryModal: { maxHeight: "78%", backgroundColor: "#FFFFFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, marginTop: "auto" },
  countryRow: { minHeight: 54, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EAEAEA", paddingVertical: 4 },
  countryFlag: { fontSize: 22, width: 38 },
  countryName: { flex: 1, color: "#292929", fontSize: 17, textAlign: "right" },
});