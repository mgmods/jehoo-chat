import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from './supabaseClient';

const C = { green: '#18C9A5', dark: '#07372F', bg: '#F3F7F5', ink: '#19312C', muted: '#82918D', white: '#FFFFFF' };

export default function ProfileScreen({ session, onSignIn }) {
  const user = session?.user;
  const [displayName, setDisplayName] = useState(user?.user_metadata?.full_name || user?.user_metadata?.name || '');
  const [bio, setBio] = useState('');
  const [country, setCountry] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '');
  const [loading, setLoading] = useState(false);
  const [publicId, setPublicId] = useState(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let alive = true;
    async function loadProfile() {
      if (!user || !supabase) return;
      const { data, error } = await supabase.from('profiles').select('public_id,display_name,bio,country,avatar_url').eq('id', user.id).maybeSingle();
      if (!alive) return;
      if (data) {
        setPublicId(data.public_id);
        setDisplayName(data.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || '');
        setBio(data.bio || '');
        setCountry(data.country || '');
        setAvatarUrl(data.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || '');
      } else if (error && error.code !== 'PGRST116') {
        // Keep the editable local defaults if the optional profiles table is not installed yet.
      }
    }
    loadProfile();
    return () => { alive = false; };
  }, [user?.id]);

  async function saveProfile() {
    if (!user || !supabase) {
      Alert.alert('يلزم إعداد الحساب', 'سجّل الدخول واضبط إعدادات Supabase لحفظ الملف الشخصي.');
      return;
    }
    setLoading(true);
    const payload = { id: user.id, display_name: displayName.trim(), bio: bio.trim(), country: country.trim(), avatar_url: avatarUrl.trim(), updated_at: new Date().toISOString() };
    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
    setLoading(false);
    if (error) Alert.alert('تعذّر الحفظ', 'تأكد من إنشاء جدول profiles وسياسات RLS الموضحة في README.');
    else { setEditing(false); Alert.alert('تم الحفظ', 'تم تحديث ملفك الشخصي.'); }
  }

  return <ScrollView style={s.safe} contentContainerStyle={s.content}>
    <View style={s.header}><Text style={s.brand}>Jehoo</Text><Text style={s.title}>الملف الشخصي</Text></View>
    <View style={s.avatarWrap}>{avatarUrl ? <Image source={{ uri: avatarUrl }} style={s.avatar} /> : <View style={[s.avatar,s.avatarFallback]}><Text style={{fontSize:40}}>🙂</Text></View>}</View>
    <Text style={s.name}>{displayName || 'عضو Jehoo'}</Text>
    <Text style={s.muted}>{user?.email || 'لم تسجّل الدخول بعد'}</Text>{user && <Text style={[s.publicId]}>Jehoo ID: {publicId ? String(publicId).padStart(6,'0') : 'يُنشأ بعد تطبيق SQL'}</Text>}
    {!user ? <Pressable style={s.primary} onPress={onSignIn}><Text style={s.primaryText}>تسجيل الدخول أو إنشاء حساب</Text></Pressable> : <>
      <View style={s.stats}><View><Text style={s.statNum}>—</Text><Text style={s.muted}>الأصدقاء</Text></View><View><Text style={s.statNum}>—</Text><Text style={s.muted}>المتابعون</Text></View><View><Text style={s.statNum}>1</Text><Text style={s.muted}>المستوى</Text></View></View>
      <Pressable style={s.primary} onPress={() => setEditing(!editing)}><Text style={s.primaryText}>{editing ? 'إلغاء التعديل' : 'تعديل الملف الشخصي'}</Text></Pressable>
      {editing && <View style={s.form}>
        <Text style={s.label}>الاسم المعروض</Text><TextInput value={displayName} onChangeText={setDisplayName} maxLength={40} placeholder="اسمك على Jehoo" style={s.input}/>
        <Text style={s.label}>نبذة عنك</Text><TextInput value={bio} onChangeText={setBio} maxLength={180} multiline placeholder="اكتب نبذة قصيرة..." style={[s.input,{minHeight:90,textAlignVertical:'top'}]}/>
        <Text style={s.label}>الدولة</Text><TextInput value={country} onChangeText={setCountry} maxLength={60} placeholder="الدولة" style={s.input}/>
        <Text style={s.label}>رابط الصورة الشخصية</Text><TextInput value={avatarUrl} onChangeText={setAvatarUrl} autoCapitalize="none" keyboardType="url" placeholder="https://..." style={s.input}/>
        <Pressable disabled={loading} style={s.primary} onPress={saveProfile}>{loading ? <ActivityIndicator color={C.dark}/> : <Text style={s.primaryText}>حفظ التغييرات</Text>}</Pressable>
      </View>}
      <View style={s.menu}><Text style={s.menuText}>🎁 الهدايا والمقتنيات</Text></View><View style={s.menu}><Text style={s.menuText}>👑 عضوية VIP</Text></View><View style={s.menu}><Text style={s.menuText}>⚙️ الإعدادات والخصوصية</Text></View>
    </>}
  </ScrollView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:C.bg},content:{padding:18,paddingBottom:36},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:26},brand:{fontSize:22,fontWeight:'900',color:C.dark},title:{fontSize:20,fontWeight:'900',color:C.ink},avatarWrap:{alignItems:'center'},avatar:{width:112,height:112,borderRadius:56,borderWidth:3,borderColor:C.green},avatarFallback:{backgroundColor:'#DDF8EF',alignItems:'center',justifyContent:'center'},name:{fontSize:22,fontWeight:'900',color:C.ink,textAlign:'center',marginTop:12},publicId:{fontSize:15,fontWeight:'900',color:C.dark,textAlign:'center',marginTop:8},muted:{fontSize:13,color:C.muted,textAlign:'center',marginTop:5},stats:{flexDirection:'row',justifyContent:'space-around',backgroundColor:C.white,borderRadius:18,padding:18,marginTop:24},statNum:{fontSize:20,fontWeight:'900',color:C.dark,textAlign:'center'},primary:{backgroundColor:C.green,padding:15,borderRadius:16,alignItems:'center',marginTop:18},primaryText:{fontWeight:'900',color:C.dark},form:{backgroundColor:C.white,padding:16,borderRadius:18,marginTop:16},label:{fontWeight:'700',color:C.ink,textAlign:'right',marginTop:10},input:{backgroundColor:'#F6F9F7',borderWidth:1,borderColor:'#DDE7E3',borderRadius:12,padding:12,textAlign:'right',marginTop:7,color:C.ink},menu:{backgroundColor:C.white,padding:17,borderRadius:14,marginTop:10},menuText:{fontWeight:'700',color:C.ink,textAlign:'right'}});
