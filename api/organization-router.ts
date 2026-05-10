import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { appDb, getSupabaseUserIdFromUnionId } from "./lib/db";
import {
  databaseOperationError,
  invalidSessionError,
  userFacingError,
} from "./lib/errors";
import { getAccountContext, requireManager } from "./lib/organization";

function requireSupabaseUserId(unionId: string) {
  const id = getSupabaseUserIdFromUnionId(unionId);
  if (!id) throw invalidSessionError();
  return id;
}

async function getPlanLimit(plan: string) {
  const { data, error } = await appDb()
    .from("subscription_plans")
    .select("sheet_limit")
    .eq("code", plan)
    .eq("active", true)
    .maybeSingle();
  if (error)
    throw databaseOperationError("caricare il limite del piano", error);
  return data?.sheet_limit ?? 5;
}

export const organizationRouter = createRouter({
  overview: authedQuery.query(async ({ ctx }) => {
    const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
    const account = await getAccountContext(supabaseUserId);

    const { data: ownerProfile, error: ownerError } = await appDb()
      .from("profiles")
      .select("id,email,name,piano,seats,trial_schede_usate,schede_mese")
      .eq("id", account.ownerUserId)
      .single();
    if (ownerError || !ownerProfile) {
      throw databaseOperationError("caricare il profilo Manager", ownerError);
    }

    const { data: subscription, error: subscriptionError } = await appDb()
      .from("subscriptions")
      .select("status,plan,seats_count,current_period_end,cancel_at_period_end")
      .eq("user_id", account.ownerUserId)
      .maybeSingle();
    if (subscriptionError)
      throw databaseOperationError(
        "caricare l’abbonamento del team",
        subscriptionError
      );

    const plan = subscription?.plan ?? ownerProfile.piano ?? "trial";
    const limit = await getPlanLimit(plan);
    const used =
      plan === "trial"
        ? (ownerProfile.trial_schede_usate ?? 0)
        : (ownerProfile.schede_mese ?? 0);

    const { data: memberRows, error: memberError } = await appDb()
      .from("seat_assignments")
      .select(
        "member_user_id,created_at,profiles!seat_assignments_member_user_id_fkey(email,name)"
      )
      .eq("owner_user_id", account.ownerUserId)
      .order("created_at", { ascending: false });
    if (memberError)
      throw databaseOperationError("caricare i membri del team", memberError);

    const memberIds = (memberRows ?? []).map(row => row.member_user_id);
    const teamUserIds = [account.ownerUserId, ...memberIds];

    const { count: teamSheetsCount, error: teamCountError } = await appDb()
      .from("sheets")
      .select("id", { count: "exact", head: true })
      .in("user_id", teamUserIds);
    if (teamCountError)
      throw databaseOperationError(
        "contare le schede del team",
        teamCountError
      );

    const { data: recentSheets, error: recentError } = await appDb()
      .from("sheets")
      .select("id,user_id,tipo_output,fonema,interesse,created_at")
      .in("user_id", teamUserIds)
      .order("created_at", { ascending: false })
      .limit(10);
    if (recentError)
      throw databaseOperationError(
        "caricare le schede recenti del team",
        recentError
      );

    const { data: invitations, error: invitationError } = await appDb()
      .from("organization_invitations")
      .select("id,email,status,created_at,accepted_at,revoked_at")
      .eq("owner_user_id", account.ownerUserId)
      .order("created_at", { ascending: false });
    if (invitationError)
      throw databaseOperationError(
        "caricare gli inviti del team",
        invitationError
      );

    return {
      role: account.role,
      owner: {
        id: ownerProfile.id,
        email: ownerProfile.email,
        name: ownerProfile.name,
      },
      subscription: subscription
        ? {
            status: subscription.status,
            plan: subscription.plan,
            seatsCount: subscription.seats_count,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          }
        : null,
      usage: {
        plan,
        limit,
        used,
        remaining: Math.max(limit - used, 0),
        teamSheetsCount: teamSheetsCount ?? 0,
      },
      members: (memberRows ?? []).map(row => {
        const profile = Array.isArray(row.profiles)
          ? row.profiles[0]
          : row.profiles;
        return {
          id: row.member_user_id,
          email: profile?.email ?? "",
          name: profile?.name ?? "Staff",
          createdAt: row.created_at,
        };
      }),
      invitations: (invitations ?? []).map(invitation => ({
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        createdAt: invitation.created_at,
        acceptedAt: invitation.accepted_at,
        revokedAt: invitation.revoked_at,
      })),
      recentSheets: (recentSheets ?? []).map(sheet => ({
        id: sheet.id,
        userId: sheet.user_id,
        tipoOutput: sheet.tipo_output,
        fonema: sheet.fonema,
        interesse: sheet.interesse,
        createdAt: sheet.created_at,
      })),
    };
  }),

  invite: authedQuery
    .input(
      z.object({
        email: z.email().transform(value => value.trim().toLowerCase()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      await requireManager(supabaseUserId);

      if (input.email === ctx.user.email.toLowerCase()) {
        throw userFacingError(
          "BAD_REQUEST",
          "Non puoi invitare il tuo stesso account."
        );
      }

      const { data, error } = await appDb()
        .from("organization_invitations")
        .upsert(
          {
            owner_user_id: supabaseUserId,
            email: input.email,
            status: "pending",
            invited_by_user_id: supabaseUserId,
            accepted_by_user_id: null,
            accepted_at: null,
            revoked_at: null,
          },
          { onConflict: "owner_user_id,email" }
        )
        .select("id,email,status,token,created_at")
        .single();
      if (error || !data)
        throw databaseOperationError("creare l’invito", error);
      return {
        id: data.id,
        email: data.email,
        status: data.status,
        token: data.token,
        createdAt: data.created_at,
      };
    }),

  revokeInvitation: authedQuery
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      await requireManager(supabaseUserId);
      const { error } = await appDb()
        .from("organization_invitations")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("owner_user_id", supabaseUserId);
      if (error) throw databaseOperationError("revocare l’invito", error);
      return { success: true };
    }),

  acceptInvitation: authedQuery
    .input(z.object({ token: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      const account = await getAccountContext(supabaseUserId);
      if (account.role === "staff") {
        throw userFacingError(
          "BAD_REQUEST",
          "Questo account è già collegato a un Manager."
        );
      }

      const { data: invitation, error: invitationError } = await appDb()
        .from("organization_invitations")
        .select("id,owner_user_id,email,status")
        .eq("token", input.token)
        .eq("status", "pending")
        .maybeSingle();
      if (invitationError)
        throw databaseOperationError(
          "caricare gli inviti del team",
          invitationError
        );
      if (!invitation || invitation.email !== ctx.user.email.toLowerCase()) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invito non valido o non più disponibile.",
        });
      }

      const { error: seatError } = await appDb()
        .from("seat_assignments")
        .insert({
          owner_user_id: invitation.owner_user_id,
          member_user_id: supabaseUserId,
        });
      if (seatError)
        throw databaseOperationError(
          "collegare l’account al Manager",
          seatError
        );

      const now = new Date().toISOString();
      const { error: updateError } = await appDb()
        .from("organization_invitations")
        .update({
          status: "accepted",
          accepted_by_user_id: supabaseUserId,
          accepted_at: now,
        })
        .eq("id", invitation.id);
      if (updateError)
        throw databaseOperationError(
          "aggiornare lo stato dell’invito",
          updateError
        );
      return { success: true };
    }),

  removeMember: authedQuery
    .input(z.object({ memberUserId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      await requireManager(supabaseUserId);
      const { error } = await appDb()
        .from("seat_assignments")
        .delete()
        .eq("owner_user_id", supabaseUserId)
        .eq("member_user_id", input.memberUserId);
      if (error)
        throw databaseOperationError("rimuovere il membro dal team", error);
      return { success: true };
    }),
});
