import { createRouter, authedQuery } from "./middleware";
import { z } from "zod";
import { getSupabaseUserIdFromUnionId } from "./lib/db";
import { supabase } from "./lib/supabase";

type PatientRow = {
  id: string;
  user_id: string;
  alias_eta: string | null;
  note_anonime: string | null;
  created_at: string;
};

function requireSupabaseUserId(unionId: string) {
  const id = getSupabaseUserIdFromUnionId(unionId);
  if (!id) throw new Error("Utente Supabase non valido");
  return id;
}

export const patientsRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
    const { data, error } = await supabase.rpc("app_patients_list", {
      p_user_id: supabaseUserId,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as PatientRow[]).map(p => ({
      id: p.id,
      userId: p.user_id,
      aliasEta: p.alias_eta,
      noteAnonime: p.note_anonime,
      createdAt: new Date(p.created_at),
    }));
  }),
  create: authedQuery
    .input(
      z.object({
        aliasEta: z
          .string()
          .trim()
          .min(1, "Il nome del paziente è obbligatorio")
          .max(50),
        noteAnonime: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      const { data, error } = await supabase.rpc("app_patients_create", {
        p_user_id: supabaseUserId,
        p_alias_eta: input.aliasEta,
        p_note_anonime: input.noteAnonime ?? null,
      });

      const created = (data as PatientRow[] | null)?.[0];
      if (error || !created)
        throw new Error(
          error?.message || "Errore durante la creazione del paziente"
        );

      return {
        id: created.id,
        userId: created.user_id,
        aliasEta: created.alias_eta,
        noteAnonime: created.note_anonime,
        createdAt: new Date(created.created_at),
      };
    }),
  detail: authedQuery
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      const { data, error } = await supabase.rpc("app_patients_detail", {
        p_user_id: supabaseUserId,
        p_id: input.id,
      });
      const patient = (data as PatientRow[] | null)?.[0];
      if (error || !patient) throw new Error("Patient not found");
      return {
        id: patient.id,
        userId: patient.user_id,
        aliasEta: patient.alias_eta,
        noteAnonime: patient.note_anonime,
        createdAt: new Date(patient.created_at),
      };
    }),
  delete: authedQuery
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      const { data, error } = await supabase.rpc("app_patients_delete", {
        p_user_id: supabaseUserId,
        p_id: input.id,
      });
      if (error) throw new Error(error.message);
      return { success: Boolean(data) };
    }),
});
