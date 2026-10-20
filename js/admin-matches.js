/* FANTASTON - modulo indipendente di gestione partite (solo admin).
   Richiede gli ID HTML: adminMatchesSection, matchForm, matchOpponent,
   matchKickoff, matchSaveButton, matchFormMessage, refreshMatches, adminMatchList.
*/
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let api;
  let busy = false;
  let lastUserId = null;
  const formatDate = iso => new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Rome'
  }).format(new Date(iso));
  const make = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  };
  const showMessage = (text, isError = false) => {
    const message = $('matchFormMessage');
    if (!message) return;
    message.hidden = false;
    message.textContent = text;
    message.style.color = isError ? '#f5a0a0' : '';
  };

  async function getAdminUser() {
    const { data: { user }, error } = await api.auth.getUser();
    if (error || !user) return null;
    const { data: profile, error: profileError } = await api.from('profiles')
      .select('role').eq('id', user.id).maybeSingle();
    if (profileError || profile?.role !== 'admin') return null;
    return user;
  }

  async function refresh() {
    if (!api || busy) return;
    const section = $('adminMatchesSection');
    if (!section) return;
    const user = await getAdminUser();
    if (!user) { section.hidden = true; lastUserId = null; return; }
    lastUserId = user.id;
    section.hidden = false;
    const list = $('adminMatchList');
    list.replaceChildren(make('p', 'admin-empty', 'Caricamento partite…'));
    const { data, error } = await api.from('matches')
      .select('id,opponent,kickoff_at,lineup_opened_at,status,opponent_logo_url,opponent_theme_image_url')
      .order('kickoff_at', { ascending: false });
    if (lastUserId !== user.id) return;
    list.replaceChildren();
    if (error) {
      list.append(make('p', 'admin-empty', `Errore: ${error.message}`));
      return;
    }
    if (!data?.length) {
      list.append(make('p', 'admin-empty', 'Nessuna partita inserita.'));
      return;
    }
    for (const match of data) {
      const card = make('article', 'admin-match-item');
      card.style.cssText = 'padding:14px 0;border-bottom:1px solid rgba(200,170,100,.2)';
      const title = make('strong', '', `Aston Birra – ${match.opponent}`);
      title.style.display = 'block';
      const details = make('p', '', `#${match.id} · ${formatDate(match.kickoff_at)} · ${match.status || '—'}`);
      details.style.margin = '6px 0';
      card.append(title, details);
      const closedByTime = Date.now() >= new Date(match.kickoff_at).getTime() - 2 * 60 * 60 * 1000;
      if (match.lineup_opened_at) {
        card.append(make('p', 'admin-helper', closedByTime ? 'Formazioni chiuse (scadenza raggiunta)' : 'Formazioni aperte'));
      } else if (match.status === 'scheduled' && !closedByTime) {
        const button = make('button', 'action action-secondary', 'Apri formazioni');
        button.type = 'button';
        button.dataset.openMatchId = match.id;
        button.style.borderRadius = '20px';
        card.append(button);
      } else {
        card.append(make('p', 'admin-helper', 'Formazioni non apribili'));
      }
      const mediaForm = make('form', 'am-media-form');
      mediaForm.dataset.mediaMatchId = match.id;
      const logoLabel = make('label', '', 'LOGO AVVERSARIO · URL HTTPS');
      const logoInput = make('input', '');
      logoInput.type = 'url'; logoInput.name = 'logo'; logoInput.maxLength = 1000;
      logoInput.placeholder = 'https://...'; logoInput.value = match.opponent_logo_url || '';
      const themeLabel = make('label', '', 'IMMAGINE COLORI MAGLIA · URL HTTPS');
      const themeInput = make('input', '');
      themeInput.type = 'url'; themeInput.name = 'theme'; themeInput.maxLength = 1000;
      themeInput.placeholder = 'https://...'; themeInput.value = match.opponent_theme_image_url || '';
      const preview = make('div', 'am-media-preview');
      for (const [src, cls] of [[match.opponent_logo_url, ''], [match.opponent_theme_image_url, 'am-kit-preview']]) {
        if (!src || !/^https:\/\/[^\s]+$/i.test(src)) continue;
        const img = make('img', cls); img.src = src; img.alt = 'Anteprima'; img.loading = 'lazy';
        img.onerror = () => img.remove(); preview.append(img);
      }
      const saveMedia = make('button', 'action action-secondary', 'Salva immagini');
      saveMedia.type = 'submit'; saveMedia.style.borderRadius = '20px';
      mediaForm.append(logoLabel, logoInput, themeLabel, themeInput, preview, saveMedia);
      card.append(mediaForm);
      list.append(card);
    }
  }

  async function submitMatch(event) {
    event.preventDefault();
    if (busy) return;
    const opponent = $('matchOpponent').value.trim();
    const kickoffValue = $('matchKickoff').value;
    const logoUrl = $('matchOpponentLogo')?.value.trim() || null;
    const themeUrl = $('matchOpponentTheme')?.value.trim() || null;
    const kickoff = new Date(kickoffValue);
    if (!opponent || !kickoffValue || !Number.isFinite(kickoff.getTime())) {
      showMessage('Inserisci avversario e data/ora valide.', true); return;
    }
    busy = true;
    $('matchSaveButton').disabled = true;
    try {
      const { data, error } = await api.rpc('admin_create_match', {
        p_opponent: opponent, p_kickoff_at: kickoff.toISOString()
      });
      if (error) throw error;
      // Il calendario si crea anche senza immagini: in quel caso nessun passaggio aggiuntivo.
      if (logoUrl || themeUrl) {
        const { error: mediaError } = await api.rpc('admin_set_match_media', {
          p_match_id: Number(data),
          p_opponent_logo_url: logoUrl,
          p_opponent_theme_image_url: themeUrl
        });
        if (mediaError) {
          showMessage(`Partita #${data} creata, ma immagini non salvate: ${mediaError.message}`, true);
          return;
        }
      }
      $('matchForm').reset();
      showMessage(`Partita #${data} creata. Le formazioni sono ancora chiuse.`);
    } catch (error) {
      showMessage(`Creazione fallita: ${error.message}`, true);
    } finally {
      busy = false;
      $('matchSaveButton').disabled = false;
      await refresh();
    }
  }

  async function saveMedia(event) {
    const form = event.target.closest('form[data-media-match-id]');
    if (!form) return;
    event.preventDefault();
    if (busy) return;
    const button = form.querySelector('button[type="submit"]');
    busy = true; button.disabled = true;
    try {
      const { error } = await api.rpc('admin_set_match_media', {
        p_match_id: Number(form.dataset.mediaMatchId),
        p_opponent_logo_url: form.elements.logo.value.trim() || null,
        p_opponent_theme_image_url: form.elements.theme.value.trim() || null
      });
      if (error) throw error;
      showMessage(`Immagini aggiornate per la partita #${form.dataset.mediaMatchId}.`);
    } catch (error) {
      showMessage('Impossibile salvare immagini: ' + error.message, true);
    } finally {
      busy = false;
      await refresh();
    }
  }

  async function openMatch(matchId, button) {
    if (busy || !window.confirm('Confermi che le convocazioni ufficiali sono state pubblicate e vuoi aprire le formazioni?')) return;
    busy = true;
    button.disabled = true;
    try {
      const { error } = await api.rpc('admin_open_lineups', { p_match_id: Number(matchId) });
      if (error) throw error;
      showMessage(`Formazioni aperte per la partita #${matchId}.`);
    } catch (error) {
      showMessage(`Apertura fallita: ${error.message}`, true);
    } finally {
      busy = false;
      await refresh();
    }
  }

  async function init() {
    if (!$('adminMatchesSection') || !$('matchForm') || !$('adminMatchList')) return;
    const config = window.FANTASTON_CONFIG;
    if (!config?.supabaseUrl || !config?.supabasePublishableKey || !window.supabase?.createClient) return;
    api = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
    $('adminMatchesSection').hidden = true;
    $('matchForm').addEventListener('submit', submitMatch);
    $('refreshMatches')?.addEventListener('click', () => { void refresh(); });
    $('adminMatchList').addEventListener('submit', event => { void saveMedia(event); });
    $('adminMatchList').addEventListener('click', event => {
      const button = event.target.closest('[data-open-match-id]');
      if (button) void openMatch(button.dataset.openMatchId, button);
    });
    document.addEventListener('click', event => {
      if (event.target.closest('[data-nav="admin"]')) setTimeout(() => { void refresh(); }, 0);
    });
    api.auth.onAuthStateChange((_event, session) => {
      if (!session) { lastUserId = null; $('adminMatchesSection').hidden = true; }
    });
    void refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else void init();
})();
