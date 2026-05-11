import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useNavigate } from "react-router";

const CAPTCHA_FAILURE_THRESHOLD = 3;

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [initialPlan, setInitialPlan] = useState<"trial" | "base">("trial");
  const [failedLoginAttempts, setFailedLoginAttempts] = useState(0);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [registrationMessage, setRegistrationMessage] = useState<string | null>(
    null
  );
  const utils = trpc.useUtils();
  const captchaRequired =
    !isRegister && failedLoginAttempts >= CAPTCHA_FAILURE_THRESHOLD;
  const captchaQuery = trpc.auth.loginCaptcha.useQuery(undefined, {
    enabled: captchaRequired,
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
      setIsRegister(false);
      setPassword("");
      setName("");
      setInitialPlan("trial");
      navigate("/login");
    },
  });

  const captchaPending =
    captchaRequired && (!captchaQuery.data || !captchaAnswer);
  const isPending =
    loginMutation.isPending || registerMutation.isPending || captchaPending;
  const onCredentialsSubmit = () => {
    setRegistrationMessage(null);
    if (isRegister) {
      registerMutation.mutate({ email, password, name, initialPlan });
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
          <CardTitle>Accedi</CardTitle>
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
          {isRegister && (
            <div className="space-y-2">
              <Label>Scelta iniziale</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={initialPlan === "trial" ? "default" : "outline"}
                  onClick={() => setInitialPlan("trial")}
                >
                  Trial
                </Button>
                <Button
                  type="button"
                  variant={initialPlan === "base" ? "default" : "outline"}
                  onClick={() => setInitialPlan("base")}
                >
                  Abbonamento
                </Button>
              </div>
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
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          {registrationMessage && !isRegister && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              {registrationMessage}
            </div>
          )}
          {captchaRequired && (
            <div className="space-y-2 rounded-md border p-3">
              <Label htmlFor="captcha">Verifica anti-automazione</Label>
              <p className="text-sm text-muted-foreground">
                Dopo diversi tentativi falliti, risolvi il CAPTCHA per
                continuare.
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
            {isRegister ? "Registrati con email" : "Accedi con email"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setIsRegister(value => {
                const nextValue = !value;
                if (nextValue) setRegistrationMessage(null);
                return nextValue;
              });
              setFailedLoginAttempts(0);
              setCaptchaAnswer("");
            }}
          >
            {isRegister
              ? "Hai già un account? Accedi"
              : "Non hai un account? Registrati"}
          </Button>
          {(loginMutation.error || registerMutation.error) && (
            <p className="text-sm text-red-600">
              {loginMutation.error?.message || registerMutation.error?.message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
