"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type MessageRow = {
  id: string; conversation_id: string; sender_id: string; message_type: string; body: string;
  attachment_path: string|null; reply_to: string|null; edited_at: string|null; deleted_at: string|null; created_at: string;
  sender: { id:string; public_id:number; display_name:string; avatar_url:string }|null;
  conversation: { id:string; kind:string; title:string|null }|null;
};
type Filters = { keyword:string; userId:string; from:string; to:string; messageType:string; includeMedia:boolean };

export default function ChatMonitorPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>({keyword:"",userId:"",from:"",to:"",messageType:"",includeMedia:false});
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [conversationList, setConversationList] = useState<Array<{id:string;title:string;kind:string;latest:string;count:number}>>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [selectedMessageId, setSelectedMessageId] = useState("");

  const refreshConversations = useCallback((rows: MessageRow[]) => {
    const grouped = new Map<string,{id:string;title:string;kind:string;latest:string;count:number}>();
    for (const row of rows) {
      const existing = grouped.get(row.conversation_id);
      if (existing) existing.count += 1;
      else grouped.set(row.conversation_id,{
        id:row.conversation_id,
        title:row.conversation?.title || (row.conversation?.kind === "group" ? "محادثة جماعية" : row.conversation?.kind === "room" ? "محادثة غرفة" : "محادثة خاصة"),
        kind:row.conversation?.kind || "direct",
        latest:row.created_at,
        count:1,
      });
    }
    setConversationList(Array.from(grouped.values()).sort((a,b)=>b.latest.localeCompare(a.latest)));
  },[]);

  const runSearch = useCallback(async (overrides?: Partial<Filters> & {conversationId?:string}, updateList = false) => {
    if (!supabase) return;
    setSearching(true); setError("");
    const active = {...filters,...overrides};
    const body: Record<string,unknown> = {limit:75,includeMedia:active.includeMedia};
    if (active.keyword.trim()) body.keyword=active.keyword.trim();
    if (active.userId.trim()) body.userId=active.userId.trim();
    if (active.from) body.from=new Date(active.from).toISOString();
    if (active.to) body.to=new Date(active.to).toISOString();
    if (active.messageType) body.messageType=active.messageType;
    if (overrides?.conversationId) body.conversationId=overrides.conversationId;
    else if (selectedConversationId && !updateList) body.conversationId=selectedConversationId;
    try {
      const {data,error:invokeError}=await supabase.functions.invoke("chat-monitor-search",{body});
      if (invokeError) setError(invokeError.message);
      else if (data?.error) setError(String(data.error));
      else {
        const rows=(data?.data ?? []) as MessageRow[];
        setMessages(rows);
        if (updateList) refreshConversations(rows);
        if (!selectedMessageId || !rows.some((m)=>m.id===selectedMessageId)) setSelectedMessageId(rows[0]?.id ?? "");
        if (!selectedConversationId && rows[0]?.conversation_id) setSelectedConversationId(rows[0].conversation_id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل الرسائل.");
    } finally {
      setSearching(false);
    }
  },[supabase,filters,selectedConversationId,selectedMessageId,refreshConversations]);

  useEffect(() => {
    if (!supabase) { setLoading(false); setError("إعداد Supabase غير مكتمل."); return; }
    let alive=true;
    supabase.auth.getSession().then(async ({data})=>{
      if (!alive) return;
      const user=data.session?.user;
      if (!user) { router.replace("/"); setLoading(false); return; }
      const {data:roles,error:roleError}=await supabase.from("admin_user_roles").select("role_id").eq("user_id",user.id).is("disabled_at",null);
      if (roleError) { setError(roleError.message); setLoading(false); return; }
      const roleIds=(roles??[]).map((r)=>r.role_id as string).filter((r)=>r!=="USER");
      if (!roleIds.length) { setError("ليس لديك صلاحية messages.view."); setLoading(false); return; }
      const {data:perms,error:permError}=await supabase.from("role_permissions").select("permission_id").in("role_id",roleIds);
      if (permError) { setError(permError.message); setLoading(false); return; }
      const set=new Set((perms??[]).map((p)=>p.permission_id as string));
      setPermissions(set);
      if (!set.has("messages.view")) { setError("ليس لديك صلاحية messages.view."); setLoading(false); return; }
      const {data:initialData,error:initialError}=await supabase.functions.invoke("chat-monitor-search",{body:{limit:75}});
      if (initialError) setError(initialError.message);
      else if (initialData?.error) setError(String(initialData.error));
      else {
        const rows=(initialData?.data ?? []) as MessageRow[];
        setMessages(rows);
        refreshConversations(rows);
        setSelectedConversationId(rows[0]?.conversation_id ?? "");
        setSelectedMessageId(rows[0]?.id ?? "");
      }
      setLoading(false);
    });
    return ()=>{alive=false;};
  },[supabase,router,refreshConversations]);

  const selectedMessage=useMemo(()=>messages.find((m)=>m.id===selectedMessageId)??null,[messages,selectedMessageId]);
  const visibleMessages=useMemo(()=>messages.filter((m)=>m.conversation_id===selectedConversationId).slice().sort((a,b)=>a.created_at.localeCompare(b.created_at)),[messages,selectedConversationId]);

  function updateFilter<K extends keyof Filters>(key:K,value:Filters[K]) {
    setFilters((old)=>({...old,[key]:value}));
  }

  return <div className="main" dir="rtl">
    <div className="topbar">
      <div><a href="/" className="muted">JEHOO CHAT / لوحة التحكم</a><h1 style={{margin:"8px 0 4px"}}>مراقبة المحادثات</h1><div className="muted">الوصول مسجّل في سجل التدقيق، ومحتوى الرسائل لا يُسجّل في سجلات الأخطاء.</div></div>
      <button className="secondary" onClick={()=>router.push("/")}>العودة للوحة التحكم</button>
    </div>
    <div className="notice">تظهر هنا الرسائل المخزنة فقط. يجب أن تكون لديك صلاحية مستقلة لعرض الرسائل أو البحث أو فتح المرفقات.</div>
    {error&&<div className="notice error">{error}</div>}
    {loading?<div className="panel">جارٍ التحقق من الصلاحيات وتحميل المحادثات…</div>:permissions.has("messages.view")&&<>
      <section className="panel monitor-filters">
        <div className="monitor-field"><label>كلمة في الرسالة</label><input className="field" value={filters.keyword} onChange={(e)=>updateFilter("keyword",e.target.value)} placeholder="بحث نصي (يتطلب messages.search)" /></div>
        <div className="monitor-field"><label>معرّف المستخدم</label><input className="field" value={filters.userId} onChange={(e)=>updateFilter("userId",e.target.value)} placeholder="UUID" /></div>
        <div className="monitor-field"><label>نوع الرسالة</label><select className="field" value={filters.messageType} onChange={(e)=>updateFilter("messageType",e.target.value)}><option value="">كل الأنواع</option><option value="text">نص</option><option value="image">صورة</option><option value="voice">رسالة صوتية</option><option value="gif">GIF</option><option value="gift">هدية</option><option value="file">ملف</option><option value="system">نظام</option></select></div>
        <div className="monitor-field"><label>من تاريخ</label><input className="field" type="datetime-local" value={filters.from} onChange={(e)=>updateFilter("from",e.target.value)} /></div>
        <div className="monitor-field"><label>إلى تاريخ</label><input className="field" type="datetime-local" value={filters.to} onChange={(e)=>updateFilter("to",e.target.value)} /></div>
        {permissions.has("messages.media_view")&&<label className="monitor-check"><input type="checkbox" checked={filters.includeMedia} onChange={(e)=>updateFilter("includeMedia",e.target.checked)} /> إظهار مسارات المرفقات</label>}
        <button className="primary" disabled={searching || (Boolean(filters.keyword||filters.userId||filters.from||filters.to||filters.messageType) && !permissions.has("messages.search"))} onClick={()=>{setSelectedConversationId("");void runSearch(undefined,true);}}>{searching?"جارٍ البحث…":"بحث"}</button>
      </section>
      {!permissions.has("messages.search")&&<p className="muted">حسابك يملك عرض الرسائل فقط؛ البحث المتقدم يتطلب messages.search.</p>}
      <div className="monitor-layout">
        <aside className="panel monitor-list"><h2 className="section-title" style={{marginTop:0}}>المحادثات</h2>
          {conversationList.map((c)=><button key={c.id} className={"conversation-option "+(selectedConversationId===c.id?"chosen":"")} onClick={()=>{setSelectedConversationId(c.id);void runSearch({conversationId:c.id},false);}}><strong>{c.title}</strong><span>{c.kind} · {c.count} رسالة في النتائج</span><small>{new Date(c.latest).toLocaleString("ar")}</small></button>)}
          {!conversationList.length&&<p className="muted">لا توجد محادثات ضمن النتائج.</p>}
        </aside>
        <section className="panel monitor-thread"><h2 className="section-title" style={{marginTop:0}}>الرسائل ({visibleMessages.length})</h2>
          {searching?<p className="muted">جارٍ التحميل…</p>:visibleMessages.map((m)=><button key={m.id} className={"message-option "+(selectedMessageId===m.id?"chosen":"")} onClick={()=>setSelectedMessageId(m.id)}>
            <div className="message-head"><strong>{m.sender?.display_name??m.sender_id}</strong><span>{m.message_type}</span></div><p>{m.deleted_at?"[تم حذف الرسالة]":m.body || (m.attachment_path?"[مرفق]":"[بدون نص]")}</p><small>{new Date(m.created_at).toLocaleString("ar")} · {m.id.slice(0,8)}</small>
            {m.attachment_path&&filters.includeMedia&&permissions.has("messages.media_view")&&<small className="attachment-path">المرفق: {m.attachment_path}</small>}
          </button>)}
          {!visibleMessages.length&&!searching&&<p className="muted">اختر محادثة من القائمة أو نفّذ بحثاً.</p>}
        </section>
        <aside className="panel monitor-details"><h2 className="section-title" style={{marginTop:0}}>التفاصيل</h2>
          {selectedMessage?<><div className="detail-row"><span>المرسل</span><strong>{selectedMessage.sender?.display_name??"غير معروف"}</strong></div><div className="detail-row"><span>User ID</span><code>{selectedMessage.sender_id}</code></div><div className="detail-row"><span>Public ID</span><strong>{selectedMessage.sender?.public_id??"—"}</strong></div><div className="detail-row"><span>Conversation ID</span><code>{selectedMessage.conversation_id}</code></div><div className="detail-row"><span>Message ID</span><code>{selectedMessage.id}</code></div><div className="detail-row"><span>النوع</span><strong>{selectedMessage.message_type}</strong></div><div className="detail-row"><span>التاريخ</span><strong>{new Date(selectedMessage.created_at).toLocaleString("ar")}</strong></div><div className="detail-row"><span>رد على</span><code>{selectedMessage.reply_to??"—"}</code></div><div className="detail-row"><span>الحالة</span><strong>{selectedMessage.deleted_at?"محذوفة":selectedMessage.edited_at?"معدّلة":"مخزّنة"}</strong></div></>:<p className="muted">اختر رسالة لعرض تفاصيلها.</p>}
          <div className="notice">تم تسجيل طلب الوصول في Audit Logs دون تخزين نص الرسالة داخل سجل التدقيق.</div>
        </aside>
      </div>
    </>}
  </div>;
}
