import { TRPCError, getTRPCErrorFromUnknown } from "@trpc/server";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server/rpc";
import { ZodError } from "zod";

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

const clientErrorMessages: Partial<
  Record<TRPC_ERROR_CODE_KEY | string, string>
> = {
  BAD_REQUEST: genericBadRequestMessage,
  PARSE_ERROR: genericBadRequestMessage,
  UNAUTHORIZED: genericAuthMessage,
  FORBIDDEN: genericForbiddenMessage,
  NOT_FOUND: genericNotFoundMessage,
  METHOD_NOT_SUPPORTED: genericBadRequestMessage,
  TIMEOUT: genericTimeoutMessage,
  PAYLOAD_TOO_LARGE: "La richiesta è troppo grande.",
};

const hiddenClientCodes = new Set<TRPC_ERROR_CODE_KEY | string>([
  "INTERNAL_SERVER_ERROR",
]);

function cleanClientMessage(message?: string) {
  return message?.replace(/\s+/g, " ").trim().slice(0, 500);
}

function getZodValidationMessage(cause: unknown) {
  if (!(cause instanceof ZodError) || cause.issues.length === 0) return null;

  const issue = cause.issues[0];
  const field = issue.path.length > 0 ? issue.path.join(".") : "campo";
  return `Controlla il campo "${field}": ${issue.message}`;
}

export function getSafeClientErrorMessage(
  code?: TRPC_ERROR_CODE_KEY | string,
  message?: string,
  cause?: unknown
) {
  if (code && hiddenClientCodes.has(code)) return genericErrorMessage;

  const validationMessage = getZodValidationMessage(cause);
  if (validationMessage) return validationMessage;

  const explicitMessage = cleanClientMessage(message);
  if (explicitMessage) return explicitMessage;

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

export function userFacingError(
  code: TRPC_ERROR_CODE_KEY,
  message: string,
  cause?: unknown
) {
  return new TRPCError({ code, message, cause });
}

export function databaseOperationError(operation: string, cause?: unknown) {
  return userFacingError(
    "SERVICE_UNAVAILABLE",
    `Non è stato possibile completare l'operazione: ${operation}. Riprova tra poco.`,
    cause
  );
}

export function missingResourceError(resource: string) {
  return userFacingError(
    "NOT_FOUND",
    `${resource} non trovata o non più disponibile.`
  );
}

export function invalidSessionError() {
  return userFacingError(
    "UNAUTHORIZED",
    "Sessione non valida: esci e accedi di nuovo."
  );
}

export function logServerError(
  error: unknown,
  context: ServerErrorContext = {}
) {
  const trpcError = getTRPCErrorFromUnknown(error);
  if (trpcError.code === "UNAUTHORIZED") return;

  console.error("[server-error]", {
    ...context,
    code: context.code ?? trpcError.code,
    message: trpcError.message,
    cause: trpcError.cause,
    stack: trpcError.stack,
  });
}
