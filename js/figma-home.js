/* Home Figma V1: nessuna alterazione di autenticazione, formazioni o punteggi. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const make = (tag, cls, value) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (value !== undefined) el.textContent = String(value);
    return el;
  };
  let lastClient = null;
  let generation = 0;
  let boardCache = [];
  let expanded = false;
  let adminReady = false;
  const num = value => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2, minimumFractionDigits: 1 }).format(value);

  function goToClassifica() {
    // Le navigazioni esistenti sono gestite da app.js: riutilizziamo il loro handler.
    document.querySelector('.side-nav [data-nav="classifica"]')?.click();
  }

  function updateDots() {
    const scroll = $('fhCarousel');
    if (!scroll) return;
    const children = [...scroll.querySelectorAll('.fh-slide')];
    const closest = children.reduce((best, item, i) => {
      const distance = Math.abs(item.offsetLeft - scroll.scrollLeft - scroll.offsetLeft);
      return distance < best.distance ? {i, distance} : best;
    }, {i:0, distance:Infinity}).i;
    document.querySelectorAll('[data-fh-slide]').forEach(btn => {
      const active = Number(btn.dataset.fhSlide) === closest;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function loadTeamLogo(client, path, name) {
    const img = $('fhTeamLogo');
    const fallback = $('fhTeamFallback');
    if (!img || !fallback) return;
    fallback.textContent = (name || 'F').trim().charAt(0).toUpperCase();
    fallback.hidden = false;
    img.hidden = true;
    img.removeAttribute('src');
    if (!path) return;
    const {data} = client.storage.from('team-logos').getPublicUrl(path);
    if (!data?.publicUrl) return;
    img.onload = () => {img.hidden = false; fallback.hidden = true;};
    img.onerror = () => {img.hidden = true; fallback.hidden = false;};
    img.src = data.publicUrl;
  }

  function renderBoard() {
    const target = $('fhBoardList');
    const more = $('fhBoardMore');
    if (!target) return;
    target.replaceChildren();
    if (!boardCache.length) {
      target.append(make('div', 'fh-board-empty', 'Nessun evento pubblicato. Le comunicazioni degli amministratori e le giornate concluse compariranno qui.'));
      if (more) more.hidden = true;
      return;
    }
    const visible = expanded ? boardCache : boardCache.slice(0, 3);
    for (const event of visible) {
      const card = make('article', 'fh-board-item');
      const iconBox = make('div', 'fh-board-icon');
      iconBox.setAttribute('aria-hidden', 'true');
      iconBox.textContent = event.event_type === 'match_published' ? '🏆' : '✦';
      const content = make('div', 'fh-board-copy');
      const heading = make('h3', '', event.title);
      const date = make('time', '', new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome', day:'numeric', month:'short', year:'numeric'
      }).format(new Date(event.created_at)));
      date.dateTime = event.created_at;
      const top = make('div', 'fh-board-item-top');
      top.append(heading, date);
      content.append(top, make('p', '', event.body || ''));
      if (event.event_type === 'match_published') {
        const button = make('button', 'fh-board-cta', 'Visualizza classifica →');
        button.type = 'button';
        button.addEventListener('click', goToClassifica);
        content.append(button);
      }
      card.append(iconBox, content);
      target.append(card);
    }
    if (more) {
      more.hidden = boardCache.length <= 3;
      more.textContent = expanded ? 'Mostra meno' : `Vedi tutti (${boardCache.length})`;
    }
  }

/* CALENDARIO HOME - PROSSIME 3 PARTITE */
async function loadHomeCalendar(client) {

  const container = document.getElementById('fhCalendarPreview');
  if (!container || !client) return;

  container.textContent = 'Caricamento calendario...';

  try {
    const { data, error } = await client
      .from('matches')
.select('id, opponent, kickoff_at, opponent_logo_url, is_home')
      .eq('status', 'scheduled')
      .gt('kickoff_at', new Date().toISOString())
      .order('kickoff_at', { ascending: true })
      .limit(3);

    if (error) throw error;

    container.replaceChildren();

    if (!data || data.length === 0) {
      container.textContent = 'Nessuna partita futura in calendario.';
      return;
    }

    const formatter = new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Rome'
    });


