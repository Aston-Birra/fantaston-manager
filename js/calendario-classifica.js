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

    // Le tre richieste sono indipendenti: un errore negli allenatori o
    // nel calendario non deve impedire di visualizzare la classifica.
    const results = await Promise.allSettled([
      client.rpc('get_fantaston_standings_with_logos'),
      client.rpc('get_fantaston_coaches'),
      client.from('matches')
        .select('id,opponent,kickoff_at,lineup_opened_at,status,opponent_logo_url')
        .order('kickoff_at', { ascending: true })
    ]);
    if (request !== generation) return;
    const valueOf = (result, label) => {
      if (result.status === 'fulfilled') {
        return result.value || { data: null, error: new Error(label + ': risposta vuota') };
      }
      console.warn('[Fantaston ' + label + ']', result.reason);
      return { data: null, error: result.reason || new Error(label + ': richiesta non riuscita') };
    };
    const standingsResult = valueOf(results[0], 'classifica');
    const coachesResult = valueOf(results[1], 'allenatori');
    const matchesResult = valueOf(results[2], 'calendario');
    const coachesByTeam = new Map(
      (Array.isArray(coachesResult.data) ? coachesResult.data : [])
        .filter(coach => coach && typeof coach.team_name === 'string')
        .map(coach => [coach.team_name, coach.coach_name])
    );
    if (coachesResult.error) {
      console.warn('[Fantaston allenatori] Nomi non disponibili:', coachesResult.error);
    }

    // Render delle fantasquadre isolato dal render del calendario.
    try {
      standings.replaceChildren();
      if (standingsResult.error) throw standingsResult.error;
      const teams = Array.isArray(standingsResult.data) ? standingsResult.data : [];
      if (!teams.length) {
        standings.append(make('p', 'fc-status', 'Nessuna fantasquadra registrata.'));
      } else {
        const ordered = [...teams].sort((a, b) =>
          Number(b.total_points) - Number(a.total_points) ||
          String(a.team_name || '').localeCompare(String(b.team_name || ''), 'it')
        );
        let previousScore = null, rank = 0;
        ordered.forEach((team, index) => {
          if (!team) return;
          const teamName = String(team.team_name || 'Fantasquadra');
          const score = Number(team.total_points) || 0;
          if (score !== previousScore) { rank = index + 1; previousScore = score; }
          const row = make('div', 'fc-ranking-row');
          const logoBox = make('span', 'fc-team-logo');
          const fallbackLogo = () => logoBox.replaceChildren(make('span', '', teamName.charAt(0).toUpperCase()));
          if (team.team_logo_path) {
            try {
              const { data: logoData } = client.storage.from('team-logos').getPublicUrl(team.team_logo_path);
              if (!logoData?.publicUrl) throw new Error('URL logo non disponibile');
              const img = make('img');
              img.src = logoData.publicUrl;
              img.alt = 'Stemma ' + teamName;
              img.loading = 'lazy';
              img.onerror = fallbackLogo;
              logoBox.append(img);
            } catch (error) {
              console.warn('[Fantaston logo]', error);
              fallbackLogo();
            }
          } else {
            fallbackLogo();
          }

          const teamInfo = make('div', 'fc-team-info');
          teamInfo.append(
            make('strong', 'fc-team-name', teamName),
            make('span', 'fc-team-coach', 'Allenatore: ' + (coachesByTeam.get(teamName) || 'Non indicato'))
          );
          row.append(
            make('span', 'fc-rank', score === 0 ? '-' : rank + '°'),
            logoBox,
            teamInfo,
            make('strong', 'fc-points',
              new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(score) + ' pt')
          );
          standings.append(row);
        });
      }
    } catch (error) {
      console.error('[Fantaston classifica]', error);
      standings.replaceChildren(make('p', 'fc-status', 'Impossibile caricare la classifica. Riprova aggiornando la pagina.'));
    }

    try {
      calendar.replaceChildren();
      if (matchesResult.error) throw matchesResult.error;
      const matches = Array.isArray(matchesResult.data) ? matchesResult.data : [];
      if (!matches.length) {
        calendar.append(make('p', 'fc-status', 'Non ci sono ancora partite nel calendario.'));
      } else {
        const upcoming = matches.filter(m =>
          m && m.status === 'scheduled' && new Date(m.kickoff_at).getTime() > Date.now()
        );
        const past = matches.filter(m => m && !upcoming.includes(m)).reverse();
        if (upcoming.length) {
          calendar.append(make('h3', 'fc-list-heading', 'Prossime partite'));
          upcoming.forEach(m => calendar.append(matchItem(m)));
        }
        if (past.length) {
          calendar.append(make('h3', 'fc-list-heading', 'Partite precedenti'));
          past.forEach(m => calendar.append(matchItem(m)));
        }
      }
    } catch (error) {
      console.error('[Fantaston calendario]', error);
      calendar.replaceChildren(make('p', 'fc-status', 'Impossibile caricare il calendario. Riprova aggiornando la pagina.'));
    }
  }
  document.addEventListener('click', event => {
    if (event.target.closest('#fcRefresh')) void refresh(lastClient);
  });
  window.FANTASTON_PUBLIC = { refresh };
})();
