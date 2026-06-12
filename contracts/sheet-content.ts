import { z } from "zod";

export const unifiedSheetTypeSchema = z.enum([
  "discriminazione_visiva",
  "morfosintassi",
  "narrazione_sequenze",
  "pragmatica",
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

const OPTIONAL_IMAGE_SHEET_TYPES: UnifiedSheetType[] = [
  "morfosintassi",
  "pragmatica",
  "storia",
  "filastrocca",
  "lista_parole",
];

type ValidateSheetOptions =
  | number
  | {
      numeroOpzioni?: number;
      numeroScene?: number;
      includeImages?: boolean;
    };

const GENERIC_INSTRUCTION_PATTERNS = [
  /^\s*trova l['’]intruso tra le immagini\.?\s*$/iu,
  /^\s*leggi il testo e svolgi l['’]?esercizio\.?\s*$/iu,
  /^\s*leggi il testo e completa l['’]?esercizio\.?\s*$/iu,
  /^\s*osserva le immagini e scegli quella corretta\.?\s*$/iu,
];
const VISUAL_LEVEL_ORDER: UnifiedSheetImage["livello"][] = [
  "difficile",
  "intermedio",
  "facile",
];
const TOO_GENERIC_IMAGE_PROMPT_PATTERNS = [
  /^\s*(?:target|distrattore|illustrazione|immagine)\s*(?:\d+)?\s*$/iu,
  /^\s*(?:realistic\s+)?(?:child-friendly\s+)?(?:target|distractor|image|illustration)(?:\s+image)?(?:,\s*no\s+text\.?)?\s*$/iu,
];

function isNonEmptyString(value: string) {
  return value.trim().length > 0;
}

function isGenericInstruction(value: string) {
  return GENERIC_INSTRUCTION_PATTERNS.some(pattern => pattern.test(value));
}

function normalizeForValidation(value: string) {
  return value
    .toLocaleLowerCase("it-IT")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countMeaningfulWords(value: string) {
  return normalizeForValidation(value)
    .split(" ")
    .filter(word => word.length > 2).length;
}

function isGenericImagePrompt(value: string, minimumMeaningfulWords = 8) {
  const normalized = value.trim();
  return (
    countMeaningfulWords(normalized) < minimumMeaningfulWords ||
    TOO_GENERIC_IMAGE_PROMPT_PATTERNS.some(pattern => pattern.test(normalized))
  );
}

function hasUniquePrompts(images: UnifiedSheetImage[]) {
  const prompts = images.map(image => normalizeForValidation(image.prompt));
  return new Set(prompts).size === prompts.length;
}

function validateVisualDiscriminationImages(
  images: UnifiedSheetImage[],
  numeroOpzioni: number
) {
  if (images.length !== numeroOpzioni) return false;
  if (!hasUniquePrompts(images)) return false;

  const [target, ...distractors] = images;
  if (target?.ruolo !== "target" || target.livello !== "principale") {
    return false;
  }
  if (isGenericImagePrompt(target.prompt)) return false;

  return distractors.every((image, index) => {
    const expectedLevel = VISUAL_LEVEL_ORDER[index];
    return (
      image.ruolo === "distrattore" &&
      image.livello === expectedLevel &&
      !isGenericImagePrompt(image.prompt)
    );
  });
}

function validateIllustrationImages(images: UnifiedSheetImage[]) {
  if (images.length < 1) return false;
  if (!hasUniquePrompts(images)) return false;

  return images.every(
    image =>
      image.ruolo === "illustrazione" &&
      image.livello === "principale" &&
      !isGenericImagePrompt(image.prompt, 5)
  );
}

function validateQuestions(
  sheet: UnifiedSheet,
  expectedType: UnifiedSheetType
) {
  if (expectedType === "discriminazione_visiva") {
    return sheet.domande.length === 0;
  }
  if (expectedType === "lista_parole") {
    return sheet.domande.length === 0;
  }
  if (expectedType === "narrazione_sequenze") {
    return (
      sheet.domande.length >= 4 &&
      sheet.domande.length <= 5 &&
      sheet.domande.every(
        question =>
          isNonEmptyString(question.domanda) &&
          isNonEmptyString(question.risposta) &&
          countMeaningfulWords(question.domanda) >= 3 &&
          countMeaningfulWords(question.risposta) >= 1
      )
    );
  }
  if (expectedType === "pragmatica") {
    return (
      sheet.domande.length >= 4 &&
      sheet.domande.length <= 6 &&
      sheet.domande.every(
        question =>
          isNonEmptyString(question.domanda) &&
          isNonEmptyString(question.risposta) &&
          countMeaningfulWords(question.domanda) >= 3 &&
          countMeaningfulWords(question.risposta) >= 1
      )
    );
  }
  if (expectedType === "morfosintassi") {
    return (
      sheet.domande.length >= 3 &&
      sheet.domande.length <= 8 &&
      sheet.domande.every(
        question =>
          isNonEmptyString(question.domanda) &&
          isNonEmptyString(question.risposta) &&
          countMeaningfulWords(question.domanda) >= 3 &&
          countMeaningfulWords(question.risposta) >= 1
      )
    );
  }

  return (
    sheet.domande.length >= 3 &&
    sheet.domande.length <= 5 &&
    sheet.domande.every(
      question =>
        isNonEmptyString(question.domanda) &&
        isNonEmptyString(question.risposta) &&
        countMeaningfulWords(question.domanda) >= 3 &&
        countMeaningfulWords(question.risposta) >= 1
    )
  );
}

function normalizeValidateSheetOptions(options: ValidateSheetOptions) {
  if (typeof options === "number") {
    return {
      numeroOpzioni: options,
      numeroScene: undefined,
      includeImages: undefined,
    };
  }

  return options;
}

function validateNarrativeSequenceImages(
  images: UnifiedSheetImage[],
  numeroScene?: number
) {
  const expectedSceneCount =
    typeof numeroScene === "number"
      ? Math.min(Math.max(numeroScene, 3), 5)
      : undefined;

  if (expectedSceneCount && images.length !== expectedSceneCount) return false;
  if (!expectedSceneCount && (images.length < 3 || images.length > 5))
    return false;

  return validateIllustrationImages(images);
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

export function canOmitSheetImages(tipo: SheetContentType) {
  return OPTIONAL_IMAGE_SHEET_TYPES.includes(normalizeUnifiedSheetType(tipo));
}

export function validateSheet(
  json: unknown,
  tipo: SheetContentType,
  options: ValidateSheetOptions = 4
): json is UnifiedSheet {
  const parsed = unifiedSheetSchema.safeParse(json);
  if (!parsed.success) return false;

  const sheet = parsed.data;
  const expectedType = normalizeUnifiedSheetType(tipo);
  const validationOptions = normalizeValidateSheetOptions(options);
  if (sheet.tipo !== expectedType) return false;
  if (!isNonEmptyString(sheet.titolo)) return false;
  if (!isNonEmptyString(sheet.consegna)) return false;
  if (isGenericInstruction(sheet.consegna)) return false;
  if (!isNonEmptyString(sheet.testo)) return false;

  if (!validateQuestions(sheet, expectedType)) return false;

  if (validationOptions.includeImages === false) {
    return canOmitSheetImages(expectedType) && sheet.immagini.length === 0;
  }

  if (expectedType === "discriminazione_visiva") {
    if (
      !validateVisualDiscriminationImages(
        sheet.immagini,
        validationOptions.numeroOpzioni ?? 4
      )
    ) {
      return false;
    }
  } else if (expectedType === "narrazione_sequenze") {
    if (
      !validateNarrativeSequenceImages(
        sheet.immagini,
        validationOptions.numeroScene
      )
    ) {
      return false;
    }
  } else {
    if (!validateIllustrationImages(sheet.immagini)) return false;
  }

  return sheet.immagini.every(
    image => isNonEmptyString(image.ruolo) && isNonEmptyString(image.prompt)
  );
}

export function parseUnifiedSheetContent(
  value: string
): UnifiedSheet | undefined {
  const text = decodeEscapedNewlines(value).trim();
  const candidates = text.startsWith("{")
    ? [text]
    : extractJsonObjectCandidates(text);

  for (const candidate of candidates) {
    try {
      return unifiedSheetSchema.parse(JSON.parse(candidate));
    } catch {
      // Try the next balanced object; legacy wrappers may contain prose first.
    }
  }

  return undefined;
}

function extractJsonObjectCandidates(value: string) {
  const candidates: string[] = [];

  for (
    let start = value.indexOf("{");
    start >= 0;
    start = value.indexOf("{", start + 1)
  ) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < value.length; index += 1) {
      const character = value[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;

      if (depth === 0) {
        candidates.push(value.slice(start, index + 1));
        break;
      }
    }
  }

  return candidates;
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
        `${index + 1}. ${question.domanda}${question.domanda.trim().endsWith("?") ? "" : "?"}`
    )
    .join(" ")}`;
}

function getSheetTitle(tipoOutput: SheetContentType): string {
  const titles: Record<UnifiedSheetType, string> = {
    discriminazione_visiva: "Discriminazione visiva",
    morfosintassi: "Morfologia e morfosintassi",
    narrazione_sequenze: "Narrazione e sequenze",
    pragmatica: "Pragmatica",
    storia: "Storia con fonema",
    filastrocca: "Filastrocca con fonema",
    lista_parole: "Lista parole con fonema",
  };

  return `Titolo: ${titles[normalizeUnifiedSheetType(tipoOutput)]}`;
}

function getStableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getVisualOptionStableKey(
  option: { role?: string; cacheKey?: string; label?: string },
  index: number
) {
  return [option.role, option.cacheKey, option.label, index]
    .filter(Boolean)
    .join(":");
}

type StableDisplayItem = {
  role?: string;
  cacheKey?: string;
  label?: string;
};

function stableShuffleVisualOptions<T extends StableDisplayItem>(
  options: T[],
  seed: string
) {
  return options
    .map((option, index) => ({
      option,
      index,
      sortKey: getStableHash(
        `${seed}:${getVisualOptionStableKey(option, index)}`
      ),
    }))
    .sort((a, b) => a.sortKey - b.sortKey || a.index - b.index)
    .map(item => item.option);
}

export function orderVisualOptionsForDisplay<T extends StableDisplayItem>(
  options: T[],
  seed: string | number
): T[] {
  if (options.length <= 1) return options;

  const seedValue = String(seed);
  const targetEntry = options
    .map((option, index) => ({ option, index }))
    .find(item => item.option.role === "target");
  if (!targetEntry) return stableShuffleVisualOptions(options, seedValue);

  const distractors = stableShuffleVisualOptions(
    options.filter((_, index) => index !== targetEntry.index),
    `${seedValue}:distrattori`
  );
  const targetIndex =
    getStableHash(`${seedValue}:target-position`) % options.length;

  return [
    ...distractors.slice(0, targetIndex),
    targetEntry.option,
    ...distractors.slice(targetIndex),
  ];
}

export function orderNarrativeSequenceForDisplay<T extends StableDisplayItem>(
  options: T[],
  seed: string | number
): T[] {
  if (options.length <= 1) return options;

  const seedValue = String(seed);
  const shuffled = stableShuffleVisualOptions(
    options,
    `${seedValue}:narrative-sequence`
  );
  const keptOriginalOrder = shuffled.every(
    (option, index) => option === options[index]
  );

  if (!keptOriginalOrder) return shuffled;

  const offset =
    (getStableHash(`${seedValue}:narrative-rotation`) % (options.length - 1)) +
    1;
  return [...shuffled.slice(offset), ...shuffled.slice(0, offset)];
}

export function getUserFacingSheetContent(params: {
  tipoOutput: SheetContentType;
  testoGenerato: string;
}): string {
  const unifiedSheet = parseUnifiedSheetContent(params.testoGenerato);
  if (unifiedSheet) {
    if (unifiedSheet.tipo === "discriminazione_visiva") {
      return [
        formatInstruction("Indica l'immagine corretta."),
        `Frase: ${normalizeSentence(unifiedSheet.testo)}`,
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    if (unifiedSheet.tipo === "narrazione_sequenze") {
      return [
        `Titolo: ${unifiedSheet.titolo}`,
        formatInstruction(
          "Osserva le immagini mescolate, riordinale nella sequenza corretta e racconta la storia."
        ),
        `Testo: ${unifiedSheet.testo}`,
        formatQuestions(unifiedSheet.domande),
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    return [
      `Titolo: ${unifiedSheet.titolo}`,
      formatInstruction(unifiedSheet.consegna),
      `Testo: ${unifiedSheet.testo}`,
      formatQuestions(unifiedSheet.domande),
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
