import { describe, expect, it } from "vitest";

import {
  getNeutralVisualOptionLabel,
  getUserFacingSheetContent,
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
    expect(result).toContain("Immagini: 1. illustrazione (principale).");
    expect(result).not.toContain("prompt");
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
