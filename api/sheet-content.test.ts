import { describe, expect, it } from "vitest";

import {
  getNeutralVisualOptionLabel,
  getUserFacingSheetContent,
  orderNarrativeSequenceForDisplay,
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
    expect(result).toContain("1. Chi corre nel prato?");
    expect(result).not.toContain("Risposta:");
    expect(result).not.toContain("Il gatto.");
    expect(result).not.toContain("Immagini:");
    expect(result).not.toContain("prompt");
  });

  it("unwraps unified JSON accidentally stored inside legacy display text", () => {
    const wrappedContent = [
      "Titolo: Filastrocca con fonema",
      "Consegna: Leggi il contenuto della scheda e svolgi l'esercizio.",
      `Testo: ${JSON.stringify(
        {
          ...unifiedSheet,
          tipo: "filastrocca",
          titolo: "Il dinosauro che fa la spesa",
          consegna:
            "Ascolta la filastrocca e rispondi alle domande sui dinosauri e la spesa.",
          testo: "C'era una volta un dinosauro, che andava a far la spesa.",
        },
        null,
        2
      )}`,
    ].join("\n\n");

    const result = getUserFacingSheetContent({
      tipoOutput: "filastrocca",
      testoGenerato: wrappedContent,
    });

    expect(result).toContain("Titolo: Il dinosauro che fa la spesa");
    expect(result).toContain(
      "Consegna: Ascolta la filastrocca e rispondi alle domande sui dinosauri e la spesa."
    );
    expect(result).toContain(
      "Testo: C'era una volta un dinosauro, che andava a far la spesa."
    );
    expect(result).not.toContain("Titolo: Filastrocca con fonema");
    expect(result).not.toContain('"immagini"');
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

  it("accepts simple concrete visual discrimination targets", () => {
    expect(
      validateSheet(
        {
          tipo: "discriminazione_visiva",
          titolo: "Penna sopra il tavolo",
          consegna:
            "Indica l'immagine in cui una penna è sopra il tavolo.",
          testo: "Una penna è sopra il tavolo.",
          immagini: [
            {
              ruolo: "target",
              livello: "principale",
              prompt: "A pen on a table.",
            },
            {
              ruolo: "distrattore",
              livello: "difficile",
              prompt: "A pen under a table.",
            },
            {
              ruolo: "distrattore",
              livello: "intermedio",
              prompt: "A pencil on a table.",
            },
            {
              ruolo: "distrattore",
              livello: "facile",
              prompt: "A cup on a table.",
            },
          ],
          domande: [],
        },
        "discriminazione_visiva",
        { numeroOpzioni: 4 }
      )
    ).toBe(true);
  });

  it("keeps a simple legacy fallback for old saved sheets", () => {
    const result = getUserFacingSheetContent({
      tipoOutput: "morfosintassi_complessa",
      testoGenerato: "Frase target: La bambina corre nel parco.",
    });

    expect(result).toContain("Titolo: Morfologia e morfosintassi");
    expect(result).toContain(
      "Testo: Frase target: La bambina corre nel parco."
    );
  });

  it("validates narrative sequences with the requested number of scenes", () => {
    const sheet: UnifiedSheet = {
      tipo: "narrazione_sequenze",
      titolo: "La palla ritrovata",
      consegna:
        "Osserva le immagini mescolate, riordinale e racconta come il bambino ritrova la palla.",
      testo:
        "Luca gioca con la palla al parco. La palla rotola sotto una panchina. Luca chiede aiuto alla sorella. Insieme ritrovano la palla.",
      immagini: [
        {
          ruolo: "illustrazione",
          livello: "principale",
          prompt:
            "Child-friendly illustration of Luca playing with a red ball in a park, first scene of a story sequence, no text.",
        },
        {
          ruolo: "illustrazione",
          livello: "principale",
          prompt:
            "Child-friendly illustration of the same red ball rolling under a bench in the same park, second scene, no text.",
        },
        {
          ruolo: "illustrazione",
          livello: "principale",
          prompt:
            "Child-friendly illustration of Luca asking his sister for help near the bench in the same park, third scene, no text.",
        },
        {
          ruolo: "illustrazione",
          livello: "principale",
          prompt:
            "Child-friendly illustration of Luca and his sister finding the red ball under the bench in the same park, fourth scene, no text.",
        },
      ],
      domande: [
        { domanda: "Che cosa succede prima?", risposta: "Luca gioca con la palla." },
        { domanda: "Dove rotola la palla?", risposta: "Sotto una panchina." },
        { domanda: "Chi aiuta Luca?", risposta: "La sorella." },
        { domanda: "Come finisce la storia?", risposta: "Ritrovano la palla." },
      ],
    };

    expect(validateSheet(sheet, "narrazione_sequenze", { numeroScene: 4 })).toBe(
      true
    );
    expect(validateSheet(sheet, "narrazione_sequenze", { numeroScene: 3 })).toBe(
      false
    );
  });

  it("validates pragmatic worksheets with model answers", () => {
    const sheet: UnifiedSheet = {
      tipo: "pragmatica",
      titolo: "Chiedere un turno",
      consegna:
        "Osserva la scena e rispondi alle domande su cosa provano e cosa possono dire i bambini.",
      testo:
        "Due bambini vogliono usare lo stesso camion. Marco lo tiene in mano e Sara aspetta il suo turno.",
      immagini: [
        {
          ruolo: "illustrazione",
          livello: "principale",
          prompt:
            "Child-friendly illustration of two children near a toy truck, one child holding the truck and another waiting, clear facial expressions, no text.",
        },
      ],
      domande: [
        { domanda: "Che cosa vuole Sara?", risposta: "Vuole giocare con il camion." },
        { domanda: "Come può sentirsi Sara?", risposta: "Può sentirsi impaziente o triste." },
        { domanda: "Che cosa può dire Sara?", risposta: "Posso giocare dopo di te?" },
        { domanda: "Che cosa può fare Marco?", risposta: "Può darle un turno o rispondere con gentilezza." },
      ],
    };

    expect(validateSheet(sheet, "pragmatica", 4)).toBe(true);
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

describe("orderNarrativeSequenceForDisplay", () => {
  it("uses a stable sheet-specific order that never keeps the chronological sequence", () => {
    const scenes = [
      { cacheKey: "scene-1", label: "Scena 1" },
      { cacheKey: "scene-2", label: "Scena 2" },
      { cacheKey: "scene-3", label: "Scena 3" },
      { cacheKey: "scene-4", label: "Scena 4" },
    ];

    const ordered = orderNarrativeSequenceForDisplay(scenes, "sheet-42");

    expect(ordered).toHaveLength(4);
    expect(new Set(ordered.map(scene => scene.cacheKey))).toEqual(
      new Set(scenes.map(scene => scene.cacheKey))
    );
    expect(orderNarrativeSequenceForDisplay(scenes, "sheet-42")).toEqual(
      ordered
    );
    expect(ordered.map(scene => scene.cacheKey)).not.toEqual(
      scenes.map(scene => scene.cacheKey)
    );
  });

  it("normalizes narrative instructions so saved sheets do not reveal ordered images", () => {
    const result = getUserFacingSheetContent({
      tipoOutput: "narrazione_sequenze",
      testoGenerato: JSON.stringify({
        tipo: "narrazione_sequenze",
        titolo: "La palla ritrovata",
        consegna:
          "Osserva le scene in ordine e racconta come il bambino ritrova la palla.",
        testo:
          "Luca gioca con la palla. La palla rotola via. Luca cerca la palla. Luca ritrova la palla.",
        immagini: [],
        domande: [],
      }),
    });

    expect(result).toContain("immagini mescolate");
    expect(result).toContain("riordinale");
    expect(result).not.toContain("scene in ordine");
    expect(result).not.toContain("Risposta:");
  });
});
