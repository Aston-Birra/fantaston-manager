/* FANTASTON — Upload stemma personale: usa il client Supabase principale. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let client = null;
  let requestNumber = 0;
  const bucket = 'team-logos';
  function status(text, error = false) {
    const p = $('teamLogoMessage');
    if (!p) return;
    p.textContent = text;
    p.hidden = false;
    p.classList.toggle('tl-error', error);
  }
  function preview(path) {
    const img = $('teamLogoPreview');
    const fallback = $('teamLogoFallback');
    if (!img || !fallback) return;
    img.hidden = true;
    fallback.hidden = false;
    if (!path || !client) return;
    const { data } = client.storage.from(bucket).getPublicUrl(path);
    img.onload = () => { img.hidden = false; fallback.hidden = true; };
    img.onerror = () => { img.hidden = true; fallback.hidden = false; };
    img.src = data.publicUrl;
  }
  async function refresh(supabaseClient) {
    if (!supabaseClient || !$('teamLogoInput')) return;
    client = supabaseClient;
    const request = ++requestNumber;
    try {
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user) return;
      const { data, error } = await client.from('profiles')
        .select('team_logo_path').eq('id',user.id).single();
      if (error) throw error;
      if (request !== requestNumber) return;
      preview(data.team_logo_path);
    } catch (e) { console.error('[Fantaston logo]', e); status('Impossibile caricare il logo: ' + e.message,true); }
  }
  async function upload() {
    if (!client) return status('Apri di nuovo il Profilo e riprova.',true);
    const file = $('teamLogoInput')?.files?.[0];
    if (!file) return status('Seleziona un’immagine.',true);
    const formats = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
    const ext = formats[file.type];
    if (!ext) return status('Formato non supportato: usa PNG, JPG o WebP.',true);
    if (file.size > 2 * 1024 * 1024) return status('File troppo grande: massimo 2 MB.',true);
    const button = $('teamLogoSave');
    button.disabled = true;
    status('Caricamento in corso…');
    try {
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user) throw Error('Sessione scaduta: esegui nuovamente l’accesso.');
      const path = `${user.id}/logo_${Date.now()}_${Math.random().toString(36).slice(2,9)}.${ext}`;
      const { error: uploadError } = await client.storage.from(bucket).upload(path,file,{
        contentType:file.type,upsert:false,cacheControl:'3600'
      });
      if (uploadError) throw uploadError;
      const { error: saveError } = await client.rpc('set_my_team_logo',{p_path:path});
      if (saveError) throw saveError;
      preview(path);
      $('teamLogoInput').value = '';
      status('Logo della fantasquadra aggiornato!');
      window.FANTASTON_PUBLIC?.refresh(client);
    } catch (e) { console.error('[Fantaston upload logo]',e); status('Operazione non riuscita: '+e.message,true); }
    finally { button.disabled = false; }
  }
  document.addEventListener('click', e => {
    if (e.target.closest('#teamLogoSave')) void upload();
  });
  window.FANTASTON_TEAM_LOGO = { refresh };
})();
