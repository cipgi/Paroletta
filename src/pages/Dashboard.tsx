import { Link } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, FileText, TrendingUp, ArrowRight } from "lucide-react";

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

export default function Dashboard() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { data: sheetsList } = trpc.sheets.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: sheetsCount } = trpc.sheets.count.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: subscription } = trpc.subscriptions.mySubscription.useQuery(
    undefined,
    {
      enabled: isAuthenticated,
    }
  );
  const { data: organizationOverview } = trpc.organization.overview.useQuery(
    undefined,
    {
      enabled: isAuthenticated,
    }
  );

  if (isLoading) {
    return <div className="text-slate-500">Caricamento dashboard...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  const totalSheets = sheetsCount ?? sheetsList?.length ?? 0;
  const recentSheets = sheetsList?.slice(0, 5) ?? [];

  const planLabels: Record<string, string> = {
    trial: "Prova Gratuita",
    base: "Base",
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Ciao, Dott. {user?.name ?? "Utente"}
        </h1>
        <p className="text-slate-500 mt-1">
          Ecco cosa è successo oggi nella tua pratica.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{totalSheets}</p>
              <p className="text-sm text-slate-500">Schede generate</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">
                {planLabels[subscription?.status ?? "trial"]}
              </p>
              <p className="text-sm text-slate-500">
                {organizationOverview
                  ? `${organizationOverview.usage.used}/${organizationOverview.usage.limit} pool condiviso`
                  : user?.piano === "trial"
                    ? `${user?.trialSchedeUsate ?? 0}/15 schede prova`
                    : `${user?.schedeMese ?? 0}/100 schede mese`}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Link to="/generator">
          <Button className="bg-teal-600 hover:bg-teal-700">
            <Sparkles className="w-4 h-4 mr-2" />
            Genera nuova scheda
          </Button>
        </Link>
      </div>

      {/* Recent sheets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Schede recenti</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          {recentSheets.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>Nessuna scheda generata ancora.</p>
              <Link to="/generator">
                <Button variant="link" className="mt-2">
                  Genera la prima scheda
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSheets.map(sheet => (
                <div
                  key={sheet.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div>
                    <p className="font-medium text-slate-800">
                      {getSheetTypeLabel(sheet.tipoOutput)}
                      {isTextWithPhonemeSheet(sheet.tipoOutput) &&
                        ` — /${sheet.fonema}/`}
                    </p>
                    <p className="text-sm text-slate-500">
                      {sheet.interesse} •{" "}
                      {new Date(sheet.createdAt).toLocaleDateString("it-IT")}
                    </p>
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
