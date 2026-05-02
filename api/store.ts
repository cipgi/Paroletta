export type Plan = "trial" | "base";

export type User = {
  id: number;
  unionId: string;
  email: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string;
  piano: Plan;
  seats: number;
  trialSchedeUsate: number;
  schedeMese: number;
  lastSignInAt?: Date;
};

export type Patient = { id: number; userId: number; aliasEta: string | null; noteAnonime: string | null; createdAt: Date };
export type Sheet = { id: number; userId: number; patientId: number | null; fonema: string; interesse: string; tipoOutput: "storia"|"filastrocca"|"lista"; testoGenerato: string; tagImmagine: string | null; listaParole: string[] | null; difficolta: "bassa"|"media"|"alta"; pdfUrl: string | null; createdAt: Date };
export type Subscription = { userId: number; status: string; seatsCount: number };
export type Illustration = { tag: string; filePath: string };

let uid=1,pid=1,sid=1;
export const users: User[] = [];
export const patients: Patient[] = [];
export const sheets: Sheet[] = [];
export const subscriptions: Subscription[] = [];
export const illustrations: Illustration[] = [];

export const nextUserId=()=>uid++;
export const nextPatientId=()=>pid++;
export const nextSheetId=()=>sid++;
