import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";

export default function SubscriptionPage() {
  const navigate = useNavigate();
  const { data: subscription } = trpc.subscriptions.mySubscription.useQuery();
  const { data: plans } = trpc.subscriptions.plans.useQuery();

  const renewalDate = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString("it-IT")
    : "-";
  const isStaff = subscription?.accountRole === "staff";

  if (isStaff) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Torna indietro
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Abbonamento gestito dal Manager</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>
              Il tuo account staff usa gli stessi strumenti del Manager e
              consuma il pool condiviso dell'organizzazione.
            </p>
            <p>
              Piano, posti e stato dell'abbonamento vengono gestiti manualmente.
            </p>
            <p>
              <strong>Piano corrente:</strong> {subscription?.plan ?? "-"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Torna indietro
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Piani disponibili</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-teal-100 bg-teal-50/60 p-4">
            <p className="text-sm text-slate-700">
              L'attivazione, la modifica e la disdetta dei piani vengono gestite
              manualmente dal team Paroletta.
            </p>
          </div>
          {(plans ?? []).map(plan => (
            <div key={plan.code} className="rounded-lg border p-4 space-y-2">
              <p className="font-medium">
                {plan.name} ({plan.code})
              </p>
              {plan.description && (
                <p className="text-sm text-slate-600">{plan.description}</p>
              )}
              <p className="text-sm text-slate-600">
                {plan.sheetLimit} schede e {plan.imageLimit} immagini /{" "}
                {plan.durationDays} giorni
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Il tuo abbonamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <strong>Stato:</strong> {subscription?.status ?? "nessuno"}
          </p>
          <p>
            <strong>Piano:</strong> {subscription?.plan ?? "-"}
          </p>
          <p>
            <strong>Posti team:</strong> {subscription?.seatsCount ?? 1}
          </p>
          <p>
            <strong>Scadenza / rinnovo:</strong> {renewalDate}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
