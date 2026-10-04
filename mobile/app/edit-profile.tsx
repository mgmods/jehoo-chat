import { useEffect, useState } from "react";
import { ActivityIndicator, SafeAreaView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import ProfileOnboarding from "@/components/ProfileOnboarding";

export default function EditProfileScreen(){
 const router=useRouter(); const [user,setUser]=useState<any>(null); const [profile,setProfile]=useState<any>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
 useEffect(()=>{let alive=true;(async()=>{try{if(!supabase)throw new Error("الخدمة غير جاهزة");const {data:{user:current},error:authError}=await supabase.auth.getUser();if(authError||!current)throw new Error("سجّل الدخول أولاً");const {data,error:profileError}=await supabase.from("profiles").select("id,first_name,nickname,gender,birth_date,country,avatar_url,profile_completed").eq("id",current.id).maybeSingle();if(profileError)throw profileError;if(alive){setUser(current);setProfile(profile)}}catch(e){if(alive)setError(e instanceof Error?e.message:"تعذر تحميل الملف الشخصي")}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[]);
 if(loading)return <SafeAreaView style={{flex:1,backgroundColor:"#08110F",alignItems:"center",justifyContent:"center"}}><ActivityIndicator color="#31D6B0"/><Text style={{color:"#D9E3EA",marginTop:12}}>جارٍ تحميل الملف الشخصي…</Text></SafeAreaView>;
 if(error||!user)return <SafeAreaView style={{flex:1,backgroundColor:"#08110F",padding:24}}><Text style={{color:"#FDA4AF"}}>{error||"تعذر تحميل الحساب"}</Text></SafeAreaView>;
 return <View style={{flex:1,backgroundColor:"#08110F"}}><ProfileOnboarding user={user} initialProfile={profile} onComplete={()=>router.replace("/")}/></View>
}
