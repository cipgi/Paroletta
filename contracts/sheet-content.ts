export type SheetContentType =
  | "storia"
  | "filastrocca"
  | "lista"
  | "discriminazione_visiva"
  | "morfosintassi_complessa"
  | (string & {});

const KNOWN_SECTION_NAMES = [
  "Obiettivo clinico",
  "Obiettivo morfosintattico",
  "Consegna",
  "Target",
  "Distrattori",
  "Contesto comune",
  "Prompt immagini",
  "Prompt immagine",
  "Frase target",
  "Scena da illustrare",
  "Domande di comprensione",
  "Parole semplici",
  "Parole medie",
  "Parole complesse",
] as const;

const INTERNAL_SECTION_NAMES = new Set<string>([
  "obiettivo clinico",
  "obiettivo morfosintattico",
  "target",
  "distrattori",
  "contesto comune",
  "prompt immagini",
  "prompt immagine",
  "scena da illustrare",
]);

const SECTION_LINE_PATTERN = (section: string) =>
  new RegExp(`^\\s*${section}\\s*:\\s*(.+?)\\s*$`, "imu");
const ANY_KNOWN_SECTION_PATTERN = new RegExp(
  `^\\s*(${KNOWN_SECTION_NAMES.map(escapeRegExp).join("|")})\\s*:\\s*(.*)$`,
  "iu"
);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSectionLine(text: string, section: string): string | undefined {
  return text.match(SECTION_LINE_PATTERN(section))?.[1]?.trim();
}

function extractSectionBlock(text: string, section: string): string | undefined {
  const lines = text.split(/\r?\n/u);
  const sectionPattern = new RegExp(
    `^\\s*${escapeRegExp(section)}\\s*:\\s*(.*)$`,
    "iu"
  );
  const block: string[] = [];
  let isCollecting = false;

  for (const line of lines) {
    if (!isCollecting) {
      const match = line.match(sectionPattern);
      if (!match) continue;
      isCollecting = true;
      block.push(`${section}: ${match[1]?.trim() ?? ""}`.trim());
      continue;
    }

    if (ANY_KNOWN_SECTION_PATTERN.test(line)) break;
    block.push(line);
  }

  return block.join("\n").trim() || undefined;
}

function removeTrailingPunctuation(value: string) {
  return value.trim().replace(/[.;:,\s]+$/u, "");
}

function lowerFirstLetter(value: string) {
  const trimmed = removeTrailingPunctuation(value);
  return trimmed
    ? `${trimmed.charAt(0).toLocaleLowerCase("it-IT")}${trimmed.slice(1)}`
    : "";
}

function getVisualInstructionAction(instruction: string) {
  if (/evidenz/iu.test(instruction)) return "Evidenzia";
  if (/cerchia/iu.test(instruction)) return "Cerchia";
  if (/colora/iu.test(instruction)) return "Colora";
  if (/seleziona/iu.test(instruction)) return "Seleziona";
  if (/indica/iu.test(instruction)) return "Indica";
  return "Trova";
}

function formatContextualVisualInstruction(text: string) {
  const target = lowerFirstLetter(extractSectionLine(text, "Target") ?? "");
  const rawInstruction = extractSectionLine(text, "Consegna") ?? "";

  if (!target) return "";

  return formatInstruction(
    `${getVisualInstructionAction(rawInstruction)} l'immagine corrispondente alla frase: ${target}`
  );
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

function removeInternalSections(text: string): string {
  const output: string[] = [];
  let isSkippingInternalSection = false;

  for (const line of text.split(/\r?\n/u)) {
    const sectionMatch = line.match(ANY_KNOWN_SECTION_PATTERN);

    if (sectionMatch) {
      const sectionName = sectionMatch[1]?.toLocaleLowerCase("it-IT") ?? "";
      isSkippingInternalSection = INTERNAL_SECTION_NAMES.has(sectionName);
      if (isSkippingInternalSection) continue;
    }

    if (!isSkippingInternalSection) output.push(line);
  }

  return output
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function joinVisibleBlocks(blocks: Array<string | undefined>) {
  return blocks.filter(Boolean).join("\n\n").trim();
}

function getSheetTitle(tipoOutput: SheetContentType): string {
  if (tipoOutput === "discriminazione_visiva") return "Titolo: Discriminazione visiva";
  if (tipoOutput === "morfosintassi_complessa") return "Titolo: Morfosintassi complessa";
  if (tipoOutput === "storia") return "Titolo: Storia con fonema";
  if (tipoOutput === "filastrocca") return "Titolo: Filastrocca con fonema";
  if (tipoOutput === "lista") return "Titolo: Lista parole con fonema";
  return "Titolo: Scheda personalizzata";
}

export function getUserFacingSheetContent(params: {
  tipoOutput: SheetContentType;
  testoGenerato: string;
}): string {
  const text = decodeEscapedNewlines(params.testoGenerato).trim();

  if (params.tipoOutput === "discriminazione_visiva") {
    const target = extractSectionLine(text, "Target");
    const instruction =
      formatContextualVisualInstruction(text) ||
      formatInstruction(extractSectionLine(text, "Consegna") ?? "") ||
      "Consegna: Trova l'immagine corrispondente alla frase.";

    return joinVisibleBlocks([
      getSheetTitle(params.tipoOutput),
      target ? `Testo: ${normalizeSentence(target)}` : undefined,
      instruction,
      "Immagini: osserva le opzioni e scegli quella corretta.",
    ]);
  }

  if (params.tipoOutput === "morfosintassi_complessa") {
    const explicitInstruction = formatInstruction(
      extractSectionLine(text, "Consegna") ?? ""
    );
    const targetPhrase = extractSectionBlock(text, "Frase target");
    const comprehensionQuestions = extractSectionBlock(
      text,
      "Domande di comprensione"
    );

    const cleaned = removeInternalSections(text);
    return joinVisibleBlocks([
      getSheetTitle(params.tipoOutput),
      explicitInstruction || "Consegna: Leggi il testo e completa l'esercizio.",
      targetPhrase
        ? `Testo: ${targetPhrase.replace(/^Frase target:\s*/iu, "")}`
        : cleaned
          ? `Testo: ${cleaned}`
          : undefined,
      comprehensionQuestions ?? "Domande di comprensione: n/d",
      "Immagini: usa l'immagine per rispondere alle domande.",
    ]);
  }

  const cleaned = removeInternalSections(text);
  return joinVisibleBlocks([
    getSheetTitle(params.tipoOutput),
    "Consegna: Leggi il testo e svolgi l'esercizio.",
    cleaned ? `Testo: ${cleaned}` : undefined,
    "Immagini: osserva l'illustrazione collegata al testo.",
  ]);
}

export function getNeutralVisualOptionLabel(index: number): string {
  return `Opzione ${index + 1}`;
}
