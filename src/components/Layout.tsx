import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LayoutDashboard,
  FileText,
  LogOut,
  Sparkles,
  Settings,
  CircleHelp,
  UserX,
  Users,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/providers/trpc";
import { SubscriptionPlanLimits } from "@contracts/constants";

function InactiveSubscriptionScreen({
  email,
  logout,
}: {
  email?: string | null;
  logout: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50">
            <CircleHelp className="h-5 w-5 text-amber-600" />
          </div>
          <div className="space-y-3">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                Abbonamento non attivo
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Chiedere l'attivazione dell'abbonamento al proprietario del
                sito.
              </p>
            </div>
            {email ? (
              <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-medium uppercase text-slate-500">
                  Email account
                </p>
                <p className="mt-1 break-all text-sm font-semibold text-slate-800">
                  {email}
                </p>
              </div>
            ) : null}
            <p className="text-sm leading-6 text-slate-600">
              Comunica questa email al proprietario del sito per l'attivazione
              manuale dell'abbonamento.
            </p>
            <Button variant="outline" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Esci
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const { data: subscription, isLoading: isSubscriptionLoading } =
    trpc.subscriptions.mySubscription.useQuery(undefined, {
      enabled: isAuthenticated,
    });
  const { data: organizationOverview } = trpc.organization.overview.useQuery(
    undefined,
    {
      enabled: isAuthenticated,
    }
  );

  const utils = trpc.useUtils();

  const deleteAccount = trpc.auth.deleteAccount.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      setDeletePassword("");
      setOpenDeleteDialog(false);
      navigate("/login");
    },
  });

  const navItems = [
    { path: "/", label: "Dashboard", icon: LayoutDashboard },
    { path: "/generator", label: "Genera Scheda", icon: Sparkles },
    { path: "/sheets", label: "Schede", icon: FileText },
    { path: "/management", label: "Gestione", icon: Users },
  ];

  const usageLeftLabel = useMemo(() => {
    if (organizationOverview) {
      return `Rimangono: ${organizationOverview.usage.sheets.remaining} schede, ${organizationOverview.usage.images.remaining} immagini`;
    }
    if (!user) return "";
    const limits =
      SubscriptionPlanLimits[
        user.piano as keyof typeof SubscriptionPlanLimits
      ] ?? SubscriptionPlanLimits.sviluppo;
    if (user.piano === "trial") {
      return `Rimangono: ${Math.max(limits.sheetLimit - (user.trialSchedeUsate ?? 0), 0)} schede, ${Math.max(limits.imageLimit - (user.trialImmaginiUsate ?? 0), 0)} immagini`;
    }
    return `Rimangono: ${Math.max(limits.sheetLimit - (user.schedeMese ?? 0), 0)} schede, ${Math.max(limits.imageLimit - (user.immaginiMese ?? 0), 0)} immagini`;
  }, [organizationOverview, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Caricamento...
      </div>
    );
  }

  if (!isAuthenticated && location.pathname !== "/login") {
    return <Navigate to="/login" replace />;
  }

  if (
    isAuthenticated &&
    isSubscriptionLoading &&
    location.pathname !== "/abbonamento"
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Verifica abbonamento...
      </div>
    );
  }

  if (isAuthenticated && subscription?.accessActive === false) {
    return <InactiveSubscriptionScreen email={user?.email} logout={logout} />;
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-50 flex">
      <aside className="h-screen w-64 shrink-0 bg-white border-r border-slate-200 hidden md:flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-slate-800">Paroletta</span>
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-teal-50 text-teal-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-100 space-y-2">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
              {user?.name?.[0] ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">
                {user?.name ?? "Utente"}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {user?.email ?? ""}
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
              >
                <Settings className="w-4 h-4 mr-2" />
                Impostazioni account
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuItem disabled>{usageLeftLabel}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  window.open(
                    "https://www.notion.so/help",
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
              >
                <CircleHelp className="w-4 h-4" />
                FAQ
              </DropdownMenuItem>
              {user?.accountRole !== "staff" ? (
                <DropdownMenuItem onClick={() => navigate("/abbonamento")}>
                  Visualizza abbonamento
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled>
                  Abbonamento gestito dal Manager
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Zona pericolosa</DropdownMenuLabel>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setOpenDeleteDialog(true)}
              >
                <UserX className="w-4 h-4" />
                Cancella account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-slate-500 hover:text-red-600"
            onClick={logout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Esci
          </Button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="md:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-slate-800">Paroletta</span>
          </Link>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </header>

        <nav className="md:hidden bg-white border-b border-slate-200 flex overflow-x-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap ${
                  active
                    ? "border-b-2 border-teal-600 text-teal-700"
                    : "text-slate-500"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>

      <AlertDialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cancellare definitivamente l'account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione elimina account, schede e abbonamento associati. Non
              può essere annullata. Per continuare inserisci la password del tuo
              account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-account-password">Password</Label>
            <Input
              id="delete-account-password"
              type="password"
              value={deletePassword}
              onChange={event => setDeletePassword(event.target.value)}
              placeholder="Conferma con la password"
              autoComplete="current-password"
            />
            {deleteAccount.error && (
              <p className="text-sm text-red-600">
                {deleteAccount.error.message}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletePassword("")}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={!deletePassword.trim() || deleteAccount.isPending}
              onClick={event => {
                event.preventDefault();
                if (!deletePassword.trim()) return;
                deleteAccount.mutate({ password: deletePassword });
              }}
            >
              {deleteAccount.isPending ? "Eliminazione..." : "Elimina account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
