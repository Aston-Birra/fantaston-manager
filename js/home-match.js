/* FANTASTON: scheda prossima partita, immagini e countdown. Nessuna scrittura al DB. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fmtDate = iso => new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(iso));
  let generation = 0;
  let kickoffTime = null;
  let ticker = null;
  const put = (id, value) => { const node = $(id); if (node) node.textContent = value; };
  const safeUrl = url => typeof url === 'string' && /^https:\/\/[^\s]+$/i.test(url.trim()) ? url.trim() : null;
  function image(id, url) {
    const element = $(id);
    if (!element) return;
    element.hidden = true;
    element.removeAttribute('src');
    const valid = safeUrl(url);
    if (!valid) return;
    element.onerror = () => { element.hidden = true; element.removeAttribute('src'); };
    element.onload = () => { element.hidden = false; };
    element.src = valid;
  }
  function setStatus(text, type='neutral') {
    const node = $('homeMatchStatus');
    if (node) { node.textContent = text; node.dataset.status = type; }
  }
  function setButton(enabled, text) {
    const button = $('homeMatchFormationLink');
    if (button) { button.disabled = !enabled; button.textContent = text; }
  }
  function tick() {
    if (!Number.isFinite(kickoffTime)) return;
    const remainder = Math.max(0, kickoffTime - Date.now());
    const seconds = Math.floor(remainder / 1000);
    put('homeMatchDays', String(Math.floor(seconds / 86400)).padStart(2, '0'));
    put('homeMatchHours', String(Math.floor(seconds % 86400 / 3600)).padStart(2, '0'));
    put('homeMatchMinutes', String(Math.floor(seconds % 3600 / 60)).padStart(2, '0'));
    put('homeMatchSeconds', String(seconds % 60).padStart(2, '0'));
    put('homeMatchCountdownLabel', remainder > 0 ? 'MANCANO AL CALCIO D’INIZIO' : 'CALCIO D’INIZIO RAGGIUNTO');
    if (!remainder) stopTicker();
  }
  function stopTicker() { if (ticker) clearInterval(ticker); ticker = null; }
  function startTicker(iso) {
    stopTicker();
    kickoffTime = new Date(iso).getTime();
    if (!Number.isFinite(kickoffTime)) return;
    tick();
    if (kickoffTime > Date.now()) ticker = setInterval(tick, 1000);
  }
  async function refresh(client) {
    const request = ++generation;
    if (!client || !$('homeMatchOpponent')) return;
    stopTicker(); kickoffTime = null;
    put('homeMatchOpponent', 'Caricamento…'); put('homeMatchKickoff', '—');
    put('homeMatchCountdownLabel', 'MANCANO AL CALCIO D’INIZIO');
    for (const unit of ['Days','Hours','Minutes','Seconds']) put('homeMatch' + unit, '--');
    image('homeMatchOpponentLogo', null);
    image('homeMatchThemeImage', null);
    setStatus('Verifica in corso'); setButton(false, 'Apri formazione');
    try {
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError) throw authError;
      if (!authData?.user || request !== generation) return;
      const now = new Date();
      const { data: matches, error: matchError } = await client.from('matches')
        .select('id,opponent,kickoff_at,lineup_opened_at,status,opponent_logo_url,opponent_theme_image_url')
        .eq('status','scheduled').gt('kickoff_at',now.toISOString())
        .order('kickoff_at',{ascending:true}).limit(1);
      if (matchError) throw matchError;
      if (request !== generation) return;
      const match = matches?.[0];
      if (!match) {
        put('homeMatchOpponent', 'Nessuna partita in programma');
        put('homeMatchKickoff', 'Il calendario verrà aggiornato dall’amministratore.');
        setStatus('Calendario in attesa'); setButton(false, 'Formazioni non disponibili');
        return;
      }
      put('homeMatchOpponent', match.opponent);
      put('homeMatchKickoff', fmtDate(match.kickoff_at));
      image('homeMatchOpponentLogo', match.opponent_logo_url);
      image('homeMatchThemeImage', match.opponent_theme_image_url);
      startTicker(match.kickoff_at);
      const deadline = new Date(match.kickoff_at).getTime() - 7200000;
      const opened = match.lineup_opened_at && new Date(match.lineup_opened_at).getTime() <= Date.now();
      const locked = Date.now() >= deadline;
      const { data: lineup, error: lineupError } = await client.from('lineups')
        .select('id,status').eq('match_id',match.id).eq('user_id',authData.user.id).maybeSingle();
      if (lineupError) throw lineupError;
      if (request !== generation) return;
      const submitted = lineup?.status === 'submitted';
      if (locked) {
        setStatus(submitted ? 'Consegnata · chiusa' : 'Non consegnata · chiusa', submitted ? 'saved' : 'closed');
        setButton(false, 'Formazioni chiuse');
      } else if (!opened) {
        setStatus(submitted ? 'Consegnata' : 'In attesa di apertura', submitted ? 'saved' : 'neutral');
        setButton(false, 'In attesa delle convocazioni');
      } else {
        setStatus(submitted ? 'Consegnata' : 'Da consegnare', submitted ? 'saved' : 'pending');
        setButton(true, submitted ? 'Modifica formazione' : 'Prepara formazione');
      }
    } catch (error) {
      if (request !== generation) return;
      console.error('[Fantaston Home]',error);
      stopTicker();
      put('homeMatchOpponent','Impossibile caricare la partita');
      put('homeMatchKickoff','Riprova aprendo nuovamente la Home.');
      setStatus('Errore di caricamento','closed'); setButton(false,'Apri formazione');
    }
  }
  window.FANTASTON_HOME = { refresh };
})();
