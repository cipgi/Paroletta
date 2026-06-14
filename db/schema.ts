// Logical app schema (stored in Postgres schema: app)
export type Plan =
  | "trial"
  | "sviluppo"
  | "nessun_abbonamento"
  | "starter"
  | "pro"
  | "max";
export type SubscriptionStatus = "trial" | "attivo" | "cancellato";
export type AccountRole = "manager" | "staff" | "single";
export type SheetOutputType =
  | "storia"
  | "filastrocca"
  | "lista"
  | "discriminazione_visiva"
  | "morfosintassi_complessa"
  | "narrazione_sequenze"
  | "pragmatica";
export type Difficulty = "bassa" | "media" | "alta";

export interface Profile {
  id: string; // references auth.users.id
  email: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isTeamManager: boolean;
  accountRole?: AccountRole;
  organizationOwnerId?: string;
  piano: Plan;
  seats: number;
  trialSchedeUsate: number;
  schedeMese: number;
  trialImmaginiUsate: number;
  immaginiMese: number;
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
  usageCounted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Illustration {
  id: string;
  tag: string;
  semanticTags: string[];
  cacheKey: string;
  filePath: string;
  mimeType: string | null;
  source: "generated" | "uploaded" | "mock";
  ownerUserId: string | null;
  sheetId: string | null;
  storageBucket: string | null;
  storagePath: string | null;
  byteSize: number | null;
  generationModel: string | null;
  generatedCostUsd: number;
  createdAt: string;
}

export interface SeatAssignment {
  id: string;
  ownerUserId: string;
  memberUserId: string;
  createdAt: string;
}

export type InvitationStatus = "pending" | "accepted" | "revoked";
export type PasswordResetRequestStatus =
  | "sent"
  | "failed"
  | "rate_limited"
  | "suppressed";

export interface OrganizationInvitation {
  id: string;
  ownerUserId: string;
  email: string;
  token: string;
  status: InvitationStatus;
  invitedByUserId: string;
  acceptedByUserId: string | null;
  createdAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export interface PasswordResetRequest {
  id: string;
  emailHash: string;
  clientIpHash: string;
  status: PasswordResetRequestStatus;
  failureCode: string | null;
  createdAt: string;
}
