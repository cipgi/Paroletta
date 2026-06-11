export type ActiveSubscription = {
  status: string;
  plan: string;
  created_at: string | null;
  current_period_end: string | null;
};

export type SubscriptionAccessInput = {
  subscription?: {
    status: string | null;
    plan: string | null;
    created_at: string | null;
    current_period_end: string | null;
  } | null;
  profile?: {
    piano: string | null;
    created_at: string | null;
  } | null;
  nowMs?: number;
};

export type SubscriptionAccessState = ActiveSubscription & {
  accessActive: boolean;
  derivedFromProfile: boolean;
};

const TRIAL_DURATION_MS = 15 * 24 * 60 * 60 * 1000;
const MANUAL_PAID_PLANS = new Set(["starter", "pro", "max"]);

function addTrialDurationIso(startMs: number) {
  return new Date(startMs + TRIAL_DURATION_MS).toISOString();
}

export function resolveSubscriptionAccess(
  input: SubscriptionAccessInput
): SubscriptionAccessState {
  const nowMs = input.nowMs ?? Date.now();
  const subscription = input.subscription ?? null;
  const profilePlan = input.profile?.piano ?? "trial";
  const profileStartedAt = input.profile?.created_at
    ? new Date(input.profile.created_at).getTime()
    : nowMs;
  const subscriptionStartedAt = subscription?.created_at
    ? new Date(subscription.created_at).getTime()
    : nowMs;

  const hasTrialAccess =
    subscription?.status === "trial" &&
    nowMs <= subscriptionStartedAt + TRIAL_DURATION_MS;
  const hasActiveSubscription =
    subscription?.status === "attivo" &&
    (subscription.current_period_end
      ? new Date(subscription.current_period_end).getTime() >= nowMs
      : true);
  const hasManualPlanAccess = MANUAL_PAID_PLANS.has(profilePlan);
  const hasProfileTrialAccess =
    profilePlan === "trial" &&
    !subscription &&
    nowMs <= profileStartedAt + TRIAL_DURATION_MS;
  const accessActive = Boolean(
    hasActiveSubscription ||
    hasTrialAccess ||
    hasManualPlanAccess ||
    hasProfileTrialAccess
  );

  if ((hasActiveSubscription || hasTrialAccess) && subscription) {
    return {
      status: subscription.status ?? "trial",
      plan: subscription.plan ?? profilePlan,
      created_at: subscription.created_at,
      current_period_end: subscription.current_period_end,
      accessActive,
      derivedFromProfile: false,
    };
  }

  if (accessActive || !subscription) {
    return {
      status: accessActive
        ? profilePlan === "trial"
          ? "trial"
          : "attivo"
        : "cancellato",
      plan: profilePlan,
      created_at: input.profile?.created_at ?? null,
      current_period_end:
        profilePlan === "trial" ? addTrialDurationIso(profileStartedAt) : null,
      accessActive,
      derivedFromProfile: true,
    };
  }

  return {
    status: subscription.status ?? "cancellato",
    plan: subscription.plan ?? profilePlan,
    created_at: subscription.created_at,
    current_period_end: subscription.current_period_end,
    accessActive: false,
    derivedFromProfile: false,
  };
}
