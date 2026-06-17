export type Plan =
  | "trial"
  | "sviluppo"
  | "nessun_abbonamento"
  | "starter"
  | "pro"
  | "max";

export type User = {
  id: number;
  unionId: string;
  email: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string;
  accountRole?: "manager" | "staff" | "single";
  organizationOwnerId?: string;
  isTeamManager?: boolean;
  piano: Plan;
  seats: number;
  trialSchedeUsate: number;
  schedeMese: number;
  trialImmaginiUsate: number;
  immaginiMese: number;
  lastSignInAt?: Date;
};

let uid = 1;
export const users: User[] = [];

export const nextUserId = () => uid++;
