import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import superjson from "superjson";
import { LOGIN_PATH } from "@/const";
import type { AppRouter } from "../../api/router";
import type { ReactNode } from "react";

export const trpc = createTRPCReact<AppRouter>();

type TrpcLikeError = {
  data?: {
    code?: string;
    httpStatus?: number;
  };
};

let isRedirectingToLogin = false;

function isUnauthorizedError(error: unknown) {
  const maybeTrpcError = error as TrpcLikeError;
  return (
    maybeTrpcError.data?.code === "UNAUTHORIZED" ||
    maybeTrpcError.data?.httpStatus === 401
  );
}

function redirectToLoginOnExpiredSession(error: unknown) {
  if (!isUnauthorizedError(error) || typeof window === "undefined") return;
  if (window.location.pathname === LOGIN_PATH || isRedirectingToLogin) return;

  isRedirectingToLogin = true;
  queryClient.clear();
  window.location.replace(LOGIN_PATH);
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: redirectToLoginOnExpiredSession,
  }),
  mutationCache: new MutationCache({
    onError: redirectToLoginOnExpiredSession,
  }),
});
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

export function TRPCProvider({ children }: { children: ReactNode }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
