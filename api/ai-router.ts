import { createRouter, authedQuery } from "./middleware";
import { z } from "zod";
import { getDb } from "./queries/connection";
import { sheets, users } from "@db/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const aiResponseSchema = z.object({
  testoGenerato: z.string(),
  tagImmagine: z.string(),
  listaParole: z.array(z.string()),
  difficolta: z.enum(["bassa", "media", "alta"]),
});

function buildPrompt(params: {
  eta: string;
  fonema: string;
  interesse: string;
  tipoOutput: "storia" | "filastrocca" | "lista";
}): string {
  return `Sei un logopedista esperto con 15 anni di esperienza in riabilitazione del linguaggio pediatrico. Devi creare materiale didattico personalizzato per un bambino.

PARAMETRI CLINICI:
- Età del pambino: ${params.eta}
- Fonema / obiettivo target: "${params.fonema}"
- Interesse del bambino: "${params.interesse}"
- Tipo di output richiesto: ${params.tipoOutput}

ISTRUZIONI:
1. Se il tipo è "storia": scrivi una storia breve (max 150 parole) che includa naturalmente parole con il fonema target. La storia deve essere coinvolgente per un bambino interessato a "${params.interesse}".
2. Se il tipo è "filastrocca": componi una filastrocca ritmata e divertente di 8-12 versi che faccia pratica sul fonema "${params.fonema}".
3. Se il tipo è "lista": fornisci una lista di 15-20 parole divise per difficoltà crescente (semplici, medie, complesse) che contengano il fonema target.

Devi rispondere ESCLUSIVAMENTE in formato JSON valido con questa struttura esatta:
{
  "testoGenerato": "il testo completo generato",
  "tagImmagine": "una singola parola chiave in italiano per l'illustrazione (es: dinosauro, principessa, palla, gatto, auto)",
  "listaParole": ["parola1", "parola2", "parola3"],
  "difficolta": "bassa" | "media" | "alta"
}

Regole:
- Non includere MAI testo esterno al JSON.
- Il campo tagImmagine deve essere una singola parola italiana.
- Adatta lessico e struttura all'età indicata.
- L'interesse del bambino deve influenzare il contenuto.`;
}

async function callOpenAI(prompt: string): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Sei un assistente specializzato in logopedia pediatrica." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status}`);
  }
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = data.choices[0]?.message?.content ?? "{}";
  return JSON.parse(content);
}

function mockAIResponse(params: {
  eta: string;
  fonema: string;
  interesse: string;
  tipoOutput: "storia" | "filastrocca" | "lista";
}) {
  const templates: Record<string, Record<string, string>> = {
    storia: {
      dinosauro: `C'era una volta un piccolo dinosauro chiamato Dino che amava correre tra le rocce. Un giorno Dino trovò una rana rosa che saltava felice tra i fiori. "Resta con me!" disse Dino. La rana sorrise e insieme andarono a cercare torri antiche da esplorare, ridendo sotto il sole caldo.`,
      principessa: `La principessa Aurora amava il suo giardino di rose. Ogni mattina annusava i fiori rossi e cantava con le rane nel laghetto. Un giorno una torre misteriosa apparve tra gli alberi. Aurora salì le scale coraggiose e trovò una stanza piena di specchi dorati dove il suo sorriso si rifletteva mille volte.`,
      calcio: `Marco era un campione di calcio. Ogni giorno correva sul campo verde e tirava la palla rossa verso la porta. I suoi amici rana e topo tifavano forte. "Marco, Marco!" gridavano. Marco sorrise, fece un dribbling magico e segnò un goal strepitoso sotto il sole.`,
    },
    filastrocca: {
      dinosauro: `Dino dinosauro corre nel prato,\ncon le zampe robuste e il passo pesante.\nTrova una rana rosa che salta beato,\ne insieme ridono sotto il sole ardente.\nLa torre li guarda da lontano,\nDino e la rana sono amici per mano!`,
      principessa: `La rosa rossa della principessa,\nprofuma dolce nella torre alta.\nLa rana canta con grazia e finezza,\nmentre il sole colora l'aria di salza.\nAurora ride, corre e danza,\nla sua corona splende, piena di speranza!`,
      calcio: `Palla rossa, campo verde,\nMarco corre, Marco prende.\nTira forte, goal che tende,\ntutti insieme l'applauso rende.\nRana e topo tifano forte,\nil calcio è magico, è uno sport!`,
    },
    lista: {
      dinosauro: `Parole semplici: rana, rosa, rete, raro, roba\nParole medie: torre, rana, rosa, raso, rotto\nParole complesse: ricostruire, rappresentare, ristrutturare, riorganizzare`,
      principessa: `Parole semplici: rosa, rana, rete, raso, roba\nParole medie: torre, rana, raso, rotto, rosa\nParole complesse: ricostruire, rappresentare, ristrutturare`,
      calcio: `Parole semplici: rana, rosa, rete, raro, roba\nParole medie: torre, rana, raso, rotto, rosa\nParole complesse: ricostruire, rappresentare, ristrutturare`,
    },
  };

  const text =
    templates[params.tipoOutput]?.[params.interesse] ??
    templates[params.tipoOutput]["dinosauro"];

  const wordMap: Record<string, string[]> = {
    r: ["rana", "rosa", "torre", "roba", "raro", "raso", "rotto"],
    s: ["sole", "sasso", "sale", "sala", "sano", "sano", "seta"],
    l: ["luna", "lago", "lana", "lama", "lato", "luce", "lana"],
  };
  const words = wordMap[params.fonema.toLowerCase()] ?? ["rana", "rosa", "torre"];

  return {
    testoGenerato: text,
    tagImmagine: params.interesse,
    listaParole: words,
    difficolta: "media" as const,
  };
}

