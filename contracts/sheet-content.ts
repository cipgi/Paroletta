import { z } from "zod";

export const unifiedSheetTypeSchema = z.enum([
  "discriminazione_visiva",
  "morfosintassi",
  "storia",
  "filastrocca",
  "lista_parole",
]);

export const unifiedImageRoleSchema = z.enum([
  "target",
  "distrattore",
  "illustrazione",
]);

export const unifiedImageLevelSchema = z.enum([
  "difficile",
  "intermedio",
  "facile",
  "principale",
]);

export const unifiedSheetImageSchema = z.object({
  ruolo: unifiedImageRoleSchema,
  livello: unifiedImageLevelSchema,
  prompt: z.string(),
});

export const unifiedSheetQuestionSchema = z.object({
  domanda: z.string(),
  risposta: z.string(),
});

export const unifiedSheetSchema = z.object({
  tipo: unifiedSheetTypeSchema,
  titolo: z.string(),
  consegna: z.string(),
  testo: z.string(),
  immagini: z.array(unifiedSheetImageSchema),
  domande: z.array(unifiedSheetQuestionSchema),
});

export type UnifiedSheetType = z.infer<typeof unifiedSheetTypeSchema>;
export type UnifiedSheetImage = z.infer<typeof unifiedSheetImageSchema>;
export type UnifiedSheetQuestion = z.infer<typeof unifiedSheetQuestionSchema>;
export type UnifiedSheet = z.infer<typeof unifiedSheetSchema>;

export type SheetContentType =
  | UnifiedSheetType
  | "lista"
  | "morfosintassi_complessa"
  | (string & {});

const GENERIC_INSTRUCTION_PATTERNS = [
  /^\s*trova l['’]intruso tra le immagini\.?\s*$/iu,
  /^\s*leggi il testo e svolgi l['’]?esercizio\.?\s*$/iu,
  /^\s*leggi il testo e completa l['’]?esercizio\.?\s*$/iu,
  /^\s*osserva le immagini e scegli quella corretta\.?\s*$/iu,
];

function isNonEmptyString(value: string) {
  return value.trim().length > 0;
}

function isGenericInstruction(value: string) {
  return GENERIC_INSTRUCTION_PATTERNS.some(pattern => pattern.test(value));
}

export function normalizeUnifiedSheetType(
  tipo: SheetContentType
): UnifiedSheetType {
  if (tipo === "lista") return "lista_parole";
  if (tipo === "morfosintassi_complessa") return "morfosintassi";
  if (unifiedSheetTypeSchema.safeParse(tipo).success)
    return tipo as UnifiedSheetType;
  return "storia";
}

export function validateSheet(
  json: unknown,
  tipo: SheetContentType,
  numeroOpzioni = 4
): json is UnifiedSheet {
  const parsed = unifiedSheetSchema.safeParse(json);
  if (!parsed.success) return false;

  const sheet = parsed.data;
  const expectedType = normalizeUnifiedSheetType(tipo);
  if (sheet.tipo !== expectedType) return false;
  if (!isNonEmptyString(sheet.titolo)) return false;
  if (!isNonEmptyString(sheet.consegna)) return false;
  if (isGenericInstruction(sheet.consegna)) return false;
  if (!isNonEmptyString(sheet.testo)) return false;

  if (expectedType === "discriminazione_visiva") {
    if (sheet.immagini.length !== numeroOpzioni) return false;
  } else if (sheet.immagini.length < 1) {
    return false;
  }

  return sheet.immagini.every(
    image => isNonEmptyString(image.ruolo) && isNonEmptyString(image.prompt)
  );
}

export function parseUnifiedSheetContent(
  value: string
): UnifiedSheet | undefined {
  const text = decodeEscapedNewlines(value).trim();
  if (!text.startsWith("{")) return undefined;

  try {
    return unifiedSheetSchema.parse(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function normalizeSentence(value: string) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function decodeEscapedNewlines(value: string) {
  return value.replace(/\\r\\n|\\n|\\r/gu, "\n");
}

function formatInstruction(instruction: string) {
  const normalized = normalizeSentence(instruction);
  return normalized ? `Consegna: ${normalized}` : "";
}

function formatQuestions(questions: UnifiedSheetQuestion[]) {
  if (questions.length === 0) return undefined;

  return `Domande: ${questions
    .map(
      (question, index) =>
        `${index + 1}. ${question.domanda}${question.domanda.trim().endsWith("?") ? "" : "?"} Risposta: ${question.risposta}`
    )
    .join(" ")}`;
}

function formatImageSummary(images: UnifiedSheetImage[]) {
  if (images.length === 0) return undefined;

  return `Immagini: ${images
    .map((image, index) => `${index + 1}. ${image.ruolo} (${image.livello})`)
    .join("; ")}.`;
}

function getSheetTitle(tipoOutput: SheetContentType): string {
  const titles: Record<UnifiedSheetType, string> = {
    discriminazione_visiva: "Discriminazione visiva",
    morfosintassi: "Morfosintassi",
    storia: "Storia con fonema",
    filastrocca: "Filastrocca con fonema",
    lista_parole: "Lista parole con fonema",
  };

  return `Titolo: ${titles[normalizeUnifiedSheetType(tipoOutput)]}`;
}

export function getUserFacingSheetContent(params: {
  tipoOutput: SheetContentType;
  testoGenerato: string;
}): string {
  const unifiedSheet = parseUnifiedSheetContent(params.testoGenerato);
  if (unifiedSheet) {
    return [
      `Titolo: ${unifiedSheet.titolo}`,
      formatInstruction(unifiedSheet.consegna),
      `Testo: ${unifiedSheet.testo}`,
      formatQuestions(unifiedSheet.domande),
      formatImageSummary(unifiedSheet.immagini),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const text = decodeEscapedNewlines(params.testoGenerato).trim();
  return [
    getSheetTitle(params.tipoOutput),
    "Consegna: Leggi il contenuto della scheda e svolgi l'esercizio.",
    text ? `Testo: ${text}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function getNeutralVisualOptionLabel(index: number): string {
  return `Opzione ${index + 1}`;
}
