/* FANTASTON — Formazione temporanea: selezione + drag & drop mouse/touch.
   Nessun salvataggio su Supabase. */
(() => {
  'use strict';

  const SLOTS = ['POR', 'DIF', 'CC', 'ATT', 'JOLLY'];
  const LABEL = { POR: 'PORTIERE', DIF: 'DIFENSORE', CC: 'CENTROCAMPISTA', ATT: 'ATTACCANTE', JOLLY: 'JOLLY' };
  const $ = (selector, root = document) => root.querySelector(selector);
  const el = (tag, cls, txt) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (txt !== undefined) node.textContent = txt;
    return node;
  };
  const fmt = num => Number(num).toLocaleString('it-IT');
  const validPhoto = url => typeof url === 'string' && /^https?:\/\/\S+$/i.test(url);

  let api;
  let players = [];
  let picks = Object.fromEntries(SLOTS.map(slot => [slot, null]));
  let chosenSlot = null;
  let captainSlot = null;
  let initialized = false;
  let loading = false;
  let dragging = null;
  let toastTimeout;

  const total = () => SLOTS.reduce((sum, slot) => sum + (Number(picks[slot]?.price) || 0), 0);
  const freePlayers = () => players.filter(player => !SLOTS.some(slot => String(picks[slot]?.id) === String(player.id)));
  const fits = (player, slot) => !!player && SLOTS.includes(slot) && (slot === 'JOLLY' || player.role === slot);
  const budgetFits = (player, slot) => total() - (Number(picks[slot]?.price) || 0) + Number(player.price) <= 90;
  const findPlayer = id => players.find(player => String(player.id) === String(id));

  function notify(message) {
    const root = $('#formazionePage');
    if (!root) return;
    let toast = $('#fmDragToast', root);
    if (!toast) {
      toast = el('div', 'fm-drag-toast');
      toast.id = 'fmDragToast';
      toast.setAttribute('role', 'status');
      root.append(toast);
    }
    toast.textContent = message;
    toast.classList.add('fm-drag-toast-visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('fm-drag-toast-visible'), 2800);
  }

  function makeVisual(player, holder, fallbackClass) {
    if (validPhoto(player.photo_url)) {
      const img = el('img');
      img.src = player.photo_url;
      img.alt = holder.classList.contains('fm-card-frame') ? player.name : '';
      img.loading = 'lazy';
      img.draggable = false;
      img.onerror = () => {
        img.remove();
        holder.append(el('span', fallbackClass, player.name.slice(0, 2).toUpperCase()));
      };
      holder.append(img);
    } else {
      holder.append(el('span', fallbackClass, player.name.slice(0, 2).toUpperCase()));
    }
  }

  function render() {
    const root = $('#formazionePage');
    if (!root) return;

    for (const slot of SLOTS) {
      const wrap = $(`.fm-slot-${slot.toLowerCase()}`, root);
      if (!wrap) continue;
      wrap.dataset.slot = slot;
      const player = picks[slot];
      const old = $('.fm-card-frame, .fm-empty', wrap);
      const card = el('button', player ? 'fm-card-frame fm-pick-button' : 'fm-empty fm-pick-button');
      card.type = 'button';
      card.dataset.slot = slot;
      card.setAttribute('aria-label', player ? `Sostituisci ${player.name}` : `Scegli ${LABEL[slot]}`);
      if (player) makeVisual(player, card, 'fm-select-fallback');
      else {
        card.append(el('span', '', '+'));
        card.append(el('small', '', slot === 'JOLLY' ? 'QUALSIASI RUOLO' : 'AGGIUNGI'));
      }
      if (old) old.replaceWith(card);
      else wrap.insertBefore(card, $('.fm-player-hint', wrap));
      let hint = $('.fm-player-hint', wrap);
      if (!hint) { hint = el('span', 'fm-player-hint'); wrap.append(hint); }
      hint.textContent = player ? `${player.name.toUpperCase()} · ${fmt(player.price)} CR` : '';
      // La corona è un pulsante indipendente: non apre il selettore dei giocatori.
      let captainButton = $('.fm-captain-button', wrap);
      if (!captainButton) {
        captainButton = el('button', 'fm-captain-button');
        captainButton.type = 'button';
        captainButton.dataset.captainSlot = slot;
        wrap.append(captainButton);
      }
      const isCaptain = !!player && captainSlot === slot;
      wrap.classList.toggle('fm-is-captain', isCaptain);
      captainButton.hidden = !player;
      captainButton.classList.toggle('fm-captain-selected', isCaptain);
      captainButton.setAttribute('aria-pressed', String(isCaptain));
      captainButton.setAttribute('aria-label', isCaptain ? `Rimuovi ${player.name} come capitano` : `Nomina ${player?.name || ''} capitano`);
      captainButton.textContent = isCaptain ? '♛ CAPITANO' : '♛ SCEGLI CAPITANO';
      // Nasconde la vecchia scritta di anteprima, se presente.
      const captainHint = $('.fm-captain-hint', wrap);
      if (captainHint) captainHint.hidden = true;
    }

    const spent = total();
    const count = SLOTS.filter(slot => picks[slot]).length;
    const budget = $('.fm-budget-panel', root);
    if (budget) {
      const strong = budget.querySelectorAll('strong');
      if (strong[0]) strong[0].innerHTML = `${fmt(90 - spent)} <small>/ 90</small>`;
      if (strong[1]) strong[1].innerHTML = `${count} <small>/ 5</small>`;
      const bar = $('.fm-track span', budget);
      if (bar) bar.style.width = `${Math.min(100, 100 * spent / 90)}%`;
    }
    const heading = $('.fm-section-heading span:last-child', root);
    if (heading) heading.textContent = `${String(count).padStart(2, '0')} / 05`;
    const spentLabel = $('.fm-bottom-actions strong', root);
    if (spentLabel) spentLabel.innerHTML = `${fmt(spent)} <small>CR UTILIZZATI</small>`;
    const summary = $('.fm-bottom-actions > div > span', root);
    if (summary) {
      const captain = captainSlot ? picks[captainSlot] : null;
      summary.textContent = captain ? `Capitano: ${captain.name}` : 'Capitano da scegliere · nessun dato salvato';
    }

    const bench = $('#benchPlayers', root);
    if (bench) {
      const previousScroll = bench.scrollLeft;
      bench.replaceChildren();
      const free = freePlayers();
      for (const p of free) {
        const card = el('button', 'fm-bench-player');
        card.type = 'button';
        card.dataset.playerId = p.id;
        card.dataset.role = p.role;
        card.setAttribute('aria-label', `Trascina ${p.name} sul campo oppure tocca per scegliere il ruolo`);
        const visual = el('span', 'fm-bench-image');
        makeVisual(p, visual, 'fm-bench-avatar');
        card.append(visual, el('span', 'fm-bench-name', p.name), el('span', 'fm-bench-price', `${fmt(p.price)} CR`));
        bench.append(card);
      }
      if (!free.length) bench.append(el('p', 'fm-bench-loading', 'Nessun altro giocatore disponibile.'));
      bench.scrollLeft = previousScroll;
    }
  }

  function open(slot) {
    chosenSlot = slot;
    const modal = $('#fmSelectDialog');
    if (!modal) return;
    $('#fmSelectTitle').textContent = `Scegli ${LABEL[slot].toLowerCase()}`;
    $('#fmSelectSearch').value = '';
    fillOptions();
    modal.hidden = false;
    document.body.classList.add('fm-modal-open');
    $('#fmSelectSearch').focus();
  }

  function close() {
    const modal = $('#fmSelectDialog');
    if (modal) modal.hidden = true;
    document.body.classList.remove('fm-modal-open');
    chosenSlot = null;
  }

  function fillOptions() {
    if (!chosenSlot) return;
    const list = $('#fmSelectList');
    if (!list) return;
    list.replaceChildren();
    const q = $('#fmSelectSearch').value.toLocaleLowerCase('it-IT').trim();
    // Un titolare già assegnato allo slot può essere sostituito; non si può duplicare un altro titolare.
    const available = freePlayers().filter(p => fits(p, chosenSlot) && p.name.toLocaleLowerCase('it-IT').includes(q));
    for (const p of available) {
      const button = el('button', 'fm-option');
      button.type = 'button';
      button.dataset.playerId = p.id;
      button.append(el('span', 'fm-option-name', `${p.name} · ${p.role}`), el('strong', '', `${fmt(p.price)} CR`));
      if (!budgetFits(p, chosenSlot)) {
        button.disabled = true;
        button.title = 'Budget massimo di 90 crediti superato';
        button.append(el('small', '', 'Budget insufficiente'));
      }
      list.append(button);
    }
    if (!available.length) list.append(el('p', 'fm-bench-loading', 'Nessun giocatore disponibile per questo ruolo.'));
  }

  function assign(player, slot) {
    if (!fits(player, slot)) { notify(`Per ${LABEL[slot].toLowerCase()} serve un giocatore del ruolo corretto.`); return false; }
    if (SLOTS.some(key => key !== slot && String(picks[key]?.id) === String(player.id))) {
      notify('Questo giocatore è già schierato.'); return false;
    }
    if (!budgetFits(player, slot)) { notify('Budget insufficiente: massimo 90 crediti.'); return false; }
    // Se il capitano viene sostituito, la fascia torna disponibile.
    if (captainSlot === slot && String(picks[slot]?.id) !== String(player.id)) captainSlot = null;
    picks[slot] = player;
    render();
    return true;
  }

  function targetSlotAt(x, y) {
    const node = document.elementFromPoint(x, y);
    const wrap = node?.closest('#formazionePage .fm-slot');
    return wrap?.dataset.slot || null;
  }

  function clearHighlight() {
    document.querySelectorAll('#formazionePage .fm-slot.fm-drop-valid, #formazionePage .fm-slot.fm-drop-invalid')
      .forEach(node => node.classList.remove('fm-drop-valid', 'fm-drop-invalid'));
  }

  function highlight(x, y, player) {
    clearHighlight();
    const slot = targetSlotAt(x, y);
    if (!slot) return;
    const wrap = $(`#formazionePage .fm-slot-${slot.toLowerCase()}`);
    if (wrap) wrap.classList.add(fits(player, slot) && budgetFits(player, slot) ? 'fm-drop-valid' : 'fm-drop-invalid');
  }

  // Gestione Pointer Events: desktop (mouse) e mobile (touch) senza il drag HTML nativo.
  function onPointerDown(e) {
    if (dragging || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const card = e.target.closest('#formazionePage .fm-bench-player');
    if (!card) return;
    const player = findPlayer(card.dataset.playerId);
    if (!player) return;
    dragging = { pointerId: e.pointerId, player, originX: e.clientX, originY: e.clientY, active: false, card, ghost: null };
  }

  function onPointerMove(e) {
    if (!dragging || dragging.pointerId !== e.pointerId) return;
    const d = dragging;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.originX, e.clientY - d.originY) < 12) return;
      // Sull'asse orizzontale lasciamo scorrere la panchina naturalmente.
      if (Math.abs(e.clientX - d.originX) > Math.abs(e.clientY - d.originY) * 1.2) {
        dragging = null;
        return;
      }
      d.active = true;
      d.card.classList.add('fm-is-dragging');
      d.ghost = d.card.cloneNode(true);
      d.ghost.classList.add('fm-drag-ghost');
      d.ghost.removeAttribute('id');
      d.ghost.setAttribute('aria-hidden', 'true');
      document.body.append(d.ghost);
    }
    if (e.cancelable) e.preventDefault();
    d.ghost.style.left = `${e.clientX}px`;
    d.ghost.style.top = `${e.clientY}px`;
    highlight(e.clientX, e.clientY, d.player);
  }

  function finishPointer(e, cancel = false) {
    if (!dragging || dragging.pointerId !== e.pointerId) return;
    const d = dragging;
    dragging = null;
    d.card.classList.remove('fm-is-dragging');
    d.ghost?.remove();
    clearHighlight();
    if (cancel || !d.active) return;
    const slot = targetSlotAt(e.clientX, e.clientY);
    if (slot) assign(d.player, slot);
    else notify('Trascina il giocatore sopra uno slot del campo.');
  }

  async function load() {
    if (loading) return;
    loading = true;
    try {
      const c = window.FANTASTON_CONFIG;
      if (!c?.supabaseUrl || !c?.supabasePublishableKey || !window.supabase?.createClient)
        throw Error('Configurazione Supabase non disponibile');
      api ||= window.supabase.createClient(c.supabaseUrl, c.supabasePublishableKey);
      const { data: { user }, error: authError } = await api.auth.getUser();
      if (authError || !user) throw Error('Devi accedere con Google per scegliere i giocatori');
      const { data, error } = await api.from('players')
        .select('id,name,role,price,photo_url').eq('active', true).order('name');
      if (error) throw error;
      players = data || [];
      render();
    } catch (error) {
      const bench = $('#benchPlayers');
      if (bench) bench.textContent = `Impossibile caricare i giocatori: ${error.message}`;
      console.error('[Fantaston formazione]', error);
    } finally {
      loading = false;
    }
  }

  function init() {
    if (initialized || !$('#formazionePage')) return;
    initialized = true;
    const modal = el('div', 'fm-select-dialog');
    modal.id = 'fmSelectDialog';
    modal.hidden = true;
    modal.innerHTML = `<div class="fm-select-backdrop" data-close-dialog></div><section class="fm-select-panel" role="dialog" aria-modal="true" aria-labelledby="fmSelectTitle"><div class="fm-select-head"><h2 id="fmSelectTitle">Scegli giocatore</h2><button type="button" data-close-dialog aria-label="Chiudi">×</button></div><input id="fmSelectSearch" type="search" placeholder="Cerca un giocatore..." autocomplete="off" aria-label="Cerca giocatori"><div id="fmSelectList" class="fm-select-list"></div></section>`;
    document.body.append(modal);

    document.addEventListener('click', e => {
      const captainButton = e.target.closest('#formazionePage .fm-captain-button');
      if (captainButton) {
        e.preventDefault();
        const slot = captainButton.dataset.captainSlot;
        if (!picks[slot]) return;
        captainSlot = captainSlot === slot ? null : slot;
        render();
        return;
      }
      const slot = e.target.closest('#formazionePage .fm-pick-button')?.dataset.slot;
      if (slot) { e.preventDefault(); open(slot); return; }
      if (e.target.closest('#fmSelectDialog [data-close-dialog]')) { close(); return; }
      const opt = e.target.closest('#fmSelectDialog .fm-option');
      if (opt && chosenSlot) {
        const player = findPlayer(opt.dataset.playerId);
        if (assign(player, chosenSlot)) close();
        return;
      }
      const benchCard = e.target.closest('#formazionePage .fm-bench-player');
      if (benchCard) {
        const player = findPlayer(benchCard.dataset.playerId);
        if (!player) return;
        const eligible = SLOTS.filter(s => fits(player, s));
        const freeEligible = eligible.find(s => !picks[s]);
        open(freeEligible || eligible[0]);
      }
    });

    $('#fmSelectSearch').addEventListener('input', fillOptions);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#fmSelectDialog').hidden) close(); });
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', e => finishPointer(e));
    document.addEventListener('pointercancel', e => finishPointer(e, true));

    document.addEventListener('click', e => {
      if (e.target.closest('[data-nav="formazione"]')) setTimeout(load, 0);
    });
    if (!$('#formazionePage').hidden) void load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
