(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const section = $("adminSection");
  const form = $("playerForm");
  const list = $("playerList");
  const refresh = $("refreshPlayers");
  const saveButton = $("playerSaveButton");
  const cancelButton = $("playerCancelButton");
  const feedback = $("playerFormMessage");
  const allowedRoles = new Set(["POR", "DIF", "CC", "ATT"]);
  let client = null;
  let players = [];
  let generation = 0;
  let bound = false;

  function say(text, isError = false) {
    feedback.textContent = text;
    feedback.classList.toggle("is-error", isError);
    feedback.hidden = !text;
  }

  function make(tag, className, content) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = String(content);
    return el;
  }

  function resetForm() {
    form.reset();
    $("playerId").value = "";
    $("playerFormTitle").textContent = "Nuovo calciatore";
    saveButton.textContent = "Aggiungi giocatore";
    cancelButton.hidden = true;
    say("");
  }

  function rowFor(player) {
    const row = make("div", `admin-player-row${player.active ? "" : " is-inactive"}`);
    const avatar = make("div", "admin-avatar", player.name.trim().charAt(0).toUpperCase());
    if (player.photo_url && /^https:\/\//i.test(player.photo_url)) {
      const image = document.createElement("img");
      image.src = player.photo_url;
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => image.remove(), { once: true });
      avatar.append(image);
    }
    const info = make("div", "admin-player-info");
    info.append(make("strong", "", player.name));
    const details = make("span");
    const role = make("span", "admin-role", player.role);
    details.append(role, document.createTextNode(`${player.price} crediti${player.active ? "" : " · INATTIVO"}`));
    info.append(details);

    const buttons = make("div", "admin-player-buttons");
    const edit = make("button", "admin-mini-btn", "Modifica");
    edit.type = "button";
    edit.dataset.playerAction = "edit";
    edit.dataset.playerId = String(player.id);
    const status = make("button", "admin-mini-btn", player.active ? "Disattiva" : "Riattiva");
    status.type = "button";
    status.dataset.playerAction = "toggle";
    status.dataset.playerId = String(player.id);
    buttons.append(edit, status);
    row.append(avatar, info, buttons);
    return row;
  }

  function render() {
    $("playerCount").textContent = String(players.length);
    list.replaceChildren();
    if (!players.length) {
      list.append(make("p", "admin-empty", "Nessun calciatore ancora inserito."));
      return;
    }
    for (const player of players) list.append(rowFor(player));
  }

  async function loadPlayers() {
    if (!client || section.hidden) return;
    const requestGeneration = generation;
    refresh.disabled = true;
    list.replaceChildren(make("p", "admin-empty", "Caricamento giocatori…"));
    try {
      const { data, error } = await client.from("players")
        .select("id,name,role,price,photo_url,active")
        .order("name", { ascending: true });
      if (error) throw error;
      if (requestGeneration !== generation) return;
      players = data || [];
      render();
    } catch (error) {
      if (requestGeneration !== generation) return;
      list.replaceChildren(make("p", "admin-empty", "Impossibile caricare i giocatori: " + error.message));
    } finally {
      if (requestGeneration === generation) refresh.disabled = false;
    }
  }

  async function savePlayer(event) {
    event.preventDefault();
    say("");
    if (!client || section.hidden) return;
    const id = $("playerId").value;
    const name = $("playerName").value.trim().replace(/\s+/g, " ");
    const role = $("playerRole").value;
    const price = Number($("playerPrice").value);
    const photoUrl = $("playerPhoto").value.trim();
    if (name.length < 2 || name.length > 70 || !allowedRoles.has(role)
        || !Number.isInteger(price) || price < 1 || price > 90
        || (photoUrl && (!/^https:\/\//i.test(photoUrl) || photoUrl.length > 500))) {
      say("Verifica nome, ruolo, prezzo (1–90) e link foto HTTPS.", true);
      return;
    }
    const requestGeneration = generation;
    saveButton.disabled = true;
    saveButton.textContent = "Salvataggio…";
    try {
      const { error } = await client.rpc("admin_save_player", {
        p_player_id: id ? Number(id) : null,
        p_name: name,
        p_role: role,
        p_price: price,
        p_photo_url: photoUrl || null
      });
      if (error) throw error;
      if (requestGeneration !== generation) return;
      resetForm();
      say(id ? "Calciatore aggiornato." : "Calciatore aggiunto.");
      await loadPlayers();
    } catch (error) {
      if (requestGeneration !== generation) return;
      say("Salvataggio non riuscito: " + error.message, true);
    } finally {
      if (requestGeneration === generation) {
        saveButton.disabled = false;
        saveButton.textContent = $("playerId").value ? "Salva modifiche" : "Aggiungi giocatore";
      }
    }
  }

  function beginEdit(player) {
    $("playerId").value = String(player.id);
    $("playerName").value = player.name;
    $("playerRole").value = player.role;
    $("playerPrice").value = String(player.price);
    $("playerPhoto").value = player.photo_url || "";
    $("playerFormTitle").textContent = "Modifica calciatore";
    saveButton.textContent = "Salva modifiche";
    cancelButton.hidden = false;
    say("");
    if (window.innerWidth < 851) form.scrollIntoView({ behavior: "smooth", block: "start" });
    $("playerName").focus({ preventScroll: true });
  }

  async function togglePlayer(player) {
    if (player.active && !window.confirm(`Disattivare ${player.name}? Le prestazioni storiche resteranno salvate.`)) return;
    const requestGeneration = generation;
    try {
      const { error } = await client.rpc("admin_set_player_active", {
        p_player_id: player.id,
        p_active: !player.active
      });
      if (error) throw error;
      if (requestGeneration !== generation) return;
      if ($("playerId").value === String(player.id)) resetForm();
      say(player.active ? "Giocatore disattivato." : "Giocatore riattivato.");
      await loadPlayers();
    } catch (error) {
      if (requestGeneration !== generation) return;
      say("Operazione non riuscita: " + error.message, true);
    }
  }

  function bind() {
    if (bound) return;
    bound = true;
    form.addEventListener("submit", savePlayer);
    cancelButton.addEventListener("click", resetForm);
    refresh.addEventListener("click", loadPlayers);
    list.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-player-action]");
      if (!btn || section.hidden || !client) return;
      const player = players.find((p) => p.id === Number(btn.dataset.playerId));
      if (!player) return;
      if (btn.dataset.playerAction === "edit") beginEdit(player);
      if (btn.dataset.playerAction === "toggle") void togglePlayer(player);
    });
  }

  function show(supabaseClient) {
    bind();
    client = supabaseClient;
    generation++;
    section.hidden = false;
    void loadPlayers();
  }

  function hide() {
    generation++;
    section.hidden = true;
    client = null;
    players = [];
    resetForm();
    list.replaceChildren();
    refresh.disabled = false;
  }

  window.FANTASTON_ADMIN = Object.freeze({ show, hide });
})();
