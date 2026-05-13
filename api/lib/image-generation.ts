import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { nanoid } from "nanoid";

export const IMAGE_GENERATION_MODEL =
  process.env.GEMINI_IMAGE_MODEL ?? "gemini-3-flash-image";
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
  generationModel?: string | null;
  generatedCostUsd?: number | null;
  createdAt?: string;
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
    const lines = splitPromptImageLines(params.testoGenerato);
    const target =
      params.testoGenerato.match(/Target:\s*([^\n.]+)/iu)?.[1]?.trim() ||
      params.scenarioSmart ||
      params.tagImmagine ||
      "target clinico";
    const distractorText =
      params.testoGenerato.match(/Distrattori:\s*([^\n]+)/iu)?.[1] ?? "";
    const distractors = distractorText
      .split(/;|,/u)
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, optionCount - 1);

    const targetPrompt = lines[0] ?? target;
    const requests: ImageRequest[] = [
      {
        role: "target",
        label: "Target",
        prompt: buildClinicalImagePrompt(targetPrompt),
        semanticTags: [
          ...baseStyleTags,
          "tipo:discriminazione_visiva",
          "ruolo:target",
          `scenario:${target}`,
        ],
      },
    ];

    for (let index = 0; index < optionCount - 1; index += 1) {
      const label = `Distrattore ${index + 1}`;
      const distractor =
        distractors[index] ??
        `${params.tagImmagine ?? "opzione"} alternativa ${index + 1}`;
      requests.push({
        role: "distrattore",
        label,
        prompt: buildClinicalImagePrompt(lines[index + 1] ?? distractor),
        semanticTags: [
          ...baseStyleTags,
          "tipo:discriminazione_visiva",
          `ruolo:distrattore_${index + 1}`,
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const endpoint =
    process.env.GEMINI_IMAGE_API_URL ??
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_GENERATION_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: IMAGE_GENERATION_ASPECT_RATIO,
          imageSize: IMAGE_GENERATION_SIZE,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini image API error: ${response.status}`);
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

function saveLocalGeneratedImage(bytes: string, mimeType: string): string {
  const extension = mimeType === "image/jpeg" ? "jpg" : "png";
  const dir = resolve(process.cwd(), ".data/generated-images");
  mkdirSync(dir, { recursive: true });
  const fileName = `${nanoid()}.${extension}`;
  const filePath = resolve(dir, fileName);
  writeFileSync(filePath, Buffer.from(bytes, "base64"));
  return `.data/generated-images/${fileName}`;
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
  if (cached) return { ...cached, cacheHit: true };

  const prompt = sanitizeImagePrompt(request.prompt);
  let filePath: string;
  let mimeType = "image/png";
  let source: CachedIllustration["source"] = "generated";

  try {
    const generated = await callGeminiImageApi(prompt);
    filePath = saveLocalGeneratedImage(generated.bytes, generated.mimeType);
    mimeType = generated.mimeType;
  } catch {
    source = "mock";
    filePath = `mock://nano-banana-2/${encodeURIComponent(cacheKey)}`;
  }

  const saved = await db.save({
    tag: request.label,
    semanticTags,
    cacheKey,
    filePath,
    mimeType,
    source,
    generationModel: IMAGE_GENERATION_MODEL,
    generatedCostUsd: source === "generated" ? IMAGE_GENERATION_COST_USD : 0,
  });

  return { ...saved, cacheHit: false };
}
