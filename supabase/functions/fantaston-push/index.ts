import { createClient } from "npm:@supabase/supabase-js@2.49.10";
import webpush from "npm:web-push@3.6.7";

const projectUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(projectUrl, serviceKey, {auth:{persistSession:false,autoRefreshToken:false}});
const origins = new Set(["https://aston-birra.github.io","http://127.0.0.1:5500","http://localhost:5500"]);
const preferenceKinds = ["formations_open","lineup_reminder","scores_published","match_soon","admin_news"];

function validPushEndpoint(value:unknown):value is string {
  if(typeof value!=="string"||value.length<30||value.length>2048)return false;
  try {
    const u=new URL(value);
    const host=u.hostname.toLowerCase();
    const recognized=host==="fcm.googleapis.com"
      || host==="updates.push.services.mozilla.com"
      || host==="push.services.mozilla.com"
      || host==="web.push.apple.com"
      || host.endsWith(".push.apple.com")
      || host.endsWith(".notify.windows.com");
    return u.protocol==="https:" && recognized && !u.username && !u.password && (!u.port || u.port==="443");
  } catch {return false}
}

function respond(data:unknown,status=200,origin="") {
 const allowed = origins.has(origin) ? origin : "https://aston-birra.github.io";
 return new Response(JSON.stringify(data), {status,headers:{
  "Content-Type":"application/json","Cache-Control":"no-store",
  "Access-Control-Allow-Origin":allowed,"Vary":"Origin",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info,x-push-cron-secret",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
 }});
}
function errorResult(msg:string,status=400,origin=""){return respond({error:msg},status,origin);}
async function keys() {
 const {data, error}=await db.from("push_server_keys").select("public_key,private_key").eq("singleton",true).maybeSingle();
 if(error)throw error;
 if(data)return data;
 const pair=webpush.generateVAPIDKeys();
 const put=await db.from("push_server_keys").upsert({singleton:true,public_key:pair.publicKey,private_key:pair.privateKey},{onConflict:"singleton",ignoreDuplicates:true});
 if(put.error)throw put.error;
 const retrieved=await db.from("push_server_keys").select("public_key,private_key").eq("singleton",true).single();
 if(retrieved.error)throw retrieved.error;
 return retrieved.data;
}
async function authenticate(req:Request) {
 const token=(req.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)throw new Error("Login richiesto");
 const {data,error}=await db.auth.getUser(token);
 if(error||!data?.user)throw new Error("Sessione scaduta: effettua il login");
 return data.user.id as string;
}
async function isAdmin(userId:string){
 const r=await db.from("profiles").select("role").eq("id",userId).single();
 if(r.error)throw r.error;
 return r.data?.role==="admin";
}
async function send(destination:any, title:string, body:string, route:string){
 if(!validPushEndpoint(destination.endpoint))return {ok:false,permanent:true,error:"Unsupported push endpoint"};
 const pair=await keys();
 webpush.setVapidDetails("https://github.com/Aston-Birra/fantaston-manager",pair.public_key,pair.private_key);
 const subscription={endpoint:destination.endpoint,keys:{p256dh:destination.p256dh,auth:destination.auth_key}};
 try{
   await webpush.sendNotification(subscription,JSON.stringify({title,body,route}),{TTL:86400,urgency:"normal"});
   return {ok:true};
 }catch(e:any){
   const code=Number(e?.statusCode||0);
   if(code===404||code===410)await db.from("push_subscriptions").delete().eq("endpoint",destination.endpoint);
   return {ok:false,permanent:code===404||code===410,error:"Push transport "+(code||"error")};
 }
}
async function dispatch(){
 // Initialize VAPID keys server-side before any user enables notifications.
 await keys();
 const schedule=await db.rpc("push_schedule_due_events");
 if(schedule.error)throw schedule.error;
 const claimed=await db.rpc("push_claim_due",{p_limit:40});
 if(claimed.error)throw claimed.error;
 let processed=0, delivered=0;
 for(const item of claimed.data||[]){
   let issue="";
   try{
     const pref=await db.from("push_preferences").select("*").eq("user_id",item.user_id).maybeSingle();
     if(pref.error)throw pref.error;
     if(!preferenceKinds.includes(item.kind)||pref.data?.[item.kind]===false){
       // Permanently opted out; don't create a retry loop.
     }else{
       const subs=await db.from("push_subscriptions").select("endpoint,p256dh,auth_key").eq("user_id",item.user_id);
       if(subs.error)throw subs.error;
       for(const sub of (subs.data||[])){
         const response=await send(sub,item.title,item.body,item.route);
         if(response.ok)delivered++;
         else if(!response.permanent)issue=response.error||"Push failed";
       }
     }
   }catch(e:any){issue=String(e?.message||e).slice(0,250)}
   const ended=!issue||item.attempts>=4;
   const updated=await db.from("push_queue").update({
     status:ended?(issue?"failed":"sent"):"pending",
     error_text:issue||null,
     finished_at:ended?new Date().toISOString():null,
     next_attempt_at:new Date(Date.now()+Math.pow(2,item.attempts)*60000).toISOString()
   }).eq("id",item.id).eq("status","processing");
   if(updated.error)console.error("Queue status update failed",item.id,updated.error.message);
   processed++;
 }
 return {processed,delivered};
}
Deno.serve(async req=>{
 const origin=req.headers.get("Origin")||"";
 if(req.method==="OPTIONS")return respond({},200,origin);
 if(req.method!=="POST")return errorResult("Metodo non supportato",405,origin);
 if(origin&&!origins.has(origin))return errorResult("Origine non consentita",403,origin);
 let body:any;
 try{body=await req.json()}catch{return errorResult("JSON non valido",400,origin)}
 try{
   if(body.action==="dispatch"){
     const incoming=req.headers.get("x-push-cron-secret")||"";
     const {data,error}=await db.from("push_cron_secret").select("token").eq("singleton",true).single();
     if(error)throw error;
     // compare all bytes even for wrong input
     const real=data.token as string;
     let diff=real.length^incoming.length;
     for(let i=0;i<real.length;i++) diff|=real.charCodeAt(i)^(incoming.charCodeAt(i)||0);
     if(diff!==0)return errorResult("Accesso non consentito",403,origin);
     return respond(await dispatch(),200,origin);
   }
   const userId=await authenticate(req);
   if(body.action==="key"){
     const k=await keys();
     return respond({publicKey:k.public_key},200,origin);
   }
   if(body.action==="subscribe"){
     const sub=body.subscription;
     const endpoint=sub?.endpoint, p256dh=sub?.keys?.p256dh, authKey=sub?.keys?.auth;
     if(!validPushEndpoint(endpoint)||typeof p256dh!=="string"||p256dh.length<30||
         typeof authKey!=="string"||authKey.length<10) return errorResult("Iscrizione non valida",400,origin);
     const found=await db.from("push_subscriptions").select("user_id").eq("endpoint",endpoint).maybeSingle();
     if(found.error)throw found.error;
     if(found.data&&found.data.user_id!==userId)return errorResult("Dispositivo associato a un altro account",403,origin);
     const result=await db.from("push_subscriptions").upsert({
       endpoint,user_id:userId,p256dh,auth_key:authKey,user_agent:String(req.headers.get("user-agent")||"").slice(0,250),
       updated_at:new Date().toISOString()
     },{onConflict:"endpoint"});
     if(result.error)throw result.error;
     await db.from("push_preferences").upsert({user_id:userId},{onConflict:"user_id",ignoreDuplicates:true});
     return respond({success:true},200,origin);
   }
   if(body.action==="unsubscribe"){
     if(typeof body.endpoint!=="string")return errorResult("Iscrizione mancante",400,origin);
     const r=await db.from("push_subscriptions").delete().eq("endpoint",body.endpoint).eq("user_id",userId);
     if(r.error)throw r.error;
     return respond({success:true},200,origin);
   }
   if(body.action==="test"){
     const {data:cooldown,error:coolError}=await db.from("push_test_cooldowns").select("last_test_at").eq("user_id",userId).maybeSingle();
     if(coolError)throw coolError;
     if(cooldown&&Date.now()-new Date(cooldown.last_test_at).getTime()<60000)
       return errorResult("Riprova tra un minuto",429,origin);
     const subs=await db.from("push_subscriptions").select("endpoint,p256dh,auth_key").eq("user_id",userId).limit(10);
     if(subs.error)throw subs.error;
     if(!subs.data?.length)return errorResult("Attiva le notifiche sul dispositivo",400,origin);
     const bump=await db.from("push_test_cooldowns").upsert({user_id:userId,last_test_at:new Date().toISOString()});
     if(bump.error)throw bump.error;
     let delivered=0;
     for(const sub of subs.data){
       const response=await send(sub,"FANTASTON è pronto! ⚽","Notifica di prova ricevuta. Le tue notifiche sono attive.","profilo");
       if(response.ok)delivered++;
     }
     return delivered?respond({success:true,delivered},200,origin):errorResult("Invio non riuscito: verifica il permesso notifiche",502,origin);
   }
   if(body.action==="admin_news"){
     if(!(await isAdmin(userId)))return errorResult("Riservato agli amministratori",403,origin);
     const title=String(body.title||"").trim();
     const content=String(body.body||"").trim();
     if(title.length<3||title.length>90||content.length<5||content.length>240)
       return errorResult("Titolo e messaggio non validi",400,origin);
     const users=await db.from("profiles").select("id").not("team_name","is",null).limit(3000);
     if(users.error)throw users.error;
     const key=crypto.randomUUID();
     const inserts=(users.data||[]).map(u=>({
       user_id:u.id,kind:"admin_news",title,body:content,route:"home",event_key:"news:"+key+":"+u.id
     }));
     if(inserts.length){
       const out=await db.from("push_queue").insert(inserts);
       if(out.error)throw out.error;
     }
     return respond({success:true,queued:inserts.length},200,origin);
   }
   return errorResult("Azione non supportata",400,origin);
 }catch(e:any){
   console.error("Fantaston push error",String(e?.message||e).slice(0,350));
   const auth=String(e?.message||"").includes("Sessione")||String(e?.message||"").includes("Login");
   return errorResult(auth?"Effettua nuovamente il login":"Servizio notifiche non disponibile",auth?401:500,origin);
 }
});