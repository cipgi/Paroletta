import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import {
  databaseOperationError,
  getSafeClientErrorMessage,
  getSafeHttpErrorBody,
  logServerError,
} from "./errors";

describe("error sanitization", () => {
  it("returns generic client messages for untrusted internal tRPC errors", () => {
    expect(
      getSafeClientErrorMessage(
        "INTERNAL_SERVER_ERROR",
        'duplicate key value violates unique constraint "profiles_pkey"'
      )
    ).toBe("Si è verificato un errore. Riprova più tardi.");
  });

  it("returns explicit user-facing messages for actionable errors", () => {
    expect(
      getSafeClientErrorMessage(
        "FORBIDDEN",
        "Hai raggiunto il limite di 5 schede per il piano trial."
      )
    ).toBe("Hai raggiunto il limite di 5 schede per il piano trial.");
    expect(getSafeClientErrorMessage("FORBIDDEN")).toBe(
      "Operazione non consentita."
    );
  });

  it("turns validation failures into field-specific messages", () => {
    const cause = new ZodError([
      {
        code: "too_small",
        minimum: 8,
        inclusive: true,
        origin: "string",
        path: ["password"],
        message: "La password deve contenere almeno 8 caratteri",
      },
    ]);

    expect(getSafeClientErrorMessage("BAD_REQUEST", undefined, cause)).toBe(
      'Controlla il campo "password": La password deve contenere almeno 8 caratteri'
    );
  });

  it("builds safe operation-specific database messages", () => {
    expect(databaseOperationError("caricare le schede").message).toBe(
      "Non è stato possibile completare l'operazione: caricare le schede. Riprova tra poco."
    );
  });

  it("maps HTTP errors without leaking technical details", () => {
    expect(getSafeHttpErrorBody(500)).toEqual({
      error: "Si è verificato un errore. Riprova più tardi.",
    });
  });

  it("does not log expected unauthorized client requests as server errors", () => {
    const error = new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logServerError(error, { path: "auth.me" });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs technical details server-side", () => {
    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: 'duplicate key value violates unique constraint "profiles_pkey"',
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logServerError(error, { path: "auth.registerWithCredentials" });

    expect(spy).toHaveBeenCalledWith(
      "[server-error]",
      expect.objectContaining({
        path: "auth.registerWithCredentials",
        code: "INTERNAL_SERVER_ERROR",
        message:
          'duplicate key value violates unique constraint "profiles_pkey"',
      })
    );
    spy.mockRestore();
  });
});
