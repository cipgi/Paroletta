import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { PasswordPolicy } from "@contracts/constants";

const CAPTCHA_FAILURE_THRESHOLD = 3;
type AuthMode = "login" | "register" | "password-reset";

const registrationSchema = z.object({
  email: z.email("Inserisci un indirizzo email valido."),
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
  const [failedLoginAttempts, setFailedLoginAttempts] = useState(0);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [registrationMessage, setRegistrationMessage] = useState<string | null>(
    () =>
      searchParams.get("reset") === "success"
        ? "Password aggiornata. Accedi con la nuova password."
        : null
  );
  const [formError, setFormError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const isRegister = authMode === "register";
  const isPasswordReset = authMode === "password-reset";
  const captchaRequired =
    authMode === "login" && failedLoginAttempts >= CAPTCHA_FAILURE_THRESHOLD;
  const captchaQuery = trpc.auth.loginCaptcha.useQuery(undefined, {
    enabled: captchaRequired || isPasswordReset,
    staleTime: 0,
  });

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
      setFailedLoginAttempts(0);
      setCaptchaAnswer("");
      refreshAuthStateAfterLogin();
      navigate("/");
    },
    onError: () => {
      setFailedLoginAttempts(value => value + 1);
      setCaptchaAnswer("");
      void captchaQuery.refetch();
    },
  });
  const registerMutation = trpc.auth.registerWithCredentials.useMutation({
    onSuccess: () => {
      setRegistrationMessage(
        "Account creato. Conferma la tua e-mail tramite il link fornito nella mail di verifica, poi accedi."
      );
      setAuthMode("login");
      setPassword("");
      setName("");
      navigate("/login");
    },
  });
  const resetPasswordMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: data => {
      setRegistrationMessage(data.message);
      setFormError(null);
      setAuthMode("login");
      setPassword("");
      setCaptchaAnswer("");
      void captchaQuery.refetch();
    },
    onError: () => {
      setCaptchaAnswer("");
      void captchaQuery.refetch();
    },
  });

  const captchaPending =
    (captchaRequired || isPasswordReset) &&
    (!captchaQuery.data || !captchaAnswer);
  const isPending =
    loginMutation.isPending ||
    registerMutation.isPending ||
    resetPasswordMutation.isPending ||
    captchaPending;
  const onCredentialsSubmit = () => {
    setRegistrationMessage(null);
    setFormError(null);
    if (isPasswordReset) {
      const parsedEmail = z
        .email("Inserisci un indirizzo email valido.")
        .safeParse(email);
      if (!parsedEmail.success) {
        setFormError(
          parsedEmail.error.issues[0]?.message ?? "Controlla l'email."
        );
        return;
      }

      resetPasswordMutation.mutate({
        email: parsedEmail.data,
        captchaChallengeId: captchaQuery.data?.id ?? "",
        captchaAnswer,
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
      captchaChallengeId: captchaQuery.data?.id,
      captchaAnswer: captchaRequired ? captchaAnswer : undefined,
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
          {(captchaRequired || isPasswordReset) && (
            <div className="space-y-2 rounded-md border p-3">
              <Label htmlFor="captcha">Verifica anti-automazione</Label>
              <p className="text-sm text-muted-foreground">
                {isPasswordReset
                  ? "Conferma la verifica per ricevere il link."
                  : "Dopo diversi tentativi falliti, risolvi il CAPTCHA per continuare."}
              </p>
              <p className="text-sm font-medium">
                {captchaQuery.data?.question ??
                  "Generazione CAPTCHA in corso..."}
              </p>
              <Input
                id="captcha"
                inputMode="numeric"
                value={captchaAnswer}
                onChange={e => setCaptchaAnswer(e.target.value)}
                placeholder="Risposta"
              />
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
                setFailedLoginAttempts(0);
                setCaptchaAnswer("");
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
                setFailedLoginAttempts(0);
                setCaptchaAnswer("");
                void captchaQuery.refetch();
              }}
            >
              {isPasswordReset ? "Torna all'accesso" : "Password dimenticata?"}
            </Button>
          )}
          {(loginMutation.error ||
            registerMutation.error ||
            resetPasswordMutation.error ||
            formError) && (
            <p className="text-sm text-red-600">
              {formError ||
                loginMutation.error?.message ||
                registerMutation.error?.message ||
                resetPasswordMutation.error?.message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
