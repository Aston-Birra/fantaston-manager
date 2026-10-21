
(() => {
  'use strict';

  const home = document.getElementById('homePage');
  const card = document.getElementById('fhTeamPushCard');
  const match = document.querySelector(
    '#fhCarousel .fh-slide-match'
  );

  if (!home || !card || !match) return;

  // Riutilizza i dati già caricati dalla Home.
  const fields = [
    ['helloName', 'fhPushWelcome'],
    ['dashboardTeamName', 'fhPushTeam'],
    ['homeRanking', 'fhPushRank']
  ];

  function syncFields() {
    fields.forEach(([sourceId, targetId]) => {
      const source = document.getElementById(sourceId);
      const target = document.getElementById(targetId);

      if (source && target) {
        target.textContent = source.textContent.trim() || '—';
      }
    });
  }

  fields.forEach(([sourceId]) => {
    const source = document.getElementById(sourceId);

    if (source) {
      new MutationObserver(syncFields).observe(source, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }
  });

  syncFields();

  // Mantiene 10 px tra le due card.
  function updatePosition() {
    if (home.hidden) return;

    const top = parseFloat(getComputedStyle(card).top) || 12;
    const cardBottom = top + card.offsetHeight;
    const matchTop = match.getBoundingClientRect().top;

    const distance = matchTop - cardBottom;
    const shift = Math.min(0, distance - 10);

    card.style.setProperty('--fh-team-shift', `${shift}px`);
  }

  let pending = false;

  function scheduleUpdate() {
    if (pending) return;

    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      updatePosition();
    });
  }

  window.addEventListener('scroll', scheduleUpdate, {
    passive: true
  });

  window.addEventListener('resize', scheduleUpdate);

  new MutationObserver(scheduleUpdate).observe(home, {
    attributes: true,
    attributeFilter: ['hidden']
  });

  scheduleUpdate();
})();
