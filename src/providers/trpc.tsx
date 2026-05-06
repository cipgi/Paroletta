import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Csrf } from "@contracts/constants";
import superjson from "superjson";
import type { AppRouter } from "../../api/router";
import type { ReactNode } from "react";

export const trpc = createTRPCReact<AppRouter>();

function readCookie(name: string): string | undefined {
  const cookiePrefix = `${name}=`;
  return document.cookie
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(cookiePrefix))
    ?.slice(cookiePrefix.length);
}

function createCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function getCsrfToken(): string {
  const existingToken = readCookie(Csrf.cookieName);
  if (existingToken && existingToken.length >= Csrf.minTokenLength) {
    return decodeURIComponent(existingToken);
  }

  const token = createCsrfToken();
  const secureAttribute = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${Csrf.cookieName}=${encodeURIComponent(token)}; Path=/; Max-Age=${Csrf.maxAgeMs / 1000}; SameSite=Lax${secureAttribute}`;
  return token;
}

const queryClient = new QueryClient();
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        const headers = new Headers(init?.headers);
        headers.set(Csrf.headerName, getCsrfToken());

        return globalThis.fetch(input, {
          ...(init ?? {}),
          headers,
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
