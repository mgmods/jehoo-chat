import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { supabase } from "@/lib/supabase";
import * as ImagePicker from "expo-image-picker";
import { COUNTRIES } from "@/data/countries";

type Props = {
  user: any;
  initialProfile?: any;
  onComplete: () => void;
};

export default function ProfileOnboarding({ user, initialProfile, onComplete }: Props) {
  const googleName = user?.user_metadata?.full_name || user?.user_metadata?.name || "";
  const googleAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "";
  const [firstName, setFirstName] = useState(initialProfile?.first_name || googleName.split(" ")[0] || "");
  const [nickname, setNickname] = useState(initialProfile?.nickname || "");
  const [gender, setGender] = useState<"male" | "female" | "">(initialProfile?.gender || "");
  const [birthDate, setBirthDate] = useState(initialProfile?.birth_date || "");
  const [country, setCountry] = useState(initialProfile?.country || "SY");
  const [avatarUrl, setAvatarUrl] = useState(initialProfile?.avatar_url || googleAvatar);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  async function chooseAvatar() {
    setError("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const client = supabase;
      if (!client || !user?.id) { setError("سجّل الدخول أولاً لاختيار الصورة."); return; }
      setAvatarBusy(true);
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const ext = (asset.fileName?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await client.storage.from("avatars").upload(path, blob, { upsert: true, contentType: asset.mimeType || "image/jpeg" });
      if (uploadError) throw uploadError;
      const { data } = client.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
    } catch (e) { setError(e instanceof Error ? `تعذر رفع الصورة: ${e.message}` : "تعذر رفع الصورة. حاول مرة أخرى."); }
    finally { setAvatarBusy(false); }
  }
  const [countryOpen, setCountryOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedCountry = COUNTRIES.find((item) => item.code === country) || COUNTRIES[0];
  const today = new Date();
  const latestAllowedBirthDate = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());
  const earliestAllowedBirthDate = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());
  const parsedBirthDate = /^\\d{4}-\\d{2}-\\d{2}$/.test(birthDate)
    ? new Date(`${birthDate}T12:00:00`)
    : new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  const pickerValue = Number.isNaN(parsedBirthDate.getTime()) ? new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()) : parsedBirthDate;
  const formatBirthDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const filteredCountries = useMemo(() => COUNTRIES, []);

  async function submit() {
    setError("");
    if (firstName.trim().length < 2) return setError("اكتب الاسم الأول.");
    if (nickname.trim().length < 2) return setError("اكتب الكنية أو الاسم المستعار.");
    if (!gender) return setError("اختر الجنس.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return setError("اكتب تاريخ الميلاد بهذا الشكل: 2000-05-21");
    if (!country) return setError("اختر البلد.");
    const client = supabase;
    if (!client) {
      setError("الاتصال بالخدمة غير جاهز. أغلق التطبيق وافتحه وحاول مرة أخرى.");
      return;
    }
    setBusy(true);
    try {
      const { error: saveError } = await client.rpc("jehoo_complete_profile", {
        p_first_name: firstName.trim(),
        p_nickname: nickname.trim(),
        p_gender: gender,
        p_birth_date: birthDate,
        p_country: country,
        p_avatar_url: avatarUrl.trim() || null,
      });
      if (saveError) {
        const message = saveError.message.includes("invalid_birth_date")
          ? "العمر يجب أن يكون بين 13 و100 سنة."
          : "تعذر حفظ الحساب. تحقق من اتصالك وحاول مرة أخرى.";
        setError(message);
        return;
      }
      onComplete();
    } catch {
      setError("تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return <KeyboardAvoidingView style={s.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}><ScrollView style={s.scroll} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false} nestedScrollEnabled>
    <View style={s.top}>
      <View style={s.progress}><View style={s.progressFill} /></View>
      <Text style={s.brand}>JEHOO <Text style={s.mint}>●</Text> CHAT</Text>
      <Text style={s.title}>خلّينا نكمّل حسابك</Text>
      <Text style={s.subtitle}>معلومات بسيطة حتى نجهّز لك تجربة Jehoo شخصية وآمنة.</Text>
    </View>

    <View style={s.avatarWrap}>
      {avatarUrl ? <Image source={{ uri: avatarUrl }} style={s.avatar} /> : <View style={[s.avatar, s.avatarEmpty]}><Text style={s.avatarEmoji}>🙂</Text></View>}
      <Text style={s.avatarLabel}>صورتك الشخصية (اختيارية)</Text>
      <Pressable disabled={avatarBusy} onPress={() => void chooseAvatar()} style={s.avatarButton}><Text style={s.avatarAction}>{avatarBusy ? "جارٍ رفع الصورة…" : "اختيار صورة من الاستوديو وقصّها"}</Text></Pressable>
      {googleAvatar ? <Pressable onPress={() => setAvatarUrl(googleAvatar)}><Text style={s.avatarAction}>استخدام صورة Google</Text></Pressable> : null}
      {avatarUrl && avatarUrl !== googleAvatar ? <Pressable onPress={() => setAvatarUrl(googleAvatar || "")}><Text style={s.avatarRemove}>إزالة الصورة المخصصة</Text></Pressable> : null}
    </View>

    <View style={s.card}>
      <Text style={s.label}>الاسم *</Text>
      <TextInput value={firstName} onChangeText={setFirstName} placeholder="مثلاً: محمد" placeholderTextColor="#728295" style={s.input} maxLength={40} />

      <Text style={s.label}>الكنية *</Text>
      <TextInput value={nickname} onChangeText={setNickname} placeholder="مثلاً: أبو علي أو اسمك المستعار" placeholderTextColor="#728295" style={s.input} maxLength={30} />

      <Text style={s.label}>الجنس *</Text>
      <View style={s.row}>
        <Pressable onPress={() => setGender("male")} style={[s.choice, gender === "male" && s.choiceActive]}><Text style={[s.choiceText, gender === "male" && s.choiceTextActive]}>ذكر</Text></Pressable>
        <Pressable onPress={() => setGender("female")} style={[s.choice, gender === "female" && s.choiceActive]}><Text style={[s.choiceText, gender === "female" && s.choiceTextActive]}>أنثى</Text></Pressable>
      </View>

      <Text style={s.label}>تاريخ الميلاد *</Text>
      <Pressable onPress={() => setDatePickerOpen(true)} style={s.dateButton}>
        <Text style={[s.dateText, !birthDate && s.datePlaceholder]}>{birthDate || "اختر تاريخ ميلادك"}</Text>
        <Text style={s.dateIcon}>📅</Text>
      </Pressable>
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

      <Text style={s.label}>البلد *</Text>
      <Pressable onPress={() => setCountryOpen(!countryOpen)} style={s.countryButton}>
        <Text style={s.countryFlag}>{selectedCountry.flag}</Text>
        <Text style={s.countryName}>{selectedCountry.name}</Text>
        <Text style={s.chevron}>{countryOpen ? "⌃" : "⌄"}</Text>
      </Pressable>
      {countryOpen ? <View style={s.countryList}>
        <FlatList data={filteredCountries} keyExtractor={(item) => item.code} nestedScrollEnabled style={{ maxHeight: 230 }}
          renderItem={({ item }) => <Pressable onPress={() => { setCountry(item.code); setCountryOpen(false); }} style={s.countryRow}><Text style={s.countryFlag}>{item.flag}</Text><Text style={s.countryRowName}>{item.name}</Text>{item.code === country ? <Text style={s.check}>✓</Text> : null}</Pressable>} />
      </View> : null}

      {error ? <Text style={s.error}>{error}</Text> : null}
      <Pressable disabled={busy} onPress={submit} style={[s.primary, busy && { opacity: .7 }]}>{busy ? <ActivityIndicator color="#06251E" /> : <Text style={s.primaryText}>إنشاء الحساب والمتابعة</Text>}</Pressable>
      <Text style={s.privacy}>بمتابعتك، يتم حفظ ملفك على Jehoo حتى لا تضطر لتعبئة بياناتك مرة أخرى.</Text>
    </View>
  </ScrollView></KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  keyboard:{flex:1},
  scroll:{flex:1,backgroundColor:"#0A1118"},
  page:{flexGrow:1,backgroundColor:"#0A1118",paddingHorizontal:20,paddingTop:18,paddingBottom:36},
  top:{alignItems:"flex-end"},
  progress:{height:4,width:"100%",backgroundColor:"#263342",borderRadius:4,marginBottom:24},
  progressFill:{height:4,width:"25%",backgroundColor:"#31D6B0",borderRadius:4},
  brand:{alignSelf:"flex-start",fontSize:18,fontWeight:"900",color:"#F2F7FA",letterSpacing:1},
  mint:{color:"#31D6B0"},
  title:{fontSize:27,fontWeight:"900",color:"#F2F7FA",marginTop:24},
  subtitle:{fontSize:13,lineHeight:21,color:"#94A3B8",textAlign:"right",marginTop:8},
  avatarWrap:{alignItems:"center",marginVertical:18},
  avatar:{width:82,height:82,borderRadius:41,borderWidth:2,borderColor:"#31D6B0"},
  avatarEmpty:{backgroundColor:"#121B25",alignItems:"center",justifyContent:"center"},
  avatarEmoji:{fontSize:34},
  avatarButton:{marginTop:8,borderWidth:1,borderColor:"#31D6B0",borderRadius:12,paddingVertical:10,paddingHorizontal:14},
  avatarRemove:{color:"#FDA4AF",fontSize:12,fontWeight:"800",marginTop:8},
  avatarLabel:{color:"#94A3B8",fontSize:11,marginTop:7},
  avatarAction:{color:"#31D6B0",fontWeight:"800",fontSize:12,marginTop:5},
  card:{backgroundColor:"#121B25",borderWidth:1,borderColor:"#263342",borderRadius:22,padding:18,paddingBottom:22},
  label:{color:"#D9E3EA",fontSize:13,fontWeight:"800",textAlign:"right",marginTop:10,marginBottom:7},
  input:{backgroundColor:"#0A1118",borderWidth:1,borderColor:"#263342",borderRadius:12,color:"#F2F7FA",paddingHorizontal:13,paddingVertical:12,textAlign:"right",minHeight:46},
  dateButton:{backgroundColor:"#0A1118",borderWidth:1,borderColor:"#263342",borderRadius:12,minHeight:50,paddingHorizontal:13,flexDirection:"row",alignItems:"center"},
  dateText:{flex:1,color:"#F2F7FA",textAlign:"right",fontWeight:"700"},
  datePlaceholder:{color:"#728295",fontWeight:"400"},
  dateIcon:{fontSize:20,marginLeft:10},
  row:{flexDirection:"row",gap:10},
  choice:{flex:1,minHeight:46,borderRadius:12,borderWidth:1,borderColor:"#263342",alignItems:"center",justifyContent:"center",backgroundColor:"#0A1118"},
  choiceActive:{borderColor:"#31D6B0",backgroundColor:"#18352F"},
  choiceText:{color:"#94A3B8",fontWeight:"800"},
  choiceTextActive:{color:"#31D6B0"},
  countryButton:{minHeight:50,flexDirection:"row",alignItems:"center",backgroundColor:"#0A1118",borderWidth:1,borderColor:"#263342",borderRadius:12,paddingHorizontal:12},
  countryFlag:{fontSize:22,width:34},
  countryName:{flex:1,color:"#F2F7FA",textAlign:"right",fontWeight:"700"},
  chevron:{color:"#94A3B8",fontSize:18,paddingLeft:8},
  countryList:{marginTop:8,borderWidth:1,borderColor:"#263342",borderRadius:14,backgroundColor:"#0D151E",overflow:"hidden"},
  countryRow:{minHeight:45,flexDirection:"row",alignItems:"center",paddingHorizontal:12,borderBottomWidth:1,borderBottomColor:"#1D2936"},
  countryRowName:{flex:1,color:"#D9E3EA",textAlign:"right",fontSize:13},
  check:{color:"#31D6B0",fontWeight:"900"},
  error:{color:"#FDA4AF",fontSize:12,textAlign:"right",marginTop:12,lineHeight:18},
  primary:{minHeight:50,borderRadius:13,backgroundColor:"#31D6B0",alignItems:"center",justifyContent:"center",marginTop:18},
  primaryText:{fontWeight:"900",color:"#06251E",fontSize:14},
  privacy:{color:"#728295",fontSize:10,lineHeight:16,textAlign:"center",marginTop:12}
});
