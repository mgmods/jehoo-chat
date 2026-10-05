"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { messages, type Locale } from "@jehoo/shared";

type Stat = { label: string; value: string | number; note: string };
type RoomRow = { id: string; name: string; status: string; created_at: string };
const navLabels = { ar: ["لوحة التحكم","المستخدمون","الغرف الصوتية","مراقبة المحادثات","البلاغات","الهدايا","VIP","المحافظ","المعاملات","المتجر","الوكالات","البنرات","الفعاليات","التصنيفات","الإشعارات","الدعم","الموظفون","سجل التدقيق","الإعدادات"], en: ["Dashboard","Users","Voice Rooms","Chat Monitoring","Reports","Gifts","VIP","Wallets","Transactions","Store","Agencies","Banners","Events","Rankings","Notifications","Support","Staff","Audit Logs","Settings"] };

export default function AdminHome() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [locale, setLocale] = useState<Locale>("ar");
  const [user, setUser] = useState<{id:string;email?:string}|null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState("");
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<Stat[]>([]);
  const [recentRooms, setRecentRooms] = useState<RoomRow[]>([]);
  const ar = locale === "ar";
  const copy = messages[locale];

  const loadDashboard = useCallback(async (userId: string) => {
    if (!supabase) return;
    setLoading(true); setError("");
    try {
      const { data: roleRows, error: roleError } = await supabase.from("admin_user_roles").select("role_id").eq("user_id", userId).is("disabled_at", null);
      if (roleError) throw roleError;
      const elevated = (roleRows ?? []).map((r) => r.role_id as string).filter((r) => r !== "USER");
      if (!elevated.length) {
        setRole("USER"); setPermissions(new Set()); setError(copy.accessDenied); setStats([]); setRecentRooms([]); setLoading(false); return;
      }
      const { data: rolePermissionRows, error: permissionError } = await supabase.from("role_permissions").select("permission_id").in("role_id", elevated);
      if (permissionError) throw permissionError;
      const granted = new Set((rolePermissionRows ?? []).map((p) => p.permission_id as string));
      setRole(elevated.includes("SUPER_ADMIN") ? "SUPER_ADMIN" : elevated.includes("ADMIN") ? "ADMIN" : elevated.includes("MANAGER") ? "MANAGER" : elevated[0]);
      setPermissions(granted);

      const [usersResult, roomsResult, messagesResult, walletResult, vipResult, agenciesResult, roomList] = await Promise.all([
        supabase.from("profiles").select("id", {count:"exact",head:true}),
        supabase.from("rooms").select("id", {count:"exact",head:true}).neq("status","closed"),
        granted.has("messages.view") ? supabase.from("messages").select("id",{count:"exact",head:true}) : Promise.resolve({count:null,error:null}),
        granted.has("wallet.view") ? supabase.from("wallets").select("coins") : Promise.resolve({data:null,error:null}),
        supabase.from("profiles").select("id",{count:"exact",head:true}).gt("vip_level",0),
        Promise.resolve({count:null,error:null}),
        granted.has("rooms.view") ? supabase.from("rooms").select("id,name,status,created_at").order("created_at",{ascending:false}).limit(6) : Promise.resolve({data:[],error:null}),
      ]);
      for (const result of [usersResult,roomsResult,messagesResult,walletResult,vipResult,agenciesResult,roomList]) if (result.error) throw result.error;
      const walletRows = (walletResult as {data?:Array<{coins:number}>}).data ?? [];
      const coinSum = walletRows.reduce((sum,row)=>sum+Number(row.coins ?? 0),0);
      setStats([
        {label:copy.totalUsers,value:usersResult.count ?? "—",note:ar?"الحسابات المسجلة":"Registered accounts"},
        {label:copy.activeRooms,value:roomsResult.count ?? "—",note:ar?"غير المغلقة":"Not closed"},
        {label:ar?"الرسائل المخزنة":"Stored messages",value:messagesResult.count ?? "—",note:granted.has("messages.view")?(ar?"بحسب صلاحيتك":"Based on your permission"):(ar?"تحتاج صلاحية messages.view":"Requires messages.view")},
        {label:ar?"إجمالي Coins":"Total Coins",value:granted.has("wallet.view")?coinSum.toLocaleString():"—",note:ar?"أرصدة المحافظ":"Wallet balances"},
        {label:ar?"مستخدمو VIP":"VIP users",value:vipResult.count ?? "—",note:ar?"مستوى VIP أكبر من صفر":"VIP level above zero"},
        {label:ar?"الوكالات":"Agencies",value:agenciesResult.count ?? "—",note:ar?"سيُفعّل بعد إضافة وحدة الوكالات":"Available after the agencies module is added"},
      ]);
      setRecentRooms((roomList.data ?? []) as RoomRow[]);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load dashboard"); }
    finally { setLoading(false); }
  }, [supabase, copy, ar]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(({data}) => {
      if (!alive) return;
      const current = data.session?.user;
      setUser(current ? {id:current.id,email:current.email} : null);
      if (current) void loadDashboard(current.id); else setLoading(false);
    });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,session) => {
      const current = session?.user;
      setUser(current ? {id:current.id,email:current.email} : null);
      if (current) void loadDashboard(current.id);
      else { setRole(""); setPermissions(new Set()); setStats([]); setLoading(false); }
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [supabase,loadDashboard]);

  async function signIn() {
    if (!supabase) return;
    setSigningIn(true); setError("");
    const redirectTo = "https://jehoo-chat-73dx.vercel.app";
    const {error:authError} = await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo}});
    if (authError) setError(authError.message);
    setSigningIn(false);
  }
  async function signOut() { if (supabase) await supabase.auth.signOut({scope:"local"}); }
  const nav = navLabels[locale];

  if (!supabase) return <main className="main"><div className="panel"><h1>{copy.appName}</h1><p>{copy.configurationRequired}</p><p className="muted">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in admin/.env.local.</p></div></main>;
  if (!user) return <main className="main" style={{maxWidth:520,margin:"8vh auto"}}><section className="panel"><div className="topbar"><h1 className="brand" style={{margin:0,display:"flex",alignItems:"center",gap:10}}><img src="/jehoo-logo.jpg" alt="JEHOO CHAT" style={{width:52,height:52,objectFit:"cover",borderRadius:12}} /> JEHOO CHAT</h1><button className="secondary" onClick={()=>setLocale(ar?"en":"ar")}>{ar?"English":"العربية"}</button></div><h2>{copy.signIn}</h2><p className="muted">{ar?"لوحة الإدارة المستقلة — يتطلب حساباً بصلاحية إدارية.":"Independent admin dashboard — an authorized staff account is required."}</p><button className="primary" disabled={signingIn} onClick={signIn}>{signingIn?copy.loading:ar?"المتابعة باستخدام Google":"Continue with Google"}</button>{error&&<p className="error">{error}</p>}</section></main>;

  return <div className="dashboard" dir={ar?"rtl":"ltr"}>
    <aside className="sidebar"><div className="brand" style={{display:"flex",alignItems:"center",gap:10}}><img src="/jehoo-logo.jpg" alt="JEHOO CHAT" style={{width:52,height:52,objectFit:"cover",borderRadius:12}} /><span style={{color:"#edf4f7"}}>JEHOO CHAT</span></div><div className="nav">
      {nav.map((label,index)=>index===0?<a key={label} href="#dashboard" className="active">{label}</a>:index===3 && permissions.has("messages.view")?<a key={label} href="/chat-monitor">{label}</a>:index===5 && permissions.has("gifts.manage")?<a key={label} href="/gifts">{label}</a>:index===7 && permissions.has("wallet.view")?<a key={label} href="/wallets">{label}</a>:index===8 && permissions.has("transactions.view")?<a key={label} href="/wallets">{label}</a>:index===14 && (permissions.has("notifications.manage")||permissions.has("notifications.send")||role==="SUPER_ADMIN")?<a key={label} href="/notifications">{label}</a>:index===18 && permissions.has("settings.manage")?<a key={label} href="/settings/splash">{label}</a>:<span key={label} className="nav-disabled" aria-disabled="true">{label}</span>)}
    </div><div style={{marginTop:24}} className="muted">{ar?"الدور الحالي":"Current role"}: <span className="pill">{role}</span></div></aside>
    <main className="main" id="dashboard">
      <div className="topbar"><div><h1 style={{margin:"0 0 6px"}}>{copy.dashboard}</h1><div className="muted">{copy.dashboardSubtitle}</div></div><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><button className="secondary" onClick={()=>setLocale(ar?"en":"ar")}>{ar?"English":"العربية"}</button><button className="secondary" onClick={()=>void loadDashboard(user.id)}>{ar?"تحديث":"Refresh"}</button><button className="secondary" onClick={signOut}>{copy.signOut}</button></div></div>
      <div className="notice">{copy.securityNotice}</div>
      {error&&<div className="notice error">{error}</div>}
      {loading?<div className="panel">{copy.loading}</div>:error===copy.accessDenied?<div className="panel"><h2>{copy.accessDenied}</h2><p className="muted">{ar?"اطلب من مسؤول مخوّل منح حسابك الدور المناسب.":"Ask an authorized administrator to assign your staff role."}</p></div>:<>
        <div className="grid">{stats.map((s)=><section className="panel" key={s.label}><div className="muted">{s.label}</div><div className="metric">{s.value}</div><div className="muted" style={{fontSize:12,marginTop:8}}>{s.note}</div></section>)}</div>
        <h2 className="section-title">{ar?"أحدث الغرف":"Recent rooms"}</h2>
        {permissions.has("rooms.view")?<div className="table-wrap"><table><thead><tr><th>{ar?"اسم الغرفة":"Room"}</th><th>{ar?"الحالة":"Status"}</th><th>{ar?"تاريخ الإنشاء":"Created"}</th></tr></thead><tbody>{recentRooms.map(r=><tr key={r.id}><td>{r.name}</td><td><span className="pill">{r.status}</span></td><td>{new Date(r.created_at).toLocaleString(ar?"ar":"en")}</td></tr>)}{!recentRooms.length&&<tr><td colSpan={3}>{ar?"لا توجد غرف بعد":"No rooms yet"}</td></tr>}</tbody></table></div>:<div className="panel muted">{ar?"تحتاج إلى rooms.view لعرض الغرف.":"rooms.view permission is required to list rooms."}</div>}
      </>}
    </main>
  </div>;
}
