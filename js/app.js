(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const loadingPanel = $("loadingPanel");
  const loginPanel = $("loginPanel");
  const accountPanel = $("accountPanel");
  const message = $("message");
  const loginButton = $("googleLogin");
  const logoutButton = $("logoutButton");
  const teamSetupForm = $("teamSetupForm");
  const saveTeamButton = $("saveTeamButton");
  let client;
  let currentUserId = null;
  let renderVersion = 0;

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
      throw new Error("Configura js/config.js con Project URL e Publishable key di Supabase.");
    }
    if (!window.supabase?.createClient) {
      throw new Error("Impossibile caricare Supabase dal CDN. Controlla la connessione.");
    }
    return c;
  }

  function displayTeamSetup(hasTeam) {
    $("setupPanel").hidden = hasTeam;
    $("readyPanel").hidden = !hasTeam;
    $("teamNameInput").disabled = hasTeam;
    $("confirmTeamName").disabled = hasTeam;
    saveTeamButton.disabled = hasTeam;
  }

  async function renderUser(user) {
    const thisRender = ++renderVersion;
    clearError();
    currentUserId = user?.id || null;

    if (!user) {
      window.FANTASTON_ADMIN?.hide();
      teamSetupForm.reset();
      setView("login");
      return;
    }

    const name = user.user_metadata?.full_name
      || user.user_metadata?.name
      || user.email?.split("@")[0]
      || "Fantallenatore";
    $("userName").textContent = name;
    $("userEmail").textContent = user.email || "";
    $("avatar").textContent = name.charAt(0).toUpperCase();
    $("setupPanel").hidden = true;
    $("readyPanel").hidden = true;
    $("adminBadge").hidden = true;
    window.FANTASTON_ADMIN?.hide();
    setView("account");

    const { data: profile, error } = await client
      .from("profiles")
      .select("team_name, role")
      .eq("id", user.id)
      .maybeSingle();

    // Evita che una risposta vecchia riappaia dopo un logout.
    if (thisRender !== renderVersion) return;

    if (error) {
      reportError("Login riuscito, ma non riesco a leggere il profilo: " + error.message);
      return;
    }
    if (!profile) {
      reportError("Il profilo non esiste in public.profiles. Controlla il trigger handle_new_user.");
      return;
    }

    $("adminBadge").hidden = profile.role !== "admin";
    if (profile.role === "admin") {
      window.FANTASTON_ADMIN?.show(client);
    }
    if (profile.team_name) {
      $("teamName").textContent = profile.team_name;
      displayTeamSetup(true);
    } else {
      displayTeamSetup(false);
    }
  }

  function friendlySaveError(error) {
    if (error?.code === "23505") return "Questo nome è già utilizzato. Scegline un altro.";
    if (error?.code === "42883") return "La funzione di registrazione non esiste: esegui prima lo SQL dello STEP 4.";
    if (error?.code === "42501") return "Permesso negato: verifica lo SQL dello STEP 4 e la sessione Google.";
    if (/nome già impostato/i.test(error?.message || "")) return "Hai già registrato una squadra. Aggiorna la pagina.";
    return "Non riesco a salvare il nome: " + (error?.message || "errore sconosciuto");
  }

  async function saveTeam(event) {
    event.preventDefault();
    clearError();
    if (!currentUserId) {
      reportError("Sessione scaduta: esegui nuovamente l'accesso.");
      return;
    }

    const value = $("teamNameInput").value.trim().replace(/\s+/g, " ");
    if (value.length < 3 || value.length > 32) {
      reportError("Il nome della fantasquadra deve contenere da 3 a 32 caratteri.");
      return;
    }
    if (!$("confirmTeamName").checked) {
      reportError("Conferma che il nome scelto sarà definitivo.");
      return;
    }

    saveTeamButton.disabled = true;
    saveTeamButton.textContent = "Salvataggio in corso…";
    const requestedBy = currentUserId;

    try {
      // Controlli di unicità e immutabilità eseguiti nella funzione SQL.
      const { data: savedName, error } = await client.rpc("register_team_name", {
        p_team_name: value
      });
      if (error) throw error;
      if (requestedBy !== currentUserId) return;

      $("teamName").textContent = savedName;
      displayTeamSetup(true);
      teamSetupForm.reset();
    } catch (error) {
      if (requestedBy === currentUserId) reportError(friendlySaveError(error));
    } finally {
      saveTeamButton.textContent = "Conferma la mia squadra";
      if (!$("setupPanel").hidden) saveTeamButton.disabled = false;
    }
  }

  async function init() {
    setView("loading");
    try {
      const c = validateConfig();
      client = window.supabase.createClient(c.supabaseUrl, c.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });

      teamSetupForm.addEventListener("submit", saveTeam);

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

      const { data, error } = await client.auth.getUser();
      if (error && !/session missing/i.test(error.message)) {
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