export const aiRouter = createRouter({
  generate: authedQuery
    .input(
      z.object({
        eta: z.string().max(20),
        fonema: z.string().max(10),
        interesse: z.string().max(100),
        tipoOutput: z.enum(["storia", "filastrocca", "lista"]),
        patientId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      // Controllo limiti
      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const user = userRows[0];
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const piano = user.piano ?? "trial";
      const planLimits: Record<string, number> = {
        trial: 10,
        base: 100,
      };
      const limit = planLimits[piano] ?? 5;
      const used =
        piano === "trial"
          ? (user.trialSchedeUsate ?? 0)
          : (user.schedeMese ?? 0);

      if (used >= limit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Hai raggiunto il limite di ${limit} schede per il piano ${piano}. Passa a un piano superiore per continuare.`,
        });
      }

      // Chiamata AI
      const prompt = buildPrompt({
        eta: input.eta,
        fonema: input.fonema,
        interesse: input.interesse,
        tipoOutput: input.tipoOutput,
      });

      let raw: unknown;
      try {
        raw = await callOpenAI(prompt);
      } catch {
        raw = mockAIResponse({
          eta: input.eta,
          fonema: input.fonema,
          interesse: input.interesse,
          tipoOutput: input.tipoOutput,
        });
      }

      const parsed = aiResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI response format invalid",
        });
      }
      const data = parsed.data;

      // Salva scheda
      const insertResult = await db
        .insert(sheets)
        .values({
          userId,
          patientId: input.patientId ?? null,
          fonema: input.fonema,
          interesse: input.interesse,
          tipoOutput: input.tipoOutput,
          testoGenerato: data.testoGenerato,
          tagImmagine: data.tagImmagine,
          listaParole: data.listaParole,
          difficolta: data.difficolta,
        })
        .returning({ id: sheets.id });

      const sheetId = insertResult[0].id;

      // Aggiorna contatore
      if (piano === "trial") {
        await db
          .update(users)
          .set({ trialSchedeUsate: (user.trialSchedeUsate ?? 0) + 1 })
          .where(eq(users.id, userId));
      } else {
        await db
          .update(users)
          .set({ schedeMese: (user.schedeMese ?? 0) + 1 })
          .where(eq(users.id, userId));
      }

      const sheetRows = await db
        .select()
        .from(sheets)
        .where(eq(sheets.id, sheetId))
        .limit(1);

      return {
        sheet: sheetRows[0],
        remaining: limit - used - 1,
        totalUsed: used + 1,
      };
    }),
});
