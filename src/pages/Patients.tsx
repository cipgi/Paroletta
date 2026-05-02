import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Users, Plus, Trash2, FileText } from "lucide-react";

export default function Patients() {
  const utils = trpc.useUtils();
  const { data: patients, isLoading } = trpc.patients.list.useQuery();
  const [open, setOpen] = useState(false);
  const [aliasEta, setAliasEta] = useState("");
  const [note, setNote] = useState("");

  const create = trpc.patients.create.useMutation({
    onSuccess: () => {
      utils.patients.list.invalidate();
      setOpen(false);
      setAliasEta("");
      setNote("");
    },
  });

  const remove = trpc.patients.delete.useMutation({
    onSuccess: () => {
      utils.patients.list.invalidate();
    },
  });

  const handleCreate = () => {
    const cleanAlias = aliasEta.trim();
    if (!cleanAlias) return;
    create.mutate({ aliasEta: cleanAlias, noteAnonime: note.trim() || undefined });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6 text-teal-600" />
            Archivio Pazienti
          </h1>
          <p className="text-slate-500 mt-1">
            Gestisci i profili anonimizzati dei tuoi pazienti.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-teal-600 hover:bg-teal-700">
              <Plus className="w-4 h-4 mr-2" />
              Nuovo paziente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuovo paziente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Nome paziente</Label>
                <Input
                  value={aliasEta}
                  onChange={(e) => setAliasEta(e.target.value)}
                  placeholder="es. Mario (o alias anonimo)"
                />
              </div>
              <div className="space-y-2">
                <Label>Note anonime</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note cliniche anonime"
                />
              </div>
              <Button
                className="w-full bg-teal-600 hover:bg-teal-700"
                onClick={handleCreate}
                disabled={create.isPending || !aliasEta.trim()}
              >
                {create.isPending ? "Creazione..." : "Crea paziente"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="text-center py-8 text-slate-400">Caricamento...</div>
          ) : !patients || patients.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>Nessun paziente archiviato.</p>
              <Button
                variant="link"
                className="mt-2"
                onClick={() => setOpen(true)}
              >
                Aggiungi il primo paziente
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {patients && patients.map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div>
                    <p className="font-medium text-slate-800">
                      {patient.aliasEta}
                    </p>
                    {patient.noteAnonime && (
                      <p className="text-sm text-slate-500 mt-0.5">
                        {patient.noteAnonime}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      Aggiunto il{" "}
                      {new Date(patient.createdAt).toLocaleDateString("it-IT")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link to={`/sheets?patientId=${patient.id}`}>
                      <Button variant="ghost" size="sm">
                        <FileText className="w-4 h-4 mr-1" />
                        Schede
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => remove.mutate({ id: patient.id })}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
