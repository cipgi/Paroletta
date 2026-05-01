import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  json,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
  firstName: varchar("firstName", { length: 100 }),
  lastName: varchar("lastName", { length: 100 }),
  piano: mysqlEnum("piano", ["trial", "base"]).default("trial"),
  seats: int("seats").default(1),
  schedeMese: int("schedeMese").default(0),
  trialSchedeUsate: int("trialSchedeUsate").default(0),
  teamId: bigint("teamId", { mode: "number", unsigned: true }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const patients = mysqlTable("patients", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true })
    .notNull(),
  aliasEta: varchar("aliasEta", { length: 50 }),
  noteAnonime: text("noteAnonime"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

export const sheets = mysqlTable("sheets", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true })
    .notNull(),
  patientId: bigint("patientId", { mode: "number", unsigned: true }),
  fonema: varchar("fonema", { length: 10 }).notNull(),
  interesse: varchar("interesse", { length: 100 }).notNull(),
  tipoOutput: mysqlEnum("tipoOutput", ["storia", "filastrocca", "lista"]).notNull(),
  testoGenerato: text("testoGenerato").notNull(),
  tagImmagine: varchar("tagImmagine", { length: 100 }),
  listaParole: json("listaParole"),
  difficolta: mysqlEnum("difficolta", ["bassa", "media", "alta"]).default("media"),
  pdfUrl: varchar("pdfUrl", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Sheet = typeof sheets.$inferSelect;
export type InsertSheet = typeof sheets.$inferInsert;

export const illustrations = mysqlTable("illustrations", {
  id: serial("id").primaryKey(),
  tag: varchar("tag", { length: 100 }).notNull(),
  filePath: varchar("filePath", { length: 500 }).notNull(),
  categoria: varchar("categoria", { length: 100 }),
  etaTarget: varchar("etaTarget", { length: 20 }),
});

export type Illustration = typeof illustrations.$inferSelect;
export type InsertIllustration = typeof illustrations.$inferInsert;

export const subscriptions = mysqlTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true })
    .notNull(),
  stripeSubId: varchar("stripeSubId", { length: 100 }),
  status: mysqlEnum("status", ["attivo", "scaduto", "cancellato", "trial"])
    .default("trial")
    .notNull(),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  seatsCount: int("seatsCount").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

export const teams = mysqlTable("teams", {
  id: serial("id").primaryKey(),
  adminUserId: bigint("adminUserId", { mode: "number", unsigned: true })
    .notNull(),
  piano: mysqlEnum("piano", ["base"]).notNull(),
  seatsTotal: int("seatsTotal").notNull(),
  seatsUsate: int("seatsUsate").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Team = typeof teams.$inferSelect;
export type InsertTeam = typeof teams.$inferInsert;

export const teamMembers = mysqlTable("team_members", {
  id: serial("id").primaryKey(),
  teamId: bigint("teamId", { mode: "number", unsigned: true })
    .notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true })
    .notNull(),
  role: mysqlEnum("role", ["admin", "member"]).default("member").notNull(),
  invitedAt: timestamp("invitedAt").defaultNow().notNull(),
  joinedAt: timestamp("joinedAt"),
});

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;
