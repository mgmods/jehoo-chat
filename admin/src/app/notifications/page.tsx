"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function NotificationsPage(){
 const [client]=useState(()=>createSupabaseBrowserClient());
 const [title,setTitle]=useState(""); const [body,setBody]=useState("");
 const [target,setTarget]=useState("all"); const [userId,setUserId]=useState("");
 const [kind,setKind]=useState("text"); const [url,setUrl]=useState(""); const [html,setHtml]=useState("");
 const [busy,setBusy]=useState(false); const [status,setStatus]=useState(""); const [history,setHistory]=useState<any[]>([]);
 async function loadHistory(){ if(!client)return; const {data,error}=await client.from("official_messages").select("id,title,body,content_type,target_type,created_at").order("created_at",{ascending:false}).limit(20); if(error)setStatus(error.message); else setHistory(data??[]); }
 useEffect(()=>{void loadHistory()},[]);
 async function send(){if(!client)return;setBusy(true);setStatus("");try{const {data:{session}}=await client.auth.getSession();if(!session)throw new Error("سجّل الدخول أولاً");const {data,error}=await client.functions.invoke("send-official-notification",{body:{title,body,content_type:kind,target_type:target,target_user_id:userId,content_url:url,html_content:html}});if(error)throw error;if(data?.error)throw new Error(data.error);setStatus("تم حفظ الرسالة وإرسال طلب الإشعارات. أجهزة مستهدفة: "+(data?.devices??0)+"، طلبات إرسال ناجحة: "+(data?.sent??0));setTitle("");setBody("");setUrl("");setHtml("");await loadHistory()}catch(e){setStatus(e instanceof Error?e.message:"تعذر الإرسال")}finally{setBusy(false)}}
 return <main className="main" dir="rtl"><div className="topbar"><div><h1>الإشعارات والرسائل الرسمية</h1><p className="muted">إرسال إشعار خارج التطبيق ورسالة مثبتة داخل قسم الشات.</p></div><a className="secondary" href="/">رجوع للوحة التحكم</a></div>
 <section className="panel" style={{maxWidth:850,marginBottom:24}}><label>عنوان الإشعار</label><input className="field" value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} placeholder="عنوان الرسالة"/>
 <label>النص</label><textarea className="field" value={body} onChange={e=>setBody(e.target.value)} maxLength={2000} rows={4} placeholder="اكتب الرسالة هنا"/>
 <label>المستلمون</label><select className="field" value={target} onChange={e=>setTarget(e.target.value)}><option value="all">كل مستخدمي التطبيق</option><option value="user">مستخدم محدد بواسطة UUID</option></select>
 {target==="user"&&<><label>معرّف المستخدم UUID</label><input className="field" value={userId} onChange={e=>setUserId(e.target.value)} placeholder="معرّف auth user UUID"/></>}
 <label>نوع المحتوى داخل الرسالة</label><select className="field" value={kind} onChange={e=>setKind(e.target.value)}><option value="text">نص</option><option value="image">صورة برابط</option><option value="link">رابط HTTPS</option><option value="html">HTML</option></select>
 {(kind==="image"||kind==="link")&&<><label>رابط المحتوى HTTPS</label><input className="field" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..."/></>}
 {kind==="html"&&<><label>HTML (يعرض كمحتوى رسمي داخل التطبيق بعد تنقية/تقييد العرض)</label><textarea className="field" value={html} onChange={e=>setHtml(e.target.value)} rows={5} maxLength={10000}/></>}
 <p className="muted">ملاحظة: إشعارات النظام تعرض العنوان والنص فقط؛ الصورة والرابط وHTML تكون ضمن الرسالة داخل التطبيق. HTML لا يُنفّذ داخل تنبيه النظام.</p>
 <button className="primary" disabled={busy||!title.trim()||(target==="user"&&!userId.trim())} onClick={()=>void send()}>{busy?"جارٍ الإرسال…":"إرسال الإشعار ونشر الرسالة الرسمية"}</button>{status&&<p className="notice">{status}</p>}</section>
 <h2>آخر الرسائل الرسمية</h2><section className="panel">{history.map(m=><div key={m.id} style={{padding:"12px 0",borderBottom:"1px solid #263342"}}><strong>{m.title}</strong><p className="muted">{m.body}</p><small>{m.target_type==="all"?"لكل المستخدمين":"مستخدم محدد"} · {m.content_type} · {new Date(m.created_at).toLocaleString("ar")}</small></div>)}{!history.length&&<p className="muted">لا توجد رسائل منشورة بعد.</p>}</section></main>
}
