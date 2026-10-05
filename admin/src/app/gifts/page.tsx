"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Gift={gift_key:string;title:string;emoji:string;price:number;diamond_value:number;is_active:boolean};

export default function GiftsPage(){
 const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
 const [rows,setRows]=useState<Gift[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const [form,setForm]=useState<Gift>({gift_key:"",title:"",emoji:"🎁",price:100,diamond_value:100,is_active:true});
 async function load(){
  if(!supabase)return; setLoading(true);setError("");
  const {data,error}=await supabase.from("room_gift_catalog").select("gift_key,title,emoji,price,diamond_value,is_active").order("price",{ascending:true});
  if(error)setError(error.message);else setRows((data??[]) as Gift[]);setLoading(false);
 }
 useEffect(()=>{void load()},[supabase]);
 async function save(){
  if(!supabase)return;setSaving(true);setError("");
  if(!/^[a-z0-9_-]{2,40}$/.test(form.gift_key.trim())){setError("مفتاح الهدية يجب أن يحتوي أحرفاً إنجليزية صغيرة وأرقاماً و _ أو - فقط.");setSaving(false);return}
  const {error}=await supabase.from("room_gift_catalog").upsert({gift_key:form.gift_key.trim(),title:form.title.trim(),emoji:form.emoji.trim(),price:Math.max(1,Math.floor(Number(form.price))),diamond_value:Math.max(0,Math.floor(Number(form.diamond_value))),is_active:form.is_active});
  if(error)setError(error.message);else{setForm({gift_key:"",title:"",emoji:"🎁",price:100,diamond_value:100,is_active:true});await load()}setSaving(false);
 }
 async function toggle(g:Gift){if(!supabase)return;const {error}=await supabase.from("room_gift_catalog").update({is_active:!g.is_active}).eq("gift_key",g.gift_key);if(error)setError(error.message);else await load()}
 return <main className="main" dir="rtl">
  <div className="topbar"><div><a href="/" className="muted">JEHOO CHAT / لوحة التحكم</a><h1>الهدايا</h1><p className="muted">إدارة كتالوج هدايا الغرف والأسعار بالـ Coins.</p></div><a className="secondary" href="/">رجوع</a></div>
  {error&&<div className="notice error">{error}</div>}
  <section className="panel" style={{maxWidth:850,marginBottom:24}}>
   <h2>إضافة / تحديث هدية</h2>
   <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
    <div><label>Gift Key</label><input className="field" value={form.gift_key} onChange={e=>setForm({...form,gift_key:e.target.value})} placeholder="rose"/></div>
    <div><label>الاسم</label><input className="field" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="وردة"/></div>
    <div><label>الإيموجي</label><input className="field" value={form.emoji} onChange={e=>setForm({...form,emoji:e.target.value})}/></div>
    <div><label>السعر Coins</label><input className="field" type="number" min="1" value={form.price} onChange={e=>setForm({...form,price:Number(e.target.value)})}/></div><div><label>قيمة Diamonds للمستلم</label><input className="field" type="number" min="0" value={form.diamond_value} onChange={e=>setForm({...form,diamond_value:Number(e.target.value)})}/></div>
   </div>
   <label style={{display:"flex",gap:8,alignItems:"center",margin:"14px 0"}}><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/> فعّالة داخل التطبيق</label>
   <button className="primary" disabled={saving} onClick={()=>void save()}>{saving?"جارٍ الحفظ…":"حفظ الهدية"}</button>
  </section>
  <section className="panel"><h2>الكتالوج الحالي</h2>{loading?<p>جارٍ التحميل…</p>:<div style={{display:"grid",gap:8}}>{rows.map(g=><div key={g.gift_key} style={{display:"grid",gridTemplateColumns:"56px 1fr auto auto",gap:12,alignItems:"center",padding:"12px 0",borderBottom:"1px solid #263342"}}><span style={{fontSize:28}}>{g.emoji}</span><div><strong>{g.title}</strong><div className="muted">{g.gift_key} · {Number(g.price).toLocaleString("ar")} Coins · {Number(g.diamond_value).toLocaleString("ar")} Diamonds</div></div><span className="pill">{g.is_active?"فعالة":"موقوفة"}</span><button className="secondary" onClick={()=>void toggle(g)}>{g.is_active?"إيقاف":"تفعيل"}</button></div>)}{!rows.length&&<p className="muted">لا توجد هدايا.</p>}</div>}</section>
 </main>
}