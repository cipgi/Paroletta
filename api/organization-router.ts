import { TRPCError } from "@trpc/server";
import { TeamLimits } from "@contracts/constants";
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { adminAppDb, appDb, getSupabaseUserIdFromUnionId } from "./lib/db";
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

async function getPlanLimit(plan: string, accessToken?: string) {
  const { data, error } = await appDb(accessToken)
    .from("subscription_plans")
    .select("sheet_limit")
    .eq("code", plan)
    .eq("active", true)
    .maybeSingle();
  if (error)
    throw databaseOperationError("caricare il limite del piano", error);
  return data?.sheet_limit ?? 5;
}

async function getSeatCapacity(ownerUserId: string, accessToken?: string) {
  const { data: subscription, error: subscriptionError } = await appDb(
    accessToken
  )
    .from("subscriptions")
    .select("seats_count")
    .eq("user_id", ownerUserId)
    .maybeSingle();
  if (subscriptionError)
    throw databaseOperationError(
      "verificare i posti disponibili del team",
      subscriptionError
    );

  if (subscription?.seats_count) {
    return Math.min(subscription.seats_count, TeamLimits.maxSeats);
  }

  const { data: profile, error: profileError } = await appDb(accessToken)
    .from("profiles")
    .select("seats")
    .eq("id", ownerUserId)
    .single();
  if (profileError || !profile) {
    throw databaseOperationError(
      "verificare i posti disponibili del profilo",
      profileError
    );
  }

  return profile.seats ?? 1;
}

async function getTeamOccupancy(ownerUserId: string, accessToken?: string) {
  const { count: membersCount, error: membersError } = await appDb(accessToken)
    .from("seat_assignments")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", ownerUserId);
  if (membersError)
    throw databaseOperationError("contare i membri del team", membersError);

  const { count: pendingInvitationsCount, error: invitationsError } =
    await appDb(accessToken)
      .from("organization_invitations")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", ownerUserId)
      .eq("status", "pending");
  if (invitationsError)
    throw databaseOperationError(
      "contare gli inviti pendenti del team",
      invitationsError
    );

  return {
    membersCount: membersCount ?? 0,
    pendingInvitationsCount: pendingInvitationsCount ?? 0,
  };
}

async function assertTeamHasSeat(
  ownerUserId: string,
  options: { includePendingInvitations: boolean },
  accessToken?: string
) {
  const seatsCount = await getSeatCapacity(ownerUserId, accessToken);
  const { membersCount, pendingInvitationsCount } = await getTeamOccupancy(
    ownerUserId,
    accessToken
  );
  const occupiedSeats =
    1 +
    membersCount +
    (options.includePendingInvitations ? pendingInvitationsCount : 0);

  if (occupiedSeats >= seatsCount) {
    throw userFacingError(
      "FORBIDDEN",
      `Non ci sono posti disponibili nel team (${occupiedSeats}/${seatsCount}). Ogni team può includere al massimo ${TeamLimits.maxStaffAccounts} account staff oltre al Manager.`
    );
  }
}

