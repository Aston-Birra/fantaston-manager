/* FANTASTON — Calendario pubblico e classifica a somma punti (inizialmente zero).
   Nessuna scrittura su Supabase; usa il client del modulo principale. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, txt) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (txt !== undefined) node.textContent = String(txt);
    return node;
  };
  const fmt = (date) => new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome', dateStyle: 'full', timeStyle: 'short'
  }).format(new Date(date));
  let generation = 0;
  let lastClient = null;
  const validHttps = (url) => typeof url === 'string' && /^https:\/\/[^\s]+$/i.test(url);

  function matchItem(match) {
    const card = make('article', 'fc-match-card');
    const top = make('div', 'fc-match-top');
    const date = make('time', 'fc-match-date', fmt(match.kickoff_at));
    date.dateTime = match.kickoff_at;
    const isFuture = new Date(match.kickoff_at).getTime() > Date.now();
    const statusText = match.status === 'published' ? 'Risultati pubblicati' :
      match.status === 'played' ? 'Disputata' : isFuture ? 'In programma' : 'Data trascorsa';
    const status = make('span', 'fc-match-tag', statusText);
    top.append(date, status);
    const middle = make('div', 'fc-match-versus');
    const crest = make('img', 'fc-match-crest');
    crest.src = './assets/aston-birra-logo.png';
    crest.alt = 'Aston Birra';
    const home = make('strong', '', 'Aston Birra');
    const vs = make('span', 'fc-versus-label', 'VS');
    const opponent = make('strong', 'fc-opponent', match.opponent);
    const logoBox = make('span', 'fc-opponent-crest');
    if (validHttps(match.opponent_logo_url)) {
      const logo = make('img', 'fc-match-crest');
      logo.src = match.opponent_logo_url;
      logo.alt = `Logo ${match.opponent}`;
      logo.loading = 'lazy';
      logo.onerror = () => logo.replaceWith(make('span', 'fc-logo-fallback', '⚽'));
      logoBox.append(logo);
    } else logoBox.append(make('span', 'fc-logo-fallback', '⚽'));
    middle.append(crest, home, vs, logoBox, opponent);
    card.append(top, middle);
    if (match.status === 'scheduled' && isFuture) {
      const deadline = new Date(match.kickoff_at).getTime() - 7200000;
      const open = match.lineup_opened_at && new Date(match.lineup_opened_at).getTime() <= Date.now();
      const label = Date.now() >= deadline ? 'Formazioni chiuse' : open ? 'Formazioni aperte' : 'In attesa delle convocazioni';
      card.append(make('p', 'fc-match-note', label));
    }
    return card;
  }

  async function refresh(client) {
    if (!client || !$('fcStandings') || !$('fcCalendar')) return;
    lastClient = client;
    const request = ++generation;
    const standings = $('fcStandings');
    const calendar = $('fcCalendar');
    standings.replaceChildren(make('p', 'fc-status', 'Caricamento fantasquadre…'));
    calendar.replaceChildren(make('p', 'fc-status', 'Caricamento calendario…'));
    try {
      const [standingsResult, matchesResult] = await Promise.all([
        client.rpc('get_fantaston_standings_with_logos'),
        client.from('matches')
          .select('id,opponent,kickoff_at,lineup_opened_at,status,opponent_logo_url')
          .order('kickoff_at', {ascending: true})
      ]);
      if (request !== generation) return;
      standings.replaceChildren();
      calendar.replaceChildren();
      if (standingsResult.error) {
        standings.append(make('p', 'fc-status', `Impossibile caricare la classifica: ${standingsResult.error.message}`));
      } else {
        const teams = standingsResult.data || [];
        if (!teams.length) standings.append(make('p', 'fc-status', 'Nessuna fantasquadra registrata.'));
        else {
          const ordered = [...teams].sort((a, b) => Number(b.total_points) - Number(a.total_points) || a.team_name.localeCompare(b.team_name, 'it'));
          let previousScore = null, rank = 0;
          ordered.forEach((team, index) => {
            const score = Number(team.total_points);
            if (score !== previousScore) { rank = index + 1; previousScore = score; }
            const row = make('div', 'fc-ranking-row');
            const logoBox = make('span', 'fc-team-logo');
            if (team.team_logo_path) {
              const { data: logoData } = client.storage.from('team-logos').getPublicUrl(team.team_logo_path);
              const img = make('img');
              img.src = logoData.publicUrl;
              img.alt = `Stemma ${team.team_name}`;
              img.loading = 'lazy';
              img.onerror = () => logoBox.replaceChildren(make('span', '', (team.team_name || '?')[0].toUpperCase()));
              logoBox.append(img);
            } else logoBox.append(make('span', '', (team.team_name || '?')[0].toUpperCase()));
            row.append(make('span', 'fc-rank', `${rank}°`), logoBox, make('strong', 'fc-team-name', team.team_name), make('strong', 'fc-points', `${new Intl.NumberFormat('it-IT', {maximumFractionDigits: 2}).format(score)} pt`));
            standings.append(row);
          });
        }
      }
      if (matchesResult.error) {
        calendar.append(make('p', 'fc-status', `Impossibile caricare le partite: ${matchesResult.error.message}`));
      } else {
        const matches = matchesResult.data || [];
        if (!matches.length) calendar.append(make('p', 'fc-status', 'Non ci sono ancora partite nel calendario.'));
        else {
          const upcoming = matches.filter(m => m.status === 'scheduled' && new Date(m.kickoff_at).getTime() > Date.now());
          const past = matches.filter(m => !upcoming.includes(m)).reverse();
          if (upcoming.length) {
            calendar.append(make('h3', 'fc-list-heading', 'Prossime partite'));
            upcoming.forEach(m => calendar.append(matchItem(m)));
          }
          if (past.length) {
            calendar.append(make('h3', 'fc-list-heading', 'Partite precedenti'));
            past.forEach(m => calendar.append(matchItem(m)));
          }
        }
      }
    } catch (err) {
      if (request !== generation) return;
      console.error('[Fantaston calendario e classifica]', err);
      standings.replaceChildren(make('p', 'fc-status', 'Errore nel caricamento della classifica.'));
      calendar.replaceChildren(make('p', 'fc-status', 'Errore nel caricamento del calendario.'));
    }
  }
  document.addEventListener('click', event => {
    if (event.target.closest('#fcRefresh')) void refresh(lastClient);
  });
  window.FANTASTON_PUBLIC = { refresh };
})();
