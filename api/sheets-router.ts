import { createRouter, authedQuery } from "./middleware";
import { z } from "zod";
import { adminAppDb, appDb, getSupabaseUserIdFromUnionId } from "./lib/db";
import {
  databaseOperationError,
  invalidSessionError,
  missingResourceError,
} from "./lib/errors";
import { getAccountContext } from "./lib/organization";
import { createSupabaseImageCacheDb } from "./lib/illustration-cache-db";
import { createSupabaseImageObjectStorage } from "./lib/image-storage";
import { supabaseAdmin } from "./lib/supabase";
import {
  buildSemanticCacheKey,
  buildImageRequests,
  getImageRequestCacheMetadata,
  resolveCachedImageRequest,
  resolveImageRequestWithCache,
} from "./lib/image-generation";
import {
  DEFAULT_TARGET_AUDIENCE,
  isTargetAudience,
} from "../contracts/target-audience";
import {
  assertActiveSubscription,
  reserveImageGenerationQuota,
} from "./lib/subscription";
import { getVisualDisplayOptionCount } from "../contracts/sheet-content";

function requireSupabaseUserId(unionId: string) {
  const id = getSupabaseUserIdFromUnionId(unionId);
  if (!id) throw invalidSessionError();
  return id;
}

async function assertCanManageSheetOwner(
  currentUserId: string,
  sheetOwnerUserId: string,
  accessToken?: string
) {
  if (currentUserId === sheetOwnerUserId) return;

  const account = await getAccountContext(currentUserId, accessToken);
  if (account.role !== "manager" || account.ownerUserId !== currentUserId) {
    throw missingResourceError("Scheda");
  }

  const { data, error } = await appDb(accessToken)
    .from("seat_assignments")
    .select("id")
    .eq("owner_user_id", currentUserId)
    .eq("member_user_id", sheetOwnerUserId)
    .maybeSingle();

  if (error)
    throw databaseOperationError("verificare l'accesso al team", error);
  if (!data) throw missingResourceError("Scheda");
}

type DbSheet = {
  id: string;
  user_id: string;
  fonema: string;
  interesse: string;
  target_audience?: string | null;
  tipo_output: string;
  testo_generato: string;
  tag_immagine: string | null;
  lista_parole: string[] | null;
  difficolta: string;
  pdf_url: string | null;
  created_at: string;
};

const mapSheet = (s: DbSheet) => ({
  id: s.id,
  userId: s.user_id,
  fonema: s.fonema,
  interesse: s.interesse,
  targetAudience: isTargetAudience(s.target_audience)
    ? s.target_audience
    : DEFAULT_TARGET_AUDIENCE,
  tipoOutput: s.tipo_output,
  testoGenerato: s.testo_generato,
  tagImmagine: s.tag_immagine,
  listaParole: s.lista_parole,
  difficolta: s.difficolta,
  pdfUrl: s.pdf_url,
  createdAt: new Date(s.created_at),
});

type ImageQuotaContext = {
  userId: string;
  accessToken?: string;
};

async function reserveImageQuotaForCurrentUser(quota: ImageQuotaContext) {
  const account = await getAccountContext(quota.userId, quota.accessToken);
  const subscription = await assertActiveSubscription({
    ownerUserId: account.ownerUserId,
    accessToken: quota.accessToken,
  });

  return reserveImageGenerationQuota({
    userId: quota.userId,
    plan: subscription.plan ?? "trial",
    accessToken: quota.accessToken,
  });
}

async function resolveSheetImageAssets(sheet: ReturnType<typeof mapSheet>) {
  const cacheScope = { ownerUserId: sheet.userId, sheetId: sheet.id };
  const imageRequests = buildImageRequests({
    tipoOutput: sheet.tipoOutput,
    interesse: sheet.interesse,
    targetAudience: sheet.targetAudience,
    tagImmagine: sheet.tagImmagine,
    testoGenerato: sheet.testoGenerato,
    numeroOpzioni:
      sheet.tipoOutput === "discriminazione_visiva"
        ? getVisualDisplayOptionCount({ words: sheet.listaParole })
        : undefined,
  });
  const imageStorage = createSupabaseImageObjectStorage(supabaseAdmin);
  const imageCacheDb = createSupabaseImageCacheDb(adminAppDb(), {
    imageStorage,
    cacheScope,
  });

  return Promise.all(
    imageRequests.map(async request => {
      const illustration = await resolveCachedImageRequest(
        request,
        imageCacheDb,
        cacheScope
      );
      const metadata = getImageRequestCacheMetadata(request);

      return {
        role: request.role,
        label: request.label,
        semanticTags: illustration?.semanticTags ?? metadata.semanticTags,
        cacheKey: illustration?.cacheKey ?? metadata.cacheKey,
        filePath: illustration?.filePath ?? null,
        source: illustration?.source ?? null,
        storageBucket: illustration?.storageBucket ?? null,
        storagePath: illustration?.storagePath ?? null,
        fallbackReason: illustration?.fallbackReason ?? null,
        cacheHit: illustration?.cacheHit ?? false,
      };
    })
  );
}
const managedSheetListInput = z
  .object({
    userId: z.string().uuid().optional(),
    allTeam: z.boolean().optional(),
  })
  .optional();

