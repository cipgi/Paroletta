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

- Parse con schema zod (`unifiedSheetSchema`).
- Validazione con `validateSheet`: tipo richiesto, consegna non generica, domande coerenti, immagini nel numero/ruolo/livello atteso e prompt non duplicati o troppo generici.
- Se il primo output del modello non passa la validazione, il server effettua un secondo tentativo con correzione esplicita; dopo il secondo errore interrompe la richiesta invece di sostituire il risultato con dati mockup.

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
- Se interesse = `libero`, il server sceglie casualmente un interesse specifico disponibile prima di costruire il prompt.
- Se interesse = `nessuno`, il server non applica interessi predefiniti e usa solo argomento, frase target, scenario o descrizione forniti dall'utente; se mancano, la richiesta viene interrotta con errore utente.

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
- `numeroOpzioni` (2-4).

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
- stampa o salvataggio PDF tramite la finestra di stampa del browser, usando l'anteprima reale della scheda.

### Leve qualità da ottimizzare

- aderenza esatta al target (soggetto-verbo-oggetto),
- robustezza della scala bersaglio/D1 difficile/D2 intermedio/D3 facile,
- coerenza stilistica cross-frame,
- chiarezza clinica della consegna.

---

## 3) Scheda "Morfologia e morfosintassi" (`morfosintassi_complessa`)

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

## 4) Scheda "Narrazione e sequenze" (`narrazione_sequenze`)

### Input utente

- età, interesse,
- tema narrativo/obiettivo clinico (`scenarioSmart`),
- numero scene (`numeroScene`, 3-5).

### Output atteso

- storia breve con personaggi, problema/imprevisto e soluzione,
- 3-5 immagini ordinate cronologicamente,
- 4-5 domande su prima/dopo, personaggi, problema e soluzione.

### Cosa può farne l'utente

- riordino e racconto di sequenze,
- produzione narrativa guidata,
- lavoro su nessi temporali e causali.

---

## 5) Scheda "Pragmatica" (`pragmatica`)

### Input utente

- età, interesse,
- abilità pragmatica target,
- scenario sociale quotidiano,
- livello di complessità.

### Output atteso

- scenario sociale concreto,
- una scena illustrata,
- 4-6 domande con risposte modello su turni, inferenze, emozioni,
  intenzioni comunicative e frasi possibili.

### Cosa può farne l'utente

- discussione guidata su cosa dire/fare in una situazione,
- lavoro su emozioni e intenzioni,
- esercizi di risposta sociale flessibile.

---

## 6) Output finale e uso post-generazione

Dopo la generazione:

- la scheda viene salvata in DB,
- appare in elenco dettagli/preview,
- può essere stampata o salvata come PDF dal browser.

Questo consente cicli rapidi di miglioramento qualità:

1. fissare KPI qualitativi per tipo scheda,
2. modificare template/prompt/validazioni,
3. rigenerare e confrontare l'output clinico.
