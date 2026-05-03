import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useNavigate } from "react-router";
import { isSubscriptionCurrentlyValid } from "@/lib/subscription";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [initialPlan, setInitialPlan] = useState<"trial" | "base">("trial");
  const utils = trpc.useUtils();

  const redirectAfterAuth = async () => {
    const subscription = await utils.subscriptions.mySubscription.fetch();
    if (isSubscriptionCurrentlyValid(subscription)) {
      navigate("/");
      return;
    }
    navigate("/abbonamento");
  };

  const loginMutation = trpc.auth.loginWithCredentials.useMutation({
    onSuccess: redirectAfterAuth,
  });
  const registerMutation = trpc.auth.registerWithCredentials.useMutation({
    onSuccess: redirectAfterAuth,
  });

  const isPending = loginMutation.isPending || registerMutation.isPending;
  const onCredentialsSubmit = () => {
    if (isRegister) {
      registerMutation.mutate({ email, password, name, initialPlan });
      return;
    }
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Accedi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <>
            <Button className="w-full" size="lg" onClick={() => (window.location.href = "/api/auth/google")}>
              Continua con Google
            </Button>
            <div className="text-center text-xs text-muted-foreground">oppure</div>
          </>
          {isRegister && (
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          {isRegister && (
            <div className="space-y-2">
              <Label>Scelta iniziale</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={initialPlan === "trial" ? "default" : "outline"} onClick={() => setInitialPlan("trial")}>Trial</Button>
                <Button type="button" variant={initialPlan === "base" ? "default" : "outline"} onClick={() => setInitialPlan("base")}>Abbonamento</Button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button className="w-full" size="lg" disabled={isPending} onClick={onCredentialsSubmit}>
            {isRegister ? "Registrati con email" : "Accedi con email"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => setIsRegister((value) => !value)}
          >
            {isRegister ? "Hai già un account? Accedi" : "Non hai un account? Registrati"}
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
