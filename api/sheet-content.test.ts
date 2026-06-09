import { describe, expect, it } from "vitest";

import {
  getNeutralVisualOptionLabel,
  getUserFacingSheetContent,
  orderVisualOptionsForDisplay,
  parseUnifiedSheetContent,
  validateSheet,
  type UnifiedSheet,
} from "@contracts/sheet-content";

const unifiedSheet: UnifiedSheet = {
  tipo: "storia",
  titolo: "Il gatto nel prato",
  consegna: "Leggi la storia del gatto e rispondi alle domande sulla palla.",
  testo: "Il gatto corre nel prato. Poi prende una palla rossa.",
  immagini: [
    {
      ruolo: "illustrazione",
      livello: "principale",
      prompt:
        "Realistic child-friendly illustration of a cat running in a meadow with a red ball, no text.",
    },
  ],
  domande: [
    { domanda: "Chi corre nel prato?", risposta: "Il gatto." },
    { domanda: "Che cosa prende il gatto?", risposta: "Una palla rossa." },
    { domanda: "Dove corre il gatto?", risposta: "Nel prato." },
  ],
};

describe("unified sheet content", () => {
  it("parses unified JSON content", () => {
    expect(parseUnifiedSheetContent(JSON.stringify(unifiedSheet))).toEqual(
      unifiedSheet
    );
  });

  it("renders title, contextual delivery, text, questions and image summary from unified JSON", () => {
    const result = getUserFacingSheetContent({
      tipoOutput: "storia",
      testoGenerato: JSON.stringify(unifiedSheet),
    });

    expect(result).toContain("Titolo: Il gatto nel prato");
    expect(result).toContain(
      "Consegna: Leggi la storia del gatto e rispondi alle domande sulla palla."
    );
    expect(result).toContain(
      "Testo: Il gatto corre nel prato. Poi prende una palla rossa."
    );
    expect(result).toContain("1. Chi corre nel prato? Risposta: Il gatto.");
    expect(result).not.toContain("Immagini:");
    expect(result).not.toContain("prompt");
  });

  it("renders visual discrimination content without repeated delivery or image metadata", () => {
    const result = getUserFacingSheetContent({
      tipoOutput: "discriminazione_visiva",
      testoGenerato: JSON.stringify({
        tipo: "discriminazione_visiva",
        titolo: "Indica l'immagine corretta dell'oca",
        consegna:
          "Indica l'immagine in cui l'oca indossa gli occhiali e nuota nel mare.",
        testo: "L'oca nuota nel mare e indossa gli occhiali.",
        immagini: [
          {
            ruolo: "target",
            livello: "principale",
            prompt:
              "A white goose wearing glasses swims in the sea, child-friendly vector style, no text.",
          },
          {
            ruolo: "distrattore",
            livello: "difficile",
            prompt:
              "A white goose without glasses swims in the same sea, child-friendly vector style, no text.",
          },
        ],
        domande: [],
      }),
    });

    expect(result).toBe(
      "Consegna: Indica l'immagine corretta.\n\nFrase: L'oca nuota nel mare e indossa gli occhiali."
    );
    expect(result).not.toContain("Titolo:");
    expect(result).not.toContain("Immagini:");
  });

  it("validates only the unified structural rules", () => {
    expect(validateSheet(unifiedSheet, "storia", 4)).toBe(true);
    expect(
      validateSheet(
        { ...unifiedSheet, consegna: "Trova l'intruso tra le immagini" },
        "storia",
        4
      )
    ).toBe(false);
  });

  it("keeps a simple legacy fallback for old saved sheets", () => {
    const result = getUserFacingSheetContent({
      tipoOutput: "morfosintassi_complessa",
      testoGenerato: "Frase target: La bambina corre nel parco.",
    });

    expect(result).toContain("Titolo: Morfosintassi");
    expect(result).toContain(
      "Testo: Frase target: La bambina corre nel parco."
    );
  });
});

describe("getNeutralVisualOptionLabel", () => {
  it("does not reveal target or distractor roles", () => {
    expect(getNeutralVisualOptionLabel(0)).toBe("Opzione 1");
    expect(getNeutralVisualOptionLabel(2)).toBe("Opzione 3");
  });
});

describe("orderVisualOptionsForDisplay", () => {
  it("uses a stable sheet-specific order instead of keeping target fixed first", () => {
    const options = [
      { role: "target", cacheKey: "target", label: "Target" },
      { role: "distrattore", cacheKey: "d1", label: "Distrattore 1" },
      { role: "distrattore", cacheKey: "d2", label: "Distrattore 2" },
      { role: "distrattore", cacheKey: "d3", label: "Distrattore 3" },
    ];

    const ordered = orderVisualOptionsForDisplay(options, "sheet-42");
    const sampledOrders = Array.from({ length: 12 }, (_, index) =>
      orderVisualOptionsForDisplay(options, `sheet-${index}`)
    );

    expect(ordered).toHaveLength(4);
    expect(new Set(ordered.map(option => option.cacheKey))).toEqual(
      new Set(options.map(option => option.cacheKey))
    );
    expect(orderVisualOptionsForDisplay(options, "sheet-42")).toEqual(ordered);
    expect(sampledOrders.some(order => order[0]?.role !== "target")).toBe(true);
    expect(
      new Set(
        sampledOrders.map(order =>
          order.map(option => option.cacheKey).join(",")
        )
      ).size
    ).toBeGreaterThan(1);
  });
});
