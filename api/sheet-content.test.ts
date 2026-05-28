import { describe, expect, it } from "vitest";

import {
  getNeutralVisualOptionLabel,
  getUserFacingSheetContent,
} from "@contracts/sheet-content";

describe("getUserFacingSheetContent", () => {
  it("shows title, text, instruction and images section for visual discrimination sheets", () => {
    const result = getUserFacingSheetContent({
      tipoOutput: "discriminazione_visiva",
      testoGenerato: `Obiettivo clinico: Riconoscere l'immagine corretta.
Consegna: Trova l'intruso tra le immagini.
Target: Un trenino sotto un tavolo.
Distrattori: Un aereo sopra un tavolo.
Contesto comune: Un tavolo.
Prompt immagini:
Target: prompt tecnico`,
    });

    expect(result).toBe(
      "Titolo: Discriminazione visiva\n\nTesto: Un trenino sotto un tavolo.\n\nConsegna: Trova l'immagine corrispondente alla frase: un trenino sotto un tavolo.\n\nImmagini: osserva le opzioni e scegli quella corretta."
    );
    expect(result).not.toContain("Prompt");
  });

  it("preserves the requested action in contextual visual instructions", () => {
    const result = getUserFacingSheetContent({
      tipoOutput: "discriminazione_visiva",
      testoGenerato: `Consegna: Evidenzia l'immagine corretta.
Target: Un trenino sotto al tavolo.
Prompt immagini:
Target: prompt tecnico`,
    });

    expect(result).toContain(
      "Consegna: Evidenzia l'immagine corrispondente alla frase: un trenino sotto al tavolo."
    );
    expect(result).not.toContain("Prompt");
  });

  it("falls back to generated delivery when no visual target is available", () => {
    const result = getUserFacingSheetContent({
      tipoOutput: "discriminazione_visiva",
      testoGenerato: "Consegna: Trova l'intruso tra le immagini.",
    });

    expect(result).toBe(
      "Titolo: Discriminazione visiva\n\nConsegna: Trova l'intruso tra le immagini.\n\nImmagini: osserva le opzioni e scegli quella corretta."
    );
  });

  it("does not show generic therapist-only instruction for morphosyntax sheets", () => {
    const result = getUserFacingSheetContent({
      tipoOutput: "morfosintassi_complessa",
      testoGenerato: `Obiettivo morfosintattico: pronome clitico lo.
Frase target: La bambina lava il cane.
Scena da illustrare: una bambina lava il cane.
Domande di comprensione: Chi lava il cane?
Prompt immagine: tecnico`,
    });

    expect(result).toBe(
      "Titolo: Morfosintassi complessa\n\nConsegna: Leggi il testo e completa l'esercizio.\n\nTesto: La bambina lava il cane.\n\nDomande di comprensione: Chi lava il cane?\n\nImmagini: usa l'immagine per rispondere alle domande."
    );
    expect(result).not.toContain("insieme al logopedista");
  });

  it("shows fallback comprehension questions instead of n/d for legacy morphosyntax sheets", () => {
    const result = getUserFacingSheetContent({
      tipoOutput: "morfosintassi_complessa",
      testoGenerato: `Obiettivo morfosintattico: pronome clitico lo.
Frase target: La bambina lava il cane.
Scena da illustrare: una bambina lava il cane.
Prompt immagine: tecnico`,
    });

    expect(result).toContain("Domande di comprensione:");
    expect(result).not.toContain("n/d");
  });

  it("extracts morphosyntax text and questions even with markdown-style section headers", () => {
    const result = getUserFacingSheetContent({
      tipoOutput: "morfosintassi_complessa",
      testoGenerato: `## Obiettivo morfosintattico: pronomi clitici
**Frase target**: Il gatto insegue la palla e poi la prende.
**Scena da illustrare**: un gatto bianco in giardino con una palla rossa.
**Domande di comprensione**: Cosa insegue il gatto? Cosa prende poi?
**Prompt immagine**: tecnico`,
    });

    expect(result).toBe(
      "Titolo: Morfosintassi complessa\n\nConsegna: Leggi il testo e completa l'esercizio.\n\nTesto: Il gatto insegue la palla e poi la prende.\n\nDomande di comprensione: Cosa insegue il gatto? Cosa prende poi?\n\nImmagini: usa l'immagine per rispondere alle domande."
    );
  });

  it("adds the standard structure for story sheets", () => {
    const result = getUserFacingSheetContent({
      tipoOutput: "storia",
      testoGenerato: "Il gatto salta sul prato.",
    });

    expect(result).toContain("Titolo: Storia con fonema");
    expect(result).toContain("Consegna: Leggi il testo e svolgi l'esercizio.");
    expect(result).toContain("Testo: Il gatto salta sul prato.");
    expect(result).toContain(
      "Immagini: osserva l'illustrazione collegata al testo."
    );
    expect(result).not.toContain("Prompt");
  });
});

describe("getNeutralVisualOptionLabel", () => {
  it("does not reveal target or distractor roles", () => {
    expect(getNeutralVisualOptionLabel(0)).toBe("Opzione 1");
    expect(getNeutralVisualOptionLabel(2)).toBe("Opzione 3");
  });
});
