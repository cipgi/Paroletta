export const IMAGE_GENERATION_MODEL =
  process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
export const IMAGE_GENERATION_MODEL_CODE_NAME = "GPT Image 2";
export const IMAGE_GENERATION_QUALITY = "low";
export const IMAGE_GENERATION_COST_USD: number | null = null;
export const IMAGE_GENERATION_ASPECT_RATIO = "1:1";
export const IMAGE_GENERATION_SIZE = "1024x1024";

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
const MAX_PROMPT_LENGTH = 1800;
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
  target: string;
  isTarget: boolean;
  context?: string;
  variationAxis?: string;
  exclude: string[];
}) {
  const context = params.context
    ? `Contesto comune vincolante da mantenere identico in tutta la serie: ${params.context}. `
    : "";
  const variationAxis = params.variationAxis
    ? `Unico asse di variazione per questa opzione: ${params.variationAxis}. `
    : "Unico asse di variazione: nessuno, questa è l'immagine target. ";
  const matchingRule = params.isTarget
    ? `REQUISITO NON NEGOZIABILE: questa immagine deve rendere vera la consegna e mostrare chiaramente il target esatto: ${params.target}. `
    : `REQUISITO NON NEGOZIABILE: questa immagine deve rappresentare il distrattore, non il target; deve rendere falsa la consegna sul target esatto: ${params.target}. `;
  const exclusions = params.exclude.length
    ? `Non includere nella stessa immagine: ${params.exclude.join(", ")}. `
    : "";

  return [
    `Frame separato di una serie visiva coerente: ${params.label}.`,
    "Le immagini della serie devono sembrare appartenere alla stessa storia clinica: stesso stile, stessa inquadratura, stesso ambiente, stessa palette e stessi personaggi salvo l'unico asse variato.",
    context,
    matchingRule,
    variationAxis,
    `Rappresenta solo questa scena, senza sostituire il soggetto richiesto: ${params.description}.`,
    "La scena generata deve combaciare letteralmente con la descrizione: soggetti, azione, oggetto e posizione devono essere quelli indicati.",
    "Varia solo il dettaglio clinico indicato; non cambiare categoria, sfondo, camera, illuminazione o altri dettagli narrativi.",
    exclusions,
    "Non creare collage, griglie, vignette multiple o scene combinate con altre opzioni.",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractVariationAxis(
  description: string,
  axes: string | undefined,
  index: number
): string {
  const labeledAxis = description.match(
    /\((azione|agente|oggetto|spazial[^)]*|posizione[^)]*)\)/iu
  )?.[1];
  if (labeledAxis) return labeledAxis;

  const parsedAxes =
    axes
      ?.split(/;|,/u)
      .map(axis => axis.trim())
      .filter(axis => /azione|agente|oggetto|spazial|posizione/iu.test(axis)) ??
    [];

  return (
    parsedAxes[index] ??
    ["azione", "agente", "oggetto", "posizione spaziale"][index] ??
    "dettaglio clinico minimo"
  );
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
  const baseStyleTags = ["stile:vettoriale_bambini", "formato:quadrato_1024"];
  const visualStyleTags = [...baseStyleTags, "prompt_version:visual_exact_v2"];

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
    const axes = extractSectionLine(params.testoGenerato, "Assi di variazione");
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
            target,
            isTarget: true,
            context,
            exclude: allDistractorDescriptions,
          })
        ),
        semanticTags: [
          ...visualStyleTags,
          "tipo:discriminazione_visiva",
          "ruolo:target",
          `scenario:${target}`,
          `consegna_target:${target}`,
          `prompt_target:${targetPrompt}`,
        ],
      },
    ];

    for (let index = 0; index < optionCount - 1; index += 1) {
      const label = `Distrattore ${index + 1}`;
      const distractor = allDistractorDescriptions[index];
      const distractorPrompt =
        extractLabeledPrompt(
          promptLines,
          new RegExp(`^\\s*distrattore\\s*${index + 1}\\b`, "iu")
        ) ?? distractor;
      const variationAxis = extractVariationAxis(distractor, axes, index);
      requests.push({
        role: "distrattore",
        label,
        prompt: buildClinicalImagePrompt(
          buildVisualOptionScene({
            label,
            description: distractorPrompt,
            target,
            isTarget: false,
            context,
            variationAxis,
            exclude: [
              target,
              ...allDistractorDescriptions.filter(
                (_, itemIndex) => itemIndex !== index
              ),
            ],
          })
        ),
        semanticTags: [
          ...visualStyleTags,
          "tipo:discriminazione_visiva",
          `ruolo:distrattore_${index + 1}`,
          `asse_variazione:${variationAxis}`,
          `scenario:${distractor}`,
          `consegna_target:${target}`,
          `prompt_opzione:${distractorPrompt}`,
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

function isEphemeralGeneratedImagePath(path: string): boolean {
  return (
    path.startsWith("/generated-images/") ||
    path.startsWith(".data/generated-images/")
  );
}

export function buildClinicalImagePrompt(scene: string): string {
  const sanitizedScene = sanitizeImagePrompt(scene);
  return [
    "Illustrazione pediatrica per esercizio di logopedia.",
    "Priorità massima: l'immagine deve essere semanticamente fedele alla consegna clinica; non aggiungere soggetti alternativi o non richiesti.",
    `Scena: ${sanitizedScene}.`,
    "Stile vettoriale per bambini, colori chiari, sfondo semplice, nessun testo nell'immagine.",
    `Output obbligatorio: aspect ratio ${IMAGE_GENERATION_ASPECT_RATIO}, risoluzione ${IMAGE_GENERATION_SIZE}.`,
    "Non includere nomi, dati clinici o identificativi di pazienti.",
  ].join(" ");
}

async function callOpenAIImageApi(prompt: string): Promise<{
  bytes: string;
  mimeType: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API key not configured. Set OPENAI_API_KEY.");
  }

  const endpoint =
    process.env.OPENAI_IMAGE_API_URL ??
    "https://api.openai.com/v1/images/generations";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: IMAGE_GENERATION_MODEL,
      prompt,
      n: 1,
      size: IMAGE_GENERATION_SIZE,
      quality: IMAGE_GENERATION_QUALITY,
    }),
  });

  if (!response.ok) {
    const errorBody = sanitizeImageText(await response.text(), 300);
    throw new Error(
      `OpenAI image API error: ${response.status}${errorBody ? ` - ${errorBody}` : ""}`
    );
  }

  const data = (await response.json()) as {
    data?: Array<{ b64_json?: string }>;
  };
  const imageData = data.data?.find(item => item.b64_json)?.b64_json;

  if (!imageData) throw new Error("OpenAI image API returned no image");

  return {
    bytes: imageData,
    mimeType: "image/png",
  };
}

function describeImageGenerationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const httpStatus = message.match(/OpenAI image API error: (\d{3})/u)?.[1];

  if (message.includes("OpenAI API key not configured")) {
    return "Chiave API OpenAI mancante: configura OPENAI_API_KEY nell'ambiente server.";
  }

  if (httpStatus) {
    return `OpenAI ha risposto con errore HTTP ${httpStatus}: controlla chiave API, quota/billing, modello ${IMAGE_GENERATION_MODEL} ed eventuale OPENAI_IMAGE_API_URL.`;
  }

  if (message.includes("returned no image")) {
    return "OpenAI ha risposto senza dati immagine base64: controlla modello, qualità low e formato 1024x1024 configurati.";
  }

  return `Errore generazione immagine: ${sanitizeImageText(message, 220) || "controlla i log del server per i dettagli"}.`;
}

function buildImageDataUrl(bytes: string, mimeType: string): string {
  return `data:${mimeType};base64,${bytes}`;
}

function buildMockImageDataUrl(label: string): string {
  const safeLabel = sanitizeImageText(label, 60) || "Immagine non disponibile";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512"><rect width="512" height="512" rx="32" fill="#f1f5f9"/><circle cx="256" cy="214" r="58" fill="#ccfbf1"/><path d="M176 332h160" stroke="#0f766e" stroke-width="18" stroke-linecap="round"/><text x="256" y="394" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#334155">${safeLabel}</text><text x="256" y="438" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#64748b">fallback locale</text></svg>`;
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
  if (
    cached &&
    cached.source !== "mock" &&
    !(
      cached.source === "generated" &&
      isEphemeralGeneratedImagePath(cached.filePath)
    )
  ) {
    return { ...cached, cacheHit: true };
  }

  const prompt = sanitizeImagePrompt(request.prompt);
  let filePath: string;
  let mimeType = "image/png";
  let source: CachedIllustration["source"] = "generated";
  let fallbackReason: string | null = null;

  try {
    const generated = await callOpenAIImageApi(prompt);
    filePath = buildImageDataUrl(generated.bytes, generated.mimeType);
    mimeType = generated.mimeType;
  } catch (error) {
    console.error("[image-generation] OpenAI image generation failed", {
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

  const saved = await db.save(illustration);

  return {
    ...saved,
    fallbackReason: saved.fallbackReason ?? fallbackReason,
    cacheHit: false,
  };
}
