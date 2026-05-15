import { useParams, Link } from "react-router";
import { useRef, type ReactNode } from "react";
import { trpc } from "@/providers/trpc";
import {
  getNeutralVisualOptionLabel,
  getUserFacingSheetContent,
} from "@contracts/sheet-content";
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
    discriminazione_visiva: "Trova l'intruso",
    morfosintassi_complessa: "Morfosintassi complessa",
  };
  return labels[tipoOutput] ?? tipoOutput;
}

function isTextWithPhonemeSheet(tipoOutput: string) {
  return ["storia", "filastrocca", "lista"].includes(tipoOutput);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedPhonemeText(
  text: string,
  fonema: string
): ReactNode[] {
  const target = fonema.trim();
  if (!target) return [text];

  const regex = new RegExp(`(${escapeRegExp(target)})`, "giu");
  return text.split(regex).map((part, index) => {
    if (part.toLocaleLowerCase("it-IT") !== target.toLocaleLowerCase("it-IT")) {
      return part;
    }

    return (
      <mark
        key={`${part}-${index}`}
        className="rounded bg-amber-100 px-0.5 font-bold text-teal-700"
      >
        {part}
      </mark>
    );
  });
}

function getVisualOptionCount(words: string[]) {
  const count = words.filter(word =>
    /^(target|distrattore)/i.test(word.trim())
  ).length;
  return Math.min(Math.max(count || 4, 2), 4);
}

function isDisplayableImagePath(path: string | null | undefined) {
  return Boolean(path && /^(https?:|data:image\/|\/)/u.test(path));
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
  const imageAssets = sheet.imageAssets ?? [];
  const visualImageAssets = imageAssets.filter(asset =>
    ["target", "distrattore"].includes(asset.role)
  );
  const visualOptionCount = Math.min(
    Math.max(getVisualOptionCount(words), visualImageAssets.length || 0),
    4
  );
  const primaryImageAsset = imageAssets[0];
  const userFacingContent = getUserFacingSheetContent({
    tipoOutput: sheet.tipoOutput,
    testoGenerato: sheet.testoGenerato,
  });

  const doctorName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.name ||
    "Nome Utente";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
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
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-teal-100 via-white to-indigo-100 p-1 shadow-xl shadow-slate-200/70">
          <CardContent className="rounded-[1.35rem] bg-white p-6 sm:p-8">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 shadow-inner">
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

            {/* Content */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800">
                {getSheetTypeLabel(sheet.tipoOutput)}
              </h2>

              <div className="text-slate-700 leading-relaxed whitespace-pre-line text-lg">
                {showPhonemeTarget
                  ? renderHighlightedPhonemeText(
                      userFacingContent,
                      sheet.fonema
                    )
                  : userFacingContent}
              </div>
            </div>

            {isVisualDiscrimination ? (
              <div className="mt-8 rounded-[1.5rem] border border-teal-100 bg-gradient-to-br from-teal-50 to-cyan-50 p-5 shadow-inner sm:p-6">
                <div className="mb-4 flex items-center gap-2 text-teal-800">
                  <Eye className="h-5 w-5" />
                  <p className="font-semibold">Scelta multipla visiva</p>
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
                  {Array.from({ length: visualOptionCount }, (_, index) => {
                    const asset = visualImageAssets[index];
                    const label = getNeutralVisualOptionLabel(index);
                    return (
                      <div
                        key={asset?.cacheKey ?? index}
                        className="rounded-[1.35rem] border border-teal-100 bg-white p-3 text-center shadow-lg shadow-teal-900/5 ring-4 ring-white/80 sm:p-4"
                      >
                        <div className="flex h-56 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 sm:h-64 md:h-72">
                          {isDisplayableImagePath(asset?.filePath) ? (
                            <img
                              src={asset.filePath}
                              alt={label}
                              className="h-full w-full object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <span className="px-4 text-sm font-medium text-slate-500">
                              Immagine non disponibile
                            </span>
                          )}
                        </div>
                        <p className="mt-4 text-base font-bold text-slate-700">
                          {label}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : isComplexMorphosyntax ? (
              <div className="mt-8 rounded-[1.5rem] border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-5 shadow-inner sm:p-6">
                <div className="mb-4 flex items-center gap-2 text-indigo-800">
                  <Brain className="h-5 w-5" />
                  <p className="font-semibold">
                    Scena morfosintattica illustrata
                  </p>
                </div>
                <div className="rounded-[1.35rem] border border-indigo-100 bg-white p-4 text-center shadow-lg shadow-indigo-900/5 ring-4 ring-white/80 sm:p-5">
                  <div className="mx-auto flex h-72 max-w-2xl items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 sm:h-80 md:h-[26rem]">
                    {isDisplayableImagePath(primaryImageAsset?.filePath) ? (
                      <img
                        src={primaryImageAsset.filePath}
                        alt={primaryImageAsset.label}
                        className="h-full w-full object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <span className="px-4 text-sm font-medium text-slate-500">
                        Immagine non disponibile
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-8 rounded-[1.5rem] border border-slate-200 bg-gradient-to-br from-slate-50 to-teal-50/70 p-5 text-center shadow-inner sm:p-6">
                <p className="mb-4 text-base font-semibold text-slate-600">
                  Illustrazione
                </p>
                <div className="mx-auto flex h-72 max-w-2xl items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-lg shadow-slate-900/5 ring-4 ring-white/80 sm:h-80 md:h-96">
                  {isDisplayableImagePath(primaryImageAsset?.filePath) ? (
                    <img
                      src={primaryImageAsset.filePath}
                      alt={primaryImageAsset.label}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <span className="px-4 text-sm font-medium text-slate-500">
                      Immagine non disponibile
                    </span>
                  )}
                </div>
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