export const organizationRouter = createRouter({
  overview: authedQuery.query(async ({ ctx }) => {
    const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
    const account = await getAccountContext(
      supabaseUserId,
      ctx.supabaseAccessToken
    );
    const db = appDb(ctx.supabaseAccessToken);

    const { data: dbOwnerProfile, error: ownerError } = await db
      .from("profiles")
      .select("id,email,name,piano,seats,trial_schede_usate,schede_mese")
      .eq("id", account.ownerUserId)
      .maybeSingle();
    if (ownerError) {
      throw databaseOperationError("caricare il profilo Manager", ownerError);
    }

    // Some older authenticated accounts may predate the profile trigger or have
    // an out-of-sync app profile. Keep the management overview available for
    // the current standalone user instead of failing on a missing row.
    const ownerProfile =
      dbOwnerProfile ??
      (account.ownerUserId === supabaseUserId
        ? {
            id: supabaseUserId,
            email: ctx.user.email,
            name: ctx.user.name,
            piano: ctx.user.piano ?? "trial",
            seats: ctx.user.seats ?? 1,
            trial_schede_usate: ctx.user.trialSchedeUsate ?? 0,
            schede_mese: ctx.user.schedeMese ?? 0,
          }
        : null);

    if (!ownerProfile) {
      throw databaseOperationError("caricare il profilo Manager");
    }

    const { data: subscription, error: subscriptionError } = await db
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
    const limit = await getPlanLimit(plan, ctx.supabaseAccessToken);
    const used =
      plan === "trial"
        ? (ownerProfile.trial_schede_usate ?? 0)
        : (ownerProfile.schede_mese ?? 0);

    const { data: memberRows, error: memberError } = await db
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

    const { count: teamSheetsCount, error: teamCountError } = await db
      .from("sheets")
      .select("id", { count: "exact", head: true })
      .in("user_id", teamUserIds);
    if (teamCountError)
      throw databaseOperationError(
        "contare le schede del team",
        teamCountError
      );

    const { data: recentSheets, error: recentError } = await db
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

    const { data: invitations, error: invitationError } = await db
      .from("organization_invitations")
      .select("id,email,token,status,created_at,accepted_at,revoked_at")
      .eq("owner_user_id", account.ownerUserId)
      .order("created_at", { ascending: false });
    if (invitationError)
      throw databaseOperationError(
        "caricare gli inviti del team",
        invitationError
      );

    const { data: receivedInvitations, error: receivedInvitationError } =
      await db
        .from("organization_invitations")
        .select(
          "id,email,token,status,created_at,profiles!organization_invitations_owner_user_id_fkey(id,email,name)"
        )
        .eq("email", ctx.user.email.toLowerCase())
        .eq("status", "pending")
        .order("created_at", { ascending: false });
    if (receivedInvitationError)
      throw databaseOperationError(
        "caricare gli inviti ricevuti",
        receivedInvitationError
      );

    const seatsCount = Math.min(
      subscription?.seats_count ?? ownerProfile.seats ?? 1,
      TeamLimits.maxSeats
    );
    const pendingInvitationsCount = (invitations ?? []).filter(
      invitation => invitation.status === "pending"
    ).length;

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
      seats: {
        total: seatsCount,
        used: 1 + memberIds.length,
        pending: pendingInvitationsCount,
        available: Math.max(
          seatsCount - 1 - memberIds.length - pendingInvitationsCount,
          0
        ),
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
        token: account.role === "manager" ? invitation.token : undefined,
        status: invitation.status,
        createdAt: invitation.created_at,
        acceptedAt: invitation.accepted_at,
        revokedAt: invitation.revoked_at,
      })),
      receivedInvitations: (receivedInvitations ?? []).map(invitation => {
        const owner = Array.isArray(invitation.profiles)
          ? invitation.profiles[0]
          : invitation.profiles;
        return {
          id: invitation.id,
          token: invitation.token,
          status: invitation.status,
          createdAt: invitation.created_at,
          owner: {
            id: owner?.id ?? "",
            email: owner?.email ?? "",
            name: owner?.name ?? "Team",
          },
        };
      }),
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
      await requireManager(supabaseUserId, ctx.supabaseAccessToken);

      if (input.email === ctx.user.email.toLowerCase()) {
        throw userFacingError(
          "BAD_REQUEST",
          "Non puoi invitare il tuo stesso account."
        );
      }

      const { data: invitedProfile, error: invitedProfileError } =
        await adminAppDb()
          .from("profiles")
          .select("id,email,is_team_manager")
          .eq("email", input.email)
          .maybeSingle();
      if (invitedProfileError)
        throw databaseOperationError(
          "verificare l’account invitato",
          invitedProfileError
        );
      if (!invitedProfile) {
        throw userFacingError(
          "NOT_FOUND",
          "Puoi invitare solo email già registrate e con accesso a Paroletta."
        );
      }
      if (invitedProfile.is_team_manager) {
        throw userFacingError(
          "BAD_REQUEST",
          "Questo account è già impostato come Manager di un team."
        );
      }

      const { data: invitedSeat, error: invitedSeatError } = await adminAppDb()
        .from("seat_assignments")
        .select("id")
        .eq("member_user_id", invitedProfile.id)
        .maybeSingle();
      if (invitedSeatError)
        throw databaseOperationError(
          "verificare il team dell’account invitato",
          invitedSeatError
        );
      if (invitedSeat) {
        throw userFacingError(
          "BAD_REQUEST",
          "Questo account appartiene già a un team."
        );
      }

      await assertTeamHasSeat(
        supabaseUserId,
        {
          includePendingInvitations: true,
        },
        ctx.supabaseAccessToken
      );

      const { data, error } = await appDb(ctx.supabaseAccessToken)
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
      await requireManager(supabaseUserId, ctx.supabaseAccessToken);
      const { error } = await appDb(ctx.supabaseAccessToken)
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
      const account = await getAccountContext(
        supabaseUserId,
        ctx.supabaseAccessToken
      );
      if (account.role === "staff") {
        throw userFacingError(
          "BAD_REQUEST",
          "Questo account è già collegato a un Manager."
        );
      }

      const { data: invitation, error: invitationError } = await appDb(
        ctx.supabaseAccessToken
      )
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

      await assertTeamHasSeat(
        invitation.owner_user_id,
        {
          includePendingInvitations: false,
        },
        ctx.supabaseAccessToken
      );

      const { error: seatError } = await appDb(ctx.supabaseAccessToken)
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
      const { error: updateError } = await appDb(ctx.supabaseAccessToken)
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
      await requireManager(supabaseUserId, ctx.supabaseAccessToken);
      const { error } = await appDb(ctx.supabaseAccessToken)
        .from("seat_assignments")
        .delete()
        .eq("owner_user_id", supabaseUserId)
        .eq("member_user_id", input.memberUserId);
      if (error)
        throw databaseOperationError("rimuovere il membro dal team", error);
      return { success: true };
    }),
});
