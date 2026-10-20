(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const loadingPanel = $("loadingPanel");
  const loginPanel = $("loginPanel");
  const accountPanel = $("accountPanel");
  const message = $("message");
  const loginButton = $("googleLogin");
  const logoutButton = $("logoutButton");
  let client;

  function setView(view) {
    loadingPanel.hidden = view !== "loading";
    loginPanel.hidden = view !== "login";
    accountPanel.hidden = view !== "account";
  }

  function reportError(text) {
    message.textContent = text;
    message.hidden = false;
  }

  function clearError() {
    message.textContent = "";
    message.hidden = true;
  }

  function validateConfig() {
    const c = window.FANTASTON_CONFIG;
    if (!c || !/^https:\/\/[^\s]+\.supabase\.co$/.test(c.supabaseUrl)
      || c.supabaseUrl.includes("SOSTITUISCI")
      || !c.supabasePublishableKey || c.supabasePublishableKey.includes("SOSTITUISCI")) {
      throw new Error("Configura prima js/config.js con Project URL e Publishable key di Supabase.");
    }
    if (!window.supabase?.createClient) {
      throw new Error("Impossibile caricare la libreria Supabase dal CDN. Controlla la connessione.");
    }
    return c;
  }

  async function renderUser(user) {
    clearError();
    if (!user) {
      setView("login");
      return;
    }

    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Fantallenatore";
    $("userName").textContent = name;
    $("userEmail").textContent = user.email || "";
    $("avatar").textContent = name.charAt(0).toUpperCase();
    $("teamName").textContent = "Da configurare";
    $("teamHint").textContent = "Nel prossimo passaggio potrai scegliere il nome definitivo della tua squadra.";

    setView("account");
    const { data, error } = await client.from("profiles").select("team_name").eq("id", user.id).maybeSingle();
    if (error) {
      reportError("Accesso Google riuscito, ma non riesco a leggere il profilo: " + error.message);
      return;
    }
    if (!data) {
      reportError("Accesso Google riuscito, ma il profilo non esiste ancora in public.profiles. Controlla il trigger handle_new_user.");
      return;
    }
    if (data.team_name) {
      $("teamName").textContent = data.team_name;
      $("teamHint").textContent = "La tua squadra è associata al tuo account.";
    }
  }

  async function init() {
    setView("loading");
    try {
      const c = validateConfig();
      client = window.supabase.createClient(c.supabaseUrl, c.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });

      loginButton.addEventListener("click", async () => {
        clearError();
        loginButton.disabled = true;
        try {
          const { error } = await client.auth.signInWithOAuth({
            provider: "google", options: { redirectTo: c.appUrl }
          });
          if (error) throw error;
        } catch (error) {
          reportError("Impossibile avviare l'accesso Google: " + error.message);
          loginButton.disabled = false;
        }
      });

      logoutButton.addEventListener("click", async () => {
        clearError();
        logoutButton.disabled = true;
        try {
          const { error } = await client.auth.signOut();
          if (error) throw error;
          await renderUser(null);
        } catch (error) {
          reportError("Errore durante la disconnessione: " + error.message);
        } finally {
          logoutButton.disabled = false;
        }
      });

      // Il client recupera l'eventuale sessione restituita dal redirect OAuth.
      const { data, error } = await client.auth.getUser();
      if (error && !/session missing/i.test(error.message)) {
        // Nessuna sessione può essere normale al primo accesso.
        console.warn("Supabase Auth:", error.message);
      }
      await renderUser(data?.user || null);

      const params = new URLSearchParams(window.location.search);
      if (params.has("error_description")) {
        reportError("Google OAuth: " + params.get("error_description"));
      }
    } catch (error) {
      console.error(error);
      setView("login");
      loginButton.disabled = true;
      reportError(error.message);
    }
  }

  init();
})();
