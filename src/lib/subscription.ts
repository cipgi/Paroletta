type SubscriptionStatus = "trial" | "attivo" | "cancellato" | string;

type SubscriptionLike = {
  status?: SubscriptionStatus | null;
  currentPeriodEnd?: string | null;
};

export function isSubscriptionCurrentlyValid(
  subscription: SubscriptionLike | null | undefined
): boolean {
  if (!subscription) return false;

  if (subscription.status === "attivo") {
    if (!subscription.currentPeriodEnd) return true;
    const periodEnd = new Date(subscription.currentPeriodEnd).getTime();
    return Number.isFinite(periodEnd) && periodEnd > Date.now();
  }

  const periodEnd = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).getTime()
    : 0;
  const isPeriodActive = Number.isFinite(periodEnd) && periodEnd > Date.now();

  return (
    isPeriodActive &&
    (subscription.status === "trial" || subscription.status === "cancellato")
  );
}