export const sheetsRouter = createRouter({
  count: authedQuery
    .input(managedSheetListInput)
    .query(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      const targetUserId = input?.userId ?? supabaseUserId;
      await assertCanManageSheetOwner(
        supabaseUserId,
        targetUserId,
        ctx.supabaseAccessToken
      );
      const { count, error } = await appDb(ctx.supabaseAccessToken)
        .from("sheets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", targetUserId);
      if (error) throw databaseOperationError("caricare le schede", error);
      return count ?? 0;
    }),
  list: authedQuery
    .input(managedSheetListInput)
    .query(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      const db = appDb(ctx.supabaseAccessToken);

      if (input?.allTeam) {
        const account = await getAccountContext(
          supabaseUserId,
          ctx.supabaseAccessToken
        );
        if (
          account.role !== "manager" ||
          account.ownerUserId !== supabaseUserId
        ) {
          throw missingResourceError("Schede del team");
        }

        const { data: members, error: membersError } = await db
          .from("seat_assignments")
          .select("member_user_id")
          .eq("owner_user_id", supabaseUserId);
        if (membersError)
          throw databaseOperationError(
            "caricare i membri del team",
            membersError
          );

        const teamUserIds = [
          supabaseUserId,
          ...(members ?? []).map(member => member.member_user_id),
        ];
        const { data, error } = await db
          .from("sheets")
          .select("*")
          .in("user_id", teamUserIds)
          .order("created_at", { ascending: false });
        if (error)
          throw databaseOperationError("caricare l’elenco delle schede", error);
        return (data ?? []).map(mapSheet);
      }

      const targetUserId = input?.userId ?? supabaseUserId;
      await assertCanManageSheetOwner(
        supabaseUserId,
        targetUserId,
        ctx.supabaseAccessToken
      );
      const { data, error } = await db
        .from("sheets")
        .select("*")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false });
      if (error)
        throw databaseOperationError("caricare l’elenco delle schede", error);
      return (data ?? []).map(mapSheet);
    }),
  detail: authedQuery
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      const { data, error } = await appDb(ctx.supabaseAccessToken)
        .from("sheets")
        .select("*")
        .eq("id", input.id)
        .single();
      if (error || !data) throw missingResourceError("Scheda");
      await assertCanManageSheetOwner(
        supabaseUserId,
        data.user_id,
        ctx.supabaseAccessToken
      );
      const sheet = mapSheet(data);
      const imageAssets = await resolveSheetImageAssets(sheet);
      return { ...sheet, imageAssets };
    }),
  regenerateImage: authedQuery
    .input(z.object({ id: z.string().uuid(), cacheKey: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      const { data, error } = await appDb(ctx.supabaseAccessToken)
        .from("sheets")
        .select("*")
        .eq("id", input.id)
        .single();
      if (error || !data) throw missingResourceError("Scheda");
      await assertCanManageSheetOwner(
        supabaseUserId,
        data.user_id,
        ctx.supabaseAccessToken
      );
      const sheet = mapSheet(data);
      const imageRequests = buildImageRequests({
        tipoOutput: sheet.tipoOutput,
        interesse: sheet.interesse,
        targetAudience: sheet.targetAudience,
        tagImmagine: sheet.tagImmagine,
        testoGenerato: sheet.testoGenerato,
        numeroOpzioni:
          sheet.tipoOutput === "discriminazione_visiva"
            ? getVisualDisplayOptionCount({ words: sheet.listaParole })
            : undefined,
      });
      const request = imageRequests.find(
        item => buildSemanticCacheKey(item.semanticTags) === input.cacheKey
      );
      if (!request) throw missingResourceError("Immagine");

      const imageStorage = createSupabaseImageObjectStorage(supabaseAdmin);
      const cacheScope = { ownerUserId: sheet.userId, sheetId: sheet.id };
      const imageCacheDb = createSupabaseImageCacheDb(adminAppDb(), {
        imageStorage,
        cacheScope,
      });
      const illustration = await resolveImageRequestWithCache(
        request,
        imageCacheDb,
        {
          force: true,
          imageStorage,
          cacheScope,
          onGenerateStart: async () =>
            reserveImageQuotaForCurrentUser({
              userId: supabaseUserId,
              accessToken: ctx.supabaseAccessToken,
            }),
        }
      );

      return {
        role: request.role,
        label: request.label,
        semanticTags: illustration.semanticTags,
        cacheKey: illustration.cacheKey,
        filePath: illustration.filePath,
        source: illustration.source,
        storageBucket: illustration.storageBucket ?? null,
        storagePath: illustration.storagePath ?? null,
        fallbackReason: illustration.fallbackReason ?? null,
        cacheHit: illustration.cacheHit,
      };
    }),
});
