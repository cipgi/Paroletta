# Processo di generazione schede (end-to-end)

Questo documento descrive, per ogni tipologia di scheda, il flusso completo:

1. input utente,
2. costruzione/sanitizzazione prompt,
3. output generato,
4. utilizzo pratico da parte dell'utente.

## 0) Pipeline comune a tutte le schede

### Input UI

L'utente compila i campi nella pagina `Generator` e avvia la mutazione `ai.generate`.

### Sanitizzazione server

Il server applica una sanitizzazione aggressiva sui campi testuali (`sanitizePromptVariable`) e valida i campi a enum consentiti (fonemi/interessi/tipo).

### Prompting

Il server costruisce due messaggi:

- `system`: template clinico fisso + regole di sicurezza + formato JSON obbligatorio.
- `user`: JSON con parametri già sanitizzati (trattati come dati, non istruzioni).

### Chiamata modello

- Chiamata a `chat/completions` con `gpt-4o-mini` e `response_format: json_object`.
- Se la chiamata fallisce, la richiesta viene interrotta con errore utente: non vengono usati contenuti mockup o precompilati.

### Validazione output

- Parse con schema zod (`aiResponseSchema`).
- Se `discriminazione_visiva`, controllo di coerenza strutturale (`validateVisualDiscriminationPlan`); se il piano non è valido, la richiesta viene interrotta invece di sostituire il risultato con dati mockup.

### Post-processing e persistenza

- Normalizzazione `listaParole` in base al tipo scheda.
- Salvataggio DB tabella `sheets`.
- Ritorno di `sheet`, `remaining`, `totalUsed`.

---

## 1) Schede "Testo con fonema"

Tipi inclusi: `storia`, `filastrocca`, `lista`.

### Input utente

- comuni: età, interesse.
- specifici: fonema target, aspetto specifico opzionale.
- selezione formato: storia/filastrocca/lista.

### Prompt processing

- Il prompt system impone semplicità linguistica, formato testuale per tipo, vincoli su `listaParole` e JSON finale.
- Se interesse = `libero`, il server sceglie un interesse specifico disponibile per la generazione.

### Output atteso

- `testoGenerato`:
  - storia: max ~150 parole + domande comprensione.
  - filastrocca: 8-12 versi + domande.
  - lista: 15-20 parole per difficoltà.
- `listaParole` coerente col testo effettivo.
- `tagImmagine` sostantivo singolo.

### Cosa può farne l'utente

- attività di articolazione guidata sul fonema,
- lettura breve + comprensione,
- progressione di difficoltà su lessico mirato.

### Leve qualità da ottimizzare

- tasso di parole realmente contenenti il fonema,
- naturalezza del testo (non liste forzate in storia/filastrocca),
- distribuzione difficoltà (soprattutto nel tipo lista),
- qualità/semplicità delle domande di comprensione.

---

## 2) Scheda "Discriminazione visiva" (`discriminazione_visiva`)

### Input utente

- età, interesse,
- `scenarioSmart`: frase target + struttura/asse da allenare,
- `numeroOpzioni` (2-4; in trial cap automatico a 2).

### Prompt processing

- Template system molto prescrittivo:
  - obbligo di produrre JSON unificato valido, senza testo extra,
  - `testo` = frase target concreta e visualmente rappresentabile,
  - `consegna` = istruzione "Indica l'immagine in cui ..." allineata alla frase target,
  - `immagini` ordinate come target, D1 difficile, D2 intermedio, D3 facile, secondo `numeroOpzioni`,
  - immagine bersaglio inequivocabilmente corretta rispetto alla frase target,
  - distrattori con difficoltà graduata e non più tutti quasi identici: D1 difficile estremamente simile con 1 dettaglio saliente cambiato, D2 intermedio con differenze evidenti su azione/modalità/posizione ma nello stesso tema, D3 facile con differenze sostanziali su agente/oggetto/destinazione o luogo,
  - un solo asse di variazione per distrattore, senza cambi casuali multipli,
  - prompt immagini in inglese con soggetto, azione, oggetto, contesto e dettaglio variato espliciti,
  - coerenza visiva forte: stesso stile, palette e livello di dettaglio,
  - no collage/griglie.
- Dopo output: `validateSheet` rifiuta piani con ruoli/livelli fuori ordine, numero opzioni errato, prompt generici, prompt duplicati o domande presenti dove non devono esserci.

### Output atteso

- JSON unificato strutturato,
- prompt immagini separati (target + distrattori),
- metadati coerenti con numero opzioni.

### Cosa può farne l'utente

- esercizi "indica l'immagine in cui..." ad alta precisione clinica,
- lavoro su comprensione frasale e differenze minime percettive,
- stampa PDF con frame coerenti.

### Leve qualità da ottimizzare

- aderenza esatta al target (soggetto-verbo-oggetto),
- robustezza della scala bersaglio/D1 difficile/D2 intermedio/D3 facile,
- coerenza stilistica cross-frame,
- chiarezza clinica della consegna.

---

## 3) Scheda "Morfosintassi complessa" (`morfosintassi_complessa`)

### Input utente

- età, interesse,
- `elementoGrammaticale` (es. clitici/relative/subordinate),
- `livelloComplessita` (base/intermedio/avanzato),
- `descrizioneScena` (smart input clinico-visivo).

### Prompt processing

- Il system prompt impone sezioni obbligatorie:
  - obiettivo morfosintattico,
  - frase target,
  - scena da illustrare,
  - domande comprensione,
  - prompt immagine.
- Sanitizzazione forte dei campi liberi prima del passaggio al modello.

### Output atteso

- focus esplicito su struttura grammaticale,
- frase target e scena strettamente allineate,
- domande mirate alla struttura.

### Cosa può farne l'utente

- terapia su strutture sintattiche specifiche,
- verifica comprensione/produzione guidata,
- uso combinato testo + immagine per ridurre ambiguità.

### Leve qualità da ottimizzare

- correttezza grammaticale reale rispetto all'obiettivo,
- calibrazione della complessità per livello scelto,
- disambiguazione della scena per supportare la frase target,
- qualità delle domande (mirate, non generiche).

---

## 4) Output finale e uso post-generazione

Dopo la generazione:

- la scheda viene salvata in DB,
- appare in elenco dettagli/preview,
- può essere esportata in PDF.

Questo consente cicli rapidi di miglioramento qualità:

1. fissare KPI qualitativi per tipo scheda,
2. modificare template/prompt/validazioni,
3. rigenerare e confrontare l'output clinico.
