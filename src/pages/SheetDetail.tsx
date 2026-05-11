import { useParams, Link } from "react-router";
import { useRef } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Download,
  ArrowLeft,
  Sparkles,
  Eye,
  Brain,
} from "lucide-react";

function getSheetTypeLabel(tipoOutput: string) {
  const labels: Record<string, string> = {
    storia: "Storia",
    filastrocca: "Filastrocca",
    lista: "Lista di parole",
    discriminazione_visiva: "Discriminazione visiva",
    morfosintassi_complessa: "Morfosintassi complessa",
  };
  return labels[tipoOutput] ?? tipoOutput;
}

function isTextWithPhonemeSheet(tipoOutput: string) {
  return ["storia", "filastrocca", "lista"].includes(tipoOutput);
}

function getVisualOptionCount(words: string[]) {
  const count = words.filter(word =>
    /^(target|distrattore)/i.test(word.trim())
  ).length;
  return Math.min(Math.max(count || 4, 2), 4);
}

function clonePrintableStyles(printDocument: Document) {
  document.querySelectorAll('link[rel="stylesheet"], style').forEach(el => {
    printDocument.head.appendChild(el.cloneNode(true));
  });
}

function waitForPrintableAssets(doc: Document) {
  const imagePromises = Array.from(doc.images).map(
    image =>
      new Promise<void>(resolve => {
        if (image.complete) {
          resolve();
          return;
        }

        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      })
  );

  const fontsReady = doc.fonts?.ready ?? Promise.resolve();

  return Promise.all([...imagePromises, fontsReady]).then(() => undefined);
}

function populatePrintableSheetDocument(params: {
  printDocument: Document;
  sheetNode: Node;
  title: string;
  sheetWidth: number;
  sheetHeight: number;
}) {
  const pageWidth = params.sheetWidth + 48;
  const pageHeight = params.sheetHeight + 48;
  const { printDocument } = params;

  printDocument.documentElement.lang = "it";

  const charset = printDocument.createElement("meta");
  charset.setAttribute("charset", "UTF-8");
  printDocument.head.appendChild(charset);

  const viewport = printDocument.createElement("meta");
  viewport.name = "viewport";
  viewport.content = "width=device-width, initial-scale=1.0";
  printDocument.head.appendChild(viewport);

  const title = printDocument.createElement("title");
  title.textContent = params.title;
  printDocument.head.appendChild(title);

  clonePrintableStyles(printDocument);

  const printStyle = printDocument.createElement("style");
  printStyle.textContent = `
    html,
    body {
      margin: 0;
      min-height: 100%;
      background: #f8fafc;
    }

    *,
    *::before,
    *::after {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      padding: 24px;
    }

    .pdf-page {
      width: ${params.sheetWidth}px;
      max-width: 100%;
      margin: 0 auto;
    }

    .pdf-page > * {
      width: 100%;
    }

    @page {
      size: ${pageWidth}px ${pageHeight}px;
      margin: 0;
    }

    @media print {
      html,
      body {
        width: ${pageWidth}px;
        min-height: ${pageHeight}px;
        background: #ffffff;
      }

      body {
        padding: 24px;
      }

      .pdf-page {
        width: ${params.sheetWidth}px;
        max-width: none;
        margin: 0 auto;
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
  `;
  printDocument.head.appendChild(printStyle);

  const main = printDocument.createElement("main");
  main.className = "pdf-page";
  main.appendChild(params.sheetNode);
  printDocument.body.replaceChildren(main);
}

