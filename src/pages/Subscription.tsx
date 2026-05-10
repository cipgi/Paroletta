import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";

export default function SubscriptionPage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: subscription } = trpc.subscriptions.mySubscription.useQuery();
  const { data: plans } = trpc.subscriptions.plans.useQuery();
  const updatePlan = trpc.subscriptions.updatePlan.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      navigate("/");
    },
  });
  const cancelSubscription = trpc.subscriptions.cancel.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
    },
  });

  const renewalDate = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString("it-IT")
    : "-";
  const canActivateTrial = !subscription;
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
            <p>Il tuo account staff usa gli stessi strumenti del Manager e consuma il pool condiviso dell'organizzazione.</p>
            <p>Billing, upgrade, disdetta e pacchetti top-up sono visibili solo all'account Manager.</p>
            <p><strong>Piano corrente:</strong> {subscription?.plan ?? "-"}</p>
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
          {(plans ?? []).map((plan) => (
            <div key={plan.code} className="rounded-lg border p-4 space-y-2">
              <p className="font-medium">{plan.name} ({plan.code})</p>
              {plan.description && <p className="text-sm text-slate-600">{plan.description}</p>}
              <p className="text-sm text-slate-600">{plan.sheetLimit} schede / {plan.durationDays} giorni</p>
              {(!plan.isTrial || canActivateTrial) && (
                <Button
                  variant={plan.isTrial ? "outline" : "default"}
                  className={plan.isTrial ? "" : "bg-teal-600 hover:bg-teal-700"}
                  onClick={() => updatePlan.mutate({ piano: plan.code })}
                  disabled={updatePlan.isPending}
                >
                  Attiva {plan.name}
                </Button>
              )}
            </div>
          ))}
          {updatePlan.error && <p className="text-sm text-red-600">{updatePlan.error.message}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Il tuo abbonamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p><strong>Stato:</strong> {subscription?.status ?? "nessuno"}</p>
          <p><strong>Piano:</strong> {subscription?.plan ?? "-"}</p>
          <p><strong>Scadenza / rinnovo:</strong> {renewalDate}</p>
          <Button variant="outline" onClick={() => cancelSubscription.mutate()} disabled={cancelSubscription.isPending || !subscription || subscription.status === "cancellato"}>
            Disdici abbonamento
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
