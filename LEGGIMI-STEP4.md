# Fantaston Manager — STEP 4

Questa cartella è un **aggiornamento** della versione già online.
NON contiene `js/config.js`: mantieni il file già configurato su GitHub.
Non serve ricreare il database né ripetere gli STEP 1 e 2.

## 1. Supabase

Nel progetto Fantaston Manager apri **SQL Editor > New query**.
Copia ed esegui `sql/04-register-team-name.sql`.
La funzione `public.register_team_name` permette ai soli utenti autenticati
il primo inserimento del nome fantasquadra, non le modifiche successive.
Usa le policy RLS esistenti (nessun UPDATE libero su `profiles`).

## 2. Abilita il tuo account amministratore

Poiché hai già eseguito l'accesso Google, dovresti già essere in `auth.users`
e in `public.profiles`. Dal SQL Editor esegui **solo nel pannello Supabase**:

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users
  WHERE LOWER(email) = LOWER('LA_TUA_EMAIL_GOOGLE')
)
RETURNING id, display_name, team_name, role;
```

Sostituisci `LA_TUA_EMAIL_GOOGLE` con la tua email.
Il risultato deve avere una riga e `role = admin`.
Non pubblicare l'email personale in script aggiunti al repository.

Il badge admin in questo step è solo informativo: il pannello admin arriverà
in una fase successiva e dovrà avere policy RLS specifiche.

## 3. Aggiornamento GitHub

Carica sul repository `Aston-Birra/fantaston-manager`, branch `main`:

- `index.html` (sovrascrivi)
- `js/app.js` (sovrascrivi)
- `css/step4.css` (nuovo)

Il file `sql/04-register-team-name.sql` puoi anche conservarlo nel repository
come versione del database, ma non è necessario per far funzionare il sito.
`LEGGIMI-STEP4.md` è facoltativo.

**NON cancellare o sostituire** `js/config.js` né `css/style.css`.
Le istruzioni di avvio OAuth e la connessione Supabase esistenti rimangono uguali.

## 4. Test

1. Apri `https://aston-birra.github.io/fantaston-manager/`.
2. Se hai già fatto il login, attendi il caricamento del profilo.
3. Verifica che appaia il form per il nome della fantasquadra.
4. Inserisci un nome di 3–32 caratteri, conferma la checkbox e salva.
5. Verifica che il form sparisca e compaia il nome della squadra.
6. Aggiorna la pagina: il nome deve rimanere uguale, senza poterlo editare.
7. Se hai abilitato l'admin, vedrai un badge amministratore.

Nota: le regole di nomi univoci, lunghezza e primo inserimento sono
verificate anche nel database. L'errore di nome già in uso verrà mostrato
nell'interfaccia. La grafica originale è intenzionalmente conservata: il CSS
sarà ridisegnato nello step grafico successivo.
