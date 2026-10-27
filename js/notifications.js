/* FANTASTON - Web Push: consenso volontario, preferenze per utente. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const kinds = ["formations_open","lineup_reminder","scores_published","match_soon","admin_news"];
  let api, busy=false, loadedFor=null;

  function client() {
    if (api) return api;
    const c=window.FANTASTON_CONFIG;
    if(!c?.supabaseUrl||!c?.supabasePublishableKey||!window.supabase?.createClient)throw Error("Connessione Supabase non disponibile");
    api=window.supabase.createClient(c.supabaseUrl,c.supabasePublishableKey);
    return api;
  }
  function available() {
    return window.isSecureContext && ("Notification" in window) && ("serviceWorker" in navigator) && ("PushManager" in window);
  }
  function isIos() {return /iPad|iPhone|iPod/i.test(navigator.userAgent);}
  function installed() {return navigator.standalone===true || window.matchMedia("(display-mode: standalone)").matches;}
  function announce(msg,error=false) {
    const status=$("pushStatus");
    if (!status)return;
    status.textContent=msg;
    status.classList.toggle("push-error",error);
  }
  function setBusy(v) {
    busy=v;
    for(const id of ["pushEnable","pushDisable","pushTest","pushAdminSend"]){
      const el=$(id);
      if(el)el.disabled=v;
    }
  }
  async function user() {
    const {data,error}=await client().auth.getUser();
    if(error||!data?.user)throw Error("Accedi per gestire le notifiche.");
    return data.user;
  }
  async function invoke(action,extra={}) {
    const c=window.FANTASTON_CONFIG;
    const {data}=await client().auth.getSession();
    if(!data?.session?.access_token)throw Error("Sessione non disponibile: accedi di nuovo.");
    const res=await fetch(c.supabaseUrl+"/functions/v1/fantaston-push",{
      method:"POST",mode:"cors",
      headers:{
        "Content-Type":"application/json",
        "Authorization":"Bearer "+data.session.access_token,
        "apikey":c.supabasePublishableKey
      },
      body:JSON.stringify({action,...extra})
    });
    const body=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(body.error||"Errore del servizio notifiche ("+res.status+")");
    return body;
  }
  function decodeKey(str) {
    const normalized=str.replace(/-/g,"+").replace(/_/g,"/");
    const pad=normalized+"=".repeat((4-normalized.length%4)%4);
    const binary=atob(pad);
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return bytes;
  }
  async function existingSubscription() {
    if(!available())return null;
    const registration=await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  }
  function buttons(active) {
    if($("pushEnable"))$("pushEnable").hidden=active;
    if($("pushDisable"))$("pushDisable").hidden=!active;
    if($("pushTest"))$("pushTest").disabled=!active;
  }
  async function load() {
    if(!$("pushPanel"))return;
    try {
      const account=await user();
      if(!available()){
        buttons(false);
        $("pushEnable").disabled=true;
        announce("Questo browser non supporta le notifiche push. Usa una PWA supportata.",true);
        return;
      }
      if(isIos()&&!installed()){
        buttons(false);
        $("pushEnable").disabled=true;
        announce("Su iPhone apri il sito in Safari, aggiungilo alla schermata Home e avvia l'app dall'icona per ricevere notifiche.",false);
        return;
      }
      const sub=await existingSubscription();
      const active=Boolean(sub)&&Notification.permission==="granted";
      buttons(active);
      $("pushEnable").disabled=busy;
      announce(active ? "Notifiche attive su questo dispositivo." :
        Notification.permission==="denied"?"Permesso negato. Puoi modificarlo nelle impostazioni del dispositivo.":
        "Puoi attivare le notifiche da questo dispositivo.");
      if(loadedFor!==account.id){
        const {data,error}=await client().from("push_preferences").select(kinds.join(",")).eq("user_id",account.id).maybeSingle();
        if(error)throw error;
        for(const key of kinds){
          const input=$("pushPref_"+key);
          if(input)input.checked=data?.[key]!==false;
        }
        loadedFor=account.id;
      }
      await setAdminView(account.id);
    }catch(e){announce(e.message||"Errore caricamento preferenze",true);}
  }
  async function setAdminView(uid) {
    const admin=$("pushAdminPanel");
    if(!admin)return;
    const {data,error}=await client().from("profiles").select("role").eq("id",uid).single();
    if(error)return;
    admin.hidden=data?.role!=="admin";
  }
  async function enable() {
    if(busy)return;
    if(!available())return announce("Le notifiche non sono supportate su questo dispositivo.",true);
    if(isIos()&&!installed())return announce("Installa prima FANTASTON nella schermata Home.",true);
    // Deve essere richiesto direttamente dal tap dell'utente (regola iOS).
    const permission=Notification.permission==="default"
      ? await Notification.requestPermission() : Notification.permission;
    if(permission!=="granted"){
      announce("Autorizzazione alle notifiche non concessa.",true);
      return;
    }
    setBusy(true);
    try {
      await user();
      const response=await invoke("key");
      const registration=await navigator.serviceWorker.ready;
      let sub=await registration.pushManager.getSubscription();
      if(!sub){
        sub=await registration.pushManager.subscribe({
          userVisibleOnly:true,applicationServerKey:decodeKey(response.publicKey)
        });
      }
      await invoke("subscribe",{subscription:sub.toJSON()});
      buttons(true);
      announce("Notifiche attive! Usa «Invia prova» per verificarle.");
    }catch(e){
      announce("Attivazione non riuscita: "+(e.message||"errore"),true);
    }finally{setBusy(false);await load();}
  }
  async function disable(silent=false) {
    if(busy&&!silent)return;
    if(!silent)setBusy(true);
    try{
      const sub=await existingSubscription();
      if(sub){
        try{await invoke("unsubscribe",{endpoint:sub.endpoint});}
        finally{await sub.unsubscribe();}
      }
      buttons(false);
      if(!silent)announce("Notifiche disattivate su questo dispositivo.");
    }catch(e){if(!silent)announce("Impossibile disattivare: "+(e.message||"errore"),true);}
    finally{if(!silent){setBusy(false);await load();}}
  }
  async function test() {
    if(busy)return;
    setBusy(true);
    announce("Invio della notifica di prova…");
    try {
      const result=await invoke("test");
      announce("Test inviato a "+result.delivered+" dispositivo/i. Controlla le notifiche!");
    }catch(e){announce("Test non riuscito: "+(e.message||"errore"),true);}
    finally{setBusy(false);}
  }
  async function preference(event) {
    const checkbox=event.target;
    const key=checkbox?.dataset?.pushPreference;
    if(!kinds.includes(key))return;
    checkbox.disabled=true;
    try{
      const account=await user();
      const r=await client().from("push_preferences").upsert({
        user_id:account.id,[key]:checkbox.checked,updated_at:new Date().toISOString()
      },{onConflict:"user_id"});
      if(r.error)throw r.error;
      announce("Preferenza salvata.");
    }catch(e){
      checkbox.checked=!checkbox.checked;
      announce("Impossibile salvare la preferenza: "+(e.message||"errore"),true);
    }finally{checkbox.disabled=false;}
  }
  async function sendNews(event) {
    event.preventDefault();
    if(busy)return;
    const title=$("pushNewsTitle")?.value.trim();
    const body=$("pushNewsBody")?.value.trim();
    if(!title||!body)return;
    setBusy(true);
    try{
      const result=await invoke("admin_news",{title,body});
      $("pushAdminForm").reset();
      announce("Comunicazione inserita nella coda per "+result.queued+" utenti.");
    }catch(e){announce("Comunicazione non inviata: "+(e.message||"errore"),true);}
    finally{setBusy(false);}
  }
  function init(){
    if(!$("pushPanel"))return;
    $("pushEnable")?.addEventListener("click",()=>void enable());
    $("pushDisable")?.addEventListener("click",()=>void disable());
    $("pushTest")?.addEventListener("click",()=>void test());
    $("pushAdminForm")?.addEventListener("submit",event=>void sendNews(event));
    $("pushPrefs")?.addEventListener("change",event=>void preference(event));
    document.addEventListener("click",event=>{
      if(event.target.closest('[data-nav="profilo"]'))
        setTimeout(()=>void load(),80);
    });
    document.addEventListener("visibilitychange",()=>{if(!document.hidden&&!$("profiloPage")?.hidden)void load();});
    if(!$("profiloPage")?.hidden)void load();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
  else init();
  window.FANTASTON_NOTIFICATIONS=Object.freeze({load,disableForSignout:()=>disable(true)});
})();