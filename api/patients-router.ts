import { createRouter, authedQuery } from "./middleware";
import { z } from "zod";
import { getSupabaseUserIdFromUnionId, queryAppTable } from "./lib/db";

function requireSupabaseUserId(unionId: string) {
  const id = getSupabaseUserIdFromUnionId(unionId);
  if (!id) throw new Error("Utente Supabase non valido");
  return id;
}

export const patientsRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
    const { data, error } = await queryAppTable((from) => from("patients").select("id,user_id,alias_eta,note_anonime,created_at").eq("user_id", supabaseUserId).order("created_at", { ascending: false }));
    if (error) throw new Error(error.message);
    return (data ?? []).map((p) => ({ id: p.id, userId: p.user_id, aliasEta: p.alias_eta, noteAnonime: p.note_anonime, createdAt: new Date(p.created_at) }));
  }),
  create: authedQuery.input(z.object({ aliasEta: z.string().trim().min(1, "Il nome del paziente è obbligatorio").max(50), noteAnonime: z.string().optional() })).mutation(async ({ ctx, input }) => {
    const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
    const { data, error } = await queryAppTable((from) =>
      from("patients")
        .insert({
          user_id: supabaseUserId,
          alias_eta: input.aliasEta,
          note_anonime: input.noteAnonime ?? null,
        })
        .select("id,user_id,alias_eta,note_anonime,created_at")
        .single(),
    );

    if (error || !data) throw new Error(error?.message || "Errore durante la creazione del paziente");

    return {
      id: data.id,
      userId: data.user_id,
      aliasEta: data.alias_eta,
      noteAnonime: data.note_anonime,
      createdAt: new Date(data.created_at),
    };
  }),
  detail: authedQuery.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
    const { data, error } = await queryAppTable((from) => from("patients").select("id,user_id,alias_eta,note_anonime,created_at").eq("id", input.id).eq("user_id", supabaseUserId).single());
    if (error || !data) throw new Error("Patient not found");
    return { id: data.id, userId: data.user_id, aliasEta: data.alias_eta, noteAnonime: data.note_anonime, createdAt: new Date(data.created_at) };
  }),
  delete: authedQuery.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
    const { error } = await queryAppTable((from) => from("patients").delete().eq("id", input.id).eq("user_id", supabaseUserId));
    if (error) throw new Error(error.message);
    return { success: true };
  }),
});
