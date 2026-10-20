/* FANTASTON MANAGER — UI Nero/Oro. OAuth, RPC e schema Supabase dello STEP 5 invariati. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const loadingView = $("loadingView");
  const landingView = $("landingView");
  const appView = $("appView");
  const message = $("message");
  const loginButton = $("googleLogin");
  const logoutButton = $("logoutButton");
  const teamSetupForm = $("teamSetupForm");
  const saveTeamButton = $("saveTeamButton");
  const pages = new Map([
    ["home", $("homePage")],
    ["formazione", $("formazionePage")],
    ["giocatori", $("giocatoriPage")],
    ["classifica", $("classificaPage")],
    ["profilo", $("profiloPage")],
    ["admin", $("adminPage")]
  ]);
  const roleLabels = { POR: "Portiere", DIF: "Difensore", CC: "Centrocampista", ATT: "Attaccante" };

  let client;
  let currentUserId = null;
  let isAdmin = false;
  let currentPage = "home";
  let renderVersion = 0;
  let playersRequestVersion = 0;

  function showView(view) {
    loadingView.hidden = view !== "loading";
    landingView.hidden = view !== "landing";
    appView.hidden = view !== "app";
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
      throw new Error("Configura js/config.js con URL e Publishable key del progetto Supabase.");
    }
    if (!window.supabase?.createClient) {
      throw new Error("Supabase non è stato caricato. Verifica la connessione Internet.");
    }
    return c;
  }

  function setPage(name, { scroll = true } = {}) {
    if (!currentUserId || !pages.has(name)) return;
    if (name === "admin" && !isAdmin) return;
    currentPage = name;
    for (const [key, page] of pages) page.hidden = key !== name;
    document.querySelectorAll("[data-nav]").forEach((button) => {
      const active = button.dataset.nav === name;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (name === "giocatori") void loadPublicPlayers();
    if (scroll) window.scrollTo({ top: 0, behavior: "instant" });
  }

  function displayTeamSetup(hasTeam) {
    $("setupPanel").hidden = hasTeam;
    $("readyPanel").hidden = !hasTeam;
    $("teamNameInput").disabled = hasTeam;
    $("confirmTeamName").disabled = hasTeam;
    saveTeamButton.disabled = hasTeam;
  }

  function setTeamName(teamName) {
    $("teamName").textContent = teamName;
    $("dashboardTeamName").textContent = teamName;
    displayTeamSetup(true);
  }

  async function renderUser(user) {
    const thisRender = ++renderVersion;
    clearError();
    currentUserId = user?.id || null;
    isAdmin = false;
    $("sideAdminLink").hidden = true;
    $("gotoAdmin").hidden = true;
    window.FANTASTON_ADMIN?.hide();

    if (!user) {
      teamSetupForm.reset();
      showView("landing");
      loginButton.disabled = false;
      return;
    }

    showView("loading");
    const name = user.user_metadata?.full_name
      || user.user_metadata?.name
      || user.email?.split("@")[0]
      || "Fantallenatore";
    $("userName").textContent = name;
    $("userEmail").textContent = user.email || "";
    $("avatar").textContent = name.trim().charAt(0).toUpperCase() || "A";
    $("helloName").textContent = name.trim().split(/\s+/)[0] || "Fantallenatore";
    $("setupPanel").hidden = true;
    $("readyPanel").hidden = true;
    $("adminBadge").hidden = true;

    const { data: profile, error } = await client.from("profiles")
      .select("team_name, role").eq("id", user.id).maybeSingle();
    if (thisRender !== renderVersion) return;

    if (error || !profile) {
      showView("app");
      setPage("profilo");
      reportError(error
        ? "Accesso effettuato, ma non riesco a leggere il profilo: " + error.message
        : "Il profilo non esiste in public.profiles. Controlla il trigger handle_new_user.");
      return;
    }

    isAdmin = profile.role === "admin";
    $("adminBadge").hidden = !isAdmin;
    $("sideAdminLink").hidden = !isAdmin;
    $("gotoAdmin").hidden = !isAdmin;
    if (isAdmin) window.FANTASTON_ADMIN?.show(client);

    if (profile.team_name) setTeamName(profile.team_name);
    else {
      $("dashboardTeamName").textContent = "Da configurare";
      displayTeamSetup(false);
    }

    showView("app");
    setPage(profile.team_name ? "home" : "profilo");
  }

  function friendlySaveError(error) {
    if (error?.code === "23505") return "Nome fantasquadra già usato: scegline un altro.";
    if (error?.code === "42883") return "Manca la funzione register_team_name. Controlla lo SQL dello STEP 4.";
    if (error?.code === "42501") return "Permesso negato: verifica la sessione e la funzione SQL.";
    if (/nome già impostato/i.test(error?.message || "")) return "Il nome risulta già registrato. Ricarica la pagina.";
    return "Salvataggio non riuscito: " + (error?.message || "errore sconosciuto");
  }

  async function saveTeam(event) {
    event.preventDefault();
    clearError();
    if (!currentUserId) return reportError("Sessione scaduta, esegui nuovamente l'accesso.");
    const value = $("teamNameInput").value.trim().replace(/\s+/g, " ");
    if (value.length < 3 || value.length > 32) return reportError("Il nome della squadra deve contenere 3–32 caratteri.");
    if (!$("confirmTeamName").checked) return reportError("Conferma che il nome scelto sarà definitivo.");

    const requestedBy = currentUserId;
    saveTeamButton.disabled = true;
    saveTeamButton.textContent = "Salvataggio…";
    try {
      const { data: savedName, error } = await client.rpc("register_team_name", { p_team_name: value });
      if (error) throw error;
      if (requestedBy !== currentUserId) return;
      setTeamName(savedName);
      teamSetupForm.reset();
      setPage("home");
    } catch (error) {
      if (requestedBy === currentUserId) reportError(friendlySaveError(error));
    } finally {
      saveTeamButton.textContent = "Conferma la mia squadra";
      if (!$("setupPanel").hidden) saveTeamButton.disabled = false;
    }
  }

  function make(tag, cls, text) {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text !== undefined) element.textContent = String(text);
    return element;
  }

  function playerRow(player) {
    const row = make("article", "public-player");
    const avatar = make("div", "public-player-avatar", player.name.trim().charAt(0).toUpperCase());
    if (player.photo_url && /^https:\/\//i.test(player.photo_url)) {
      const img = document.createElement("img");
      img.src = player.photo_url;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => img.remove(), { once: true });
      avatar.append(img);
    }
    const info = make("div", "public-player-info");
    info.append(make("strong", "", player.name), make("span", "", roleLabels[player.role] || player.role));
    const price = make("div", "public-player-price", player.price);
    price.append(make("small", "", "CREDITI"));
    row.append(avatar, info, price);
    return row;
  }

  async function loadPublicPlayers() {
    if (!client || !currentUserId) return;
    const requestedBy = currentUserId;
    const generation = ++playersRequestVersion;
    const list = $("publicPlayerList");
    list.replaceChildren(make("p", "inline-status", "Caricamento rosa…"));
    try {
      const { data, error } = await client.from("players")
        .select("id,name,role,price,photo_url,active")
        .eq("active", true).order("name", { ascending: true });
      if (error) throw error;
      if (requestedBy !== currentUserId || generation !== playersRequestVersion) return;
      list.replaceChildren();
      $("publicPlayerCount").textContent = `${data?.length || 0} GIOCATORI`;
      if (!data?.length) list.append(make("p", "inline-status", "Nessun giocatore attivo nell'anagrafica."));
      else for (const p of data) list.append(playerRow(p));
    } catch (error) {
      if (requestedBy !== currentUserId || generation !== playersRequestVersion) return;
      list.replaceChildren(make("p", "inline-status", "Non riesco a caricare la rosa: " + error.message));
    }
  }

  async function init() {
    showView("loading");
    try {
      const c = validateConfig();
      client = window.supabase.createClient(c.supabaseUrl, c.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });

      document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => {
        clearError();
        setPage(button.dataset.nav);
      }));
      teamSetupForm.addEventListener("submit", saveTeam);
      loginButton.addEventListener("click", async () => {
        clearError();
        loginButton.disabled = true;
        try {
          const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: c.appUrl } });
          if (error) throw error;
        } catch (error) {
          reportError("Impossibile avviare l'accesso con Google: " + error.message);
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
          reportError("Impossibile uscire: " + error.message);
        } finally {
          logoutButton.disabled = false;
        }
      });
      const { data, error } = await client.auth.getUser();
      if (error && !/session missing/i.test(error.message)) console.warn("Supabase Auth:", error.message);
      await renderUser(data?.user || null);
      const params = new URLSearchParams(window.location.search);
      if (params.has("error_description")) reportError("Google OAuth: " + params.get("error_description"));
    } catch (error) {
      console.error(error);
      showView("landing");
      loginButton.disabled = true;
      reportError(error.message);
    }
  }

  init();
})();
