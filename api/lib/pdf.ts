function escapePdfText(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function normalizePdfText(input: string): string {
  return input
    .normalize("NFC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...");
}

function wrapText(text: string, maxChars = 85): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function isTextWithPhonemeSheet(tipoOutput?: string) {
  return ["storia", "filastrocca", "lista"].includes(tipoOutput ?? "");
}

export function createDidacticPdf(params: {
  title: string;
  subtitle: string;
  fonema: string;
  interesse: string;
  difficolta: string;
  content: string;
  words: string[];
  illustrationLabel: string;
  watermarkDoctor: string;
  tipoOutput?: string;
}): Uint8Array {
  const lines: string[] = [];
  lines.push("BT");
  lines.push("/F1 20 Tf 50 790 Td");
  lines.push(`(${escapePdfText(params.title)}) Tj`);
  lines.push("ET");

  lines.push("BT /F1 11 Tf 50 772 Td");
  lines.push(`(${escapePdfText(params.subtitle)}) Tj ET`);

  const typeLabel: Record<string, string> = {
    storia: "Storia",
    filastrocca: "Filastrocca",
    lista: "Lista parole",
    discriminazione_visiva: "Discriminazione visiva",
    morfosintassi_complessa: "Morfosintassi complessa",
  };

  const metadata = [
    `Tipo: ${typeLabel[params.tipoOutput ?? ""] ?? "Scheda"}`,
    ...(isTextWithPhonemeSheet(params.tipoOutput)
      ? [`Fonema: /${params.fonema}/`]
      : []),
    `Interesse: ${params.interesse}`,
    `Difficolta: ${params.difficolta}`,
  ].join("   ");

  lines.push("BT /F1 12 Tf 50 740 Td");
  lines.push(`(${escapePdfText(metadata)}) Tj ET`);

  let y = 710;
  for (const row of wrapText(params.content)) {
    lines.push(`BT /F1 12 Tf 50 ${y} Td (${escapePdfText(row)}) Tj ET`);
    y -= 16;
    if (y < 140) break;
  }

  if (params.tipoOutput === "discriminazione_visiva") {
    const optionCount = Math.min(Math.max(params.words.length || 4, 2), 4);
    const positions = [
      [55, 250],
      [310, 250],
      [55, 120],
      [310, 120],
    ];
    lines.push(
      "BT /F1 13 Tf 50 310 Td (Layout PDF: scelta multipla con target e distrattori coordinati) Tj ET"
    );
    for (let index = 0; index < optionCount; index += 1) {
      const [x, boxY] = positions[index];
      lines.push("0.92 g");
      lines.push(`${x} ${boxY} 220 105 re f`);
      lines.push("0 g");
      lines.push(
        `BT /F1 12 Tf ${x + 18} ${boxY + 55} Td (${escapePdfText(index === 0 ? "TARGET" : `DISTRATTORE ${index}`)}) Tj ET`
      );
      lines.push(
        `BT /F1 10 Tf ${x + 18} ${boxY + 35} Td (${escapePdfText("spazio immagine AI")}) Tj ET`
      );
    }
    y = 105;
  } else if (params.tipoOutput === "morfosintassi_complessa") {
    lines.push("0.92 g");
    lines.push("80 135 435 155 re f");
    lines.push("0 g");
    lines.push(
      "BT /F1 13 Tf 105 225 Td (Scena AI vincolata alla frase target) Tj ET"
    );
    lines.push(
      `BT /F1 10 Tf 105 205 Td (${escapePdfText(`Etichetta immagine: ${params.illustrationLabel}`)}) Tj ET`
    );
    y = 110;
  } else if (params.words.length > 0 && y > 180) {
    lines.push(
      `BT /F1 11 Tf 50 ${y - 8} Td (${escapePdfText(`Parole chiave: ${params.words.join(", ")}`)}) Tj ET`
    );
    y -= 28;
  }

  if (
    params.tipoOutput !== "discriminazione_visiva" &&
    params.tipoOutput !== "morfosintassi_complessa"
  ) {
    lines.push(
      `BT /F1 11 Tf 50 ${Math.max(y - 6, 120)} Td (${escapePdfText(`Illustrazione associata: ${params.illustrationLabel}`)}) Tj ET`
    );
  }

  lines.push("0.85 g");
  lines.push("BT /F1 12 Tf 110 60 Td");
  lines.push(
    `(${escapePdfText(`Materiale a cura del Dott. ${params.watermarkDoctor}`)}) Tj ET`
  );
  lines.push("0 g");

  const contentStream = normalizePdfText(lines.join("\n"));

  const streamLength = Buffer.byteLength(contentStream, "latin1");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${streamLength} >> stream\n${contentStream}\nendstream endobj`,
  ];

  let pdf = "%PDF-1.4\n";
  const xref: number[] = [0];
  for (const obj of objects) {
    xref.push(pdf.length);
    pdf += `${obj}\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < xref.length; i++) {
    pdf += `${xref[i].toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Uint8Array.from(Buffer.from(normalizePdfText(pdf), "latin1"));
}
