import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Loader2,
  FileText,
  Baby,
  Heart,
  Mic,
  Eye,
  Brain,
  Images,
  ListOrdered,
  MessageCircle,
} from "lucide-react";

const interessi = [
  "libero",
  "nessuno",
  "dinosauro",
  "principessa",
  "calcio",
  "gatto",
  "cane",
  "auto",
  "cucina",
  "mare",
  "ballo",
  "musica",
];

const fonemi = ["r", "s", "l", "t", "d", "k", "g", "p", "b", "f", "v"];

type TipoScheda =
  | "storia"
  | "filastrocca"
  | "lista"
  | "discriminazione_visiva"
  | "morfosintassi_complessa"
  | "narrazione_sequenze"
  | "pragmatica";

type TipoSchedaPrincipale =
  | "testo_con_fonema"
  | "discriminazione_visiva"
  | "morfosintassi_complessa"
  | "narrazione_sequenze"
  | "pragmatica";

type TipoTestoConFonema = Extract<
  TipoScheda,
  "storia" | "filastrocca" | "lista"
>;

type LivelloComplessita = "base" | "intermedio" | "avanzato";

const tipiTestoConFonema: TipoTestoConFonema[] = [
  "storia",
  "filastrocca",
  "lista",
];

const tipoTestoConFonemaConfig: Record<
  TipoTestoConFonema,
  { titolo: string; descrizione: string }
> = {
  storia: {
    titolo: "Storia breve",
    descrizione: "Materiale fonologico semplice con parole target nel testo.",
  },
  filastrocca: {
    titolo: "Filastrocca",
    descrizione: "Testo ritmato e breve per ripetizione e produzione orale.",
  },
  lista: {
    titolo: "Lista parole",
    descrizione: "Parole organizzate per difficoltà e fonema target.",
  },
};

const tipoSchedaConfig: Record<
  TipoSchedaPrincipale,
  { titolo: string; descrizione: string; icona: typeof FileText }
> = {
  discriminazione_visiva: {
    titolo: "Indica l'immagine corretta",
    descrizione:
      "Categorizzazione semantica o attenzione visiva: un target corretto e distrattori coordinati.",
    icona: Eye,
  },
  morfosintassi_complessa: {
    titolo: "Morfologia e morfosintassi",
    descrizione:
      "Articoli, accordi, tempi verbali, clitici, relative e subordinate.",
    icona: Brain,
  },
  narrazione_sequenze: {
    titolo: "Narrazione e sequenze",
    descrizione:
      "Storia in 3-5 scene ordinate con domande su prima/dopo, problema e soluzione.",
    icona: ListOrdered,
  },
  pragmatica: {
    titolo: "Pragmatica",
    descrizione:
      "Turni conversazionali, inferenze, emozioni e intenzioni comunicative.",
    icona: MessageCircle,
  },
  testo_con_fonema: {
    titolo: "Testo con fonema",
    descrizione:
      "Storie, filastrocche o liste costruite intorno a un fonema obiettivo.",
    icona: FileText,
  },
};

const isTipoTestoConFonema = (tipo: TipoScheda): tipo is TipoTestoConFonema =>
  tipiTestoConFonema.includes(tipo as TipoTestoConFonema);

const canDisableImagesForType = (tipo: TipoScheda) =>
  [
    "morfosintassi_complessa",
    "pragmatica",
    "storia",
    "filastrocca",
    "lista",
  ].includes(tipo);

