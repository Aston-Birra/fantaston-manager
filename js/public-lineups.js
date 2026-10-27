/* Fantaston: formazioni salvate degli altri utenti, sola lettura. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, value) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = String(value);
    return node;
  };
  const roles = { POR:'PORTIERE', DIF:'DIFENSORE', CC:'CENTROCAMPISTA', ATT:'ATTACCANTE', JOLLY:'JOLLY' };
  const validPhoto = url => typeof url === 'string' && /^https:\/\/[^\s]+$/i.test(url);
  let api;
  let selectedMatch = null;
  let matches = [];
  let lastPayload = null;
  let expandedTeam = null;
  let loading = false;
  let version = 0;
  let lastUpdated = 0;

  function visible() {
    const page = $('formazionePage');
    return !!page && !page.hidden && !document.hidden;
  }
  function client() {
    if (api) return api;
    const config = window.FANTASTON_CONFIG;
    if (!config?.supabaseUrl || !config?.supabasePublishableKey || !window.supabase?.createClient)
      throw new Error('Connessione Supabase non disponibile');
    api = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
    return api;
  }
  function imageOrInitial(parent, url, label, storagePath=false) {
    parent.append(el('span','fl-initial',String(label||'?').charAt(0).toUpperCase()));
    let src = url;
    if (storagePath && url) {
      src = client().storage.from('team-logos').getPublicUrl(url).data?.publicUrl;
    }
    if (!validPhoto(src)) return;
    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error',()=>img.remove(),{once:true});
    img.src = src;
    parent.append(img);
  }
  function pickCard(pick) {
    const row = el('div','fl-pick');
    if (pick.is_captain) row.classList.add('captain');
    const face = el('div','fl-portrait');
    imageOrInitial(face,pick.photo_url,pick.name);
    const info = el('div','fl-info');
    info.append(el('small','',roles[pick.slot]||pick.slot||''),el('strong','',pick.name||'Giocatore'));
    if (pick.is_captain) info.append(el('small','fl-captain','♛ CAPITANO'));
    row.append(face,info,el('strong','fl-price',String(pick.price??0)+' CR'));
    return row;
  }
  function teamCard(team) {
    const ready = team.submitted === true && Array.isArray(team.players) && team.players.length === 5;
    const card = el('article','fl-card');
    const button = el('button','fl-summary');
    button.type = 'button';
    button.disabled = !ready;
    const logo = el('div','fl-logo');
    imageOrInitial(logo,team.team_logo_path,team.team_name,true);
    const text = el('span','fl-title');
    const name = team.team_name||'Fantasquadra';
    text.append(el('strong','',name),el('small','',ready ?
      (team.is_mine ? 'La tua formazione · 5 titolari' : 'Formazione salvata · 5 titolari') :
      'Formazione non schierata'));
    button.append(logo,text,el('span','fl-status',ready ? '⌄' : 'IN ATTESA'));
    const details = el('div','fl-detail');
    const opened = ready && expandedTeam === name;
    details.hidden = !opened;
    button.setAttribute('aria-expanded',String(opened));
    if (ready) {
      button.addEventListener('click',()=>{
        const isOpening = details.hidden;
        $('flTeamList').querySelectorAll('.fl-detail').forEach(node=>node.hidden=true);
        $('flTeamList').querySelectorAll('.fl-summary').forEach(node=>node.setAttribute('aria-expanded','false'));
        details.hidden=!isOpening;
        button.setAttribute('aria-expanded',String(isOpening));
        expandedTeam=isOpening?name:null;
      });
      const head = el('div','fl-meta');
      head.append(el('span','','5 TITOLARI · 1 CAPITANO'),el('strong','',String(team.credits_used??0)+' / 95 CR'));
      details.append(head);
      const slotOrder = {POR:0,DIF:1,CC:2,ATT:3,JOLLY:4};
      [...team.players].sort((a,b)=>(slotOrder[a.slot]??5)-(slotOrder[b.slot]??5))
        .forEach(pick=>details.append(pickCard(pick)));
    }
    card.append(button,details);
    return card;
  }
  function render() {
    const list = $('flTeamList'), count=$('flCount');
    if (!list||!count) return;
    const teams = Array.isArray(lastPayload?.teams) ? lastPayload.teams : [];
    count.textContent = String(lastPayload?.submitted_count??0)+' / '+String(lastPayload?.total_teams??0);
    list.replaceChildren();
    if (!teams.length) {
      list.append(el('p','fl-empty','Nessuna fantasquadra registrata.'));
      return;
    }
    teams.sort((a,b)=>(b.submitted===true?1:0)-(a.submitted===true?1:0)
      || (b.is_mine===true?1:0)-(a.is_mine===true?1:0)
      || String(a.team_name||'').localeCompare(String(b.team_name||''),'it'));
    teams.forEach(team=>list.append(teamCard(team)));
  }
  async function loadMatches(clientInstance) {
    const {data,error} = await clientInstance.from('matches')
      .select('id,opponent,kickoff_at,status')
      .order('kickoff_at',{ascending:false}).limit(50);
    if (error) throw error;
    matches = data||[];
    const select=$('flMatchSelect');
    select.replaceChildren();
    if (!matches.length) {
      selectedMatch=null;
      select.disabled=true;
      select.append(new Option('Nessuna partita',''));
      return;
    }
    for (const match of matches) {
      const d=new Date(match.kickoff_at);
      const date=isNaN(d.getTime())?'':new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',timeZone:'Europe/Rome'}).format(d);
      select.append(new Option(date+' · '+match.opponent,String(match.id)));
    }
    if (!matches.some(m=>String(m.id)===String(selectedMatch))) {
      const future=matches.filter(m=>m.status==='scheduled'&&new Date(m.kickoff_at)>new Date())
        .sort((a,b)=>new Date(a.kickoff_at)-new Date(b.kickoff_at));
      selectedMatch=(future[0]||matches[0]).id;
    }
    select.disabled=false;
    select.value=String(selectedMatch);
  }
  async function refresh(reloadMatches=false,quiet=false) {
    if (!visible()||loading) return;
    loading=true;
    const request=++version;
    const list=$('flTeamList');
    const reload=$('flRefresh');
    if (reload) reload.disabled=true;
    if (!quiet) list.replaceChildren(el('p','fl-empty','Caricamento formazioni…'));
    try {
      const supabase=client();
      const {data:auth,error:authError}=await supabase.auth.getUser();
      if (authError||!auth?.user) throw new Error('Effettua il login per vedere le formazioni.');
      if (reloadMatches||!matches.length) await loadMatches(supabase);
      if (selectedMatch===null) {
        lastPayload={total_teams:0,submitted_count:0,teams:[]};
        render();
        list.replaceChildren(el('p','fl-empty','Nessuna partita disponibile.'));
        return;
      }
      const id=selectedMatch;
      const {data,error}=await supabase.rpc('get_public_lineups',{p_match_id:id});
      if (error) throw error;
      if (request!==version||String(id)!==String(selectedMatch)) return;
      lastPayload=data;
      lastUpdated=Date.now();
      render();
    } catch(error) {
      console.error('[Fantaston formazioni condivise]',error);
      if (!quiet||!lastPayload) {
        list.replaceChildren(el('p','fl-empty','Impossibile caricare le formazioni: '+(error.message||'riprova')));
        if ($('flCount')) $('flCount').textContent='—';
      }
    } finally {
      loading=false;
      if (reload) reload.disabled=false;
    }
  }
  function init() {
    const select=$('flMatchSelect');
    if (!select) return;
    select.addEventListener('change',()=>{
      selectedMatch=select.value;
      expandedTeam=null;
      lastPayload=null;
      void refresh(false,false);
    });
    $('flRefresh')?.addEventListener('click',()=>void refresh(true,false));
    document.addEventListener('click',event=>{
      if (event.target.closest('[data-nav="formazione"]'))
        setTimeout(()=>void refresh(true,false),130);
    });
    document.addEventListener('visibilitychange',()=>{
      if (visible()) void refresh(true,true);
    });
    window.addEventListener('fantaston:lineup-saved',()=>{
      if (visible()) void refresh(true,false);
    });
    setInterval(()=>{
      if (visible() && !loading && Date.now()-lastUpdated>12000) void refresh(false,true);
    },15000);
    if (visible()) void refresh(true,false);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
  window.FANTASTON_PUBLIC_LINEUPS={refresh};
})();
