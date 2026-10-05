"use client";
import {useEffect,useMemo,useState} from "react";
import {createSupabaseBrowserClient} from "@/lib/supabase";
type P={id?:string;package_key:string;title:string;coins:number;bonus_coins:number;price_usd:number;sku:string|null;is_popular:boolean;is_active:boolean;sort_order:number};
type G={gift_key:string;title:string;emoji:string;price:number;diamond_value:number;is_active:boolean};
type W={id:string;user_id:string;diamonds:number;amount_usd:number;method:string;status:string;created_at:string};
type A={id:string;name:string;owner_id:string;commission_percent:number;status:string;total_diamonds:number};
const blank:P={package_key:"",title:"",coins:10000,bonus_coins:0,price_usd:.99,sku:"",is_popular:false,is_active:true,sort_order:1};
export default function EconomyPage(){
 const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
 const [tab,setTab]=useState("settings");
 const [pub,setPub]=useState({coins_per_usd:10000,diamond_usd:.0000666667,gift_diamond_ratio:1,min_withdraw_diamonds:150000,min_withdraw_usd:10,show_diamond_value_in_app:false});
 const [priv,setPriv]=useState({platform_percent:0,agency_default_percent:20});
 const [packages,setPackages]=useState<P[]>([]),[gifts,setGifts]=useState<G[]>([]),[withdrawals,setWithdrawals]=useState<W[]>([]),[agencies,setAgencies]=useState<A[]>([]);
 const [form,setForm]=useState<P>(blank),[agencyName,setAgencyName]=useState(""),[agencyOwner,setAgencyOwner]=useState(""),[agencyPercent,setAgencyPercent]=useState(20),[memberAgency,setMemberAgency]=useState(""),[memberUser,setMemberUser]=useState("");
 const [error,setError]=useState(""),[saving,setSaving]=useState(false);
 async function load(){
  if(!supabase)return;
  const [s,p,g,w,a]=await Promise.all([
   supabase.from("app_settings").select("key,value").in("key",["economy.public","economy.private"]),
   supabase.from("coin_packages").select("*").order("sort_order"),
   supabase.from("room_gift_catalog").select("gift_key,title,emoji,price,diamond_value,is_active").order("price"),
   supabase.from("withdraw_requests").select("id,user_id,diamonds,amount_usd,method,status,created_at").order("created_at",{ascending:false}).limit(100),
   supabase.from("agencies").select("id,name,owner_id,commission_percent,status,total_diamonds").order("created_at",{ascending:false})
  ]);
  const e=[s,p,g,w,a].find(x=>x.error)?.error;if(e){setError(e.message);return}
  const map=Object.fromEntries((s.data??[]).map((r:any)=>[r.key,r.value]));
  if(map["economy.public"])setPub(x=>({...x,...map["economy.public"]}));
  if(map["economy.private"])setPriv(x=>({...x,...map["economy.private"]}));
  setPackages((p.data??[]) as P[]);setGifts((g.data??[]) as G[]);setWithdrawals((w.data??[]) as W[]);setAgencies((a.data??[]) as A[]);
 }
 useEffect(()=>{void load()},[supabase]);
 async function saveSettings(){
  if(!supabase)return;setSaving(true);setError("");
  const publicValue={coins_per_usd:Math.max(100,Math.floor(Number(pub.coins_per_usd)||10000)),diamond_usd:Math.max(.000001,Number(pub.diamond_usd)||.0000666667),gift_diamond_ratio:Math.max(.01,Math.min(1,Number(pub.gift_diamond_ratio)||1)),min_withdraw_diamonds:Math.max(1,Math.floor(Number(pub.min_withdraw_diamonds)||150000)),min_withdraw_usd:Math.max(1,Number(pub.min_withdraw_usd)||10),show_diamond_value_in_app:!!pub.show_diamond_value_in_app};
  const privateValue={platform_percent:Math.max(0,Math.min(100,Number(priv.platform_percent)||0)),agency_default_percent:Math.max(0,Math.min(100,Number(priv.agency_default_percent)||20))};
  const r1=await supabase.from("app_settings").upsert({key:"economy.public",value:publicValue});const r2=await supabase.from("app_settings").upsert({key:"economy.private",value:privateValue});
  if(r1.error||r2.error)setError((r1.error||r2.error)!.message);else{setPub(publicValue);setPriv(privateValue)}setSaving(false);
 }
 async function savePackage(){if(!supabase)return;setSaving(true);const payload={...form,coins:Math.max(1,Math.floor(Number(form.coins))),bonus_coins:Math.max(0,Math.floor(Number(form.bonus_coins))),price_usd:Math.max(.01,Number(form.price_usd)),sort_order:Math.floor(Number(form.sort_order)||1)};const r=await supabase.from("coin_packages").upsert(payload,{onConflict:"package_key"});if(r.error)setError(r.error.message);else{setForm({...blank});await load()}setSaving(false)}
 async function togglePackage(x:P){if(!supabase)return;const r=await supabase.from("coin_packages").update({is_active:!x.is_active}).eq("package_key",x.package_key);if(r.error)setError(r.error.message);else await load()}
 async function saveGift(x:G){if(!supabase)return;const r=await supabase.from("room_gift_catalog").update({diamond_value:Math.max(0,Math.floor(Number(x.diamond_value))),is_active:x.is_active}).eq("gift_key",x.gift_key);if(r.error)setError(r.error.message);else await load()}
 async function settle(id:string,status:string){if(!supabase)return;const r=await supabase.rpc("jehoo_admin_set_withdraw_status",{p_request_id:id,p_status:status,p_note:null});if(r.error)setError(r.error.message);else await load()}
 async function createAgency(){if(!supabase||agencyName.trim().length<2||!agencyOwner)return;setSaving(true);const r=await supabase.from("agencies").insert({name:agencyName.trim(),owner_id:agencyOwner,commission_percent:Math.max(0,Math.min(100,Number(agencyPercent)||20)),status:"active"});if(r.error)setError(r.error.message);else{setAgencyName("");setAgencyOwner("");await load()}setSaving(false)}
 async function addMember(){if(!supabase||!memberAgency||!memberUser)return;setSaving(true);const r=await supabase.from("agency_members").upsert({agency_id:memberAgency,user_id:memberUser,role:"host",status:"active"},{onConflict:"agency_id,user_id"});if(r.error)setError(r.error.message);else{setMemberUser("");setMemberAgency("");}setSaving(false)}
 const tabs=[["settings","إعدادات الاقتصاد"],["packages","باقات Coins"],["gifts","قيمة الهدايا"],["withdrawals","السحب"],["agencies","الوكالات"]];
 return <main className="main" dir="rtl">
  <div className="topbar"><div><a href="/" className="muted">JEHOO CHAT / لوحة التحكم</a><h1>الاقتصاد</h1><p className="muted">Coins → هدية → Diamonds → سحب. قيمة الهدية كاملة، وعمولة الوكالة منفصلة. نسبة التطبيق الداخلية لا تظهر للمستخدم.</p></div><a className="secondary" href="/">رجوع</a></div>
  {error&&<div className="notice error">{error}</div>}
  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>{tabs.map(t=><button key={t[0]} className={tab===t[0]?"primary":"secondary"} onClick={()=>setTab(t[0])}>{t[1]}</button>)}</div>
  {tab==="settings"&&<section className="panel"><h2>إعدادات الاقتصاد</h2><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}}>
   <label>Coins لكل 1$<input className="field" type="number" value={pub.coins_per_usd} onChange={e=>setPub({...pub,coins_per_usd:Number(e.target.value)})}/></label>
   <label>قيمة Diamond بالدولار<input className="field" type="number" step=".0000001" value={pub.diamond_usd} onChange={e=>setPub({...pub,diamond_usd:Number(e.target.value)})}/></label>
   <label>نسبة gift → Diamonds<input className="field" type="number" step=".01" min=".01" max="1" value={pub.gift_diamond_ratio} onChange={e=>setPub({...pub,gift_diamond_ratio:Number(e.target.value)})}/></label>
   <label>الحد الأدنى للسحب Diamonds<input className="field" type="number" value={pub.min_withdraw_diamonds} onChange={e=>setPub({...pub,min_withdraw_diamonds:Number(e.target.value)})}/></label>
   <label>الحد الأدنى للسحب $<input className="field" type="number" value={pub.min_withdraw_usd} onChange={e=>setPub({...pub,min_withdraw_usd:Number(e.target.value)})}/></label>
   <label>عمولة الوكالة الافتراضية %<input className="field" type="number" min="0" max="100" value={priv.agency_default_percent} onChange={e=>setPriv({...priv,agency_default_percent:Number(e.target.value)})}/></label>
   <label>نسبة التطبيق الداخلية %<input className="field" type="number" min="0" max="100" value={priv.platform_percent} onChange={e=>setPriv({...priv,platform_percent:Number(e.target.value)})}/><span className="muted">مخفية عن المستخدمين.</span></label>
  </div><label style={{display:"flex",gap:8,alignItems:"center",margin:"14px 0"}}><input type="checkbox" checked={pub.show_diamond_value_in_app} onChange={e=>setPub({...pub,show_diamond_value_in_app:e.target.checked})}/> إظهار قيمة Diamonds للمستخدم</label>
  <div className="notice">مثال: 10$ ≈ 100,000 Coins. وعند 0.0000666667$ لكل Diamond، يستلم صاحب الهدية 6.67$ عند 100,000 Diamonds. عمولة وكالة 20% = 20,000 Diamonds إضافية ولا تُخصم منه.</div>
  <button className="primary" disabled={saving} onClick={()=>void saveSettings()}>{saving?"جارٍ الحفظ…":"حفظ"}</button></section>}
  {tab==="packages"&&<section className="panel"><h2>باقات Coins</h2><p className="muted">الكتالوج من الداشبورد. لا نعطي Coins من العميل بمجرد الضغط؛ الشحن الحقيقي يحتاج تحقق إيصال الدفع.</p>
   <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}><input className="field" placeholder="package_key" value={form.package_key} onChange={e=>setForm({...form,package_key:e.target.value})}/><input className="field" placeholder="العنوان" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><input className="field" type="number" placeholder="Coins" value={form.coins} onChange={e=>setForm({...form,coins:Number(e.target.value)})}/><input className="field" type="number" placeholder="Bonus" value={form.bonus_coins} onChange={e=>setForm({...form,bonus_coins:Number(e.target.value)})}/><input className="field" type="number" step=".01" placeholder="USD" value={form.price_usd} onChange={e=>setForm({...form,price_usd:Number(e.target.value)})}/><input className="field" placeholder="SKU" value={form.sku||""} onChange={e=>setForm({...form,sku:e.target.value})}/></div>
   <button className="primary" style={{marginTop:10}} disabled={saving} onClick={()=>void savePackage()}>حفظ الباقة</button>
   <div style={{marginTop:18}}>{packages.map(x=><div key={x.package_key} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:12,alignItems:"center",padding:"10px 0",borderBottom:"1px solid #263342"}}><div><strong>{x.title}</strong><div className="muted">{Number(x.coins+x.bonus_coins).toLocaleString("ar")} Coins · {"$"}{Number(x.price_usd).toFixed(2)} · {x.sku||"—"}</div></div><span className="pill">{x.is_active?"فعالة":"موقوفة"}</span><button className="secondary" onClick={()=>void togglePackage(x)}>{x.is_active?"إيقاف":"تفعيل"}</button></div>)}</div>
  </section>}
  {tab==="gifts"&&<section className="panel"><h2>قيمة الهدايا</h2><p className="muted">قيمة الهدية Coins تبقى كاملة. Diamond value منفصل، وعمولة الوكالة لا تُخصم من قيمة الهدية.</p>{gifts.map(x=><div key={x.gift_key} style={{display:"grid",gridTemplateColumns:"40px 1fr 150px auto",gap:10,alignItems:"center",padding:"10px 0",borderBottom:"1px solid #263342"}}><span style={{fontSize:24}}>{x.emoji}</span><div><strong>{x.title}</strong><div className="muted">{Number(x.price).toLocaleString("ar")} Coins</div></div><input className="field" type="number" min="0" value={x.diamond_value} onChange={e=>setGifts(g=>g.map(y=>y.gift_key===x.gift_key?{...y,diamond_value:Number(e.target.value)}:y))}/><button className="secondary" onClick={()=>void saveGift(x)}>حفظ</button></div>)}</section>}
  {tab==="withdrawals"&&<section className="panel"><h2>طلبات السحب</h2>{withdrawals.map(x=><div key={x.id} style={{padding:"12px 0",borderBottom:"1px solid #263342"}}><strong>{"$"}{Number(x.amount_usd).toFixed(2)} · {Number(x.diamonds).toLocaleString("ar")} ♦</strong><div className="muted">{x.user_id} · {x.method} · {x.status}</div>{x.status==="pending"&&<div style={{display:"flex",gap:8,marginTop:8}}><button className="secondary" onClick={()=>void settle(x.id,"approved")}>موافقة</button><button className="secondary" onClick={()=>void settle(x.id,"rejected")}>رفض</button></div>}{x.status==="approved"&&<button className="primary" style={{marginTop:8}} onClick={()=>void settle(x.id,"paid")}>تم الدفع</button>}</div>)}{!withdrawals.length&&<p className="muted">لا توجد طلبات.</p>}</section>}
  {tab==="agencies"&&<section className="panel"><h2>الوكالات</h2><div className="panel" style={{background:"#111a24",marginBottom:16}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 120px auto",gap:8}}><input className="field" placeholder="اسم الوكالة" value={agencyName} onChange={e=>setAgencyName(e.target.value)}/><input className="field" placeholder="Owner UUID" value={agencyOwner} onChange={e=>setAgencyOwner(e.target.value)}/><input className="field" type="number" min="0" max="100" value={agencyPercent} onChange={e=>setAgencyPercent(Number(e.target.value))}/><button className="primary" disabled={saving} onClick={()=>void createAgency()}>إنشاء</button></div></div><div className="panel" style={{background:"#111a24",marginBottom:16}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:8}}><input className="field" placeholder="Agency UUID" value={memberAgency} onChange={e=>setMemberAgency(e.target.value)}/><input className="field" placeholder="Host User UUID" value={memberUser} onChange={e=>setMemberUser(e.target.value)}/><button className="secondary" disabled={saving} onClick={()=>void addMember()}>إضافة Host</button></div></div>{agencies.map(x=><div key={x.id} style={{padding:"12px 0",borderBottom:"1px solid #263342"}}><strong>{x.name}</strong><div className="muted">Owner: {x.owner_id} · {x.commission_percent}% · ♦ {Number(x.total_diamonds).toLocaleString("ar")} · {x.status}</div></div>)}</section>}
 </main>
}