export default function Generator() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const [eta, setEta] = useState("6-8 anni");
  const [fonema, setFonema] = useState("r");
  const [interesse, setInteresse] = useState("libero");
  const [tipoOutput, setTipoOutput] = useState<TipoScheda>(
    "discriminazione_visiva"
  );
  const [aspettoSpecifico, setAspettoSpecifico] = useState("");
  const [scenarioSmart, setScenarioSmart] = useState("");
  const [elementoGrammaticale, setElementoGrammaticale] = useState(
    "pronome clitico lo/la"
  );
  const [livelloComplessita, setLivelloComplessita] =
    useState<LivelloComplessita>("intermedio");
  const [descrizioneScena, setDescrizioneScena] = useState("");
  const [numeroOpzioni, setNumeroOpzioni] = useState(4);
  const [numeroScene, setNumeroScene] = useState(4);
  const [includeImages, setIncludeImages] = useState(true);

  const generate = trpc.ai.generate.useMutation({
    onSuccess: data => {
      utils.sheets.list.setData(undefined, current => {
        if (!current) return current;
        return [data.sheet, ...current];
      });
      utils.sheets.count.setData(undefined, current => (current ?? 0) + 1);

      void Promise.allSettled([
        utils.sheets.list.invalidate(),
        utils.sheets.count.invalidate(),
        utils.auth.me.invalidate(),
        utils.subscriptions.mySubscription.invalidate(),
      ]).then(results => {
        const failedRefreshes = results.filter(
          result => result.status === "rejected"
        );
        if (failedRefreshes.length > 0) {
          console.warn("Post-generation cache refresh failed", failedRefreshes);
        }
      });

      navigate("/sheets");
    },
  });

  const handleGenerate = () => {
    const trimmedAspettoSpecifico = aspettoSpecifico.trim();
    const trimmedScenarioSmart = scenarioSmart.trim();
    const trimmedElementoGrammaticale = elementoGrammaticale.trim();
    const trimmedDescrizioneScena = descrizioneScena.trim();

    generate.mutate({
      eta,
      fonema,
      interesse,
      tipoOutput,
      includeImages: canDisableImagesForType(tipoOutput) ? includeImages : true,
      ...(isTipoTestoConFonema(tipoOutput)
        ? { aspettoSpecifico: trimmedAspettoSpecifico || undefined }
        : {}),
      ...(tipoOutput === "discriminazione_visiva"
        ? {
            scenarioSmart: trimmedScenarioSmart || undefined,
            numeroOpzioni,
          }
        : {}),
      ...(tipoOutput === "narrazione_sequenze"
        ? {
            scenarioSmart: trimmedScenarioSmart || undefined,
            numeroScene,
          }
        : {}),
      ...(tipoOutput === "pragmatica"
        ? {
            aspettoSpecifico: trimmedAspettoSpecifico || undefined,
            scenarioSmart: trimmedScenarioSmart || undefined,
            livelloComplessita,
          }
        : {}),
      ...(tipoOutput === "morfosintassi_complessa"
        ? {
            elementoGrammaticale: trimmedElementoGrammaticale || undefined,
            livelloComplessita,
            descrizioneScena: trimmedDescrizioneScena || undefined,
          }
        : {}),
    });
  };

  const renderImageToggle = () => {
    if (!canDisableImagesForType(tipoOutput)) return null;

    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Images className="h-4 w-4 text-teal-600" />
            Immagine nella scheda
          </Label>
          <p className="mt-1 text-xs text-slate-500">
            {includeImages
              ? "La scheda includerà una o più immagini generate."
              : "La scheda sarà solo testuale, senza generare immagini."}
          </p>
        </div>
        <Toggle
          pressed={includeImages}
          onPressedChange={setIncludeImages}
          variant="outline"
          className="w-full justify-center sm:w-32"
          aria-label="Attiva o disattiva immagini nella scheda"
        >
          {includeImages ? "On" : "Off"}
        </Toggle>
      </div>
    );
  };

  const renderClinicalInputs = () => {
    if (tipoOutput === "discriminazione_visiva") {
      return (
        <div className="space-y-5 rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
          <div className="space-y-2">
            <Label htmlFor="scenarioSmart" className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-600" />
              Frase target e struttura da allenare
            </Label>
            <Textarea
              id="scenarioSmart"
              value={scenarioSmart}
              onChange={e => setScenarioSmart(e.target.value)}
              placeholder='es. "Frase target: Il bambino accarezza il dinosauro. Struttura: soggetto-verbo-oggetto. Variazioni: azione, agente, oggetto"'
              rows={5}
            />
            <p className="text-xs text-slate-500">
              Paroletta genera un bersaglio esatto e distrattori graduati:
              difficile quasi identico, intermedio con differenze evidenti,
              facile con differenze sostanziali.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="numeroOpzioni" className="flex items-center gap-2">
              <Images className="w-4 h-4 text-teal-600" />
              Numero di frame coerenti
            </Label>
            <Select
              value={String(numeroOpzioni)}
              onValueChange={value => setNumeroOpzioni(Number(value))}
            >
              <SelectTrigger id="numeroOpzioni">
                <SelectValue placeholder="Seleziona numero immagini" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">
                  2 immagini: target + 1 distrattore
                </SelectItem>
                <SelectItem value="3">
                  3 immagini: target + 2 distrattori
                </SelectItem>
                <SelectItem value="4">
                  4 immagini: target + 3 distrattori
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Ogni nuova immagine generata viene scalata dal limite immagini del
              piano attivo.
            </p>
          </div>
        </div>
      );
    }

    if (tipoOutput === "narrazione_sequenze") {
      return (
        <div className="space-y-5 rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
          <div className="space-y-2">
            <Label htmlFor="scenarioSmart" className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              Tema narrativo e obiettivo
            </Label>
            <Textarea
              id="scenarioSmart"
              value={scenarioSmart}
              onChange={e => setScenarioSmart(e.target.value)}
              placeholder='es. "Un bambino perde la palla al parco, chiede aiuto e la ritrova. Lavora su prima/dopo, problema e soluzione."'
              rows={5}
            />
            <p className="text-xs text-slate-500">
              Paroletta crea una sequenza ordinata con personaggi coerenti,
              problema semplice e soluzione finale.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="numeroScene" className="flex items-center gap-2">
              <Images className="w-4 h-4 text-amber-600" />
              Numero di scene
            </Label>
            <Select
              value={String(numeroScene)}
              onValueChange={value => setNumeroScene(Number(value))}
            >
              <SelectTrigger id="numeroScene">
                <SelectValue placeholder="Seleziona numero scene" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 scene</SelectItem>
                <SelectItem value="4">4 scene</SelectItem>
                <SelectItem value="5">5 scene</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }

    if (tipoOutput === "pragmatica") {
      return (
        <div className="space-y-5 rounded-2xl border border-rose-100 bg-rose-50/50 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="aspettoSpecifico">
                Abilità pragmatica target
              </Label>
              <Input
                id="aspettoSpecifico"
                value={aspettoSpecifico}
                onChange={e => setAspettoSpecifico(e.target.value)}
                placeholder="es. turno conversazionale, inferenza, emozione, richiesta di aiuto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="livelloComplessita">Complessità richiesta</Label>
              <Select
                value={livelloComplessita}
                onValueChange={(value: LivelloComplessita) =>
                  setLivelloComplessita(value)
                }
              >
                <SelectTrigger id="livelloComplessita">
                  <SelectValue placeholder="Seleziona complessità" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">Base</SelectItem>
                  <SelectItem value="intermedio">Intermedio</SelectItem>
                  <SelectItem value="avanzato">Avanzato</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scenarioSmart" className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-600" />
              Scenario sociale
            </Label>
            <Textarea
              id="scenarioSmart"
              value={scenarioSmart}
              onChange={e => setScenarioSmart(e.target.value)}
              placeholder='es. "Due bambini vogliono lo stesso gioco. Uno è triste e l’altro deve scegliere cosa dire."'
              rows={5}
            />
            <p className="text-xs text-slate-500">
              L’IA genera uno scenario quotidiano con domande su emozioni,
              intenzioni, inferenze e frasi possibili.
            </p>
          </div>
        </div>
      );
    }

    if (tipoOutput === "morfosintassi_complessa") {
      return (
        <div className="space-y-5 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="elementoGrammaticale">
                Obiettivo morfologico o morfosintattico
              </Label>
              <Input
                id="elementoGrammaticale"
                value={elementoGrammaticale}
                onChange={e => setElementoGrammaticale(e.target.value)}
                placeholder="es. articoli, plurali, accordi nome-aggettivo, pronome clitico lo, frase relativa"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="livelloComplessita">Complessità richiesta</Label>
              <Select
                value={livelloComplessita}
                onValueChange={(value: LivelloComplessita) =>
                  setLivelloComplessita(value)
                }
              >
                <SelectTrigger id="livelloComplessita">
                  <SelectValue placeholder="Seleziona complessità" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">Base</SelectItem>
                  <SelectItem value="intermedio">Intermedio</SelectItem>
                  <SelectItem value="avanzato">Avanzato</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="descrizioneScena"
              className="flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              Smart Input: scena visiva e obiettivo clinico
            </Label>
            <Textarea
              id="descrizioneScena"
              value={descrizioneScena}
              onChange={e => setDescrizioneScena(e.target.value)}
              placeholder='es. "Due bambini hanno una palla rossa e due palle blu: voglio lavorare su plurali e accordo nome-aggettivo."'
              rows={5}
            />
            <p className="text-xs text-slate-500">
              L’IA adatta consegna, frase target, domande e prompt immagine al
              livello scelto: morfologia di base o struttura complessa.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-5 rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
        <div className="space-y-2">
          <Label htmlFor="fonema" className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-teal-600" />
            Fonema obiettivo
          </Label>
          <Select value={fonema} onValueChange={setFonema}>
            <SelectTrigger id="fonema">
              <SelectValue placeholder="Seleziona fonema" />
            </SelectTrigger>
            <SelectContent>
              {fonemi.map(f => (
                <SelectItem key={f} value={f}>
                  /{f}/
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="aspettoSpecifico">
            Aspetto specifico (opzionale)
          </Label>
          <Textarea
            id="aspettoSpecifico"
            value={aspettoSpecifico}
            onChange={e => setAspettoSpecifico(e.target.value)}
            placeholder='es. "Non usare verbi al passato"'
            rows={3}
          />
        </div>
      </div>
    );
  };

  const tipoPrincipale: TipoSchedaPrincipale = isTipoTestoConFonema(tipoOutput)
    ? "testo_con_fonema"
    : tipoOutput;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-teal-600" />
          Genera scheda
        </h1>
        <p className="text-slate-500 mt-1">
          Scegli il tipo di esercizio: Paroletta adatta i parametri, la logica
          visiva e il layout finale.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-teal-600" />
              Tipo di scheda
            </Label>
            <div className="grid gap-3 md:grid-cols-2">
              {(
                [
                  "discriminazione_visiva",
                  "morfosintassi_complessa",
                  "narrazione_sequenze",
                  "pragmatica",
                  "testo_con_fonema",
                ] as TipoSchedaPrincipale[]
              ).map(tipo => {
                const config = tipoSchedaConfig[tipo];
                const Icon = config.icona;
                const selected = tipoPrincipale === tipo;

                if (tipo === "testo_con_fonema") {
                  const selectedTextConfig =
                    tipoTestoConFonemaConfig[
                      tipoOutput as TipoTestoConFonema
                    ] ?? tipoTestoConFonemaConfig.storia;

                  return (
                    <div
                      key={tipo}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (!isTipoTestoConFonema(tipoOutput)) {
                          setTipoOutput("storia");
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (!isTipoTestoConFonema(tipoOutput)) {
                            setTipoOutput("storia");
                          }
                        }
                      }}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        selected
                          ? "border-teal-600 bg-teal-50 text-teal-800 shadow-sm"
                          : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        <Icon className="h-5 w-5" />
                        {config.titolo}
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-slate-500">
                        {config.descrizione}
                      </p>

                      {selected && (
                        <div
                          className="mt-4 space-y-2"
                          onClick={e => e.stopPropagation()}
                        >
                          <Label htmlFor="tipoTestoConFonema">
                            Formato del testo
                          </Label>
                          <Select
                            value={tipoOutput}
                            onValueChange={(value: TipoTestoConFonema) =>
                              setTipoOutput(value)
                            }
                          >
                            <SelectTrigger id="tipoTestoConFonema">
                              <SelectValue placeholder="Scegli formato" />
                            </SelectTrigger>
                            <SelectContent>
                              {tipiTestoConFonema.map(opzione => (
                                <SelectItem key={opzione} value={opzione}>
                                  {tipoTestoConFonemaConfig[opzione].titolo}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs leading-relaxed text-slate-500">
                            {selectedTextConfig.descrizione}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <button
                    key={tipo}
                    onClick={() => setTipoOutput(tipo)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      selected
                        ? "border-teal-600 bg-teal-50 text-teal-800 shadow-sm"
                        : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      <Icon className="h-5 w-5" />
                      {config.titolo}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">
                      {config.descrizione}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="eta" className="flex items-center gap-2">
                <Baby className="w-4 h-4 text-teal-600" />
                Fascia d'età
              </Label>
              <Select value={eta} onValueChange={setEta}>
                <SelectTrigger id="eta">
                  <SelectValue placeholder="Seleziona fascia d'età" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3-5 anni">3-5 anni</SelectItem>
                  <SelectItem value="6-8 anni">6-8 anni</SelectItem>
                  <SelectItem value="9-11 anni">9-11 anni</SelectItem>
                  <SelectItem value="12-14 anni">12-14 anni</SelectItem>
                  <SelectItem value="adulto">Adulto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="interesse" className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-teal-600" />
                Interesse del bambino
              </Label>
              <Select value={interesse} onValueChange={setInteresse}>
                <SelectTrigger id="interesse">
                  <SelectValue placeholder="Seleziona interesse" />
                </SelectTrigger>
                <SelectContent>
                  {interessi.map(i => (
                    <SelectItem key={i} value={i}>
                      {i === "libero"
                        ? "Libero (sceglie il sistema)"
                        : i === "nessuno"
                          ? "Nessuno (usa solo il tuo input)"
                          : i.charAt(0).toUpperCase() + i.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {renderImageToggle()}

          {renderClinicalInputs()}

          <Button
            className="w-full bg-teal-600 hover:bg-teal-700"
            size="lg"
            onClick={handleGenerate}
            disabled={generate.isPending}
          >
            {generate.isPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Generazione in corso...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2" />
                Genera scheda
              </>
            )}
          </Button>

          {generate.isError && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {generate.error?.message ?? "Errore durante la generazione"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
