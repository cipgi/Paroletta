import { useMemo } from "react";
import { SubscriptionPlanLimits } from "@contracts/constants";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";

export function useUsageRemaining() {
  const { user, isAuthenticated } = useAuth();
  const { data: organizationOverview, isLoading } =
    trpc.organization.overview.useQuery(undefined, {
      enabled: isAuthenticated,
    });

  return useMemo(() => {
    if (organizationOverview) {
      const sheets = organizationOverview.usage.sheets.remaining;
      const images = organizationOverview.usage.images.remaining;

      return {
        sheets,
        images,
        label: `Rimangono: ${sheets} schede, ${images} immagini`,
        organizationOverview,
        isLoading,
      };
    }

    if (!user) {
      return {
        sheets: 0,
        images: 0,
        label: "",
        organizationOverview,
        isLoading,
      };
    }

    const limits =
      SubscriptionPlanLimits[
        user.piano as keyof typeof SubscriptionPlanLimits
      ] ?? SubscriptionPlanLimits.trial;
    const sheetUsage =
      user.piano === "trial"
        ? (user.trialSchedeUsate ?? 0)
        : (user.schedeMese ?? 0);
    const imageUsage =
      user.piano === "trial"
        ? (user.trialImmaginiUsate ?? 0)
        : (user.immaginiMese ?? 0);
    const sheets = Math.max(limits.sheetLimit - sheetUsage, 0);
    const images = Math.max(limits.imageLimit - imageUsage, 0);

    return {
      sheets,
      images,
      label: `Rimangono: ${sheets} schede, ${images} immagini`,
      organizationOverview,
      isLoading,
    };
  }, [isLoading, organizationOverview, user]);
}
