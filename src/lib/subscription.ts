import { SubscriptionPlanLabels } from "@contracts/constants";

export type SubscriptionLike = {
  status?: string | null;
  currentPeriodEnd?: string | null;
};

const statusLabels: Record<string, string> = {
  active: "Attivo",
  attivo: "Attivo",
  trial: "Prova gratuita",
  expired: "Scaduto",
  scaduto: "Scaduto",
  canceled: "Cancellato",
  cancelled: "Cancellato",
  cancellato: "Cancellato",
  inactive: "Non attivo",
  pending: "In attesa",
};

function capitalizeRawValue(value: string) {
  const normalizedValue = value.replace(/_/g, " ").trim();
  if (!normalizedValue) return "";

  return normalizedValue.charAt(0).toLocaleUpperCase("it-IT") + normalizedValue.slice(1);
}

/**
 * Subscription authorization is enforced by tRPC procedures on the server.
 * The frontend may display subscription metadata, but must not decide whether
 * privileged application actions are allowed.
 */
export function formatSubscriptionStatus(
  subscription: SubscriptionLike | null | undefined
) {
  const status = subscription?.status?.trim();
  if (!status) return "Nessun abbonamento";

  return statusLabels[status.toLowerCase()] ?? capitalizeRawValue(status);
}

export function formatSubscriptionPlan(plan: string | null | undefined) {
  if (!plan) return "-";

  return (
    SubscriptionPlanLabels[plan as keyof typeof SubscriptionPlanLabels] ??
    capitalizeRawValue(plan)
  );
}
