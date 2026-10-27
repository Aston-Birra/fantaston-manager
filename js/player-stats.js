/* FANTASTON - Scheda statistiche del calciatore (soltanto giornate pubblicate). */
(() => {
  'use strict';

  const roleNames = {
    POR: 'Portiere', DIF: 'Difensore', CC: 'Centrocampista', ATT: 'Attaccante'
  };
  const number = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });
  const average = new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 1, maximumFractionDigits: 2
  });
  const make = (tag, cls, content) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (content !== undefined) el.textContent = String(content);
    return el;
  };
  const numeric = value => Number(value) || 0;
  const printed = value => value == null ? '—' : average.format(Number(value));
  const validPhoto = url => typeof url === 'string' && /^https:\/\/[^\s]+$/i.test(url);

  let overlay = null;
  let content = null;
  let closeButton = null;
  let requestNumber = 0;
  let previouslyFocused = null;
  let oldBodyOverflow = null;

  function close() {
    if (!overlay || overlay.hidden) return;
    requestNumber++;
    overlay.hidden = true;
    if (oldBodyOverflow !== null) {
      document.body.style.overflow = oldBodyOverflow;
      oldBodyOverflow = null;
    }
    if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    previouslyFocused = null;
  }

  function ensureModal() {
    if (overlay) return;
    overlay = make('div', 'ps-overlay');
    overlay.id = 'playerStatsModal';
    overlay.hidden = true;
    const dialog = make('section', 'ps-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'psTitle');

    const top = make('div', 'ps-topbar');
    top.append(make('span', 'ps-eyebrow', 'FANTASTON · STATISTICHE'));
    closeButton = make('button', 'ps-close', '×');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Chiudi statistiche giocatore');
    closeButton.addEventListener('click', close);
    top.append(closeButton);

    content = make('div', 'ps-content');
    content.id = 'psContent';
    content.setAttribute('aria-live', 'polite');
    dialog.append(top, content);
    overlay.append(dialog);
    document.body.append(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => {
      if (!overlay || overlay.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const focusable = [closeButton, ...content.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')]
        .filter(el => !el.disabled && el.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  function addPhoto(target, player) {
    const holder = make('div', 'ps-photo');
    const fallback = make('span', 'ps-photo-fallback', (player.name || '?').trim().charAt(0).toUpperCase());
    holder.append(fallback);
    if (validPhoto(player.photo_url)) {
      const img = make('img', 'ps-photo-image');
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => img.remove();
      img.src = player.photo_url;
      holder.append(img);
    }
    target.append(holder);
  }

  function metric(label, value, suffix = '') {
    const tile = make('div', 'ps-metric');
    tile.append(
      make('span', 'ps-metric-value', value == null ? '—' : String(value) + suffix),
      make('span', 'ps-metric-label', label)
    );
    return tile;
  }

  function historyItem(entry) {
    const card = make('article', 'ps-match');
    const head = make('div', 'ps-match-head');
    let date = 'Data da definire';
    if (entry.kickoff_at) {
      const d = new Date(entry.kickoff_at);
      if (!Number.isNaN(d.getTime())) {
        date = new Intl.DateTimeFormat('it-IT', {
          timeZone: 'Europe/Rome', day: 'numeric', month: 'short', year: 'numeric'
        }).format(d);
      }
    }
    const name = make('div', 'ps-match-name');
    name.append(make('strong', '', 'vs ' + (entry.opponent || 'Avversario')), make('span', '', date));
    const score = make('strong', 'ps-match-score',
      entry.played ? (entry.fantavote == null ? '—' : number.format(numeric(entry.fantavote))) + ' PT' : 'N.G.'
    );
    head.append(name, score);
    card.append(head);

    if (!entry.played) {
      card.append(make('p', 'ps-no-play', 'Non sceso in campo · 0 fantapunti'));
      return card;
    }

    const details = make('div', 'ps-match-details');
    const items = [
      ['Voto base', printed(entry.base_vote)],
      ['Gol', number.format(numeric(entry.goals))],
      ['Assist', number.format(numeric(entry.assists))]
    ];
    for (const [label, value] of items) {
      const item = make('span', 'ps-match-pill');
      item.append(make('span', '', label), make('strong', '', value));
      details.append(item);
    }
    const events = [];
    if (numeric(entry.yellow_cards)) events.push(number.format(numeric(entry.yellow_cards)) + ' ammonizioni');
    if (entry.red_card) events.push('Espulsione');
    if (numeric(entry.penalties_saved)) events.push(number.format(numeric(entry.penalties_saved)) + ' rigori parati');
    if (numeric(entry.penalties_missed)) events.push(number.format(numeric(entry.penalties_missed)) + ' rigori sbagliati');
    if (numeric(entry.own_goals)) events.push(number.format(numeric(entry.own_goals)) + ' autogol');
    card.append(details);
    if (events.length) card.append(make('p', 'ps-events', events.join(' · ')));
    return card;
  }

  function render(data) {
    const player = data.player;
    const summary = data.summary || {};
    const history = Array.isArray(data.history) ? data.history : [];
    const header = make('header', 'ps-hero');
    addPhoto(header, player);
    const info = make('div', 'ps-hero-info');
    info.append(make('p', 'ps-role', roleNames[player.role] || player.role || 'Calciatore'));
    const title = make('h2', 'ps-title', player.name || 'Calciatore');
    title.id = 'psTitle';
    info.append(title);
    const identifiers = make('div', 'ps-identifiers');
    identifiers.append(
      make('span', '', 'N° ' + (player.shirt_number ?? '—')),
      make('span', '', number.format(numeric(player.price)) + ' CREDITI')
    );
    info.append(identifiers);
    header.append(info);

    const sectionTitle = make('h3', 'ps-section-title', 'Rendimento stagionale');
    const summaryGrid = make('div', 'ps-metrics');
    const totalAppearances = numeric(summary.appearances);
    summaryGrid.append(
      metric('Presenze', number.format(totalAppearances)),
      metric('Gol', number.format(numeric(summary.goals))),
      metric('Assist', number.format(numeric(summary.assists))),
      metric('Media voto', printed(summary.average_vote)),
      metric('Media fantavoto', printed(summary.average_fantavote)),
      metric('Ammonizioni', number.format(numeric(summary.yellow_cards))),
      metric('Espulsioni', number.format(numeric(summary.red_cards))),
      metric('Rigori parati', number.format(numeric(summary.penalties_saved))),
      metric('Rigori sbagliati', number.format(numeric(summary.penalties_missed))),
      metric('Autogol', number.format(numeric(summary.own_goals)))
    );

    const note = make('p', 'ps-note',
      'Statistiche delle giornate con voti pubblicati. Medie calcolate sulle presenze; fantavoto senza bonus capitano.'
    );
    const historyTitle = make('h3', 'ps-section-title', 'Partita per partita');
    const historyList = make('div', 'ps-history');
    if (!history.length) {
      historyList.append(make('p', 'ps-empty', 'Nessuna statistica pubblicata per questo calciatore.'));
    } else {
      history.forEach(item => historyList.append(historyItem(item)));
    }
    content.replaceChildren(header, sectionTitle, summaryGrid, note, historyTitle, historyList);
  }

  async function open(client, playerId) {
    const id = Number(playerId);
    if (!client || !Number.isSafeInteger(id) || id <= 0) return;
    ensureModal();
    const request = ++requestNumber;
    if (overlay.hidden) {
      previouslyFocused = document.activeElement;
      oldBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    overlay.hidden = false;
    content.replaceChildren(make('p', 'ps-loading', 'Caricamento statistiche…'));
    closeButton.focus({ preventScroll: true });
    try {
      const { data, error } = await client.rpc('get_player_statistics', { p_player_id: id });
      if (error) throw error;
      if (request !== requestNumber || overlay.hidden) return;
      if (!data?.player) throw new Error('Dati del calciatore non disponibili');
      render(data);
    } catch (error) {
      if (request !== requestNumber || overlay.hidden) return;
      console.error('[Fantaston statistiche giocatore]', error);
      const message = make('p', 'ps-error', 'Statistiche non disponibili: ' + (error.message || 'riprova più tardi'));
      content.replaceChildren(message);
    }
  }

  window.FANTASTON_PLAYER_STATS = Object.freeze({ open, close });
})();