type SubscriptionStatus = "trial" | "attivo" | "cancellato" | string;

type SubscriptionLike = {
  status?: SubscriptionStatus | null;
  currentPeriodEnd?: string | null;
};

export function isSubscriptionCurrentlyValid(subscription: SubscriptionLike | null | undefined): boolean {
  if (!subscription) return false;

  const periodEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).getTime() : 0;
  const isPeriodActive = Number.isFinite(periodEnd) && periodEnd > Date.now();

  if (!isPeriodActive) return false;

  return subscription.status === "attivo" || subscription.status === "trial" || subscription.status === "cancellato";
}

