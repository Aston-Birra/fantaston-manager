/* FANTASTON MANAGER - Pagelle ufficiali: gestione bozze (Admin)
   Utilizza le tabelle player_match_stats e matches e la RPC
   admin_save_match_vote_draft. La pubblicazione NON è implementata qui. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text);
    return el;
  };

  const roleName = { POR: 'PORTIERE', DIF: 'DIFENSORE', CC: 'CENTROCAMPISTA', ATT: 'ATTACCANTE' };
  const fields = [
    ['goals', 'Gol'],
    ['assists', 'Assist'],
    ['yellow_cards', 'Gialli'],
    ['penalties_saved', 'Rigori parati'],
    ['penalties_missed', 'Rigori sbagliati'],
    ['own_goals', 'Autogol']
  ];
  let api = null;
  let selectedMatch = null;
  let requestId = 0;
  let busy = false;
  let dirty = false;

  function say(message, error = false) {
    const output = $('favMessage');
    if (!output) return;
    output.textContent = message;
    output.classList.toggle('is-error', error);
    output.hidden = !message;
  }

  function updateCount() {
    const rows = [...$('favPlayersList').querySelectorAll('.fav-player')];
    const completed = rows.filter(row => row.querySelector('.fav-played').value !== '').length;
    $('favCompleted').textContent = `${completed} di ${rows.length} giocatori compilati`;
  }

  function updateRowState(row) {
    const mode = row.querySelector('.fav-played').value;
    const enabled = mode === 'yes' && !selectedMatch?.votes_published_at;
    for (const control of row.querySelectorAll('.fav-stat-input, .fav-red-card')) {
      control.disabled = !enabled;
    }
    row.classList.toggle('fav-not-played', mode === 'no');
    row.classList.toggle('fav-unset', mode === '');
    updateCount();
  }

  function numericField(name, label, value, isVote = false) {
    const wrap = make('label', 'fav-stat-field');
    const title = make('span', '', label);
    const input = make('input', 'fav-stat-input');
    input.dataset.stat = name;
    input.type = 'number';
    input.inputMode = isVote ? 'decimal' : 'numeric';
    input.min = '0';
    input.step = isVote ? '0.01' : '1';
    input.value = value === null || value === undefined ? '' : String(value);
    input.placeholder = isVote ? '—' : '0';
    input.autocomplete = 'off';
    wrap.append(title, input);
    return wrap;
  }

  function buildPlayerRow(player, stat) {
    const row = make('article', 'fav-player');
    row.dataset.playerId = String(player.id);

    const header = make('div', 'fav-player-head');
    const avatar = make('div', 'fav-avatar');
    const initial = (player.name || '?').trim().charAt(0).toUpperCase();
    avatar.textContent = initial;
    if (player.photo_url && /^https:\/\//i.test(player.photo_url)) {
      const img = make('img');
      img.src = player.photo_url;
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => { img.remove(); avatar.textContent = initial; }, { once: true });
      // Il CSS sovrappone la foto all'iniziale, senza mostrarle affiancate.
      avatar.append(img);
    }
    const identity = make('div', 'fav-identity');
    identity.append(
      make('strong', '', player.name),
      make('small', '', `${roleName[player.role] || player.role}${player.shirt_number == null ? '' : ' · N° ' + player.shirt_number}${player.active === false ? ' · INATTIVO' : ''}`)
    );
    const selectLabel = make('label', 'fav-presence-wrap');
    selectLabel.append(make('span', '', 'Presenza'));
    const presence = make('select', 'fav-played');
    for (const [value, label] of [['', 'Da compilare'], ['yes', 'Ha giocato'], ['no', 'Non ha giocato']]) {
      const option = make('option', '', label);
      option.value = value;
      presence.append(option);
    }
    presence.value = stat ? (stat.played ? 'yes' : 'no') : '';
    presence.disabled = Boolean(selectedMatch?.votes_published_at);
    selectLabel.append(presence);
    header.append(avatar, identity, selectLabel);

    const inputs = make('div', 'fav-stat-grid');
    inputs.append(numericField('base_vote', 'Voto base', stat?.base_vote, true));
    for (const [key, label] of fields) inputs.append(numericField(key, label, stat?.[key] ?? 0));

    const redLabel = make('label', 'fav-red-label');
    const red = make('input', 'fav-red-card');
    red.type = 'checkbox';
    red.checked = Boolean(stat?.red_card);
    redLabel.append(red, make('span', '', 'Espulsione'));
    inputs.append(redLabel);
    row.append(header, inputs);
    return row;
  }

  async function getAdmin() {
    const { data: { user }, error } = await api.auth.getUser();
    if (error || !user) return false;
    const { data, error: profileError } = await api.from('profiles')
      .select('role').eq('id', user.id).maybeSingle();
    return !profileError && data?.role === 'admin';
  }

  async function open(matchId) {
    if (!api || busy) return;
    if (dirty && !window.confirm('Ci sono modifiche non salvate. Vuoi cambiare partita?')) return;

    const id = Number(matchId);
    if (!Number.isInteger(id) || id <= 0) return;
    const section = $('adminVotesSection');
    const list = $('favPlayersList');
    if (!section || !list) return;

    const request = ++requestId;
    selectedMatch = null;
    dirty = false;
    say('');
    section.hidden = false;
    $('favMatchTitle').textContent = 'Caricamento partita...';
    list.replaceChildren(make('p', 'admin-empty', 'Caricamento pagelle...'));
    $('favSave').disabled = true;
    $('favPreview').disabled = true;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      if (!await getAdmin()) throw new Error('Accesso consentito soltanto agli amministratori.');

      const [matchResult, playersResult, statsResult] = await Promise.all([
        api.from('matches').select('id,opponent,kickoff_at,goals_conceded,votes_published_at')
          .eq('id', id).single(),
        api.from('players').select('id,name,role,shirt_number,photo_url,active')
          .order('name', { ascending: true }),
        api.from('player_match_stats').select('player_id,played,base_vote,goals,assists,yellow_cards,red_card,penalties_saved,penalties_missed,own_goals')
          .eq('match_id', id)
      ]);
      if (request !== requestId) return;
      if (matchResult.error) throw matchResult.error;
      if (playersResult.error) throw playersResult.error;
      if (statsResult.error) throw statsResult.error;

      selectedMatch = matchResult.data;
      $('favMatchTitle').textContent = `Aston Birra – ${selectedMatch.opponent} · #${id}`;
      $('favGoalsConceded').value = selectedMatch.goals_conceded ?? '';
      $('favGoalsConceded').disabled = Boolean(selectedMatch.votes_published_at);
      $('favLocked').hidden = !selectedMatch.votes_published_at;
      $('favSave').disabled = Boolean(selectedMatch.votes_published_at);
      $('favPreview').disabled = false;

      const stats = new Map((statsResult.data || []).map(item => [Number(item.player_id), item]));
      list.replaceChildren();
      for (const player of playersResult.data || []) {
        const row = buildPlayerRow(player, stats.get(Number(player.id)));
        list.append(row);
        updateRowState(row);
      }
      if (!list.children.length) list.append(make('p', 'admin-empty', 'Nessun calciatore presente.'));
      updateCount();
      dirty = false;
    } catch (error) {
      if (request !== requestId) return;
      list.replaceChildren(make('p', 'admin-empty', 'Impossibile caricare le pagelle.'));
      say(`Errore: ${error.message}`, true);
    }
  }

  function parseStat(input, isVote = false) {
    const raw = input.value.trim();
    if (raw === '') {
      if (isVote) throw new Error('Inserisci il voto base per ogni giocatore che ha giocato.');
      return 0;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || (!isVote && !Number.isInteger(value))) {
      throw new Error(`Valore non valido per ${input.dataset.stat}.`);
    }
    if (isVote && Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) {
      throw new Error('Il voto base può avere al massimo due cifre decimali.');
    }
    return value;
  }

  function collectStats() {
    const rows = [];
    for (const node of $('favPlayersList').querySelectorAll('.fav-player')) {
      const played = node.querySelector('.fav-played').value;
      if (!played) continue; // Non compilato: NON equivale a non sceso in campo.
      const playerId = Number(node.dataset.playerId);
      if (played === 'no') {
        rows.push({ player_id: playerId, played: false, base_vote: null,
          goals: 0, assists: 0, yellow_cards: 0, red_card: false,
          penalties_saved: 0, penalties_missed: 0, own_goals: 0 });
      } else {
        const get = key => parseStat(node.querySelector(`[data-stat="${key}"]`), key === 'base_vote');
        rows.push({ player_id: playerId, played: true,
          base_vote: get('base_vote'), goals: get('goals'), assists: get('assists'),
          yellow_cards: get('yellow_cards'), red_card: node.querySelector('.fav-red-card').checked,
          penalties_saved: get('penalties_saved'), penalties_missed: get('penalties_missed'),
          own_goals: get('own_goals') });
      }
    }
    return rows;
  }

  async function save() {
    if (!api || !selectedMatch || busy || selectedMatch.votes_published_at) return;
    let stats, goalsConceded;
    try {
      stats = collectStats();
      const input = $('favGoalsConceded').value.trim();
      goalsConceded = input === '' ? null : Number(input);
      if (goalsConceded !== null && (!Number.isInteger(goalsConceded) || goalsConceded < 0)) {
        throw new Error('Inserisci un numero intero di gol subiti, oppure lascia il campo vuoto.');
      }
    } catch (error) { say(error.message, true); return; }
    if (busy) return;
    busy = true;
    $('favSave').disabled = true;
    say('Salvataggio in corso...');
    try {
      const { data, error } = await api.rpc('admin_save_match_vote_draft', {
        p_match_id: selectedMatch.id,
        p_goals_conceded: goalsConceded,
        p_stats: stats
      });
      if (error) throw error;
      dirty = false;
      selectedMatch.goals_conceded = goalsConceded;
      say(`Bozza salvata: ${data} pagelle registrate o aggiornate. Nessun punteggio pubblicato.`);
    } catch (error) {
      say(`Salvataggio non riuscito: ${error.message}`, true);
    } finally {
      busy = false;
      $('favSave').disabled = false;
    }
  }

  async function preview() {
    if (!api || !selectedMatch || busy) return;
    if (dirty) { say('Salva prima le modifiche, poi aggiorna l’anteprima.', true); return; }
    const output = $('favPreviewResults');
    output.replaceChildren(make('p', 'admin-helper', 'Calcolo delle formazioni...'));
    try {
      // RPC protetta: vede tutte le formazioni, anche se le policy
      // RLS delle lineups limitano l'accesso diretto al solo proprietario.
      const { data: scores, error } = await api.rpc('admin_preview_match_scores', {
        p_match_id: selectedMatch.id
      });
      if (error) throw error;
      output.replaceChildren();
      if (!scores?.length) {
        output.append(make('p', 'admin-helper', 'Non risultano formazioni inviate.'));
        return;
      }
      for (const score of scores) {
        output.append(make('div', 'fav-preview-item', score.ready
          ? `Formazione #${score.lineup_id}: ${Number(score.total_points).toLocaleString('it-IT', { minimumFractionDigits: 2 })} fantapunti`
          : `Formazione #${score.lineup_id}: ancora incompleta (${score.missing_votes ?? '?'} pagelle mancanti${score.missing_match_result ? ', gol subiti non indicati' : ''}).`));
      }
    } catch (error) {
      output.replaceChildren(make('p', 'fav-error', `Anteprima non disponibile: ${error.message}`));
    }
  }

  function close() {
    if (dirty && !window.confirm('Ci sono modifiche non salvate. Vuoi chiudere?')) return;
    requestId++;
    $('adminVotesSection').hidden = true;
    selectedMatch = null;
    dirty = false;
    $('favPreviewResults').replaceChildren();
  }

  function init() {
    if (!$('adminVotesSection')) return;
    const config = window.FANTASTON_CONFIG;
    if (!config?.supabaseUrl || !config?.supabasePublishableKey || !window.supabase?.createClient) return;
    api = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);

    $('favClose').addEventListener('click', close);
    $('favSave').addEventListener('click', () => { void save(); });
    $('favPreview').addEventListener('click', () => { void preview(); });
    $('favGoalsConceded').addEventListener('input', () => { dirty = true; });
    $('favPlayersList').addEventListener('input', event => {
      if (event.target.closest('input, select')) dirty = true;
    });
    $('favPlayersList').addEventListener('change', event => {
      if (event.target.matches('.fav-played')) updateRowState(event.target.closest('.fav-player'));
    });
    api.auth.onAuthStateChange((_event, session) => {
      if (!session && $('adminVotesSection')) {
        $('adminVotesSection').hidden = true;
        selectedMatch = null;
        dirty = false;
      }
    });
  }
  window.FANTASTON_VOTES = Object.freeze({ open, canLeave: () => { if (!dirty) return true; if (!window.confirm('Ci sono modifiche alle pagelle non salvate. Vuoi uscire senza salvarle?')) return false; dirty = false; return true; } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
