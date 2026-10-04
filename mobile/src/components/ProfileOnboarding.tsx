import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "@/lib/supabase";
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
  const [countryOpen, setCountryOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedCountry = COUNTRIES.find((item) => item.code === country) || COUNTRIES[0];

  const filteredCountries = useMemo(() => COUNTRIES, []);

  async function submit() {
    setError("");
    if (firstName.trim().length < 2) return setError("اكتب الاسم الأول.");
    if (nickname.trim().length < 2) return setError("اكتب الكنية أو الاسم المستعار.");
    if (!gender) return setError("اختر الجنس.");
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(birthDate)) return setError("اكتب تاريخ الميلاد بهذا الشكل: 2000-05-21");
    if (!country) return setError("اختر البلد.");
    setBusy(true);
    const { error: saveError } = await supabase!.rpc("jehoo_complete_profile", {
      p_first_name: firstName.trim(),
      p_nickname: nickname.trim(),
      p_gender: gender,
      p_birth_date: birthDate,
      p_country: country,
      p_avatar_url: avatarUrl.trim() || null,
    });
    setBusy(false);
    if (saveError) {
      const message = saveError.message.includes("nickname_taken")
        ? "هذه الكنية مستخدمة مسبقاً، اختر كنية أخرى."
        : saveError.message.includes("invalid_birth_date")
          ? "العمر يجب أن يكون بين 13 و100 سنة."
          : "تعذر حفظ الحساب. حاول مرة أخرى.";
      setError(message);
      return;
    }
    onComplete();
  }

  return <View style={s.page}>
    <View style={s.top}>
      <View style={s.progress}><View style={s.progressFill} /></View>
      <Text style={s.brand}>JEHOO <Text style={s.mint}>●</Text> CHAT</Text>
      <Text style={s.title}>خلّينا نكمّل حسابك</Text>
      <Text style={s.subtitle}>معلومات بسيطة حتى نجهّز لك تجربة Jehoo شخصية وآمنة.</Text>
    </View>

    <View style={s.avatarWrap}>
      {avatarUrl ? <Image source={{ uri: avatarUrl }} style={s.avatar} /> : <View style={[s.avatar, s.avatarEmpty]}><Text style={s.avatarEmoji}>🙂</Text></View>}
      <Text style={s.avatarLabel}>الصورة الشخصية اختيارية</Text>
      {googleAvatar ? <Pressable onPress={() => setAvatarUrl(avatarUrl ? "" : googleAvatar)}><Text style={s.avatarAction}>{avatarUrl ? "إزالة الصورة" : "استخدام صورة Google"}</Text></Pressable> : null}
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
      <TextInput value={birthDate} onChangeText={setBirthDate} placeholder="YYYY-MM-DD  مثال 2000-05-21" placeholderTextColor="#728295" style={s.input} keyboardType="numbers-and-punctuation" maxLength={10} />

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
  </View>;
}

const s = StyleSheet.create({
  page:{flex:1,backgroundColor:"#0A1118",paddingHorizontal:20,paddingTop:18},
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
  avatarLabel:{color:"#94A3B8",fontSize:11,marginTop:7},
  avatarAction:{color:"#31D6B0",fontWeight:"800",fontSize:12,marginTop:5},
  card:{backgroundColor:"#121B25",borderWidth:1,borderColor:"#263342",borderRadius:22,padding:18,paddingBottom:22},
  label:{color:"#D9E3EA",fontSize:13,fontWeight:"800",textAlign:"right",marginTop:10,marginBottom:7},
  input:{backgroundColor:"#0A1118",borderWidth:1,borderColor:"#263342",borderRadius:12,color:"#F2F7FA",paddingHorizontal:13,paddingVertical:12,textAlign:"right",minHeight:46},
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
