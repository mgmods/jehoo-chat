"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type SplashRow = {
  id: string;
  image_url: string;
  storage_path: string;
  duration_seconds: number;
  updated_at: string;
};

export default function SplashSettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [userId, setUserId] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [current, setCurrent] = useState<SplashRow | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(5);

  const load = useCallback(async () => {
    if (!supabase) {
      setError("إعداد Supabase غير مكتمل.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      router.replace("/");
      return;
    }
    setUserId(user.id);
    const { data: roles, error: rolesError } = await supabase
      .from("admin_user_roles")
      .select("role_id")
      .eq("user_id", user.id)
      .is("disabled_at", null);
    if (rolesError) {
      setError(rolesError.message);
      setLoading(false);
      return;
    }
    const roleIds = (roles ?? []).map((row) => row.role_id as string).filter((role) => role !== "USER");
    if (!roleIds.length) {
      setError("هذا القسم يتطلب صلاحية settings.manage.");
      setLoading(false);
      return;
    }
    const { data: permissions, error: permissionsError } = await supabase
      .from("role_permissions")
      .select("permission_id")
      .in("role_id", roleIds);
    if (permissionsError) {
      setError(permissionsError.message);
      setLoading(false);
      return;
    }
    const canManage = (permissions ?? []).some((row) => row.permission_id === "settings.manage");
    setAllowed(canManage);
    if (!canManage) {
      setError("هذا القسم يتطلب صلاحية settings.manage.");
      setLoading(false);
      return;
    }
    const { data, error: settingsError } = await supabase
      .from("app_splash_settings")
      .select("id,image_url,storage_path,duration_seconds,updated_at")
      .eq("id", "default")
      .maybeSingle();
    if (settingsError) setError(settingsError.message);
    else if (data) {
      setCurrent(data as SplashRow);
      setDuration(Number(data.duration_seconds) || 5);
    } else {
      setCurrent(null);
      setDuration(5);
    }
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!supabase || !userId || !allowed) return;
    if (!current && !file) {
      setError("اختَر صورة أولاً.");
      return;
    }
    if (file && !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("الصيغ المسموحة: PNG أو JPG أو WEBP.");
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      setError("حجم الصورة يجب ألا يتجاوز 10 ميغابايت.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    let uploadedPath: string | null = null;
    try {
      let imageUrl = current?.image_url ?? "";
      let storagePath = current?.storage_path ?? "";
      if (file) {
        const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        uploadedPath = `splash/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("app-assets")
          .upload(uploadedPath, file, { contentType: file.type, cacheControl: "3600", upsert: false });
        if (uploadError) throw uploadError;
        const { data: publicData } = supabase.storage.from("app-assets").getPublicUrl(uploadedPath);
        imageUrl = publicData.publicUrl;
        storagePath = uploadedPath;
      }
      const { error: saveError } = await supabase.from("app_splash_settings").upsert({
        id: "default",
        image_url: imageUrl,
        storage_path: storagePath,
        duration_seconds: duration,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (saveError) throw saveError;
      if (file && current?.storage_path && current.storage_path !== storagePath) {
        await supabase.storage.from("app-assets").remove([current.storage_path]);
      }
      setNotice("تم تطبيق شاشة البداية. ستصل التغييرات للأجهزة المتصلة خلال لحظات، وستظهر أيضاً عند تشغيل التطبيق.");
      setFile(null);
      await load();
    } catch (e) {
      if (uploadedPath) await supabase.storage.from("app-assets").remove([uploadedPath]);
      setError(e instanceof Error ? e.message : "تعذر حفظ الإعدادات.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSplash() {
    if (!supabase || !current || !allowed) return;
    if (!window.confirm("حذف صورة شاشة البداية؟ سيعود التطبيق إلى الواجهة الافتراضية.")) return;
    setSaving(true);
    setError("");
    setNotice("");
    const { error: deleteError } = await supabase.from("app_splash_settings").delete().eq("id", "default");
    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }
    const { error: storageError } = current.storage_path
      ? await supabase.storage.from("app-assets").remove([current.storage_path])
      : { error: null };
    setCurrent(null);
    setFile(null);
    setDuration(5);
    setSaving(false);
    setNotice(storageError ? "تم إلغاء شاشة البداية، لكن تعذر حذف ملف الصورة من التخزين." : "تم حذف شاشة البداية والصورة من التخزين.");
  }

  return <main className="main" dir="rtl">
    <div className="topbar">
      <div><a href="/" className="muted">JEHOO CHAT / لوحة التحكم</a><h1 style={{margin:"8px 0 4px"}}>شاشة البداية (Splash)</h1><p className="muted">ارفع صورة تظهر عند تشغيل التطبيق، وحدد مدة عرضها.</p></div>
      <button className="secondary" onClick={() => router.push("/")}>العودة للوحة التحكم</button>
    </div>
    <div className="notice">الصورة الديناميكية تظهر داخل التطبيق بعد بدء تشغيله. شاشة Android الأصلية التي تظهر قبل تحميل JavaScript لا يمكن تبديلها فورياً من الداشبورد.</div>
    {error && <div className="notice error">{error}</div>}
    {notice && <div className="notice">{notice}</div>}
    {loading ? <section className="panel">جارٍ تحميل الإعدادات…</section> : allowed && <>
      <section className="panel" style={{maxWidth:760}}>
        <h2 className="section-title" style={{marginTop:0}}>صورة شاشة البداية</h2>
        {current && <div style={{marginBottom:18}}>
          <p className="muted">الصورة الحالية</p>
          <img src={current.image_url} alt="صورة شاشة البداية الحالية" style={{display:"block",width:"100%",maxWidth:320,maxHeight:420,objectFit:"contain",background:"#071019",borderRadius:16,border:"1px solid #263342"}} />
          <p className="muted">آخر تحديث: {new Date(current.updated_at).toLocaleString("ar")}</p>
        </div>}
        <label className="monitor-field" style={{display:"block",marginBottom:18}}>
          <span style={{display:"block",marginBottom:8}}>اختيار صورة جديدة (PNG / JPG / WEBP، حتى 10MB)</span>
          <input className="field" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        {file && <div className="muted" style={{marginBottom:16}}>الصورة المختارة: {file.name}</div>}
        <label style={{display:"block",marginBottom:8,fontWeight:700}}>مدة العرض: {duration} ثوانٍ</label>
        <input type="range" min={1} max={15} step={1} value={duration} onChange={(event) => setDuration(Number(event.target.value))} style={{width:"100%",maxWidth:420,marginBottom:20}} />
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <button className="primary" disabled={saving || (!file && !current)} onClick={() => void save()}>{saving ? "جارٍ الحفظ…" : "حفظ وتطبيق"}</button>
          {current && <button className="secondary" disabled={saving} onClick={() => void removeSplash()}>حذف الصورة وإلغاء Splash</button>}
        </div>
      </section>
    </>}
  </main>;
}
