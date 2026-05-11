export type SubscriptionLike = {
  status?: string | null;
  currentPeriodEnd?: string | null;
};

/**
 * Subscription authorization is enforced by tRPC procedures on the server.
 * The frontend may display subscription metadata, but must not decide whether
 * privileged application actions are allowed.
 */
export function formatSubscriptionStatus(
  subscription: SubscriptionLike | null | undefined
) {
  return subscription?.status ?? "nessuno";
}
