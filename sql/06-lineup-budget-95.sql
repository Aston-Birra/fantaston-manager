-- FANTASTON MANAGER | Aggiornamento budget formazione: 90 -> 95 crediti
--
-- Eseguire UNA volta dal SQL Editor del progetto Supabase.
-- Aggiorna esclusivamente il controllo del budget nella funzione gia esistente
-- public.save_lineup(bigint, jsonb), preservando tutti gli altri controlli,
-- permessi e comportamento di salvataggio.
--
-- La migrazione fallisce senza modifiche se la definizione non corrisponde
-- alla versione attesa. Non cambia il limite della quotazione del singolo
-- giocatore (admin_save_player), che e una regola distinta.

BEGIN;

DO $migration$
DECLARE
  v_definition text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef(to_regprocedure('public.save_lineup(bigint,jsonb)'))
    INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Funzione public.save_lineup(bigint,jsonb) non trovata: nessuna modifica applicata';
  END IF;

  IF position('v_total > 95' IN v_definition) > 0 THEN
    RAISE NOTICE 'Il budget di save_lineup e gia impostato a 95 crediti';
  ELSIF position('v_total > 90' IN v_definition) > 0 THEN
    v_updated := replace(v_definition, 'v_total > 90', 'v_total > 95');
    v_updated := replace(v_updated, 'massimo 90 crediti', 'massimo 95 crediti');
    v_updated := replace(v_updated, '90 crediti', '95 crediti');

    EXECUTE v_updated;
    RAISE NOTICE 'Budget di save_lineup aggiornato a 95 crediti';
  ELSE
    RAISE EXCEPTION 'Controllo budget atteso (v_total > 90) non trovato: nessuna modifica applicata';
  END IF;
END;
$migration$;

COMMIT;

-- Verifica: il risultato deve essere true.
SELECT position(
  'v_total > 95'
  IN pg_get_functiondef(to_regprocedure('public.save_lineup(bigint,jsonb)'))
) > 0 AS budget_95_attivo;
