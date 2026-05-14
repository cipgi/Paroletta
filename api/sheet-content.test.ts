import { describe, expect, it } from "vitest";

import {
  getNeutralVisualOptionLabel,
  getUserFacingSheetContent,
} from "@contracts/sheet-content";

describe("getUserFacingSheetContent", () => {
  it("shows only the delivery instruction for visual discrimination sheets", () => {
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

    expect(result).toBe("Consegna: Trova l'intruso tra le immagini.");
    expect(result).not.toContain("Target");
    expect(result).not.toContain("Prompt");
  });

  it("keeps only fundamental text for morphosyntax sheets", () => {
    const result = getUserFacingSheetContent({
      tipoOutput: "morfosintassi_complessa",
      testoGenerato: `Obiettivo morfosintattico: pronome clitico lo.
Frase target: La bambina lava il cane.
Scena da illustrare: una bambina lava il cane.
Domande di comprensione: Chi lava il cane?
Prompt immagine: tecnico`,
    });

    expect(result).toBe(
      "Consegna: Osserva l'immagine e rispondi insieme al logopedista.\n\nFrase target: La bambina lava il cane.\n\nDomande di comprensione: Chi lava il cane?"
    );
    expect(result).not.toContain("Obiettivo");
    expect(result).not.toContain("Scena da illustrare");
    expect(result).not.toContain("Prompt");
  });

  it("removes internal prompt sections from story sheets", () => {
    const result = getUserFacingSheetContent({
      tipoOutput: "storia",
      testoGenerato: `Il gatto salta sul prato.
Domande di comprensione:
1. Chi salta?
Prompt immagine: gatto sul prato`,
    });

    expect(result).toBe(
      "Il gatto salta sul prato.\nDomande di comprensione:\n1. Chi salta?"
    );
    expect(result).not.toContain("Prompt");
  });

  it("keeps generated word lists but removes internal objectives", () => {
    const result = getUserFacingSheetContent({
      tipoOutput: "lista",
      testoGenerato: `Obiettivo clinico: esercizio sul fonema.
Parole semplici: rana, rosa
Parole medie: torre, carro
Prompt immagine: tecnico`,
    });

    expect(result).toBe("Parole semplici: rana, rosa\nParole medie: torre, carro");
    expect(result).not.toContain("Obiettivo");
    expect(result).not.toContain("Prompt");
  });
});

describe("getNeutralVisualOptionLabel", () => {
  it("does not reveal target or distractor roles", () => {
    expect(getNeutralVisualOptionLabel(0)).toBe("Opzione 1");
    expect(getNeutralVisualOptionLabel(2)).toBe("Opzione 3");
  });
});
