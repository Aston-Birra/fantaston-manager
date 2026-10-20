-- FANTASTON MANAGER · STEP 5 · Gestione anagrafica calciatori
-- Eseguire nel SQL Editor del proprio progetto Supabase.
-- Presuppone lo STEP 1 con public.profiles e public.players, RLS attiva.
-- Funzioni idempotenti: CREATE OR REPLACE.
-- Non crea policy di scrittura pubbliche: soltanto queste RPC permettono
-- modifiche alla rosa, e controllano il ruolo admin sul server.

CREATE OR REPLACE FUNCTION public.admin_save_player(
  p_player_id BIGINT,
  p_name TEXT,
  p_role TEXT,
  p_price INTEGER,
  p_photo_url TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id BIGINT;
  v_name TEXT;
  v_role TEXT;
  v_photo_url TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo un amministratore puo modificare i calciatori'
      USING ERRCODE = '42501';
  END IF;

  v_name := pg_catalog.regexp_replace(pg_catalog.btrim(p_name), '[[:space:]]+', ' ', 'g');
  v_role := pg_catalog.upper(pg_catalog.btrim(p_role));
  v_photo_url := NULLIF(pg_catalog.btrim(p_photo_url), '');

  IF v_name IS NULL OR pg_catalog.char_length(v_name) NOT BETWEEN 2 AND 70 THEN
    RAISE EXCEPTION 'Nome calciatore non valido (2-70 caratteri)';
  END IF;
  IF v_role IS NULL OR v_role NOT IN ('POR', 'DIF', 'CC', 'ATT') THEN
    RAISE EXCEPTION 'Ruolo non valido';
  END IF;
  IF p_price IS NULL OR p_price NOT BETWEEN 1 AND 90 THEN
    RAISE EXCEPTION 'La quotazione deve essere tra 1 e 90';
  END IF;
  IF v_photo_url IS NOT NULL AND (
    pg_catalog.char_length(v_photo_url) > 500
    OR v_photo_url !~* '^https://[^[:space:]]+$'
  ) THEN
    RAISE EXCEPTION 'La foto deve essere un URL HTTPS valido (max 500 caratteri)';
  END IF;

  IF p_player_id IS NULL THEN
    INSERT INTO public.players (name, role, price, photo_url, active)
    VALUES (v_name, v_role, p_price, v_photo_url, TRUE)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.players
    SET name = v_name, role = v_role, price = p_price, photo_url = v_photo_url
    WHERE id = p_player_id
    RETURNING id INTO v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Calciatore non trovato';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_player_active(
  p_player_id BIGINT,
  p_active BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo un amministratore puo modificare i calciatori'
      USING ERRCODE = '42501';
  END IF;
  IF p_active IS NULL THEN
    RAISE EXCEPTION 'Stato attivo non valido';
  END IF;
  UPDATE public.players SET active = p_active WHERE id = p_player_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calciatore non trovato';
  END IF;
  RETURN p_active;
END;
$$;

-- Blocca invocazioni anonime; concedi solo agli utenti autenticati.
-- I normali utenti ricevono comunque errore 42501 grazie al controllo ruolo.
REVOKE ALL ON FUNCTION public.admin_save_player(BIGINT,TEXT,TEXT,INTEGER,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_save_player(BIGINT,TEXT,TEXT,INTEGER,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_save_player(BIGINT,TEXT,TEXT,INTEGER,TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_player_active(BIGINT,BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_player_active(BIGINT,BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_player_active(BIGINT,BOOLEAN) TO authenticated;

-- Ricorda: public.players ha gia RLS attiva dallo STEP 1 e la sola
-- policy SELECT per authenticated. Non aggiungere INSERT/UPDATE da client.
