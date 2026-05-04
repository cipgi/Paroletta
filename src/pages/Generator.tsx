import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
} from "lucide-react";

const interessi = [
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

export default function Generator() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const savedPreferences = (() => {
    const saved = localStorage.getItem("generator-preferences");
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved) as {
        eta?: string;
        fonema?: string;
        interesse?: string;
        tipoOutput?: "storia" | "filastrocca" | "lista";
        aspettoSpecifico?: string;
      };
      return {
        eta: parsed.eta ?? "6 anni",
        fonema: parsed.fonema && fonemi.includes(parsed.fonema) ? parsed.fonema : "r",
        interesse: parsed.interesse && interessi.includes(parsed.interesse) ? parsed.interesse : "dinosauro",
        tipoOutput: parsed.tipoOutput ?? "storia",
        aspettoSpecifico: parsed.aspettoSpecifico ?? "",
      };
    } catch {
      return null;
    }
  })();

  const [eta, setEta] = useState(savedPreferences?.eta ?? "6 anni");
  const [fonema, setFonema] = useState(savedPreferences?.fonema ?? "r");
  const [interesse, setInteresse] = useState(savedPreferences?.interesse ?? "dinosauro");
  const [tipoOutput, setTipoOutput] = useState<"storia" | "filastrocca" | "lista">(savedPreferences?.tipoOutput ?? "storia");
  const [aspettoSpecifico, setAspettoSpecifico] = useState(savedPreferences?.aspettoSpecifico ?? "");

  useEffect(() => {
    localStorage.setItem("generator-preferences", JSON.stringify({ eta, fonema, interesse, tipoOutput, aspettoSpecifico }));
  }, [eta, fonema, interesse, tipoOutput, aspettoSpecifico]);

  const generate = trpc.ai.generate.useMutation({
    onSuccess: async (data) => {
      await Promise.all([
        utils.sheets.list.invalidate(),
        utils.auth.me.invalidate(),
        utils.subscriptions.mySubscription.invalidate(),
      ]);
      navigate(`/sheets/${data.sheet.id}`);
    },
  });

  const handleGenerate = () => {
    generate.mutate({
      eta,
      fonema,
      interesse,
      tipoOutput,
      aspettoSpecifico: aspettoSpecifico.trim() || undefined,
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-teal-600" />
          Genera Scheda Didattica
        </h1>
        <p className="text-slate-500 mt-1">
          Inserisci pochi parametri e l'IA creerà materiale personalizzato.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="eta" className="flex items-center gap-2">
              <Baby className="w-4 h-4 text-teal-600" />
              Età del paziente
            </Label>
            <Input
              id="eta"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              placeholder="es. 6 anni"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fonema" className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-teal-600" />
              Fonema / Obiettivo
            </Label>
            <Select value={fonema} onValueChange={setFonema}>
              <SelectTrigger id="fonema">
                <SelectValue placeholder="Seleziona fonema" />
              </SelectTrigger>
              <SelectContent>
                {fonemi.map((f) => (
                  <SelectItem key={f} value={f}>
                    /{f}/
                  </SelectItem>
                ))}
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
                {interessi.map((i) => (
                  <SelectItem key={i} value={i}>
                    {i.charAt(0).toUpperCase() + i.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-teal-600" />
              Tipo di output
            </Label>
            <div className="grid grid-cols-3 gap-3">
              {(["storia", "filastrocca", "lista"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTipoOutput(t)}
                  className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                    tipoOutput === t
                      ? "border-teal-600 bg-teal-50 text-teal-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {t === "storia" && "Storia breve"}
                  {t === "filastrocca" && "Filastrocca"}
                  {t === "lista" && "Lista parole"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="aspettoSpecifico">Aspetto specifico (opzionale)</Label>
            <Textarea
              id="aspettoSpecifico"
              value={aspettoSpecifico}
              onChange={(e) => setAspettoSpecifico(e.target.value)}
              placeholder='es. "Non usare verbi al passato"'
              rows={3}
            />
          </div>

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
