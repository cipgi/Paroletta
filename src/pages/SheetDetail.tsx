import { useParams, Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Download,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

export default function SheetDetail() {
  const { id } = useParams<{ id: string }>();
  const sheetId = Number(id);

  const { user } = useAuth();

  const { data: sheet, isLoading } = trpc.sheets.detail.useQuery(
    { id: sheetId },
    { enabled: !isNaN(sheetId) }
  );

  const generatePdf = trpc.sheets.generatePdf.useMutation({
    onSuccess: (data) => {
      const a = document.createElement("a");
      a.href = `data:application/pdf;base64,${data.data}`;
      a.download = data.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20 text-slate-400">
        Caricamento...
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <FileText className="w-10 h-10 mx-auto mb-3 text-slate-300" />
        <p className="text-slate-500">Scheda non trovata.</p>
        <Link to="/sheets">
          <Button variant="link" className="mt-2">
            Torna alle schede
          </Button>
        </Link>
      </div>
    );
  }

  const words = (sheet.listaParole as string[] | null) ?? [];

  const doctorName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.name || "Nome Utente";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/sheets">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Indietro
          </Button>
        </Link>
        <div className="flex gap-2">
          <Button
            className="bg-teal-600 hover:bg-teal-700"
            size="sm"
            onClick={() => generatePdf.mutate({ id: sheet.id })}
            disabled={generatePdf.isPending}
          >
            <Download className="w-4 h-4 mr-1" />
            {generatePdf.isPending ? "Generazione..." : "Scarica PDF"}
          </Button>
        </div>
      </div>

      {/* Preview card */}
      <Card className="border-2 border-slate-200">
        <CardContent className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-600 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-slate-800">LogopediPro</p>
                <p className="text-xs text-slate-500">Scheda didattica personalizzata</p>
              </div>
            </div>
            <Badge variant="outline" className="capitalize">
              {sheet.tipoOutput}
            </Badge>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-slate-500">Fonema target</p>
              <p className="font-semibold text-slate-800 text-lg">/{sheet.fonema}/</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-slate-500">Interesse</p>
              <p className="font-semibold text-slate-800 capitalize">{sheet.interesse}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-slate-500">Difficoltà</p>
              <p className="font-semibold text-slate-800 capitalize">{sheet.difficolta}</p>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-800">
              {sheet.tipoOutput === "storia" && "Storia"}
              {sheet.tipoOutput === "filastrocca" && "Filastrocca"}
              {sheet.tipoOutput === "lista" && "Lista di parole"}
            </h2>

            <div className="text-slate-700 leading-relaxed whitespace-pre-line text-lg">
              {sheet.testoGenerato}
            </div>

            {words.length > 0 && (
              <div className="pt-4">
                <p className="text-sm font-medium text-slate-500 mb-2">Parole chiave:</p>
                <div className="flex flex-wrap gap-2">
                  {words.map((w) => (
                    <Badge key={w} variant="secondary" className="text-sm">
                      {w}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Illustration placeholder */}
          <div className="mt-8 p-6 bg-slate-50 rounded-xl text-center">
            <p className="text-sm text-slate-500 mb-2">Illustrazione</p>
            <div className="w-32 h-32 mx-auto bg-slate-200 rounded-lg flex items-center justify-center">
              <span className="text-4xl">🎨</span>
            </div>
            <p className="text-xs text-slate-400 mt-2 capitalize">
              Tag: {sheet.tagImmagine ?? "generico"}
            </p>
          </div>

          {/* Watermark footer */}
          <div className="mt-8 pt-4 border-t border-slate-200 text-center">
            <p className="text-sm text-slate-500 italic">
              Materiale a cura del Dott. {doctorName}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Generato con LogopediPro — www.logopedipro.it
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
