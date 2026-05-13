import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { nanoid } from "nanoid";

export const IMAGE_GENERATION_MODEL =
  process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image-preview";
export const IMAGE_GENERATION_MODEL_CODE_NAME = "Nano Banana 2";
export const IMAGE_GENERATION_COST_USD = 0.045;
export const IMAGE_GENERATION_ASPECT_RATIO = "1:1";
export const IMAGE_GENERATION_SIZE = "512x512";

const SCRIPT_STYLE_CONTENT_PATTERN =
  /<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/giu;
const CODE_FENCE_PATTERN = /```+/g;
const ROLE_MARKER_PATTERN = /\b(?:system|developer|assistant|user)\s*:/giu;
const INSTRUCTION_MARKER_PATTERN =
  /(?:^|\b)(?:ignora|ignore|disregard|forget|system|developer|assistant|istruzioni|instructions|prompt|jailbreak|override|bypass|rispondi come|act as)(?:\b|$)/giu;

function sanitizeImageText(input: string, maxLength: number): string {
  return input
    .replace(SCRIPT_STYLE_CONTENT_PATTERN, " ")
    .replace(/[<>]/g, " ")
    .replace(CODE_FENCE_PATTERN, " ")
    .replace(ROLE_MARKER_PATTERN, " ")
    .replace(INSTRUCTION_MARKER_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

const MAX_TAG_LENGTH = 80;
const MAX_PROMPT_LENGTH = 1200;
const SENSITIVE_PATIENT_PATTERN =
  /\b(?:paziente|patient|nome|cognome|codice\s*fiscale|telefono|email|indirizzo|diagnosi|cartella|nato\s+il|nata\s+il)\b(?:\s+[^,.;:]+)?/giu;
const NON_SEMANTIC_PATTERN = /[^a-z0-9_:-]+/giu;

export type ImageRole = "base" | "target" | "distrattore";

export type ImageRequest = {
  role: ImageRole;
  label: string;
  prompt: string;
  semanticTags: string[];
};

export type CachedIllustration = {
  id?: string;
  tag: string;
  semanticTags: string[];
  cacheKey: string;
  filePath: string;
  mimeType?: string | null;
  source: "generated" | "uploaded" | "mock";
  fallbackReason?: string | null;
  generationModel?: string | null;
  generatedCostUsd?: number | null;
  createdAt?: string;
};

export type ResolvedImageAsset = {
  role: ImageRole;
  label: string;
  semanticTags: string[];
  cacheKey: string;
  filePath: string;
  source: CachedIllustration["source"];
  fallbackReason?: string | null;
  cacheHit: boolean;
};

export type ImageCacheDb = {
  findByCacheKey(cacheKey: string): Promise<CachedIllustration | null>;
  save(
    illustration: Omit<CachedIllustration, "id" | "createdAt">
  ): Promise<CachedIllustration>;
};

export function normalizeSemanticTag(tag: string): string {
  return sanitizeImageText(tag, MAX_TAG_LENGTH)
    .toLocaleLowerCase("it-IT")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*:\s*/g, ":")
    .replace(/\s+/g, "_")
    .replace(NON_SEMANTIC_PATTERN, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function sanitizeImagePrompt(prompt: string): string {
  return sanitizeImageText(
    prompt.replace(SENSITIVE_PATIENT_PATTERN, " "),
    MAX_PROMPT_LENGTH
  );
}

export function buildSemanticCacheKey(tags: string[]): string {
  const normalizedTags = Array.from(
    new Set(tags.map(normalizeSemanticTag).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "it-IT"));

  if (normalizedTags.length === 0) {
    throw new Error("At least one semantic tag is required for image caching");
  }

  return normalizedTags.join("|");
}

function splitPromptImageLines(text: string): string[] {
  const promptSection = text.match(/Prompt immagini?:([\s\S]*)/iu)?.[1] ?? text;
  return promptSection
    .split(/\n|;|\d+\.|- /u)
    .map(line => line.trim())
    .filter(line => line.length > 12);
}

function cleanVisualOptionText(text: string): string {
  return text
    .replace(
      /^\s*(?:target|distrattore\s*\d*)\s*(?:\([^)]*\))?\s*[:.-]\s*/iu,
      ""
    )
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;,]\s*$/u, "");
}

function extractSectionLine(text: string, section: string): string | undefined {
  return text.match(new RegExp(`${section}:\\s*([^\\n]+)`, "iu"))?.[1]?.trim();
}

function extractLabeledPrompt(
  promptLines: string[],
  labelPattern: RegExp
): string | undefined {
  const line = promptLines.find(item => labelPattern.test(item));
  return line ? cleanVisualOptionText(line) : undefined;
}

function parseDistractors(text: string, maxDistractors: number): string[] {
  const distractorText = extractSectionLine(text, "Distrattori") ?? "";
  const primaryParts = distractorText
    .split(/;|\n/u)
    .map(cleanVisualOptionText)
    .filter(Boolean);

  const parts =
    primaryParts.length <= 1
      ? distractorText.split(/,/u).map(cleanVisualOptionText).filter(Boolean)
      : primaryParts;

  return parts.slice(0, maxDistractors);
}

function buildVisualOptionScene(params: {
  label: string;
  description: string;
  context?: string;
  similarity?: string;
  exclude: string[];
}) {
  const context = params.context
    ? `Contesto comune da mantenere: ${params.context}. `
    : "";
  const similarity = params.similarity
    ? `Grado di somiglianza con il target: ${params.similarity}. `
    : "";
  const exclusions = params.exclude.length
    ? `Non includere nella stessa immagine: ${params.exclude.join(", ")}. `
    : "";

  return [
    `Opzione visiva separata: ${params.label}.`,
    context,
    similarity,
    `Rappresenta solo questa scena: ${params.description}.`,
    exclusions,
    "Non creare collage, griglie, vignette multiple o scene combinate con altre opzioni.",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildImageRequests(params: {
  tipoOutput: string;
  interesse: string;
  tagImmagine?: string | null;
  testoGenerato: string;
  numeroOpzioni?: number;
  scenarioSmart?: string;
  descrizioneScena?: string;
}): ImageRequest[] {
  const baseStyleTags = ["stile:vettoriale_bambini", "formato:quadrato_512"];

  if (params.tipoOutput === "discriminazione_visiva") {
    const optionCount = Math.min(Math.max(params.numeroOpzioni ?? 4, 2), 4);
    const promptLines = splitPromptImageLines(params.testoGenerato);
    const target =
      cleanVisualOptionText(
        extractSectionLine(params.testoGenerato, "Target") ?? ""
      ) ||
      params.scenarioSmart ||
      params.tagImmagine ||
      "target clinico";
    const distractors = parseDistractors(params.testoGenerato, optionCount - 1);
    const context = extractSectionLine(params.testoGenerato, "Contesto comune");
    const targetPrompt =
      extractLabeledPrompt(promptLines, /^\s*target\b/iu) ?? target;
    const allDistractorDescriptions = Array.from(
      { length: optionCount - 1 },
      (_, index) =>
        distractors[index] ??
        `${params.tagImmagine ?? "opzione"} alternativa ${index + 1}`
    );
    const requests: ImageRequest[] = [
      {
        role: "target",
        label: "Target",
        prompt: buildClinicalImagePrompt(
          buildVisualOptionScene({
            label: "Target",
            description: targetPrompt,
            context,
            exclude: allDistractorDescriptions,
          })
        ),
        semanticTags: [
          ...baseStyleTags,
          "tipo:discriminazione_visiva",
          "ruolo:target",
          `scenario:${target}`,
        ],
      },
    ];

    const similarities = [
      "molto simile",
      "mediamente simile",
      "lontanamente simile",
    ];

    for (let index = 0; index < optionCount - 1; index += 1) {
      const label = `Distrattore ${index + 1}`;
      const distractor = allDistractorDescriptions[index];
      const distractorPrompt =
        extractLabeledPrompt(
          promptLines,
          new RegExp(`^\\s*distrattore\\s*${index + 1}\\b`, "iu")
        ) ?? distractor;
      requests.push({
        role: "distrattore",
        label,
        prompt: buildClinicalImagePrompt(
          buildVisualOptionScene({
            label,
            description: distractorPrompt,
            context,
            similarity: similarities[index],
            exclude: [
              target,
              ...allDistractorDescriptions.filter(
                (_, itemIndex) => itemIndex !== index
              ),
            ],
          })
        ),
        semanticTags: [
          ...baseStyleTags,
          "tipo:discriminazione_visiva",
          `ruolo:distrattore_${index + 1}`,
          `similarita:${similarities[index]}`,
          `scenario:${distractor}`,
        ],
      });
    }

    return requests;
  }

  const scene =
    params.tipoOutput === "morfosintassi_complessa"
      ? params.descrizioneScena ||
        params.testoGenerato.match(/Scena da illustrare:\s*([^\n]+)/iu)?.[1] ||
        params.tagImmagine ||
        "scena morfosintattica"
      : params.tagImmagine || params.interesse || "illustrazione generica";

  return [
    {
      role: "base",
      label: params.tagImmagine ?? "Illustrazione",
      prompt: buildClinicalImagePrompt(String(scene)),
      semanticTags: [
        ...baseStyleTags,
        `tipo:${params.tipoOutput}`,
        `soggetto:${scene}`,
      ],
    },
  ];
}

export function buildClinicalImagePrompt(scene: string): string {
  const sanitizedScene = sanitizeImagePrompt(scene);
  return [
    "Illustrazione pediatrica per esercizio di logopedia.",
    `Scena: ${sanitizedScene}.`,
    "Stile vettoriale per bambini, colori chiari, sfondo semplice, nessun testo nell'immagine.",
    `Output obbligatorio: aspect ratio ${IMAGE_GENERATION_ASPECT_RATIO}, risoluzione ${IMAGE_GENERATION_SIZE}.`,
    "Non includere nomi, dati clinici o identificativi di pazienti.",
  ].join(" ");
}

async function callGeminiImageApi(prompt: string): Promise<{
  bytes: string;
  mimeType: string;
}> {
  const apiKey =
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Gemini API key not configured. Set GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY."
    );
  }

  const endpoint =
    process.env.GEMINI_IMAGE_API_URL ??
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_GENERATION_MODEL}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = sanitizeImageText(await response.text(), 300);
    throw new Error(
      `Gemini image API error: ${response.status}${errorBody ? ` - ${errorBody}` : ""}`
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
      };
    }>;
  };
  const inlineData = data.candidates?.[0]?.content?.parts?.find(
    part => part.inlineData?.data
  )?.inlineData;

  if (!inlineData?.data) throw new Error("Gemini image API returned no image");

  return {
    bytes: inlineData.data,
    mimeType: inlineData.mimeType ?? "image/png",
  };
}

function describeImageGenerationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const httpStatus = message.match(/Gemini image API error: (\d{3})/u)?.[1];

  if (message.includes("Gemini API key not configured")) {
    return "Chiave API Gemini mancante: configura GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY o GOOGLE_API_KEY nell'ambiente server.";
  }

  if (httpStatus) {
    return `Gemini ha risposto con errore HTTP ${httpStatus}: controlla chiave API, quota/billing, modello ${IMAGE_GENERATION_MODEL} ed eventuale GEMINI_IMAGE_API_URL.`;
  }

  if (message.includes("returned no image")) {
    return "Gemini ha risposto senza dati immagine inline: controlla modello, responseModalities IMAGE e compatibilità dell'endpoint configurato.";
  }

  return `Errore generazione immagine: ${sanitizeImageText(message, 220) || "controlla i log del server per i dettagli"}.`;
}

function saveLocalGeneratedImage(bytes: string, mimeType: string): string {
  const extension = mimeType === "image/jpeg" ? "jpg" : "png";
  const dir = resolve(process.cwd(), ".data/generated-images");
  mkdirSync(dir, { recursive: true });
  const fileName = `${nanoid()}.${extension}`;
  const filePath = resolve(dir, fileName);
  writeFileSync(filePath, Buffer.from(bytes, "base64"));
  return `/generated-images/${fileName}`;
}

function buildMockImageDataUrl(label: string): string {
  const safeLabel = sanitizeImageText(label, 60) || "Immagine non disponibile";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="32" fill="#f1f5f9"/><circle cx="256" cy="214" r="58" fill="#ccfbf1"/><path d="M176 332h160" stroke="#0f766e" stroke-width="18" stroke-linecap="round"/><text x="256" y="394" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#334155">${safeLabel}</text><text x="256" y="438" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#64748b">fallback locale</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function resolveImageRequestWithCache(
  request: ImageRequest,
  db: ImageCacheDb
): Promise<CachedIllustration & { cacheHit: boolean }> {
  const semanticTags = Array.from(
    new Set(request.semanticTags.map(normalizeSemanticTag).filter(Boolean))
  );
  const cacheKey = buildSemanticCacheKey(semanticTags);
  const cached = await db.findByCacheKey(cacheKey);
  if (cached && cached.source !== "mock") return { ...cached, cacheHit: true };

  const prompt = sanitizeImagePrompt(request.prompt);
  let filePath: string;
  let mimeType = "image/png";
  let source: CachedIllustration["source"] = "generated";
  let fallbackReason: string | null = null;

  try {
    const generated = await callGeminiImageApi(prompt);
    filePath = saveLocalGeneratedImage(generated.bytes, generated.mimeType);
    mimeType = generated.mimeType;
  } catch (error) {
    console.error("[image-generation] Gemini image generation failed", {
      cacheKey,
      error,
    });
    source = "mock";
    fallbackReason = describeImageGenerationError(error);
    filePath = buildMockImageDataUrl(request.label);
  }

  const illustration = {
    tag: request.label,
    semanticTags,
    cacheKey,
    filePath,
    mimeType,
    source,
    fallbackReason,
    generationModel: IMAGE_GENERATION_MODEL,
    generatedCostUsd: source === "generated" ? IMAGE_GENERATION_COST_USD : 0,
  };

  if (source === "mock") {
    return { ...illustration, cacheHit: false };
  }

  const saved = await db.save(illustration);

  return { ...saved, cacheHit: false };
}
