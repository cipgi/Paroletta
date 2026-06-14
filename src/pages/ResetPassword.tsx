import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOGIN_PATH } from "@/const";
import {
  createPasswordResetSupabaseClient,
  establishPasswordRecoverySession,
} from "@/lib/supabase-password-reset";
import { trpc } from "@/providers/trpc";
import { PasswordPolicy } from "@contracts/constants";

const passwordUpdateSchema = z
  .object({
    password: z
      .string()
      .min(PasswordPolicy.minLength, PasswordPolicy.minLengthMessage)
      .regex(
        PasswordPolicy.alphanumericPattern,
        PasswordPolicy.alphanumericMessage
      ),
    confirmPassword: z.string(),
  })
  .refine(value => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Le password non coincidono.",
  });

export default function ResetPassword() {
  const navigate = useNavigate();
  const clientRef = useRef<ReturnType<
    typeof createPasswordResetSupabaseClient
  > | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const configQuery = trpc.auth.supabasePublicConfig.useQuery();

  useEffect(() => {
    if (!configQuery.data || clientRef.current) return;

    const client = createPasswordResetSupabaseClient(configQuery.data);
    clientRef.current = client;

    void establishPasswordRecoverySession(client)
      .then(() => {
        setSessionReady(true);
        setSessionError(null);
      })
      .catch(() => {
        setSessionReady(false);
        setSessionError(
          "Link non valido o scaduto. Richiedi un nuovo recupero."
        );
      });
  }, [configQuery.data]);

  const updatePassword = async () => {
    setFormError(null);
    setSuccessMessage(null);

    const parsed = passwordUpdateSchema.safeParse({
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Controlla la nuova password."
      );
      return;
    }

    const client = clientRef.current;
    if (!client || !sessionReady) {
      setFormError("Link non valido o scaduto. Richiedi un nuovo recupero.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await client.auth.updateUser({
      password: parsed.data.password,
    });
    setIsSubmitting(false);

    if (error) {
      setFormError("Password non aggiornata. Richiedi un nuovo recupero.");
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setSuccessMessage("Password aggiornata. Accedi con la nuova password.");
  };

  const isLoadingConfig =
    configQuery.isLoading ||
    (configQuery.isSuccess && !sessionReady && !sessionError);
  const canSubmit = sessionReady && !isSubmitting && !successMessage;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm rounded-lg">
        <CardHeader className="text-center">
          <CardTitle>Reimposta password</CardTitle>
          <CardDescription>Inserisci una nuova password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingConfig && (
            <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
              Verifica link in corso...
            </div>
          )}

          {(sessionError || configQuery.error) && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {sessionError ??
                "Recupero password temporaneamente non disponibile."}
            </div>
          )}

          {sessionReady && !successMessage && (
            <>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nuova password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                />
                <p className="text-xs text-slate-500">
                  {PasswordPolicy.helpText}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">Conferma password</Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                />
              </div>
            </>
          )}

          {formError && (
            <p className="text-sm text-red-600" role="alert">
              {formError}
            </p>
          )}

          {successMessage && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              {successMessage}
            </div>
          )}

          {!successMessage && (
            <Button
              className="w-full"
              size="lg"
              disabled={!canSubmit}
              onClick={updatePassword}
            >
              {isSubmitting ? "Aggiornamento..." : "Aggiorna password"}
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() =>
              navigate(
                successMessage ? `${LOGIN_PATH}?reset=success` : LOGIN_PATH
              )
            }
          >
            Torna all'accesso
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
