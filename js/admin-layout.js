/* FANTASTON — Admin Nero & Oro: dashboard e scheda partita.
   Presentazione/navigazione, nessuna scrittura al database.
   Riutilizza Admin Giocatori, Gestione Partite e Pagelle 

v1. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const create = (tag, className, text) => {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = String(text);
    return e;
  };
  const date = value => value ? new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Rome'
  }).format(new Date(value)) : '—';
  const friendly = text => text == null || text === '' ? 'Non definito' : String(text);
  let api = null;
  let currentMatch = null;
  let currentTab = 'partita';
  let currentArea = 'home';
  let loadedVotesMatch = null;
  let pending = 0;
  let mainBackButton = null;

  const pageMarkup = `
    <section id="famHome" class="fam-home" hidden aria-label="Amministrazione FANTASTON">
      <div class="fam-kicker">FANTASTON MANAGER</div>
      <h1>Amministrazione</h1>
      <p class="fam-muted">Gestione della stagione Aston Birra</p>
      <div class="fam-dashboard-grid">
        <button type="button" class="fam-tile" data-fam-area="partite"><span class="fam-tile-icon">▦</span><strong>Partite</strong><small>Calendario, formazioni e pagelle</small></button>
        <button type="button" class="fam-tile" data-fam-area="giocatori"><span class="fam-tile-icon">♙</span><strong>Giocatori</strong><small>Rosa, ruoli, foto e crediti</small></button>
        <button type="button" class="fam-tile" data-fam-area="classifica"><span class="fam-tile-icon">♛</span><strong>Classifica</strong><small>Consulta i punteggi generali</small></button>
        <button type="button" class="fam-tile" data-fam-area="impostazioni"><span class="fam-tile-icon">⚙</span><strong>Impostazioni</strong><small>Regolamento e comunicazioni</small></button>
      </div>
      <p class="fam-hint">Le pagelle in bozza non modificano la classifica generale.</p>
    </section>
    <div id="famWorkspace" hidden>
      <button type="button" id="famBackHome" class="fam-back">← Amministrazione</button>
      <section id="famPlayersView" hidden></section>
      <section id="famMatchesView" hidden>
        <div id="famMatchListView">
          <h2 class="fam-title">Partite</h2>
          <p class="fam-muted">Apri una scheda per gestire la giornata; da questo elenco puoi anche creare nuove partite e modificare le immagini.</p>
        </div>
        <div id="famDetail" hidden>
          <button type="button" id="famMatchBack" class="fam-back">← Tutte le partite</button>
          <header class="fam-detail-head">
            <div class="fam-kicker" id="famMatchLabel">PARTITA</div>
            <h2 id="famMatchTitle">Caricamento partita…</h2>
            <p id="famMatchSubtitle" class="fam-muted"></p>
            <p id="famMatchVoteStatus" class="fam-vote-status"></p>
          </header>
          <div class="fam-tabs" role="tablist" aria-label="Gestione della partita">
            <button type="button" role="tab" data-fam-tab="partita" aria-selected="true">Partita</button>
            <button type="button" role="tab" data-fam-tab="formazioni" aria-selected="false">Formazioni</button>
            <button type="button" role="tab" data-fam-tab="pagelle" aria-selected="false">Pagelle</button>
            <button type="button" role="tab" data-fam-tab="risultati" aria-selected="false">Risultati</button>
          </div>
          <section class="fam-tab-panel" id="famTabPartita" role="tabpanel">
            <div class="fam-card" id="famMatchSummary">Caricamento dati partita…</div>
            <button type="button" id="famToList" class="fam-outline">Torna all'elenco per modificare la partita</button>
          </section>
          <section class="fam-tab-panel" id="famTabFormazioni" role="tabpanel" hidden>
            <div class="fam-card"><h3>Formazioni ricevute</h3><p class="fam-muted">Formazioni inviate per questa partita. Le pagelle ufficiali sono gestite nella scheda Pagelle.</p><div id="famLineupList" aria-live="polite">Seleziona la scheda per caricare le formazioni.</div></div>
          </section>
          <section class="fam-tab-panel" id="famTabPagelle" role="tabpanel" hidden></section>
          <section class="fam-tab-panel" id="famTabRisultati" role="tabpanel" hidden>
            <div class="fam-card">
              <h3>Anteprima punteggi</h3>
              <p class="fam-muted">Calcolo di prova. Nessun punteggio viene pubblicato o aggiunto alla classifica.</p>
              <div id="famPreviewButtonHost"></div>
              <div id="famPreviewHost"></div>
            

<div class="fam-publish-note" id="famPublishNote">
  Verifica le pagelle e l'anteprima prima di pubblicare.
</div>

<button type="button"
        id="famPublishButton"
        class="fam-outline">
  Pubblica giornata
</button>

            </div>
          </section>
        </div>
      </section>
      <section id="famSettingsView" hidden>
        <h2 class="fam-title">Impostazioni</h2>
        <div class="fam-card"><h3>Regole Fantaston</h3><p>5 giocatori: POR, DIF, CC, ATT e JOLLY. Budget massimo 90 crediti; un capitano per formazione.</p><p>Bonus capitano: +50% del solo voto base. Un giocatore non sceso in campo vale 0 punti, senza sostituzioni.</p><p>La pubblicazione dei voti e l'aggiornamento classifica verranno abilitati dopo i controlli definitivi.</p></div>
        <button type="button" id="famOpenEvents" class="fam-outline">Gestisci comunicazioni in bacheca</button>
      </section>
      <section id="famEventsView" hidden>
        <h2 class="fam-title">Comunicazioni in bacheca</h2>
        <button type="button" id="famEventsBack" class="fam-back">← Impostazioni</button>
      </section>
    </div>`;

  function leavingOkay() {
    return !window.FANTASTON_VOTES?.canLeave || window.FANTASTON_VOTES.canLeave();
  }
  function hideAreas() {
    for (const id of ['famHome', 'famWorkspace', 'famPlayersView', 'famMatchesView', 'famSettingsView', 'famEventsView']) {
      $(id).hidden = true;
    }
  }
  function top() { window.scrollTo({ top: 0, behavior: 'instant' }); }

  // Un unico pulsante in cima alla pagina, con destinazione contestuale.
  function updateBackButton() {
    if (!mainBackButton) return;
    let target = 'profilo';
    let label = '← Torna al profilo';
    if (currentArea === 'partite') {
      if (currentMatch != null && $('famDetail') && !$('famDetail').hidden) {
        target = 'partite';
        label = '← Tutte le partite';
      } else {
        target = 'home';
        label = '← Amministrazione';
      }
    } else if (currentArea === 'eventi') {
      target = 'impostazioni';
      label = '← Impostazioni';
    } else if (currentArea !== 'home') {
      target = 'home';
      label = '← Amministrazione';
    }
    mainBackButton.textContent = label;
    mainBackButton.dataset.famBackTarget = target;
    if (target === 'profilo') mainBackButton.dataset.nav = 'profilo';
    else mainBackButton.removeAttribute('data-nav');
  }
  async function isAdmin() {
    if (!api) return false;
    const { data: { user }, error } = await api.auth.getUser();
    if (error || !user) return false;
    const { data, error: profileError } = await api.from('profiles').select('role').eq('id', user.id).maybeSingle();
    return !profileError && data?.role === 'admin';
  }
  async function showHome() {
    if (!leavingOkay()) return;
    if (!await isAdmin()) return;
    currentArea = 'home';
    currentMatch = null;
    hideAreas();
    $('famHome').hidden = false;
    updateBackButton();
    top();
  }
  function showArea(area) {
    if (!leavingOkay()) return;
    currentArea = area;
    currentMatch = null;
    hideAreas();
    $('famWorkspace').hidden = false;
    if (area === 'partite') {
      $('famMatchesView').hidden = false;
      $('famDetail').hidden = true;
      $('famMatchListView').hidden = false;
    } else if (area === 'giocatori') {
      $('famPlayersView').hidden = false;
    } else if (area === 'impostazioni') {
      $('famSettingsView').hidden = false;
    } else if (area === 'eventi') {
      $('famEventsView').hidden = false;
    }
    updateBackButton();
    top();
  }

  function showMatchSummary(match) {
    $('famMatchLabel').textContent = `PARTITA #${match.id}`;
    $('famMatchTitle').textContent = `Aston Birra — ${match.opponent}`;
    $('famMatchSubtitle').textContent = date(match.kickoff_at);
    $('famMatchVoteStatus').textContent = match.votes_published_at ? 'Pagelle pubblicate' : 'Pagelle in bozza';
    const box = $('famMatchSummary');
    box.replaceChildren();
    const rows = [
      ['Avversario', match.opponent],
      ['Data e ora', date(match.kickoff_at)],
      ['Stato sportivo', friendly(match.status)],
      ['Convocazioni / apertura formazioni', match.lineup_opened_at ? date(match.lineup_opened_at) : 'Non ancora aperte'],
      ['Scadenza formazioni', date(new Date(new Date(match.kickoff_at).getTime() - 7200000).toISOString())],
      ['Gol subiti', match.goals_conceded == null ? 'Da registrare nelle pagelle' : match.goals_conceded],
      ['Stato pagelle', match.votes_published_at ? 'Pubblicate' : 'Bozza']
    ];
    for (const [label, value] of rows) {
      const row = create('div', 'fam-data-row');
      row.append(create('span', '', label), create('strong', '', value));
      box.append(row);
    }
  }

  async function loadFormations(matchId) {
    const list = $('famLineupList');
    list.replaceChildren(create('p', 'fam-muted', 'Caricamento formazioni…'));
    const { data, error } = await api.from('lineups')
      .select('id,user_id,status,submitted_at')
      .eq('match_id', matchId).order('id', { ascending: true });
    if (currentMatch !== matchId || currentTab !== 'formazioni') return;
    list.replaceChildren();
    if (error) {
      list.append(create('p', 'fam-error', 'Non riesco a leggere le formazioni: ' + error.message));
      return;
    }
    if (!data?.length) {
      list.append(create('p', 'fam-muted', 'Nessuna formazione visibile per questa partita.'));
      return;
    }
    const userIds = [...new Set(data.map(x => x.user_id).filter(Boolean))];
    const teams = new Map();
    if (userIds.length) {
      const { data: profiles } = await api.from('profiles').select('id,team_name').in('id', userIds);
      for (const profile of profiles || []) teams.set(profile.id, profile.team_name);
    }
    const count = create('p', 'fam-muted', `${data.length} formazioni visibili`);
    list.append(count);
    for (const lineup of data) {
      const row = create('div', 'fam-lineup-row');
      const info = create('div', '');
      info.append(
        create('strong', '', teams.get(lineup.user_id) || `Formazione #${lineup.id}`),
        create('small', '', `#${lineup.id} · ${lineup.status} · ${date(lineup.submitted_at)}`)
      );
      row.append(info);
      list.append(row);
    }
  }

  // Compatta la scheda giocatore senza cambiare gli input usati dal salvataggio.
  function compactVoteRows() {
    const list = $('favPlayersList');
    if (!list) return;
    for (const row of list.querySelectorAll('.fav-player')) {
      if (row.querySelector('.fam-more-events')) continue;
      const grid = row.querySelector('.fav-stat-grid');
      if (!grid) continue;
      const details = create('details', 'fam-more-events');
      details.append(create('summary', '', 'Cartellini, rigori e altri eventi'));
      const extra = create('div', 'fam-more-grid');
      for (const field of ['yellow_cards', 'penalties_saved', 'penalties_missed', 'own_goals']) {
        const input = grid.querySelector(`[data-stat="${field}"]`);
        if (input) extra.append(input.closest('.fav-stat-field'));
      }
      const red = grid.querySelector('.fav-red-label');
      if (red) extra.append(red);
      details.append(extra);
      row.append(details);
    }
  }

  async function showTab(tab) {
    if (tab !== currentTab && !leavingOkay()) return;
    currentTab = tab;
    for (const name of ['partita', 'formazioni', 'pagelle', 'risultati']) {
      $(`famTab${name[0].toUpperCase() + name.slice(1)}`).hidden = name !== tab;
      const button = document.querySelector(`[data-fam-tab="${name}"]`);
      button.setAttribute('aria-selected', name === tab ? 'true' : 'false');
    }
    if (tab === 'formazioni') await loadFormations(currentMatch);
    if ((tab === 'pagelle' || tab === 'risultati') && loadedVotesMatch !== currentMatch) {
      loadedVotesMatch = currentMatch;
      if (window.FANTASTON_VOTES?.open) await window.FANTASTON_VOTES.open(currentMatch);
      compactVoteRows();
    }
  }

  async function openMatch(matchId, initialTab = 'partita') {
    if (!leavingOkay()) return;
    const id = Number(matchId);
    if (!Number.isSafeInteger(id) || id <= 0 || !await isAdmin()) return;
    currentArea = 'partite';
    currentMatch = id;
    loadedVotesMatch = null;
    $('famHome').hidden = true;
    $('famWorkspace').hidden = false;
    $('famMatchesView').hidden = false;
    $('famMatchListView').hidden = true;
    $('famDetail').hidden = false;
    $('famPlayersView').hidden = true;
    $('famSettingsView').hidden = true;
    $('famEventsView').hidden = true;
    updateBackButton();
    $('famMatchTitle').textContent = 'Caricamento partita…';
    $('famMatchSummary').textContent = 'Caricamento dati partita…';
    await showTab(initialTab);
    top();
    const request = ++pending;
    const { data, error } = await api.from('matches')
      .select('id,opponent,kickoff_at,status,lineup_opened_at,goals_conceded,votes_published_at')
      .eq('id', id).single();
    if (request !== pending || currentMatch !== id) return;
    if (error) {
      $('famMatchSummary').textContent = 'Errore caricamento partita: ' + error.message;
      return;
    }
    showMatchSummary(data);

$('famPublishButton').disabled =
  Boolean(data.votes_published_at);

$('famPublishNote').textContent =
  data.votes_published_at
    ? 'Risultati pubblicati ufficialmente.'
    : 'Verifica le pagelle e l’anteprima prima di pubblicare.';

  }

   
async function publishMatch() {
  const id = currentMatch;
  const button = $('famPublishButton');
  const note = $('famPublishNote');

  if (!id || !api || button.disabled) return;

  if (window.FANTASTON_VOTES?.hasUnsavedChanges?.()) {
    note.textContent = 'Salva prima le modifiche alle pagelle.';
    return;
  }

  button.disabled = true;
  let published = false;

  try {
    if (!await isAdmin()) {
      throw new Error('Accesso non autorizzato.');
    }

    // Controlla lo stato aggiornato della partita.
    const { data: match, error: matchError } = await api
      .from('matches')
      .select('opponent,kickoff_at,votes_published_at')
      .eq('id', id)
      .single();

    if (matchError) throw matchError;

    if (match.votes_published_at) {
      published = true;
      throw new Error('Questa giornata è già pubblicata.');
    }

    if (Date.now() < new Date(match.kickoff_at).getTime()) {
      throw new Error('La partita non è ancora iniziata.');
    }

    // Verifica tutte le formazioni inviate.
    const { data: scores, error: previewError } =
      await api.rpc('admin_preview_match_scores', {
        p_match_id: id
      });

    if (previewError) throw previewError;

    if (!Array.isArray(scores) || !scores.length) {
      throw new Error('Non risultano formazioni inviate.');
    }

    const missing = scores.find(
      s => s.ready !== true || s.total_points == null
    );

    if (missing) {
      throw new Error(
        `Formazione #${missing.lineup_id} incompleta: controlla le pagelle.`
      );
    }

    // Riepilogo prima della conferma.
    const detail = scores.map(s =>
      `#${s.lineup_id}: ${Number(s.total_points)
        .toLocaleString('it-IT')} punti`
    ).join('\n');

    const confirmed = window.confirm(
      `PUBBLICARE DEFINITIVAMENTE la partita #${id}` +
      ` contro ${match.opponent}?\n\n` +
      `${detail}\n\n` +
      'La classifica sarà aggiornata. ' +
      'La correzione di una giornata pubblicata ' +
      'non è ancora disponibile.'
    );

    if (!confirmed) return;

    note.textContent = 'Pubblicazione in corso…';

    // Pubblicazione atomica lato database.
    const { data, error } = await api.rpc(
      'admin_publish_match_scores',
      { p_match_id: id }
    );

    if (error) throw error;

    published = true;

    // Ricarica lo stato ufficiale della partita.
    await openMatch(id, 'risultati');

    note.textContent =
      `Giornata pubblicata. ${data.fantasquadre} ` +
      'fantasquadre aggiornate.';

  } catch (error) {
    note.textContent =
      `Pubblicazione non riuscita: ${error.message}`;
  } finally {
    button.disabled = published;
  }
}

  function init() {
    const page = $('adminPage');
    const players = $('adminSection');
    const matches = $('adminMatchesSection');
    const votes = $('adminVotesSection');
    const events = $('fhAdminEventSection');
    const config = window.FANTASTON_CONFIG;
    if (!page || !players || !matches || !votes || !events || !config?.supabaseUrl || !config?.supabasePublishableKey || !window.supabase?.createClient) return;
    api = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
    const root = create('div', 'fam-admin-root');
    root.innerHTML = pageMarkup; // solo markup statico interno, non dati utente
    const originalBack = page.querySelector('.back-button');
    mainBackButton = originalBack;
    page.insertBefore(root, originalBack?.nextSibling || page.firstChild);
    if (originalBack) {
      originalBack.addEventListener('click', event => {
        const target = originalBack.dataset.famBackTarget;
        if (!target || target === 'profilo') return; // usa navigazione esistente
        event.preventDefault();
        event.stopImmediatePropagation();
        if (target === 'partite') showArea('partite');
        else if (target === 'impostazioni') showArea('impostazioni');
        else void showHome();
      });
    }
    updateBackButton();
    // Spostiamo i pannelli ESISTENTI, con gli stessi ID, eventi e form.
    $('famPlayersView').append(players);
    $('famMatchListView').append(matches);
    $('famTabPagelle').append(votes);
    $('famEventsView').append(events);
    const previewButton = $('favPreview');
    if (previewButton) $('famPreviewButtonHost').append(previewButton);
    const preview = votes.querySelector('.fav-preview');
    if (preview) $('famPreviewHost').append(preview);
    root.addEventListener('click', event => {

if (event.target.closest('#famPublishButton')) {
  void publishMatch();
  return;
}

      const card = event.target.closest('[data-fam-area]');
      if (card) {
        const area = card.dataset.famArea;
        if (area === 'classifica') {
          if (!leavingOkay()) return;
          const nav = document.querySelector('[data-nav="classifica"]');
          if (nav) nav.click();
        } else showArea(area);
        return;
      }
      if (event.target.closest('#famBackHome')) { void showHome(); return; }
      if (event.target.closest('#famMatchBack, #famToList')) { showArea('partite'); return; }
      const tab = event.target.closest('[data-fam-tab]');
      if (tab) { void showTab(tab.dataset.famTab); return; }
      if (event.target.closest('#famOpenEvents')) { showArea('eventi'); return; }
      if (event.target.closest('#famEventsBack')) { showArea('impostazioni'); }
    });
    // Protegge le pagelle non salvate anche quando si usa il menu generale.
    document.addEventListener('click', event => {
      const nav = event.target.closest('[data-nav]');
      if (nav && !page.hidden && nav.dataset.nav !== 'admin' && !leavingOkay()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    // L'app richiama questa pagina con la navigazione già esistente.
    document.addEventListener('click', event => {
      if (event.target.closest('[data-nav="admin"]')) {
        setTimeout(() => { void showHome(); }, 0);
      }
    });
    api.auth.onAuthStateChange((_event, session) => {
      if (!session) { hideAreas(); currentMatch = null; }
    });
  }

  window.FANTASTON_ADMIN_UI = Object.freeze({ openMatch });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
