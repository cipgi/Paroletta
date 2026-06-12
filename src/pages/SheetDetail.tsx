import { useParams, Link } from "react-router";
import { useRef } from "react";
import { trpc } from "@/providers/trpc";
import {
  getNeutralVisualOptionLabel,
  getUserFacingSheetContent,
  orderNarrativeSequenceForDisplay,
  orderVisualOptionsForDisplay,
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
  ListOrdered,
  MessageCircle,
  RefreshCcw,
  Loader2,
} from "lucide-react";

function getSheetTypeLabel(tipoOutput: string) {
  const labels: Record<string, string> = {
    storia: "Storia",
    filastrocca: "Filastrocca",
    lista: "Lista di parole",
    discriminazione_visiva: "Trova l'intruso",
    morfosintassi_complessa: "Morfologia e morfosintassi",
    narrazione_sequenze: "Narrazione e sequenze",
    pragmatica: "Pragmatica",
  };
  return labels[tipoOutput] ?? tipoOutput;
}

function getVisualSheetTitle(interesse: string) {
  if (!interesse.trim()) return "Trova l'intruso";
  return `Trova l'intruso — tema ${interesse}`;
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
  const utils = trpc.useUtils();

  const { user } = useAuth();
  const sheetCardRef = useRef<HTMLDivElement | null>(null);

  const { data: sheet, isLoading } = trpc.sheets.detail.useQuery(
    { id: sheetId },
    { enabled: Boolean(sheetId) }
  );
  const regenerateImage = trpc.sheets.regenerateImage.useMutation({
    onSuccess: () => {
      void utils.sheets.detail.invalidate({ id: sheetId });
    },
  });

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
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="h-10 w-28 animate-pulse rounded-lg bg-slate-200" />
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-teal-100 via-white to-indigo-100 p-1 shadow-xl shadow-slate-200/70">
          <CardContent className="space-y-5 rounded-[1.35rem] bg-white p-6 sm:p-8">
            <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
            <div className="space-y-3">
              <div className="h-7 w-64 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-10/12 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
          </CardContent>
        </Card>
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
  const isNarrativeSequence = sheet.tipoOutput === "narrazione_sequenze";
  const isPragmatic = sheet.tipoOutput === "pragmatica";
  const imageAssets = sheet.imageAssets ?? [];
  const hasImageAssets = imageAssets.length > 0;
  const hasDisplayableImageAssets = imageAssets.some(asset =>
    isDisplayableImagePath(asset.filePath)
  );
  const visualImageAssets = imageAssets.filter(asset =>
    ["target", "distrattore"].includes(asset.role)
  );
  const visualDisplayAssets = orderVisualOptionsForDisplay(
    visualImageAssets,
    sheet.id
  );
  const narrativeDisplayAssets = orderNarrativeSequenceForDisplay(
    imageAssets,
    sheet.id
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
  const imageActionAssets = (
    isVisualDiscrimination
      ? visualDisplayAssets
      : isNarrativeSequence
        ? narrativeDisplayAssets
        : imageAssets
  ).slice(0, 4);

  const doctorName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.name ||
    "Nome Utente";

  const displayTitle =
    sheet.tipoOutput === "discriminazione_visiva"
      ? getVisualSheetTitle(sheet.interesse)
      : getSheetTypeLabel(sheet.tipoOutput);

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
                {displayTitle}
              </h2>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Consegna bambino
                </p>
                <div className="text-slate-800 leading-relaxed whitespace-pre-line text-lg">
                  {userFacingContent}
                </div>
              </div>

              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-sm text-slate-700">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                  Note professionista
                </p>
                <p>
                  {hasImageAssets
                    ? hasDisplayableImageAssets
                      ? "Verifica coerenza tema-immagini e accuratezza della risposta; usa “Rigenera” per correggere contenuto o immagini."
                      : "Le immagini non sono ancora disponibili; il contenuto testuale della scheda resta invariato."
                    : "Verifica accuratezza della consegna, del testo e delle risposte prima dell'uso clinico."}
                </p>
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
                    const asset = visualDisplayAssets[index];
                    const label = getNeutralVisualOptionLabel(index);
                    return (
                      <div
                        key={asset?.cacheKey ?? index}
                        className="rounded-[1.35rem] border border-teal-100 bg-white p-3 text-center shadow-lg shadow-teal-900/5 ring-4 ring-white/80 sm:p-4"
                      >
                        <div className="flex h-56 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 sm:h-64 md:h-72">
                          {isDisplayableImagePath(asset?.filePath) ? (
                            <img
                              src={asset.filePath ?? undefined}
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
                        <p className="mt-1 text-sm text-slate-500">
                          Didascalia: opzione {index + 1}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : isComplexMorphosyntax && hasImageAssets ? (
              <div className="mt-8 rounded-[1.5rem] border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-5 shadow-inner sm:p-6">
                <div className="mb-4 flex items-center gap-2 text-indigo-800">
                  <Brain className="h-5 w-5" />
                  <p className="font-semibold">
                    Scena morfologica o morfosintattica illustrata
                  </p>
                </div>
                <div className="rounded-[1.35rem] border border-indigo-100 bg-white p-4 text-center shadow-lg shadow-indigo-900/5 ring-4 ring-white/80 sm:p-5">
                  <div className="mx-auto flex h-72 max-w-2xl items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 sm:h-80 md:h-[26rem]">
                    {isDisplayableImagePath(primaryImageAsset?.filePath) ? (
                      <img
                        src={primaryImageAsset.filePath ?? undefined}
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
            ) : isNarrativeSequence ? (
              <div className="mt-8 rounded-[1.5rem] border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-inner sm:p-6">
                <div className="mb-4 flex items-center gap-2 text-amber-800">
                  <ListOrdered className="h-5 w-5" />
                  <p className="font-semibold">Sequenza narrativa</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {narrativeDisplayAssets.map((asset, index) => (
                    <div
                      key={asset.cacheKey}
                      className="rounded-[1.35rem] border border-amber-100 bg-white p-3 text-center shadow-lg shadow-amber-900/5 ring-4 ring-white/80 sm:p-4"
                    >
                      <div className="flex h-52 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 sm:h-60">
                        {isDisplayableImagePath(asset.filePath) ? (
                          <img
                            src={asset.filePath ?? undefined}
                            alt={asset.label}
                            className="h-full w-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <span className="px-4 text-sm font-medium text-slate-500">
                            Immagine non disponibile
                          </span>
                        )}
                      </div>
                      <p className="mt-3 text-base font-bold text-slate-700">
                        Scena {index + 1}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : isPragmatic && hasImageAssets ? (
              <div className="mt-8 rounded-[1.5rem] border border-rose-100 bg-gradient-to-br from-rose-50 to-pink-50 p-5 shadow-inner sm:p-6">
                <div className="mb-4 flex items-center gap-2 text-rose-800">
                  <MessageCircle className="h-5 w-5" />
                  <p className="font-semibold">
                    Scenario pragmatico illustrato
                  </p>
                </div>
                <div className="rounded-[1.35rem] border border-rose-100 bg-white p-4 text-center shadow-lg shadow-rose-900/5 ring-4 ring-white/80 sm:p-5">
                  <div className="mx-auto flex h-72 max-w-2xl items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 sm:h-80 md:h-[26rem]">
                    {isDisplayableImagePath(primaryImageAsset?.filePath) ? (
                      <img
                        src={primaryImageAsset.filePath ?? undefined}
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
            ) : hasImageAssets ||
              (sheet.tipoOutput === "lista" && words.length > 0) ? (
              <div className="mt-8 rounded-[1.5rem] border border-slate-200 bg-gradient-to-br from-slate-50 to-teal-50/70 p-5 text-center shadow-inner sm:p-6">
                {hasImageAssets ? (
                  <>
                    <p className="mb-4 text-base font-semibold text-slate-600">
                      Illustrazione
                    </p>
                    <div className="mx-auto flex h-72 max-w-2xl items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-lg shadow-slate-900/5 ring-4 ring-white/80 sm:h-80 md:h-96">
                      {isDisplayableImagePath(primaryImageAsset?.filePath) ? (
                        <img
                          src={primaryImageAsset.filePath ?? undefined}
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
                  </>
                ) : null}
                {sheet.tipoOutput === "lista" && words.length > 0 ? (
                  <div
                    className={`${hasImageAssets ? "mt-6" : ""} rounded-2xl border border-slate-200 bg-white p-4 text-left`}
                  >
                    <p className="mb-3 text-sm font-semibold text-slate-700">
                      Vocabolario
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {words.slice(0, 20).map((word, index) => (
                        <div
                          key={`${word}-${index}`}
                          className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 text-sm"
                        >
                          {word}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {imageActionAssets.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {imageActionAssets.map((asset, index) => {
                  const isRegenerating =
                    regenerateImage.isPending &&
                    regenerateImage.variables?.cacheKey === asset.cacheKey;
                  const hasImage = isDisplayableImagePath(asset.filePath);

                  return (
                    <Button
                      key={asset.cacheKey}
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={regenerateImage.isPending}
                      onClick={() => {
                        regenerateImage.mutate({
                          id: sheet.id,
                          cacheKey: asset.cacheKey,
                        });
                      }}
                    >
                      {isRegenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-4 w-4" />
                      )}
                      {hasImage ? "Rigenera" : "Genera"} immagine {index + 1}
                    </Button>
                  );
                })}
                {regenerateImage.isError ? (
                  <p className="basis-full text-sm text-red-600">
                    {regenerateImage.error?.message ??
                      "Errore durante la rigenerazione dell'immagine."}
                  </p>
                ) : null}
              </div>
            ) : null}

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
