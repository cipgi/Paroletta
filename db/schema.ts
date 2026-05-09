// Logical app schema (stored in Postgres schema: app)
export type Plan = "trial" | "base" | "dev";
export type SubscriptionStatus = "trial" | "attivo" | "cancellato";
export type SheetOutputType =
  | "storia"
  | "filastrocca"
  | "lista"
  | "discriminazione_visiva"
  | "morfosintassi_complessa";
export type Difficulty = "bassa" | "media" | "alta";

export interface Profile {
  id: string; // references auth.users.id
  email: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  piano: Plan;
  seats: number;
  trialSchedeUsate: number;
  schedeMese: number;
  lastSignInAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  status: SubscriptionStatus;
  plan: Plan;
  seatsCount: number;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Sheet {
  id: string;
  userId: string;
  fonema: string;
  interesse: string;
  tipoOutput: SheetOutputType;
  testoGenerato: string;
  tagImmagine: string | null;
  listaParole: string[] | null;
  difficolta: Difficulty;
  pdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Illustration {
  id: string;
  tag: string;
  filePath: string;
  createdAt: string;
}

export interface SeatAssignment {
  id: string;
  ownerUserId: string;
  memberUserId: string;
  createdAt: string;
}
