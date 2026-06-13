import { Link } from "react-router";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, FileText, TrendingUp, ArrowRight } from "lucide-react";
import { SubscriptionPlanLimits } from "@contracts/constants";

function getSheetTypeLabel(tipoOutput: string) {
  const labels: Record<string, string> = {
    storia: "Storia",
    filastrocca: "Filastrocca",
    lista: "Lista parole",
    discriminazione_visiva: "Trova l'intruso",
    morfosintassi_complessa: "Morfologia e morfosintassi",
    narrazione_sequenze: "Narrazione e sequenze",
    pragmatica: "Pragmatica",
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

  const totalSheets = sheetsCount ?? sheetsList?.length ?? 0;
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [phonemeFilter, setPhonemeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recenti" | "vecchie">("recenti");

  const recentSheets = useMemo(() => {
    const base = sheetsList ?? [];
    return base
      .filter(sheet =>
        typeFilter === "all" ? true : sheet.tipoOutput === typeFilter
      )
      .filter(sheet =>
        phonemeFilter === "all" ? true : sheet.fonema === phonemeFilter
      )
      .sort((a, b) =>
        sortBy === "recenti"
          ? +new Date(b.createdAt) - +new Date(a.createdAt)
          : +new Date(a.createdAt) - +new Date(b.createdAt)
      )
      .slice(0, 10);
  }, [phonemeFilter, sheetsList, sortBy, typeFilter]);

  const availableTypes = Array.from(
    new Set((sheetsList ?? []).map(sheet => sheet.tipoOutput))
  );
  const availablePhonemes = Array.from(
    new Set((sheetsList ?? []).map(sheet => sheet.fonema))
  );

  const planLabels: Record<string, string> = {
    trial: "Prova Gratuita",
    sviluppo: "Sviluppo",
    nessun_abbonamento: "Nessun abbonamento",
    starter: "Starter",
    pro: "Pro",
    max: "Max",
  };
  const currentPlan = subscription?.plan ?? user?.piano ?? "trial";
  const currentPlanLabel = planLabels[currentPlan] ?? currentPlan;
  const currentFallbackLimits =
    SubscriptionPlanLimits[
      currentPlan as keyof typeof SubscriptionPlanLimits
    ] ?? SubscriptionPlanLimits.trial;
  const fallbackSheetUsage =
    user?.piano === "trial"
      ? (user?.trialSchedeUsate ?? 0)
      : (user?.schedeMese ?? 0);
  const fallbackImageUsage =
    user?.piano === "trial"
      ? (user?.trialImmaginiUsate ?? 0)
      : (user?.immaginiMese ?? 0);

  if (isLoading) {
    return <div className="text-slate-500">Caricamento dashboard...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

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
                {currentPlanLabel}
              </p>
              <p className="text-sm text-slate-500 leading-5">
                {organizationOverview
                  ? `${organizationOverview.usage.sheets.used}/${organizationOverview.usage.sheets.limit} schede`
                  : `${fallbackSheetUsage}/${currentFallbackLimits.sheetLimit} schede`}
                <br />
                {organizationOverview
                  ? `${organizationOverview.usage.images.used}/${organizationOverview.usage.images.limit} immagini`
                  : `${fallbackImageUsage}/${currentFallbackLimits.imageLimit} immagini`}
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
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
              value={typeFilter}
              onChange={event => setTypeFilter(event.target.value)}
            >
              <option value="all">Tutti i tipi</option>
              {availableTypes.map(type => (
                <option key={type} value={type}>
                  {getSheetTypeLabel(type)}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
              value={phonemeFilter}
              onChange={event => setPhonemeFilter(event.target.value)}
            >
              <option value="all">Tutti i fonemi</option>
              {availablePhonemes.map(phoneme => (
                <option key={phoneme} value={phoneme}>
                  /{phoneme}/
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
              value={sortBy}
              onChange={event =>
                setSortBy(event.target.value as "recenti" | "vecchie")
              }
            >
              <option value="recenti">Più recenti</option>
              <option value="vecchie">Più vecchie</option>
            </select>
          </div>
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