data.forEach(match => {

  const row = document.createElement('div');
  row.className = 'fh-cal-row';

  // DATA E ORA
  const date = document.createElement('span');
  date.className = 'fh-cal-date';
  date.textContent = formatter.format(
    new Date(match.kickoff_at)
  );

  // ICONA CASA / TRASFERTA
  const venue = document.createElement('span');
  venue.className = 'fh-cal-venue';

  const isHome = match.is_home;

  venue.title = isHome === true
    ? 'In casa'
    : isHome === false
      ? 'In trasferta'
      : 'Da definire';

  venue.setAttribute('aria-label', venue.title);

  if (isHome === null || isHome === undefined) {
    venue.textContent = '—';
  } else {
    const svg = document.createElementNS(
      'http://www.w3.org/2000/svg', 'svg'
    );

    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const path = document.createElementNS(
      'http://www.w3.org/2000/svg', 'path'
    );

    path.setAttribute('d', isHome
      ? 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z'
      : 'M17.5 21H21v-3.5L14 11V3.5a2 2 0 0 0-4 0V11l-7 6.5V21h3.5l5.5-4 5.5 4Z'
    );

    svg.append(path);
    venue.append(svg);
  }

  // CONTENITORE LOGO AVVERSARIO
  const logoBox = document.createElement('span');
  logoBox.className = 'fh-cal-logo';

  const logoUrl = match.opponent_logo_url;

  if (logoUrl && /^https:\/\//i.test(logoUrl)) {
    const img = document.createElement('img');
    img.src = logoUrl;
    img.alt = `Logo ${match.opponent}`;
    img.loading = 'lazy';

    img.onerror = () => {
      img.remove();
      logoBox.textContent = '?';
    };

    logoBox.append(img);
  } else {
    logoBox.textContent = '?';
  }

  // NOME AVVERSARIO
  const opponent = document.createElement('strong');
  opponent.className = 'fh-cal-opponent';
  opponent.textContent = match.opponent || 'Da definire';

  // ORDINE ELEMENTI
  row.append(date, venue, logoBox, opponent);

  container.append(row);
});


  } catch (error) {
    console.error('[FANTASTON Calendario Home]', error);
    container.textContent = 'Impossibile caricare il calendario.';
  }
}

  async function refresh(client) {
    lastClient = client;
    const request = ++generation;
    if (!client || !$('fhTotalPoints')) return;
    void loadHomeCalendar(client);
    const pointsNode = $('fhTotalPoints');
    pointsNode.textContent = '0,0';
    $('homeRanking').textContent = '—';
    $('fhSeasonMessage').textContent = 'Caricamento classifica…';
    $('fhBoardList').replaceChildren(make('div', 'fh-board-empty', 'Caricamento eventi…'));
    try {
      const {data: {user}, error: authError} = await client.auth.getUser();
      if (authError) throw authError;
      if (!user || request !== generation) return;
      const [teamResult, standingsResult, eventsResult] = await Promise.all([
        client.from('profiles').select('team_name,team_logo_path').eq('id',user.id).maybeSingle(),
        client.rpc('get_fantaston_standings_with_logos'),
        client.from('fantaston_board_events').select('id,event_type,title,body,created_at').order('created_at',{ascending:false}).limit(30)
      ]);
      if (request !== generation) return;
      const profile = teamResult.data;
      if (!teamResult.error && profile) loadTeamLogo(client, profile.team_logo_path, profile.team_name);
      else loadTeamLogo(client, null, $('dashboardTeamName')?.textContent);
      if (standingsResult.error) {
        $('fhSeasonMessage').textContent = 'Classifica temporaneamente non disponibile.';
      } else {
        const ordered = [...(standingsResult.data || [])].sort((a,b) => Number(b.total_points) - Number(a.total_points) || String(a.team_name).localeCompare(String(b.team_name),'it'));
        const myTeam = ordered.find(t => t.user_id === user.id) || ordered.find(t => t.team_name && t.team_name === profile?.team_name);
        if (myTeam) {
          const points = Number(myTeam.total_points) || 0;
          const better = ordered.filter(t => Number(t.total_points) > points).length;
          pointsNode.textContent = num(points);
          $('homeRanking').textContent = points === 0 ? '-' : `${better + 1}°`;
          $('fhSeasonMessage').textContent = points === 0 ? 'In attesa dei primi risultati ufficiali.' : 'Classifica a somma di fantapunti.';
        } else $('fhSeasonMessage').textContent = 'La tua fantasquadra non compare ancora in classifica.';
      }
      if (eventsResult.error) {
        $('fhBoardList').replaceChildren(make('div', 'fh-board-empty',
          eventsResult.error.code === '42P01' || eventsResult.error.code === 'PGRST205'
            ? 'Bacheca non ancora attivata: esegui il file SQL incluso nel pacchetto.'
            : 'Impossibile caricare gli eventi. Riprova aprendo la Home.'));
        boardCache = [];
        $('fhBoardMore').hidden = true;
      } else {
        boardCache = eventsResult.data || [];
        renderBoard();
      }
    } catch(e) {
      if (request !== generation) return;
      console.warn('[FANTASTON figma-home]', e);
      $('fhSeasonMessage').textContent = 'Impossibile aggiornare la classifica.';
      $('fhBoardList').replaceChildren(make('div','fh-board-empty','Impossibile caricare la bacheca.'));
    }
  }

  async function setupAdmin(client) {
    if (!client || !($('fhAdminEventForm'))) return;
    lastClient = client;
    try {
      const {data: {user}} = await client.auth.getUser();
      if (!user) return;
      const {data, error} = await client.from('profiles').select('role').eq('id',user.id).maybeSingle();
      if (!error && data?.role === 'admin') {
        $('fhAdminEventSection').hidden = false;
        adminReady = true;
      }
    } catch(e) {console.warn('[FANTASTON Admin bacheca]',e);}
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('fhCarousel')?.addEventListener('scroll', updateDots, {passive:true});
    document.querySelectorAll('[data-fh-slide]').forEach(button => button.addEventListener('click', () => {
      const slides = $('fhCarousel')?.querySelectorAll('.fh-slide');
      slides?.[Number(button.dataset.fhSlide)]?.scrollIntoView({behavior:'smooth', block:'nearest', inline:'start'});
    }));
    $('fhOpenClassifica')?.addEventListener('click', goToClassifica);
    $('fhBoardMore')?.addEventListener('click', () => { expanded = !expanded; renderBoard(); });
    $('fhAdminEventForm')?.addEventListener('submit', async evt => {
      evt.preventDefault();
      if (!adminReady || !lastClient) return;
      const title = $('fhAdminEventTitle').value.trim();
      const body = $('fhAdminEventBody').value.trim();
      const result = $('fhAdminEventMessage');
      if (!title || !body) return;
      const button = $('fhAdminEventSend');
      button.disabled = true;
      result.textContent = 'Pubblicazione in corso…';
      try {
        const {data: {user},error:authError} = await lastClient.auth.getUser();
        if (authError || !user) throw Error('Accedi di nuovo per pubblicare.');
        const {error} = await lastClient.from('fantaston_board_events')
          .insert({event_type:'manual', title, body, author_id:user.id});
        if (error) throw error;
        $('fhAdminEventForm').reset();
        result.textContent = 'Comunicazione pubblicata.';
        await refresh(lastClient);
      } catch(e) {result.textContent = `Errore: ${e.message}`;}
      finally {button.disabled = false;}
    });
  });
  window.FANTASTON_FIGMA_HOME = { refresh, setupAdmin };
})();
