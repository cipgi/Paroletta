import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  getSafeClientErrorMessage,
  getSafeHttpErrorBody,
  logServerError,
} from "./errors";

describe("error sanitization", () => {
  it("returns generic client messages for internal tRPC errors", () => {
    expect(getSafeClientErrorMessage("INTERNAL_SERVER_ERROR")).toBe(
      "Si è verificato un errore. Riprova più tardi."
    );
  });

  it("maps authorization errors without leaking technical details", () => {
    expect(getSafeClientErrorMessage("FORBIDDEN")).toBe(
      "Operazione non consentita."
    );
    expect(getSafeHttpErrorBody(500)).toEqual({
      error: "Si è verificato un errore. Riprova più tardi.",
    });
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
        message: 'duplicate key value violates unique constraint "profiles_pkey"',
      })
    );
    spy.mockRestore();
  });
});
