import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  BarChart3,
  Copy,
  CreditCard,
  FileText,
  MailPlus,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TeamLimits } from "@contracts/constants";

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(Math.round((value / total) * 100), 100);
}

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

export default function Management() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const utils = trpc.useUtils();
  const invitationBaseUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/invito`;
  }, []);
  const {
    data: overview,
    error: overviewError,
    isLoading: isOverviewLoading,
  } = trpc.organization.overview.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const teamAccounts = useMemo(() => {
    if (!overview) return [];
    return [
      {
        id: overview.owner.id,
        name: overview.owner.name,
        email: overview.owner.email,
        role: "Manager",
      },
      ...overview.members.map(member => ({
        id: member.id,
        name: member.name,
        email: member.email,
        role: "Staff",
      })),
    ];
  }, [overview]);
  const accountById = useMemo(
    () => new Map(teamAccounts.map(account => [account.id, account])),
    [teamAccounts]
  );
  const {
    data: managedSheets,
    isLoading: isManagedSheetsLoading,
    error: managedSheetsError,
  } = trpc.sheets.list.useQuery(
    { allTeam: true },
    { enabled: Boolean(overview?.role === "manager") }
  );
  const invite = trpc.organization.invite.useMutation({
    onSuccess: async () => {
      setEmail("");
      await utils.organization.overview.invalidate();
    },
  });
  const revokeInvitation = trpc.organization.revokeInvitation.useMutation({
    onSuccess: async () => utils.organization.overview.invalidate(),
  });
  const acceptInvitation = trpc.organization.acceptInvitation.useMutation({
    onSuccess: async () => {
      await utils.organization.overview.invalidate();
      await utils.auth.me.invalidate();
    },
  });
  if (isLoading) {
    return <div className="text-slate-500">Caricamento gestione...</div>;
  }

  if (!user) {
    return null;
  }

  if (isOverviewLoading) {
    return <div className="text-slate-500">Caricamento gestione...</div>;
  }

  if (overviewError) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-lg text-slate-800">
            Gestione non disponibile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            Non è stato possibile caricare i dati di gestione. Riprova tra poco
            o contatta il supporto se il problema persiste.
          </p>
          <p className="mt-3 text-xs text-red-600">{overviewError.message}</p>
        </CardContent>
      </Card>
    );
  }

  if (!overview) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-lg text-slate-800">
            Gestione non disponibile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            I dati di gestione non sono ancora disponibili. Aggiorna la pagina o
            riprova tra poco.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isTeamOwner = overview.role === "manager";
  const hasTeam = overview.role === "manager" || overview.role === "staff";
  const usagePercent = percent(overview.usage.used, overview.usage.limit);
  const seatsSummary = `${overview.seats.used}/${overview.seats.total} posti attivi`;

  function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    invite.mutate({ email });
  }

  const receivedInvitationsCard =
    overview.receivedInvitations.length > 0 ? (
      <Card className="border-teal-100 bg-teal-50/40">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MailPlus className="w-5 h-5 text-teal-600" />
            Inviti ricevuti
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {overview.receivedInvitations.map(invitation => (
            <div
              key={invitation.id}
              className="flex flex-col gap-3 rounded-lg border border-teal-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-slate-800">
                  Sei stato invitato a partecipare al team di{" "}
                  {invitation.owner.name} ({invitation.owner.email}).
                </p>
                <p className="text-xs text-slate-500">
                  Accetta per condividere il pool di utilizzo e comparire nel
                  team.
                </p>
              </div>
              <Button
                type="button"
                className="bg-teal-600 hover:bg-teal-700"
                disabled={acceptInvitation.isPending}
                onClick={() =>
                  acceptInvitation.mutate({ token: invitation.token })
                }
              >
                Accetta invito
              </Button>
            </div>
          ))}
          {acceptInvitation.error && (
            <p className="text-sm text-red-600">
              {acceptInvitation.error.message}
            </p>
          )}
        </CardContent>
      </Card>
    ) : null;

  if (!hasTeam) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestione team</h1>
          <p className="text-slate-500 mt-1">
            Qui visualizzi il team a cui appartieni e gli inviti ricevuti.
          </p>
        </div>
        {receivedInvitationsCard}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-teal-600" />
              Nessun team collegato
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p>
              Al momento non fai parte di nessun team. Questa sezione diventerà
              utile quando un Manager ti inviterà a collaborare.
            </p>
            <p>
              Quando un account principale ti inviterà, troverai qui la
              richiesta di partecipazione con il nome e l'email del team owner.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Gestione team</h1>
        <p className="text-slate-500 mt-1">
          Visualizza il team a cui appartieni e il consumo condiviso delle
          generazioni.
        </p>
      </div>

      {receivedInvitationsCard}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">
                {overview.members.length + 1}
              </p>
              <p className="text-sm text-slate-500">{seatsSummary}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">
                {overview.usage.used}/{overview.usage.limit}
              </p>
              <p className="text-sm text-slate-500">Generazioni dal pool</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {overview.subscription?.plan ?? "trial"}
              </p>
              <p className="text-sm text-slate-500">
                Piano gestito dal Manager
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-teal-600" />
            Utilizzi del team
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-600"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <div className="flex flex-wrap justify-between gap-3 text-sm text-slate-600">
            <span>{overview.usage.remaining} generazioni rimanenti</span>
            <span>{overview.usage.teamSheetsCount} schede totali del team</span>
          </div>
          <p className="text-xs text-slate-500">
            Ogni scheda generata dal team viene scalata dallo stesso pool
            mensile. Posti disponibili: {overview.seats.available}. Inviti
            pendenti: {overview.seats.pending}.
          </p>
        </CardContent>
      </Card>

      {isTeamOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-teal-600" />
              Dashboard aggregata del team
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              Come Manager vedi in un'unica dashboard le schede del tuo account
              e di tutti i sub-account collegati, così puoi aprirle e generare
              il PDF senza entrare account per account.
            </p>

            <div className="rounded-lg border border-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
                <div>
                  <p className="font-medium text-slate-800">Tutto il team</p>
                  <p className="text-xs text-slate-500">
                    {teamAccounts.length} account aggregati
                  </p>
                </div>
                <Badge variant="secondary">
                  {managedSheets?.length ?? 0} schede totali visibili
                </Badge>
              </div>
              <div className="divide-y divide-slate-100">
                {isManagedSheetsLoading ? (
                  <p className="p-4 text-sm text-slate-500">
                    Caricamento schede...
                  </p>
                ) : managedSheetsError ? (
                  <p className="p-4 text-sm text-red-600">
                    {managedSheetsError.message}
                  </p>
                ) : !managedSheets || managedSheets.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">
                    Nessuna scheda generata dal team.
                  </p>
                ) : (
                  managedSheets.map(sheet => (
                    <div
                      key={sheet.id}
                      className="flex items-center justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800">
                          {getSheetTypeLabel(sheet.tipoOutput)}
                        </p>
                        <p className="text-sm text-slate-500 truncate">
                          {accountById.get(sheet.userId)?.name ?? "Account"} ·{" "}
                          {sheet.interesse} ·{" "}
                          {isTextWithPhonemeSheet(sheet.tipoOutput)
                            ? `/${sheet.fonema}/ · `
                            : ""}
                          {new Date(sheet.createdAt).toLocaleDateString(
                            "it-IT"
                          )}
                        </p>
                      </div>
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/sheets/${sheet.id}`}>
                          Apri <ArrowRight className="w-4 h-4 ml-2" />
                        </Link>
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isTeamOwner && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MailPlus className="w-5 h-5 text-teal-600" />
                Invita terapeuti
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form className="space-y-2" onSubmit={onInvite}>
                <Label htmlFor="staff-email">Email terapeuta</Label>
                <div className="flex gap-2">
                  <Input
                    id="staff-email"
                    type="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder="terapeuta@clinica.it"
                    disabled={overview.seats.available === 0}
                  />
                  <Button
                    type="submit"
                    disabled={
                      invite.isPending || overview.seats.available === 0
                    }
                    className="bg-teal-600 hover:bg-teal-700"
                  >
                    Invita
                  </Button>
                </div>
                {overview.seats.available === 0 && (
                  <p className="text-xs text-amber-700">
                    Tutti i posti sono occupati o riservati da inviti pendenti.
                    Ogni team può includere al massimo{" "}
                    {TeamLimits.maxStaffAccounts}
                    account staff oltre al Manager.
                  </p>
                )}
              </form>
              {invite.error && (
                <p className="text-sm text-red-600">{invite.error.message}</p>
              )}

              <div className="space-y-2">
                {overview.invitations.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nessun invito creato.
                  </p>
                ) : (
                  overview.invitations.map(invitation => {
                    const invitationUrl = invitation.token
                      ? `${invitationBaseUrl}/${invitation.token}`
                      : "";

                    return (
                      <div
                        key={invitation.id}
                        className="rounded-lg border border-slate-100 p-3 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-800">
                              {invitation.email}
                            </p>
                            <Badge variant="secondary" className="mt-1">
                              {invitation.status}
                            </Badge>
                          </div>
                          {invitation.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Revoca invito per ${invitation.email}`}
                              onClick={() =>
                                revokeInvitation.mutate({ id: invitation.id })
                              }
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        {invitation.status === "pending" && invitationUrl && (
                          <div className="space-y-2">
                            <Label htmlFor={`invite-link-${invitation.id}`}>
                              Link invito
                            </Label>
                            <div className="flex gap-2">
                              <Input
                                id={`invite-link-${invitation.id}`}
                                readOnly
                                value={invitationUrl}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  navigator.clipboard?.writeText(invitationUrl)
                                }
                              >
                                <Copy className="w-4 h-4 mr-2" /> Copia
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-teal-600" />
              Team attivo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-800">
                {overview.owner.name}
              </p>
              <p className="text-xs text-slate-500">
                Manager · {overview.owner.email}
              </p>
            </div>
            {overview.members.map(member => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {member.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    Staff · {member.email}
                  </p>
                </div>
                {isTeamOwner && (
                  <Badge variant="secondary">Incluso nella dashboard</Badge>
                )}
              </div>
            ))}
            {overview.members.length === 0 && (
              <p className="text-sm text-slate-500">
                Nessun sub-account collegato.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Team, ruoli e separazione degli accessi
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 space-y-2">
          <p>
            Tutti i membri possono visualizzare il team e gli utilizzi condivisi
            del pool mensile.
          </p>
          <p>
            Solo l'account principale può invitare utenti già registrati, fino a
            {TeamLimits.maxStaffAccounts} account staff, e aprire gli archivi
            dei sub-account collegati.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
