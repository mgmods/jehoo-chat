import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { supabase } from './supabaseClient';

WebBrowser.maybeCompleteAuthSession();
const C = { green: '#18C9A5', dark: '#07372F', ink: '#19312C', muted: '#82918D', white: '#FFFFFF' };

export default function AuthScreen({ onDone }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '',
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
  });

  useEffect(() => {
    async function finishGoogleSignIn() {
      if (response?.type !== 'success') return;
      const idToken = response.params?.id_token;
      if (!idToken || !supabase) {
        Alert.alert('إعداد تسجيل Google مطلوب', 'تأكد من إعداد معرّفات Google وSupabase Auth.');
        return;
      }
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
      setLoading(false);
      if (error) Alert.alert('تعذّر تسجيل الدخول', error.message);
      else if (data.session) onDone?.(data.session);
    }
    finishGoogleSignIn();
  }, [response]);

  async function submitEmail() {
    if (!supabase) {
      Alert.alert('الإعداد غير مكتمل', 'أضف عنوان Supabase ومفتاح anon إلى ملف البيئة كما هو موضح في README.');
      return;
    }
    if (!email.trim() || password.length < 6) {
      Alert.alert('تحقق من البيانات', 'أدخل البريد الإلكتروني وكلمة مرور من 6 أحرف على الأقل.');
      return;
    }
    setLoading(true);
    const result = mode === 'signup'
      ? await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: displayName.trim() } } })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (result.error) Alert.alert('لم يكتمل الطلب', result.error.message);
    else if (result.data.session) onDone?.(result.data.session);
    else Alert.alert('تحقق من بريدك', 'قد تحتاج إلى فتح رسالة التأكيد قبل تسجيل الدخول.');
  }

  return <View style={s.container}>
    <Text style={s.brand}>Jehoo <Text style={{color:C.green}}>●</Text></Text>
    <Text style={s.title}>{mode === 'login' ? 'أهلاً بعودتك' : 'أنشئ حسابك'}</Text>
    <Text style={s.subtitle}>مساحتك، صوتك، أصدقاؤك</Text>
    <View style={s.switcher}>
      <Pressable onPress={() => setMode('login')} style={[s.switch,{backgroundColor:mode==='login'?C.green:'#E6EFEB'}]}><Text style={s.switchText}>تسجيل الدخول</Text></Pressable>
      <Pressable onPress={() => setMode('signup')} style={[s.switch,{backgroundColor:mode==='signup'?C.green:'#E6EFEB'}]}><Text style={s.switchText}>إنشاء حساب</Text></Pressable>
    </View>
    {mode === 'signup' && <TextInput value={displayName} onChangeText={setDisplayName} placeholder="الاسم المعروض" style={s.input}/>}
    <TextInput value={email} onChangeText={setEmail} placeholder="البريد الإلكتروني" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={s.input}/>
    <TextInput value={password} onChangeText={setPassword} placeholder="كلمة المرور (6 أحرف على الأقل)" secureTextEntry style={s.input}/>
    <Pressable disabled={loading} onPress={submitEmail} style={s.primary}>{loading ? <ActivityIndicator color={C.dark}/> : <Text style={s.primaryText}>{mode === 'login' ? 'تسجيل الدخول' : 'إنشاء الحساب'}</Text>}</Pressable>
    <View style={s.separator}><View style={s.line}/><Text style={s.subtitle}>أو</Text><View style={s.line}/></View>
    <Pressable disabled={!request || loading} onPress={() => promptAsync()} style={s.google}><Text style={s.googleText}>G  المتابعة باستخدام Google</Text></Pressable>
    <Text style={s.note}>يتطلب تسجيل Google إعداد OAuth في Google Cloud وSupabase، وإضافة معرّفات التطبيق إلى ملف البيئة.</Text>
  </View>;
}
const s=StyleSheet.create({container:{flex:1,justifyContent:'center',padding:24,backgroundColor:'#F3F7F5'},brand:{fontSize:30,fontWeight:'900',color:C.dark,textAlign:'center'},title:{fontSize:25,fontWeight:'900',color:C.ink,textAlign:'center',marginTop:28},subtitle:{fontSize:13,color:C.muted,textAlign:'center',marginTop:8},switcher:{flexDirection:'row',gap:10,marginTop:24},switch:{flex:1,padding:12,borderRadius:13,alignItems:'center'},switchText:{color:C.dark,fontWeight:'800'},input:{backgroundColor:C.white,borderWidth:1,borderColor:'#DDE7E3',borderRadius:14,padding:14,textAlign:'right',marginTop:12},primary:{backgroundColor:C.green,padding:15,borderRadius:14,alignItems:'center',marginTop:16},primaryText:{fontWeight:'900',color:C.dark},separator:{flexDirection:'row',alignItems:'center',gap:12,marginVertical:16},line:{height:1,flex:1,backgroundColor:'#DDE7E3'},google:{backgroundColor:C.white,borderWidth:1,borderColor:'#DDE7E3',borderRadius:14,padding:15,alignItems:'center'},googleText:{fontWeight:'800',color:C.ink},note:{fontSize:12,color:C.muted,textAlign:'center',lineHeight:18,marginTop:16}});
