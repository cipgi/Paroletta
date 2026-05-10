import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CheckCircle2, LogIn, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";

export default function Invitation() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user, refresh } = useAuth();
  const utils = trpc.useUtils();
  const acceptInvitation = trpc.organization.acceptInvitation.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      await refresh();
    },
  });

  useEffect(() => {
    if (
      token &&
      isAuthenticated &&
      !acceptInvitation.isPending &&
      !acceptInvitation.isSuccess &&
      !acceptInvitation.error
    ) {
      acceptInvitation.mutate({ token });
    }
  }, [acceptInvitation, isAuthenticated, token]);

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle>Invito non valido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <p>Il link non contiene un codice invito valido.</p>
            <Button asChild>
              <Link to="/">Torna alla dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-800">
            <Users className="w-5 h-5 text-teal-600" />
            Invito al team Paroletta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          {isLoading ? <p>Verifica sessione in corso...</p> : null}

          {!isLoading && !isAuthenticated ? (
            <>
              <p>
                Per collegare il tuo account al Manager devi accedere con la
                stessa email che ha ricevuto l'invito.
              </p>
              <Button asChild className="bg-teal-600 hover:bg-teal-700">
                <Link to="/login">
                  <LogIn className="w-4 h-4 mr-2" /> Accedi o registrati
                </Link>
              </Button>
            </>
          ) : null}

          {isAuthenticated && acceptInvitation.isPending ? (
            <p>Collegamento dell'account {user?.email} al team...</p>
          ) : null}

          {acceptInvitation.error ? (
            <div className="space-y-3">
              <p className="text-red-600">{acceptInvitation.error.message}</p>
              <p>
                Controlla di aver effettuato l'accesso con l'email invitata o
                chiedi al Manager di generare un nuovo invito.
              </p>
              <Button variant="outline" onClick={() => navigate("/")}>
                Torna alla dashboard
              </Button>
            </div>
          ) : null}

          {acceptInvitation.isSuccess ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 font-medium text-teal-700">
                <CheckCircle2 className="w-5 h-5" /> Account collegato al team.
              </p>
              <p>
                Ora userai il pool condiviso del Manager mantenendo privata la
                tua area di lavoro personale.
              </p>
              <Button onClick={() => navigate("/")}>Vai alla dashboard</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
