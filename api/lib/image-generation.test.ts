import { describe, expect, it, vi } from "vitest";

import {
  buildImageRequests,
  buildSemanticCacheKey,
  normalizeSemanticTag,
  resolveCachedImageRequest,
  resolveImageRequestWithCache,
  sanitizeImagePrompt,
  type ImageCacheDb,
} from "./image-generation";
import type { ImageObjectStorage } from "./image-storage";

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
    expect(requests[0].prompt).toContain(
      "Frame separato di una serie visiva coerente: Target"
    );
    expect(requests[0].prompt).toContain("Non creare collage");
    expect(requests[0].prompt).toContain("serie visiva coerente");
    expect(requests[0].prompt).toContain("REQUISITO NON NEGOZIABILE");
    expect(requests[0].prompt).toContain(
      "target esatto: il cane mangia la mela"
    );
    expect(requests[0].semanticTags.map(normalizeSemanticTag)).toContain(
      "prompt_version:visual_graded_v5"
    );
    expect(requests[1].prompt).toContain("Unico asse di variazione");
    expect(requests[1].prompt).toContain(
      "difficile: immagine estremamente simile"
    );
    expect(requests[2].prompt).toContain("intermedio");
    expect(requests[3].prompt).toContain("facile: distrattore più semplice");
    expect(requests[2].prompt).toContain("stesso stile");
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
      "Rappresenta solo questa scena, senza sostituire il soggetto richiesto: un gatto che dorme"
    );
  });

  it("anchors visual prompts to the exact target named by the worksheet", () => {
    const requests = buildImageRequests({
      tipoOutput: "discriminazione_visiva",
      interesse: "animali",
      tagImmagine: "aquila",
      numeroOpzioni: 2,
      scenarioSmart: "l'aquila",
      testoGenerato: `Consegna: Indica l'immagine in cui si vede l'aquila.
Target: l'aquila.
Distrattori: il falco.
Contesto comune: cielo azzurro semplice, stile vettoriale per bambini.
Assi di variazione: oggetto.
Prompt immagini:
Target: singola immagine con un'aquila al centro nel cielo azzurro.
Distrattore 1: singola immagine con un falco al centro nel cielo azzurro.`,
    });

    expect(requests[0].prompt).toContain("target esatto: l'aquila");
    expect(requests[0].prompt).toContain("un'aquila al centro");
    expect(requests[1].prompt).toContain("deve rendere falsa la consegna");
    expect(requests[1].prompt).toContain("target esatto: l'aquila");
    expect(requests[0].semanticTags.map(normalizeSemanticTag)).toContain(
      "consegna_target:laquila"
    );
  });

  it("enriches unified visual sheet prompts with target and graded distractor rules", () => {
    const requests = buildImageRequests({
      tipoOutput: "discriminazione_visiva",
      interesse: "calcio",
      numeroOpzioni: 4,
      testoGenerato: JSON.stringify({
        tipo: "discriminazione_visiva",
        titolo: "Calcia la palla",
        consegna:
          "Indica l'immagine in cui il bambino calcia la palla rossa dentro la porta piccola.",
        testo: "Il bambino calcia la palla rossa dentro la porta piccola.",
        immagini: [
          {
            ruolo: "target",
            livello: "principale",
            prompt:
              "A boy kicks a red ball into a small soccer goal in a child-friendly field, no text.",
          },
          {
            ruolo: "distrattore",
            livello: "difficile",
            prompt:
              "The same boy kicks a blue ball into the same small soccer goal in the same field, no text.",
          },
          {
            ruolo: "distrattore",
            livello: "intermedio",
            prompt:
              "The same boy throws the red ball with his hands toward the small soccer goal, no text.",
          },
          {
            ruolo: "distrattore",
            livello: "facile",
            prompt:
              "A girl holds a tennis racket near a table in a park, no text.",
          },
        ],
        domande: [],
      }),
    });

    expect(requests).toHaveLength(4);
    expect(requests.map(request => request.label)).toEqual([
      "Target",
      "Distrattore 1",
      "Distrattore 2",
      "Distrattore 3",
    ]);
    expect(requests[0].prompt).toContain("deve rendere vera la consegna");
    expect(requests[0].prompt).toContain(
      "target esatto: Il bambino calcia la palla rossa dentro la porta piccola."
    );
    expect(requests[1].prompt).toContain(
      "difficile: immagine estremamente simile"
    );
    expect(requests[1].prompt).toContain("1 solo dettaglio saliente");
    expect(requests[2].prompt).toContain(
      "intermedio: mantieni tema e scenario riconoscibili"
    );
    expect(requests[2].prompt).toContain("lanciare con le mani verso la porta");
    expect(requests[3].prompt).toContain("facile: distrattore più semplice");
    expect(requests[3].prompt).toContain("tavolo al posto della porta");
  });

  it("does not build image requests when a unified optional sheet has no images", () => {
    const requests = buildImageRequests({
      tipoOutput: "pragmatica",
      interesse: "calcio",
      testoGenerato: JSON.stringify({
        tipo: "pragmatica",
        titolo: "Aspettare il turno",
        consegna:
          "Leggi lo scenario e rispondi alle domande su cosa possono dire i bambini.",
        testo:
          "Due bambini vogliono tirare lo stesso rigore e devono decidere i turni.",
        immagini: [],
        domande: [
          {
            domanda: "Che cosa vogliono fare i bambini?",
            risposta: "Vogliono tirare il rigore.",
          },
          {
            domanda: "Che cosa possono decidere?",
            risposta: "Possono decidere i turni.",
          },
          {
            domanda: "Come può sentirsi chi aspetta?",
            risposta: "Può sentirsi impaziente.",
          },
          {
            domanda: "Che frase gentile può usare?",
            risposta: "Posso tirare dopo di te?",
          },
        ],
      }),
    });

    expect(requests).toEqual([]);
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
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("fake image").toString("base64") }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    try {
      let saved = 0;
      let uploaded = 0;
      const imageStorage: ImageObjectStorage = {
        async uploadGeneratedImage(input) {
          uploaded += 1;
          expect(input.bytes).toBe(
            Buffer.from("fake image").toString("base64")
          );
          expect(input.mimeType).toBe("image/png");
          expect(input.cacheKey).toBe("ruolo:base|soggetto:cane");
          return {
            filePath: "https://storage.example/signed-generated-image",
            storageBucket: "generated-images",
            storagePath: "generated/test.png",
            byteSize: Buffer.byteLength("fake image"),
          };
        },
        async getDisplayUrl() {
          return "https://storage.example/signed-generated-image";
        },
      };
      const db: ImageCacheDb = {
        async findByCacheKey() {
          return null;
        },
        async save(illustration) {
          saved += 1;
          expect(illustration.filePath).toBe(
            "storage://generated-images/generated/test.png"
          );
          expect(illustration.storageBucket).toBe("generated-images");
          expect(illustration.storagePath).toBe("generated/test.png");
          expect(illustration.byteSize).toBe(Buffer.byteLength("fake image"));
          return {
            ...illustration,
            filePath: "https://storage.example/signed-generated-image",
          };
        },
      };

      const result = await resolveImageRequestWithCache(
        {
          role: "base",
          label: "Illustrazione",
          prompt: "cane che mangia mela",
          semanticTags: ["ruolo:base", "soggetto:cane"],
        },
        db,
        { imageStorage }
      );

      expect(result.source).toBe("generated");
      expect(saved).toBe(1);
      expect(uploaded).toBe(1);
      expect(result.filePath).toBe(
        "https://storage.example/signed-generated-image"
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
      fetchSpy.mockRestore();
      for (const [key, value] of Object.entries(previousKeys)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("fails without saving mockup images when OpenAI is not configured", async () => {
    const previousKeys = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };
    delete process.env.OPENAI_API_KEY;
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      let saved = 0;
      const imageStorage: ImageObjectStorage = {
        async uploadGeneratedImage() {
          throw new Error("storage should not be called");
        },
        async getDisplayUrl() {
          return null;
        },
      };
      const db: ImageCacheDb = {
        async findByCacheKey() {
          return null;
        },
        async save(illustration) {
          saved += 1;
          return illustration;
        },
      };

      await expect(
        resolveImageRequestWithCache(
          {
            role: "target",
            label: "Target",
            prompt: "cane che mangia mela",
            semanticTags: ["ruolo:target", "soggetto:cane"],
          },
          db,
          { imageStorage }
        )
      ).rejects.toThrow("Chiave API OpenAI mancante");

      expect(saved).toBe(0);
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

  it("force-generates images without reading from cache", async () => {
    const previousKeys = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };
    process.env.OPENAI_API_KEY = "test-openai-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("forced image").toString("base64") }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    try {
      let cacheReads = 0;
      let saved = 0;
      let uploaded = 0;
      const imageStorage: ImageObjectStorage = {
        async uploadGeneratedImage() {
          uploaded += 1;
          return {
            filePath: "https://storage.example/forced-image",
            storageBucket: "generated-images",
            storagePath: "generated/forced.png",
            byteSize: Buffer.byteLength("forced image"),
          };
        },
        async getDisplayUrl() {
          return "https://storage.example/forced-image";
        },
      };
      const db: ImageCacheDb = {
        async findByCacheKey() {
          cacheReads += 1;
          return {
            tag: "Target",
            semanticTags: ["ruolo:target"],
            cacheKey: "ruolo:target|soggetto:cane",
            filePath: "cache://target",
            source: "uploaded",
          };
        },
        async save(illustration) {
          saved += 1;
          return {
            ...illustration,
            filePath: "https://storage.example/forced-image",
          };
        },
      };

      const result = await resolveImageRequestWithCache(
        {
          role: "target",
          label: "Target",
          prompt: "cane che mangia mela",
          semanticTags: ["ruolo:target", "soggetto:cane"],
        },
        db,
        { force: true, imageStorage }
      );

      expect(cacheReads).toBe(0);
      expect(uploaded).toBe(1);
      expect(saved).toBe(1);
      expect(result.cacheHit).toBe(false);
      expect(result.filePath).toBe("https://storage.example/forced-image");
    } finally {
      fetchSpy.mockRestore();
      for (const [key, value] of Object.entries(previousKeys)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("passes owner and sheet scope to cache reads", async () => {
    const scope = {
      ownerUserId: "00000000-0000-0000-0000-000000000001",
      sheetId: "00000000-0000-0000-0000-000000000002",
    };
    const db: ImageCacheDb = {
      async findByCacheKey(cacheKey, receivedScope) {
        expect(cacheKey).toBe("ruolo:target|soggetto:cane");
        expect(receivedScope).toEqual(scope);
        return {
          tag: "Target",
          semanticTags: ["ruolo:target"],
          cacheKey,
          filePath: "cache://target",
          source: "uploaded",
        };
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
      db,
      { cacheScope: scope }
    );

    expect(result.cacheHit).toBe(true);
  });

  it("reads image cache without generating missing images", async () => {
    let saved = 0;
    const db: ImageCacheDb = {
      async findByCacheKey() {
        return null;
      },
      async save(illustration) {
        saved += 1;
        return illustration;
      },
    };

    const result = await resolveCachedImageRequest(
      {
        role: "target",
        label: "Target",
        prompt: "cane che mangia mela",
        semanticTags: ["ruolo:target", "soggetto:cane"],
      },
      db
    );

    expect(result).toBeNull();
    expect(saved).toBe(0);
  });

  it("does not regenerate stale local generated files during cache-only reads", async () => {
    let saved = 0;
    const db: ImageCacheDb = {
      async findByCacheKey(cacheKey) {
        return {
          tag: "Target",
          semanticTags: ["ruolo:target"],
          cacheKey,
          filePath: "/generated-images/stale.png",
          source: "generated",
        };
      },
      async save(illustration) {
        saved += 1;
        return illustration;
      },
    };

    const result = await resolveCachedImageRequest(
      {
        role: "target",
        label: "Target",
        prompt: "cane che mangia mela",
        semanticTags: ["ruolo:target", "soggetto:cane"],
      },
      db
    );

    expect(result).toBeNull();
    expect(saved).toBe(0);
  });

  it("regenerates generated cache entries that point to ephemeral local files", async () => {
    const previousKeys = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };
    process.env.OPENAI_API_KEY = "test-openai-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("new image").toString("base64") }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    try {
      let saved = 0;
      let uploaded = 0;
      const imageStorage: ImageObjectStorage = {
        async uploadGeneratedImage(input) {
          uploaded += 1;
          expect(input.bytes).toBe(Buffer.from("new image").toString("base64"));
          return {
            filePath: "https://storage.example/signed-new-image",
            storageBucket: "generated-images",
            storagePath: "generated/new.png",
            byteSize: Buffer.byteLength("new image"),
          };
        },
        async getDisplayUrl() {
          return "https://storage.example/signed-new-image";
        },
      };
      const db: ImageCacheDb = {
        async findByCacheKey(cacheKey) {
          return {
            tag: "Target",
            semanticTags: ["ruolo:target"],
            cacheKey,
            filePath: "/generated-images/stale.png",
            source: "generated",
          };
        },
        async save(illustration) {
          saved += 1;
          expect(illustration.filePath).toBe(
            "storage://generated-images/generated/new.png"
          );
          return {
            ...illustration,
            filePath: "https://storage.example/signed-new-image",
          };
        },
      };

      const result = await resolveImageRequestWithCache(
        {
          role: "target",
          label: "Target",
          prompt: "cane che mangia mela",
          semanticTags: ["ruolo:target", "soggetto:cane"],
        },
        db,
        { imageStorage }
      );

      expect(result.cacheHit).toBe(false);
      expect(saved).toBe(1);
      expect(uploaded).toBe(1);
      expect(result.filePath).toBe("https://storage.example/signed-new-image");
    } finally {
      fetchSpy.mockRestore();
      for (const [key, value] of Object.entries(previousKeys)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
