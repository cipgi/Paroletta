function escapePdfText(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
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
}): Uint8Array {
  const lines: string[] = [];
  lines.push("BT");
  lines.push("/F1 20 Tf 50 790 Td");
  lines.push(`(${escapePdfText(params.title)}) Tj`);
  lines.push("ET");

  lines.push("BT /F1 11 Tf 50 772 Td");
  lines.push(`(${escapePdfText(params.subtitle)}) Tj ET`);

  lines.push("BT /F1 12 Tf 50 740 Td");
  lines.push(`(${escapePdfText(`Fonema: /${params.fonema}/   Interesse: ${params.interesse}   Difficolta: ${params.difficolta}`)}) Tj ET`);

  let y = 710;
  for (const row of wrapText(params.content)) {
    lines.push(`BT /F1 12 Tf 50 ${y} Td (${escapePdfText(row)}) Tj ET`);
    y -= 16;
    if (y < 140) break;
  }

  if (params.words.length > 0 && y > 180) {
    lines.push(`BT /F1 11 Tf 50 ${y - 8} Td (${escapePdfText(`Parole chiave: ${params.words.join(", ")}`)}) Tj ET`);
    y -= 28;
  }

  lines.push(`BT /F1 11 Tf 50 ${Math.max(y - 6, 120)} Td (${escapePdfText(`Illustrazione associata: ${params.illustrationLabel}`)}) Tj ET`);

  lines.push("0.85 g");
  lines.push("BT /F1 12 Tf 110 60 Td");
  lines.push(`(${escapePdfText(`Materiale a cura del Dott. ${params.watermarkDoctor}`)}) Tj ET`);
  lines.push("0 g");

  const contentStream = lines.join("\n");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${contentStream.length} >> stream\n${contentStream}\nendstream endobj`,
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

  return new TextEncoder().encode(pdf);
}
