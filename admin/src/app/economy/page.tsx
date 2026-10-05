"use client";
import {useEffect,useMemo,useState} from "react";
import {createSupabaseBrowserClient} from "@/lib/supabase";
type Package={id?:string;package_key:string;title:string;coins:number;bonus_coins:number;price_usd:number;sku:string|null;is_popular:boolean;is_active:boolean;sort_order:number};
const blank:Package={package_key:"",title:"",coins:10000,bonus_coins:0,price_usd:.99,sku:"",is_popular:false,is_active:true,sort_order:1};
export default function EconomyPage(){
 const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
 const [settings,setSettings]=useState({coinsPerUsd:"10000",diamondUsd:"0.00006",agencyCommission:"20",minWithdraw:"10000",showDiamonds:false});
 const [packages,setPackages]=useState<Package[]>([]),[form,setForm]=useState<Package>(blank),[error,setError]=useState(""),[saving,setSaving]=useState(false);
 async function load(){
  if(!supabase)return;
  const [s,p]=await Promise.all([
   supabase.from("app_settings").select("key,value").in("key",["economy.coins_per_usd","economy.diamond_usd","economy.agency_commission_percent","economy.min_withdraw_diamonds","economy.show_diamond_value_in_app"]),
   supabase.from("coin_packages").select("*").order("sort_order",{ascending:true})
  ]);
  if(s.error||p.error){setError((s.error||p.error)?.message||"تعذر التحميل");return}
  const map=Object.fromEntries((s.data??[]).map((r:any)=>[r.key,r.value]));
  const raw=(v:any,d:string)=>v==null?d:String(v);
  setSettings({coinsPerUsd:raw(map["economy.coins_per_usd"],"10000"),diamondUsd:raw(map["economy.diamond_usd"],"0.00006"),agencyCommission:raw(map["economy.agency_commission_percent"],"20"),minWithdraw:raw(map["economy.min_withdraw_diamonds"],"10000"),showDiamonds:map["economy.show_diamond_value_in_app"]===true||map["economy.show_diamond_value_in_app"]==="true"});
  setPackages((p.data??[]) as Package[]);
 }
 useEffect(()=>{void load()},[supabase]);
 async function saveSettings(){
  if(!supabase)return;setSaving(true);setError("");
  const {error}=await supabase.from("app_settings").upsert([
   {key:"economy.coins_per_usd",value:Number(settings.coinsPerUsd)},
   {key:"economy.diamond_usd",value:Number(settings.diamondUsd)},
   {key:"economy.agency_commission_percent",value:Number(settings.agencyCommission)},
   {key:"economy.min_withdraw_diamonds",value:Number(settings.minWithdraw)},
   {key:"economy.show_diamond_value_in_app",value:settings.showDiamonds}
  ],{onConflict:"key"});
  if(error)setError(error.message);else await load();setSaving(false);
 }
 async function savePackage(){
  if(!supabase)return;setSaving(true);setError("");
  const payload={...form,coins:Math.max(1,Math.floor(Number(form.coins))),bonus_coins:Math.max(0,Math.floor(Number(form.bonus_coins))),price_usd:Number(form.price_usd),sort_order:Number(form.sort_order)};
  const {error}=await supabase.from("coin_packages").upsert(payload,{onConflict:"package_key"});
  if(error)setError(error.message);else{setForm({...blank});await load()}setSaving(false);
 }
 async function toggle(p:Package){if(!supabase)return;const {error}=await supabase.from("coin_packages").update({is_active:!p.is_active}).eq("package_key",p.package_key);if(error)setError(error.message);else await load()}
 return <main className="main" dir="rtl">
  <div className="topbar"><div><a href="/" className="muted">JEHOO CHAT / لوحة التحكم</a><h1>إعدادات الاقتصاد</h1><p className="muted">التحكم المركزي بالشحن وDiamonds وعمولة الوكالة. نسبة التطبيق تبقى داخلية ولا تظهر للمستخدم.</p></div><a className="secondary" href="/">رجوع</a></div>
  {error&&<div className="notice error">{error}</div>}
  <section className="panel" style={{marginBottom:24}}><h2>إعدادات الاقتصاد</h2>
   <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}}>
    <label>Coins لكل 1$<input className="field" type="number" value={settings.coinsPerUsd} onChange={e=>setSettings({...settings,coinsPerUsd:e.target.value})}/></label>
    <label>قيمة Diamond بالدولار<input className="field" type="number" step="0.000001" value={settings.diamondUsd} onChange={e=>setSettings({...settings,diamondUsd:e.target.value})}/></label>
    <label>عمولة الوكالة %<input className="field" type="number" min="0" max="100" value={settings.agencyCommission} onChange={e=>setSettings({...settings,agencyCommission:e.target.value})}/></label>
    <label>أقل سحب Diamonds<input className="field" type="number" min="1" value={settings.minWithdraw} onChange={e=>setSettings({...settings,minWithdraw:e.target.value})}/></label>
   </div>
   <label style={{display:"flex",gap:8,alignItems:"center",margin:"14px 0"}}><input type="checkbox" checked={settings.showDiamonds} onChange={e=>setSettings({...settings,showDiamonds:e.target.checked})}/> إظهار قيمة Diamonds للمستخدم داخل التطبيق</label>
   <div className="notice">مثال: 10$ = 100,000 Coins، وقيمة Diamond = 0.00006$ تعطي المضيف 6$ عند استلام 100,000 Diamonds. عمولة الوكالة 20% تُضاف منفصلة ولا تُخصم من المضيف.</div>
   <button className="primary" disabled={saving} onClick={()=>void saveSettings()}>{saving?"جارٍ الحفظ…":"حفظ إعدادات الاقتصاد"}</button>
  </section>
  <section className="panel"><h2>باقات الشحن</h2>
   <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,marginBottom:16}}>
    <input className="field" placeholder="package_key" value={form.package_key} onChange={e=>setForm({...form,package_key:e.target.value})}/>
    <input className="field" placeholder="العنوان" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
    <input className="field" type="number" placeholder="Coins" value={form.coins} onChange={e=>setForm({...form,coins:Number(e.target.value)})}/>
    <input className="field" type="number" placeholder="Bonus Coins" value={form.bonus_coins} onChange={e=>setForm({...form,bonus_coins:Number(e.target.value)})}/>
    <input className="field" type="number" step="0.01" placeholder="السعر $" value={form.price_usd} onChange={e=>setForm({...form,price_usd:Number(e.target.value)})}/>
    <input className="field" placeholder="SKU" value={form.sku||""} onChange={e=>setForm({...form,sku:e.target.value})}/>
    <input className="field" type="number" placeholder="الترتيب" value={form.sort_order} onChange={e=>setForm({...form,sort_order:Number(e.target.value)})}/>
   </div>
   <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={form.is_popular} onChange={e=>setForm({...form,is_popular:e.target.checked})}/> باقة مميزة</label>
   <label style={{display:"flex",gap:8,alignItems:"center",margin:"8px 0 14px"}}><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/> فعالة</label>
   <button className="primary" disabled={saving} onClick={()=>void savePackage()}>حفظ الباقة</button>
   <div style={{display:"grid",gap:8,marginTop:18}}>{packages.map(p=><div key={p.package_key} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:12,alignItems:"center",padding:"12px 0",borderBottom:"1px solid #263342"}}><div><strong>{p.title}</strong><div className="muted">{Number(p.coins+p.bonus_coins).toLocaleString("ar")} Coins · {"$"}{Number(p.price_usd).toFixed(2)} · {p.sku||"—"}</div></div><span className="pill">{p.is_active?"فعالة":"موقوفة"}</span><button className="secondary" onClick={()=>void toggle(p)}>{p.is_active?"إيقاف":"تفعيل"}</button></div>)}</div>
  </section>
 </main>
}