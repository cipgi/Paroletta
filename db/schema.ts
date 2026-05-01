import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";

const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
const pianoEnum = pgEnum("piano", ["trial", "base"]);
const tipoOutputEnum = pgEnum("tipo_output", ["storia", "filastrocca", "lista"]);
const difficoltaEnum = pgEnum("difficolta", ["bassa", "media", "alta"]);
const subscriptionStatusEnum = pgEnum("subscription_status", ["attivo", "scaduto", "cancellato", "trial"]);
const teamMemberRoleEnum = pgEnum("team_member_role", ["admin", "member"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("union_id", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("password_hash", { length: 255 }),
  avatar: text("avatar"),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignInAt: timestamp("last_sign_in_at").defaultNow().notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  piano: pianoEnum("piano").default("trial"),
  seats: integer("seats").default(1),
  schedeMese: integer("schede_mese").default(0),
  trialSchedeUsate: integer("trial_schede_usate").default(0),
  teamId: bigint("team_id", { mode: "number" }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  aliasEta: varchar("alias_eta", { length: 50 }),
  noteAnonime: text("note_anonime"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sheets = pgTable("sheets", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  patientId: bigint("patient_id", { mode: "number" }),
  fonema: varchar("fonema", { length: 10 }).notNull(),
  interesse: varchar("interesse", { length: 100 }).notNull(),
  tipoOutput: tipoOutputEnum("tipo_output").notNull(),
  testoGenerato: text("testo_generato").notNull(),
  tagImmagine: varchar("tag_immagine", { length: 100 }),
  listaParole: jsonb("lista_parole"),
  difficolta: difficoltaEnum("difficolta").default("media"),
  pdfUrl: varchar("pdf_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const illustrations = pgTable("illustrations", {
  id: serial("id").primaryKey(),
  tag: varchar("tag", { length: 100 }).notNull(),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  categoria: varchar("categoria", { length: 100 }),
  etaTarget: varchar("eta_target", { length: 20 }),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  stripeSubId: varchar("stripe_sub_id", { length: 100 }),
  status: subscriptionStatusEnum("status").default("trial").notNull(),
  currentPeriodEnd: timestamp("current_period_end"),
  seatsCount: integer("seats_count").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  adminUserId: bigint("admin_user_id", { mode: "number" }).notNull(),
  piano: pgEnum("team_plan", ["base"])("piano").notNull(),
  seatsTotal: integer("seats_total").notNull(),
  seatsUsate: integer("seats_usate").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  teamId: bigint("team_id", { mode: "number" }).notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  role: teamMemberRoleEnum("role").default("member").notNull(),
  invitedAt: timestamp("invited_at").defaultNow().notNull(),
  joinedAt: timestamp("joined_at"),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;
export type Sheet = typeof sheets.$inferSelect;
export type InsertSheet = typeof sheets.$inferInsert;
export type Illustration = typeof illustrations.$inferSelect;
export type InsertIllustration = typeof illustrations.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type InsertTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;
