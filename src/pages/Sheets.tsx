import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, ArrowRight, Sparkles } from "lucide-react";

function getSheetTypeLabel(tipoOutput: string) {
  const labels: Record<string, string> = {
    storia: "Storia",
    filastrocca: "Filastrocca",
    lista: "Lista parole",
    discriminazione_visiva: "Trova l'intruso",
    morfosintassi_complessa: "Morfosintassi complessa",
  };
  return labels[tipoOutput] ?? tipoOutput;
}

function isTextWithPhonemeSheet(tipoOutput: string) {
  return ["storia", "filastrocca", "lista"].includes(tipoOutput);
}

export default function Sheets() {
  const { data: sheets, isLoading } = trpc.sheets.list.useQuery();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-teal-600" />
            Schede Generate
          </h1>
          <p className="text-slate-500 mt-1">
            Storico di tutte le schede didattiche create.
          </p>
        </div>
        <Link to="/generator">
          <Button className="bg-teal-600 hover:bg-teal-700">
            <Sparkles className="w-4 h-4 mr-2" />
            Nuova scheda
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="text-center py-8 text-slate-400">
              Caricamento...
            </div>
          ) : !sheets || sheets.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>Nessuna scheda generata.</p>
              <Link to="/generator">
                <Button variant="link" className="mt-2">
                  Genera la prima scheda
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {sheets &&
                sheets.map(sheet => (
                  <div
                    key={sheet.id}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-teal-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800 flex items-center gap-2">
                          {getSheetTypeLabel(sheet.tipoOutput)}
                          {isTextWithPhonemeSheet(sheet.tipoOutput) && (
                            <Badge
                              variant="outline"
                              className="capitalize text-xs"
                            >
                              /{sheet.fonema}/
                            </Badge>
                          )}
                        </p>
                        <p className="text-sm text-slate-500">
                          {sheet.interesse} •{" "}
                          {new Date(sheet.createdAt).toLocaleDateString(
                            "it-IT"
                          )}
                        </p>
                      </div>
                    </div>
                    <Link to={`/sheets/${sheet.id}`}>
                      <Button variant="ghost" size="sm">
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
