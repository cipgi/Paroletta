import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Plan = "trial" | "base" | "dev";

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
  lastSignInAt?: Date;
};

export type Sheet = {
  id: number;
  userId: number;
  fonema: string;
  interesse: string;
  tipoOutput:
    | "storia"
    | "filastrocca"
    | "lista"
    | "discriminazione_visiva"
    | "morfosintassi_complessa";
  testoGenerato: string;
  tagImmagine: string | null;
  listaParole: string[] | null;
  difficolta: "bassa" | "media" | "alta";
  pdfUrl: string | null;
  createdAt: Date;
};
export type Subscription = {
  userId: number;
  status: string;
  seatsCount: number;
};
export type Illustration = { tag: string; filePath: string };

let uid = 1,
  sid = 1;
export const users: User[] = [];
export const sheets: Sheet[] = [];
export const subscriptions: Subscription[] = [];
export const illustrations: Illustration[] = [];

export const nextUserId = () => uid++;
export const nextSheetId = () => sid++;

const SHEETS_FILE = resolve(process.cwd(), ".data/sheets.json");

const ensureDir = (path: string) => {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
};

export const loadSheets = () => {
  if (!existsSync(SHEETS_FILE)) return;
  try {
    const raw = JSON.parse(readFileSync(SHEETS_FILE, "utf8")) as Array<
      Sheet & { createdAt: string }
    >;
    sheets.splice(
      0,
      sheets.length,
      ...raw.map(sheet => ({ ...sheet, createdAt: new Date(sheet.createdAt) }))
    );
    const maxId = sheets.reduce((max, sheet) => Math.max(max, sheet.id), 0);
    sid = Math.max(sid, maxId + 1);
  } catch {
    // Ignore malformed storage to keep server boot resilient.
  }
};

export const saveSheets = () => {
  ensureDir(SHEETS_FILE);
  writeFileSync(SHEETS_FILE, JSON.stringify(sheets, null, 2), "utf8");
};
