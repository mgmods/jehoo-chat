"use client";

import { useEffect,useMemo,useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
type W={user_id:string;coins:number;updated_at:string};
type T={id:string;user_id:string;amount:number;balance_after:number|null;kind:string;status:string;created_at:string};
export default function WalletPage(){
 const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
 const [wallets,setWallets]=useState<W[]>([]),[tx,setTx]=useState<T[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 async function load(){if(!supabase)return;setLoading(true);setError("");const [w,t]=await Promise.all([supabase.from("wallets").select("user_id,coins,updated_at").order("coins",{ascending:false}).limit(100),supabase.from("wallet_transactions").select("id,user_id,amount,balance_after,kind,status,created_at").order("created_at",{ascending:false}).limit(100)]);if(w.error||t.error)setError((w.error||t.error)?.message||"تعذر التحميل");else{setWallets((w.data??[]) as W[]);setTx((t.data??[]) as T[])}setLoading(false)}
 useEffect(()=>{void load()},[supabase]);
 return <main className="main" dir="rtl"><div className="topbar"><div><a href="/" className="muted">JEHOO CHAT / لوحة التحكم</a><h1>المحافظ والمعاملات</h1><p className="muted">عرض أرصدة Coins وسجل العمليات. أي تعديل مالي يجب أن يمر عبر مسار خادمي مدقّق.</p></div><a className="secondary" href="/">رجوع</a></div>{error&&<div className="notice error">{error}</div>}{loading?<section className="panel">جارٍ التحميل…</section>:<><section className="panel" style={{marginBottom:24}}><h2>أعلى الأرصدة</h2>{wallets.map(w=><div key={w.user_id} style={{padding:"10px 0",borderBottom:"1px solid #263342"}}><strong>{Number(w.coins).toLocaleString("ar")} Coins</strong><div className="muted">{w.user_id}</div></div>)}{!wallets.length&&<p className="muted">لا توجد محافظ.</p>}</section><section className="panel"><h2>آخر المعاملات</h2>{tx.map(t=><div key={t.id} style={{padding:"10px 0",borderBottom:"1px solid #263342"}}><strong>{t.amount>0?"+":""}{Number(t.amount).toLocaleString("ar")} Coins</strong> · {t.kind} · {t.status}<div className="muted">{t.user_id} · الرصيد بعد العملية: {t.balance_after===null?"—":Number(t.balance_after).toLocaleString("ar")} · {new Date(t.created_at).toLocaleString("ar")}</div></div>)}{!tx.length&&<p className="muted">لا توجد معاملات.</p>}</section></>}</main>
}