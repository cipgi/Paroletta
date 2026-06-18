# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Autenticazione

Paroletta usa Supabase Auth per il login e la registrazione con email e password.
Il flusso credentials è implementato nel router TRPC `api/auth-router.ts`, tramite
`supabase.auth.signUp` per la registrazione e `supabase.auth.signInWithPassword`
per l'accesso.

Il recupero password parte da `auth.requestPasswordReset`: il backend applica
rate limit/audit su `app.password_reset_requests` e invia l'email tramite
`supabase.auth.resetPasswordForEmail`. Il link torna a `/reset-password`, dove il
frontend usa una sessione Supabase temporanea solo in memoria per chiamare
`supabase.auth.updateUser`.

Il login Google/OAuth non è esposto: non ci sono route HTTP dedicate a Google in
`api/boot.ts` e la schermata di login mostra solo il form email/password.

## Variabili d’ambiente di produzione

In produzione il server richiede le credenziali Supabase prima di avviarsi, così
da evitare deploy apparentemente online ma con query TRPC che falliscono a runtime
con `Invalid API key`. Configura queste variabili nel provider di hosting:

- `SESSION_SECRET` con almeno 32 caratteri casuali, usato per firmare i JWT di sessione applicativa
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (oppure `SUPABASE_ANON_KEY` per configurazioni legacy)
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL`, URL pubblico HTTPS dell'app, usato per i link email di recupero password

In Supabase Auth configura questi redirect:

- Site URL: `${APP_BASE_URL}`
- Redirect URL recupero password: `${APP_BASE_URL}/reset-password`
- Redirect URL conferma account: `${APP_BASE_URL}/login?auth_action=confirm-email`

Nel template email di conferma account puoi usare il link Supabase standard
`{{ .ConfirmationURL }}`. Se invece usi un template custom che porta direttamente
all'app, usa
`{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`.
Nel template recupero password usa `{{ .ConfirmationURL }}`. Configura un SMTP
custom in produzione per evitare i limiti del servizio email di default.

Se il link email di recupero porta a `/` o a `localhost:3000` invece che a
`/reset-password`, Supabase sta usando il Site URL o sta rifiutando il redirect
richiesto: controlla che `APP_BASE_URL` corrisponda al dominio pubblico e che la
Redirect URL esatta sia allowlistata. Se compare `otp_expired`, richiedi un nuovo
link: i link di recovery sono temporanei e monouso.

Gli header IP di proxy (`X-Forwarded-For`, `X-Real-IP`, `CF-Connecting-IP`) sono
ignorati dal rate limit login per default. Imposta `LOGIN_TRUST_PROXY_HEADERS=true`
solo se il deployment è dietro un proxy fidato che sovrascrive o normalizza questi
header prima che arrivino al backend.

Per la generazione immagini server-side configura anche `OPENAI_API_KEY`. Il
provider immagini usa OpenAI con modello predefinito `gpt-image-2`, qualità
`low`, formato quadrato 1:1 e risoluzione `1024x1024`; `OPENAI_IMAGE_MODEL` e
`OPENAI_IMAGE_API_URL` sono disponibili solo per override server-side.
Le immagini generate vengono caricate nel bucket Supabase Storage privato
`generated-images`; il database salva solo il riferimento `storage://...` e il
backend restituisce al frontend una signed URL temporanea. Puoi cambiare il nome
bucket con `SUPABASE_GENERATED_IMAGES_BUCKET` e la durata delle signed URL con
`SUPABASE_IMAGE_SIGNED_URL_SECONDS`; se cambi bucket, crea anche il bucket
corrispondente o adatta la migrazione SQL.

Per migrare immagini già salvate in `app.illustrations.file_path` come
`data:image/...;base64,...`, applica prima le migrazioni SQL e poi lancia:

```bash
npm run migrate:images:storage
```

### Perché servono tutte e tre

L’errore mostrato nei log non indica un problema nella query
`organization.overview`: quella query arriva fino a Supabase, ma Supabase rifiuta
la chiave configurata sul server. In particolare:

- la publishable/anon key serve per le operazioni utente e per far valutare le
  policy RLS con il token della sessione;
- la service-role key serve solo al backend per operazioni amministrative
  limitate, ad esempio leggere gli inviti ricevuti e i profili dei Manager;
- se la service-role key manca, è vuota o è stata copiata male in Render, il
  client admin Supabase viene creato con una chiave non valida e le chiamate
  server-side falliscono con `Invalid API key`.

La service-role key è usata solo lato server. Non esporla mai al client e non
prefissarla con `VITE_`, perché le variabili `VITE_*` vengono incluse nel bundle
frontend.

Se nei log compare invece `permission denied for schema app`, le chiavi sono
state accettate ma il ruolo PostgREST non ha i permessi SQL sullo schema
custom `app`. Applica le migrazioni fino a `db/migrations/016_app_schema_grants.sql`
per concedere `usage` sullo schema e i privilegi necessari a `authenticated` e
`service_role`; le policy RLS continuano comunque a limitare le righe accessibili
agli utenti.

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs["recommended-typescript"],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```
