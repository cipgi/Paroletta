import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { PasswordPolicy } from "@contracts/constants";
import {
  confirmEmailFromUrl,
  createEmailConfirmationSupabaseClient,
  finishEmailConfirmationUrlCleanup,
  hasEmailConfirmationCallback,
} from "@/lib/supabase-email-confirmation";

type AuthMode = "login" | "register" | "password-reset";

const emailInputSchema = z.preprocess(
  value => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.email("Inserisci un indirizzo email valido.")
);

const registrationSchema = z.object({
  email: emailInputSchema,
  name: z.string().trim().min(2, "Inserisci un nome di almeno 2 caratteri."),
  password: z
    .string()
    .min(PasswordPolicy.minLength, PasswordPolicy.minLengthMessage)
    .regex(
      PasswordPolicy.alphanumericPattern,
      PasswordPolicy.alphanumericMessage
    ),
});

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [registrationMessage, setRegistrationMessage] = useState<string | null>(
    () => {
      if (searchParams.get("verified") === "success") {
        return "Email confermata. Ora puoi accedere.";
      }

      return searchParams.get("reset") === "success"
        ? "Password aggiornata. Accedi con la nuova password."
        : null;
    }
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isConfirmingEmail, setIsConfirmingEmail] = useState(() =>
    hasEmailConfirmationCallback()
  );
  const utils = trpc.useUtils();
  const isRegister = authMode === "register";
  const isPasswordReset = authMode === "password-reset";
  const emailConfirmationConfigQuery = trpc.auth.supabasePublicConfig.useQuery(
    undefined,
    {
      enabled: isConfirmingEmail,
      retry: false,
    }
  );

  useEffect(() => {
    if (!isConfirmingEmail || !emailConfirmationConfigQuery.data) return;

    let cancelled = false;
    const client = createEmailConfirmationSupabaseClient(
      emailConfirmationConfigQuery.data
    );

    void confirmEmailFromUrl(client)
      .then(() => {
        if (cancelled) return;
        setRegistrationMessage("Email confermata. Ora puoi accedere.");
        setFormError(null);
        setAuthMode("login");
      })
      .catch(error => {
        if (cancelled) return;
        setRegistrationMessage(null);
        setFormError(
          error instanceof Error
            ? error.message
            : "Non è stato possibile confermare l'email."
        );
      })
      .finally(() => {
        if (!cancelled) setIsConfirmingEmail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [emailConfirmationConfigQuery.data, isConfirmingEmail]);

  useEffect(() => {
    if (!isConfirmingEmail || !emailConfirmationConfigQuery.error) return;
    finishEmailConfirmationUrlCleanup();
    queueMicrotask(() => {
      setRegistrationMessage(null);
      setFormError("Conferma email temporaneamente non disponibile.");
      setIsConfirmingEmail(false);
    });
  }, [emailConfirmationConfigQuery.error, isConfirmingEmail]);

  const refreshAuthStateAfterLogin = () => {
    void Promise.all([
      utils.auth.me.invalidate(),
      utils.subscriptions.mySubscription.invalidate(),
      utils.organization.overview.invalidate(),
    ]).catch(error => {
      console.warn("Post-login cache refresh failed", error);
    });
  };

  const loginMutation = trpc.auth.loginWithCredentials.useMutation({
    onSuccess: async () => {
      refreshAuthStateAfterLogin();
      navigate("/");
    },
  });
  const registerMutation = trpc.auth.registerWithCredentials.useMutation({
    onSuccess: () => {
      setRegistrationMessage(
        "Se l'indirizzo non era già registrato, riceverai una mail di verifica. Apri il link, poi accedi."
      );
      setAuthMode("login");
      setPassword("");
      setName("");
      navigate("/login");
    },
  });
  const resetPasswordMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: data => {
      if (data.success) {
        setRegistrationMessage(data.message);
        setFormError(null);
      } else {
        setRegistrationMessage(null);
        setFormError(data.message);
      }
      setAuthMode("login");
      setPassword("");
    },
  });
  const resendConfirmationMutation =
    trpc.auth.resendEmailConfirmation.useMutation({
      onSuccess: data => {
        if (data.success) {
          setRegistrationMessage(data.message);
          setFormError(null);
        } else {
          setRegistrationMessage(null);
          setFormError(data.message);
        }
        setAuthMode("login");
        setPassword("");
      },
    });

  const isPending =
    loginMutation.isPending ||
    registerMutation.isPending ||
    resetPasswordMutation.isPending ||
    resendConfirmationMutation.isPending ||
    isConfirmingEmail;
  const resendEmailConfirmation = () => {
    setRegistrationMessage(null);
    setFormError(null);
    const parsedEmail = emailInputSchema.safeParse(email);
    if (!parsedEmail.success) {
      setFormError(
        parsedEmail.error.issues[0]?.message ?? "Controlla l'email."
      );
      return;
    }

    resendConfirmationMutation.mutate({ email: parsedEmail.data });
  };
  const onCredentialsSubmit = () => {
    setRegistrationMessage(null);
    setFormError(null);
    if (isPasswordReset) {
      const parsedEmail = emailInputSchema.safeParse(email);
      if (!parsedEmail.success) {
        setFormError(
          parsedEmail.error.issues[0]?.message ?? "Controlla l'email."
        );
        return;
      }

      resetPasswordMutation.mutate({
        email: parsedEmail.data,
      });
      return;
    }

    if (isRegister) {
      const parsedRegistration = registrationSchema.safeParse({
        email,
        password,
        name,
      });
      if (!parsedRegistration.success) {
        setFormError(
          parsedRegistration.error.issues[0]?.message ??
            "Controlla i dati di registrazione."
        );
        return;
      }

      registerMutation.mutate(parsedRegistration.data);
      return;
    }

    loginMutation.mutate({
      email,
      password,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>
            {isRegister
              ? "Registrati"
              : isPasswordReset
                ? "Recupera password"
                : "Accedi"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isRegister && (
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          {!isPasswordReset && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              {isRegister ? (
                <p className="text-xs text-slate-500">
                  {PasswordPolicy.helpText} Il piano iniziale viene sempre
                  impostato su trial.
                </p>
              ) : null}
            </div>
          )}
          {registrationMessage && !isRegister && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              {registrationMessage}
            </div>
          )}
          {isConfirmingEmail && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              Conferma email in corso...
            </div>
          )}
          <Button
            className="w-full"
            size="lg"
            disabled={isPending}
            onClick={onCredentialsSubmit}
          >
            {isRegister
              ? "Registrati con email"
              : isPasswordReset
                ? "Invia link di recupero"
                : "Accedi con email"}
          </Button>
          {!isPasswordReset && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setAuthMode(value => {
                  const nextValue = value === "register" ? "login" : "register";
                  if (nextValue === "register") setRegistrationMessage(null);
                  return nextValue;
                });
                setFormError(null);
              }}
            >
              {isRegister
                ? "Hai già un account? Accedi"
                : "Non hai un account? Registrati"}
            </Button>
          )}
          {!isRegister && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setAuthMode(isPasswordReset ? "login" : "password-reset");
                setRegistrationMessage(null);
                setFormError(null);
              }}
            >
              {isPasswordReset ? "Torna all'accesso" : "Password dimenticata?"}
            </Button>
          )}
          {!isRegister && !isPasswordReset && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={isPending}
              onClick={resendEmailConfirmation}
            >
              Non hai ricevuto la mail di conferma?
            </Button>
          )}
          {(loginMutation.error ||
            registerMutation.error ||
            resetPasswordMutation.error ||
            resendConfirmationMutation.error ||
            formError) && (
            <p className="text-sm text-red-600">
              {formError ||
                loginMutation.error?.message ||
                registerMutation.error?.message ||
                resetPasswordMutation.error?.message ||
                resendConfirmationMutation.error?.message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
