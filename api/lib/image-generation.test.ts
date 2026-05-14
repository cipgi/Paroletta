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

  it("builds separated target and graded distractor image requests", () => {
    const requests = buildImageRequests({
      tipoOutput: "discriminazione_visiva",
      interesse: "mare",
      tagImmagine: "trova intruso",
      numeroOpzioni: 4,
      scenarioSmart: "il cane mangia la mela",
      testoGenerato: `Target: il cane mangia la mela.
Distrattori: il cane guarda la mela; il gatto mangia la mela; il cane mangia la pera.
Contesto comune: cucina luminosa con tavolo blu.
Prompt immagini:
Target: cane che mangia una mela in cucina.
Distrattore 1: cane che guarda una mela in cucina.
Distrattore 2: gatto che mangia una mela in cucina.
Distrattore 3: cane che mangia una pera in cucina.`,
    });

    expect(requests).toHaveLength(4);
    expect(requests[0].role).toBe("target");
    expect(
      requests.slice(1).every(request => request.role === "distrattore")
    ).toBe(true);
    expect(requests[0].prompt).toContain("Opzione visiva separata: Target");
    expect(requests[0].prompt).toContain("Non creare collage");
    expect(requests[1].prompt).toContain("molto simile");
    expect(requests[2].prompt).toContain("mediamente simile");
    expect(requests[3].prompt).toContain("lontanamente simile");
    expect(requests[0].semanticTags.map(normalizeSemanticTag)).toContain(
      "ruolo:target"
    );
  });

  it("respects a two-option visual discrimination request", () => {
    const requests = buildImageRequests({
      tipoOutput: "discriminazione_visiva",
      interesse: "animali",
      tagImmagine: "trova intruso",
      numeroOpzioni: 2,
      testoGenerato: `Target: un gatto che gioca con una palla.
Distrattori: un gatto che dorme.
Prompt immagini: un gatto giocoso con una palla colorata, un gatto che dorme su un cuscino.`,
    });

    expect(requests).toHaveLength(2);
    expect(requests.map(request => request.label)).toEqual([
      "Target",
      "Distrattore 1",
    ]);
    expect(requests[0].prompt).not.toContain(
      "un gatto giocoso con una palla colorata, un gatto che dorme"
    );
    expect(requests[1].prompt).toContain(
      "Rappresenta solo questa scena: un gatto che dorme"
    );
  });

  it("calls OpenAI with the requested GPT Image generation settings", async () => {
    const previousKeys = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_IMAGE_API_URL: process.env.OPENAI_IMAGE_API_URL,
      OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL,
    };
    process.env.OPENAI_API_KEY = "test-openai-key";
    delete process.env.OPENAI_IMAGE_API_URL;
    delete process.env.OPENAI_IMAGE_MODEL;

    let generatedFilePath: string | undefined;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("fake image").toString("base64") }],
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
      expect(result.generationModel).toBe("gpt-image-2");
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.openai.com/v1/images/generations",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-openai-key",
          }),
          body: JSON.stringify({
            model: "gpt-image-2",
            prompt: "cane che mangia mela",
            n: 1,
            size: "1024x1024",
            quality: "low",
          }),
        })
      );
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

  it("includes a specific fallback reason when OpenAI is not configured", async () => {
    const previousKeys = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };
    delete process.env.OPENAI_API_KEY;
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
      expect(result.fallbackReason).toContain("Chiave API OpenAI mancante");
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
