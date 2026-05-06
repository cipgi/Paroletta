import { getTRPCErrorFromUnknown } from "@trpc/server";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server/rpc";

type ServerErrorContext = {
  path?: string;
  type?: string;
  code?: string;
  method?: string;
  url?: string;
};

const genericErrorMessage = "Si è verificato un errore. Riprova più tardi.";
const genericAuthMessage = "Autenticazione richiesta.";
const genericForbiddenMessage = "Operazione non consentita.";
const genericNotFoundMessage = "Risorsa non trovata.";
const genericBadRequestMessage = "Richiesta non valida.";
const genericTimeoutMessage = "La richiesta è scaduta. Riprova più tardi.";

const clientErrorMessages: Partial<Record<TRPC_ERROR_CODE_KEY | string, string>> = {
  BAD_REQUEST: genericBadRequestMessage,
  PARSE_ERROR: genericBadRequestMessage,
  UNAUTHORIZED: genericAuthMessage,
  FORBIDDEN: genericForbiddenMessage,
  NOT_FOUND: genericNotFoundMessage,
  METHOD_NOT_SUPPORTED: genericBadRequestMessage,
  TIMEOUT: genericTimeoutMessage,
  PAYLOAD_TOO_LARGE: "La richiesta è troppo grande.",
};

export function getSafeClientErrorMessage(code?: TRPC_ERROR_CODE_KEY | string) {
  return (code && clientErrorMessages[code]) || genericErrorMessage;
}

export function getSafeHttpErrorBody(status: number) {
  if (status === 400) return { error: genericBadRequestMessage };
  if (status === 401) return { error: genericAuthMessage };
  if (status === 403) return { error: genericForbiddenMessage };
  if (status === 404) return { error: genericNotFoundMessage };
  if (status === 413) return { error: "La richiesta è troppo grande." };
  return { error: genericErrorMessage };
}

export function logServerError(error: unknown, context: ServerErrorContext = {}) {
  const trpcError = getTRPCErrorFromUnknown(error);

  console.error("[server-error]", {
    ...context,
    code: context.code ?? trpcError.code,
    message: trpcError.message,
    cause: trpcError.cause,
    stack: trpcError.stack,
  });
}
