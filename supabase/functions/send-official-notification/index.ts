import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({error:"Unauthorized"}), {status:401,headers:{...cors,"Content-Type":"application/json"}});
    const userClient = createClient(url, anon, {global:{headers:{Authorization:auth}}});
    const {data:{user},error:userError}=await userClient.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({error:"Unauthorized"}), {status:401,headers:{...cors,"Content-Type":"application/json"}});
    const admin = createClient(url, serviceKey);
    const {data:roles,error:rolesError}=await admin.from("admin_user_roles").select("role_id").eq("user_id",user.id).is("disabled_at",null);
    if (rolesError) throw rolesError;
    const roleIds=(roles??[]).map((r)=>r.role_id).filter((r)=>r!=="USER");
    if (!roleIds.length) return new Response(JSON.stringify({error:"Admin access required"}), {status:403,headers:{...cors,"Content-Type":"application/json"}});
    const {data:perms,error:permError}=await admin.from("role_permissions").select("permission_id").in("role_id",roleIds);
    if (permError) throw permError;
    if (!roleIds.includes("SUPER_ADMIN") && !(perms??[]).some((p)=>["notifications.manage","notifications.send","settings.manage"].includes(p.permission_id))) return new Response(JSON.stringify({error:"Missing notification permission"}), {status:403,headers:{...cors,"Content-Type":"application/json"}});
    const input=await req.json();
    const title=String(input.title??"").trim().slice(0,120);
    const body=String(input.body??"").trim().slice(0,2000);
    const contentType=["text","image","link","html"].includes(input.content_type)?input.content_type:"text";
    const contentUrl=input.content_url?String(input.content_url).trim().slice(0,2000):null;
    const htmlContent=contentType==="html"&&input.html_content?String(input.html_content).slice(0,10000):null;
    const targetType=input.target_type==="user"?"user":"all";
    const requestedTarget=targetType==="user"?String(input.target_user_id??"").trim():null;
    let targetId:string|null=null;
    if (targetType==="user" && requestedTarget) {
      const profileQuery = /^\\d+$/.test(requestedTarget) ? admin.from("profiles").select("id").eq("public_id", Number(requestedTarget)).maybeSingle() : admin.from("profiles").select("id").eq("id", requestedTarget).maybeSingle();
      const {data:targetProfile,error:targetError}=await profileQuery;
      if(targetError) throw targetError;
      targetId=targetProfile?.id??null;
    }
    if (!title || (targetType==="user"&&(!requestedTarget||!targetId))) return new Response(JSON.stringify({error:"Title and target user ID are required"}), {status:400,headers:{...cors,"Content-Type":"application/json"}});
    if (contentType==="link" && contentUrl && !/^https:\/\//i.test(contentUrl)) return new Response(JSON.stringify({error:"Links must use HTTPS"}), {status:400,headers:{...cors,"Content-Type":"application/json"}});
    const {data:message,error:insertError}=await admin.from("official_messages").insert({title,body,content_type:contentType,content_url:contentUrl,html_content:htmlContent,target_type:targetType,target_user_id:targetId,created_by:user.id,pinned:true}).select("id").single();
    if (insertError) throw insertError;
    let tokenQuery=admin.from("push_tokens").select("expo_push_token");
    if (targetType==="user") tokenQuery=tokenQuery.eq("user_id",targetId!);
    const {data:tokens,error:tokenError}=await tokenQuery;
    if (tokenError) throw tokenError;
    const messages=(tokens??[]).map((t)=>({to:t.expo_push_token,sound:"default",title,body:body||title,data:{officialMessageId:message.id,contentType,contentUrl},channelId:"official"}));
    let sent=0;
    for(let i=0;i<messages.length;i+=100){
      const response=await fetch("https://exp.host/--/api/v2/push/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(messages.slice(i,i+100))});
      if(response.ok) sent+=messages.slice(i,i+100).length;
    }
    return new Response(JSON.stringify({ok:true,message_id:message.id,devices:messages.length,sent}),{headers:{...cors,"Content-Type":"application/json"}});
  } catch (error) {
    return new Response(JSON.stringify({error:error instanceof Error?error.message:"Unexpected error"}),{status:500,headers:{...cors,"Content-Type":"application/json"}});
  }
});
