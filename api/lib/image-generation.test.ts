import { rmSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  buildImageRequests,
  buildSemanticCacheKey,
  normalizeSemanticTag,
  resolveImageRequestWithCache,
  sanitizeImagePrompt,
  type ImageCacheDb,
} from "./image-generation";

describe("image generation semantic cache", () => {
  it("normalizes semantic tags into a deterministic exact-match cache key", () => {
    expect(
      buildSemanticCacheKey([
        "Azione: Mangiare",
        "soggetto:Cane",
        "stile:vettoriale bambini",
        "soggetto:cane",
      ])
    ).toBe("azione:mangiare|soggetto:cane|stile:vettoriale_bambini");
  });

  it("removes patient-sensitive terms from image prompts", () => {
    expect(
      sanitizeImagePrompt(
        "Nome Mario Rossi, diagnosi privata: cane che mangia una mela"
      )
    ).not.toMatch(/nome|diagnosi|Mario/iu);
  });

  it("builds one target plus up to three distractor image requests", () => {
    const requests = buildImageRequests({
      tipoOutput: "discriminazione_visiva",
      interesse: "mare",
      tagImmagine: "trova intruso",
      numeroOpzioni: 4,
      scenarioSmart: "il cane mangia la mela",
      testoGenerato:
        "Target: il cane mangia la mela.\nDistrattori: il cane guarda la mela; il gatto mangia la mela; il cane mangia la pera.\nPrompt immagini: ambiente chiaro e coerente",
    });

    expect(requests).toHaveLength(4);
    expect(requests[0].role).toBe("target");
    expect(
      requests.slice(1).every(request => request.role === "distrattore")
    ).toBe(true);
    expect(requests[0].semanticTags.map(normalizeSemanticTag)).toContain(
      "ruolo:target"
    );
  });

  it("calls Gemini with the JavaScript SDK-compatible image request shape", async () => {
    const previousKeys = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      GEMINI_IMAGE_API_URL: process.env.GEMINI_IMAGE_API_URL,
    };
    process.env.GEMINI_API_KEY = "test-gemini-key";
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_IMAGE_API_URL;

    let generatedFilePath: string | undefined;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: Buffer.from("fake image").toString("base64"),
                      mimeType: "image/png",
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    try {
      const db: ImageCacheDb = {
        async findByCacheKey() {
          return null;
        },
        async save(illustration) {
          return illustration;
        },
      };

      const result = await resolveImageRequestWithCache(
        {
          role: "base",
          label: "Illustrazione",
          prompt: "cane che mangia mela",
          semanticTags: ["ruolo:base", "soggetto:cane"],
        },
        db
      );

      expect(result.source).toBe("generated");
      generatedFilePath = result.filePath.replace(
        "/generated-images/",
        ".data/generated-images/"
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(":generateContent"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-goog-api-key": "test-gemini-key",
          }),
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: "cane che mangia mela" }],
              },
            ],
          }),
        })
      );
      const request = JSON.parse(
        (fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string
      ) as Record<string, unknown>;
      expect(request).not.toHaveProperty("generationConfig");
    } finally {
      if (generatedFilePath) {
        rmSync(resolve(process.cwd(), generatedFilePath), { force: true });
      }
      fetchSpy.mockRestore();
      for (const [key, value] of Object.entries(previousKeys)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("includes a specific fallback reason when Gemini is not configured", async () => {
    const previousKeys = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    };
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const db: ImageCacheDb = {
        async findByCacheKey() {
          return null;
        },
        async save(illustration) {
          return illustration;
        },
      };

      const result = await resolveImageRequestWithCache(
        {
          role: "target",
          label: "Target",
          prompt: "cane che mangia mela",
          semanticTags: ["ruolo:target", "soggetto:cane"],
        },
        db
      );

      expect(result.source).toBe("mock");
      expect(result.fallbackReason).toContain("Chiave API Gemini mancante");
    } finally {
      consoleSpy.mockRestore();
      for (const [key, value] of Object.entries(previousKeys)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("returns cached images without invoking generation", async () => {
    let saved = 0;
    const db: ImageCacheDb = {
      async findByCacheKey(cacheKey) {
        return {
          tag: "Target",
          semanticTags: ["ruolo:target"],
          cacheKey,
          filePath: "cache://target",
          source: "uploaded",
        };
      },
      async save(illustration) {
        saved += 1;
        return illustration;
      },
    };

    const result = await resolveImageRequestWithCache(
      {
        role: "target",
        label: "Target",
        prompt: "cane che mangia mela",
        semanticTags: ["ruolo:target", "soggetto:cane"],
      },
      db
    );

    expect(result.cacheHit).toBe(true);
    expect(result.filePath).toBe("cache://target");
    expect(saved).toBe(0);
  });
});