export default function SheetDetail() {
  const { id } = useParams<{ id: string }>();
  const sheetId = id ?? "";

  const { user } = useAuth();
  const sheetCardRef = useRef<HTMLDivElement | null>(null);

  const { data: sheet, isLoading } = trpc.sheets.detail.useQuery(
    { id: sheetId },
    { enabled: Boolean(sheetId) }
  );

  const printSheetAsPdf = () => {
    const sheetElement = sheetCardRef.current;
    if (!sheetElement) return;

    const printFrame = document.createElement("iframe");
    printFrame.title = "Anteprima PDF della scheda";
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    printFrame.style.opacity = "0";
    printFrame.style.pointerEvents = "none";
    printFrame.setAttribute("sandbox", "allow-modals allow-same-origin");

    const cleanup = () => {
      window.setTimeout(() => printFrame.remove(), 250);
    };

    printFrame.addEventListener("load", () => {
      const printDocument = printFrame.contentDocument;
      const printWindow = printFrame.contentWindow;
      if (!printDocument || !printWindow) {
        cleanup();
        return;
      }

      waitForPrintableAssets(printDocument).then(() => {
        printWindow.addEventListener("afterprint", cleanup, { once: true });
        printWindow.focus();
        printWindow.print();
        window.setTimeout(cleanup, 60_000);
      });
    });

    document.body.appendChild(printFrame);

    const printDocument = printFrame.contentDocument;
    if (!printDocument) {
      cleanup();
      return;
    }

    populatePrintableSheetDocument({
      printDocument,
      sheetNode: sheetElement.cloneNode(true),
      title: `Scheda ${sheetId}`,
      sheetWidth: Math.ceil(sheetElement.getBoundingClientRect().width),
      sheetHeight: Math.ceil(sheetElement.getBoundingClientRect().height),
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20 text-slate-400">
        Caricamento...
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <FileText className="w-10 h-10 mx-auto mb-3 text-slate-300" />
        <p className="text-slate-500">Scheda non trovata.</p>
        <Link to="/sheets">
          <Button variant="link" className="mt-2">
            Torna alle schede
          </Button>
        </Link>
      </div>
    );
  }

  const words = (sheet.listaParole as string[] | null) ?? [];
  const isVisualDiscrimination = sheet.tipoOutput === "discriminazione_visiva";
  const isComplexMorphosyntax = sheet.tipoOutput === "morfosintassi_complessa";
  const showPhonemeTarget = isTextWithPhonemeSheet(sheet.tipoOutput);
  const visualOptionCount = getVisualOptionCount(words);

  const doctorName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.name ||
    "Nome Utente";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/sheets">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Indietro
          </Button>
        </Link>
        <div className="flex gap-2">
          <Button
            className="bg-teal-600 hover:bg-teal-700"
            size="sm"
            onClick={printSheetAsPdf}
          >
            <Download className="w-4 h-4 mr-1" />
            Scarica PDF
          </Button>
        </div>
      </div>

      {/* Preview card */}
      <div ref={sheetCardRef}>
        <Card className="border-2 border-slate-200">
          <CardContent className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-600 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-slate-800">Paroletta</p>
                  <p className="text-xs text-slate-500">
                    Scheda clinica personalizzata
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="capitalize">
                {getSheetTypeLabel(sheet.tipoOutput)}
              </Badge>
            </div>

            {/* Meta */}
            <div
              className={`grid gap-4 mb-6 text-sm ${
                showPhonemeTarget ? "grid-cols-3" : "grid-cols-2"
              }`}
            >
              {showPhonemeTarget && (
                <div className="bg-slate-50 p-3 rounded-lg">
                  <p className="text-slate-500">Fonema target</p>
                  <p className="font-semibold text-slate-800 text-lg">
                    /{sheet.fonema}/
                  </p>
                </div>
              )}
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-slate-500">Interesse</p>
                <p className="font-semibold text-slate-800 capitalize">
                  {sheet.interesse}
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-slate-500">Difficoltà</p>
                <p className="font-semibold text-slate-800 capitalize">
                  {sheet.difficolta}
                </p>
              </div>
            </div>

            {/* Content */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800">
                {getSheetTypeLabel(sheet.tipoOutput)}
              </h2>

              <div className="text-slate-700 leading-relaxed whitespace-pre-line text-lg">
                {sheet.testoGenerato}
              </div>

              {words.length > 0 && !isVisualDiscrimination && (
                <div className="pt-4">
                  <p className="text-sm font-medium text-slate-500 mb-2">
                    {isComplexMorphosyntax
                      ? "Parametri clinici:"
                      : "Parole chiave:"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {words.map(w => (
                      <Badge key={w} variant="secondary" className="text-sm">
                        {w}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {isVisualDiscrimination ? (
              <div className="mt-8 rounded-xl bg-teal-50 p-5">
                <div className="mb-4 flex items-center gap-2 text-teal-800">
                  <Eye className="h-5 w-5" />
                  <p className="font-semibold">Scelta multipla visiva</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {Array.from({ length: visualOptionCount }, (_, index) => (
                    <div
                      key={index}
                      className="rounded-xl border-2 border-white bg-white p-3 text-center shadow-sm"
                    >
                      <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100">
                        <span className="text-5xl">
                          {index === 0 ? "🎯" : "🖼️"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-700">
                        {index === 0
                          ? "Target corretto"
                          : `Distrattore ${index}`}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Le immagini sono generate come set coordinato: stesso contesto
                  visivo, dettaglio discriminante diverso.
                </p>
              </div>
            ) : isComplexMorphosyntax ? (
              <div className="mt-8 rounded-xl bg-indigo-50 p-5">
                <div className="mb-4 flex items-center gap-2 text-indigo-800">
                  <Brain className="h-5 w-5" />
                  <p className="font-semibold">
                    Scena morfosintattica illustrata
                  </p>
                </div>
                <div className="rounded-xl border-2 border-white bg-white p-5 text-center shadow-sm">
                  <div className="mx-auto flex h-56 max-w-lg items-center justify-center rounded-lg bg-slate-100">
                    <span className="text-6xl">🧠</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    Immagine AI vincolata alla frase target e alla struttura
                    grammaticale descritta.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-8 p-6 bg-slate-50 rounded-xl text-center">
                <p className="text-sm text-slate-500 mb-2">Illustrazione</p>
                <div className="w-32 h-32 mx-auto bg-slate-200 rounded-lg flex items-center justify-center">
                  <span className="text-4xl">🎨</span>
                </div>
                <p className="text-xs text-slate-400 mt-2 capitalize">
                  Tag: {sheet.tagImmagine ?? "generico"}
                </p>
              </div>
            )}

            {/* Watermark footer */}
            <div className="mt-8 pt-4 border-t border-slate-200 text-center">
              <p className="text-sm text-slate-500 italic">
                Materiale a cura del Dott. {doctorName}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Generato con Paroletta — www.paroletta.it
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
