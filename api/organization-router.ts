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
import { getUsageSummary } from "./lib/subscription";

function requireSupabaseUserId(unionId: string) {
  const id = getSupabaseUserIdFromUnionId(unionId);
  if (!id) throw invalidSessionError();
  return id;
}

type RpcClient = {
  rpc(
    functionName: string,
    args: Record<string, unknown>
  ): Promise<{ data: unknown; error: unknown }>;
};

function getDatabaseErrorText(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const fields = ["message", "details", "hint", "code"] as const;
  return fields
    .map(field => {
      const value = error[field as keyof typeof error];
      return typeof value === "string" ? value : "";
    })
    .join(" ");
}

function isDatabaseSignal(error: unknown, signal: string) {
  return getDatabaseErrorText(error).includes(signal);
}

function teamSeatLimitError() {
  return userFacingError(
    "FORBIDDEN",
    `Non ci sono posti disponibili nel team. Ogni team può includere al massimo ${TeamLimits.maxStaffAccounts} account staff oltre al Manager.`
  );
}

function teamPlanMismatchError() {
  return userFacingError(
    "BAD_REQUEST",
    "Puoi collegare al team solo account con lo stesso piano del Manager. Un team deve essere composto interamente da Starter, Pro o Max."
  );
}

async function createInvitationAtomically(params: {
  ownerUserId: string;
  email: string;
}) {
  const rpc = adminAppDb() as unknown as RpcClient;
  const { data, error } = await rpc.rpc("create_organization_invitation", {
    owner_id: params.ownerUserId,
    invited_email: params.email,
    invited_by_id: params.ownerUserId,
  });
  if (error) {
    if (isDatabaseSignal(error, "team_seat_limit_reached")) {
      throw teamSeatLimitError();
    }
    if (isDatabaseSignal(error, "team_plan_mismatch")) {
      throw teamPlanMismatchError();
    }
    throw databaseOperationError("creare l’invito", error);
  }

  const invitation = Array.isArray(data) ? data[0] : data;
  if (!invitation || typeof invitation !== "object") {
    throw databaseOperationError("creare l’invito");
  }
  return invitation as {
    id: string;
    email: string;
    status: string;
    token: string;
    created_at: string;
  };
}

async function acceptInvitationAtomically(params: {
  token: string;
  userId: string;
  email: string;
}) {
  const rpc = adminAppDb() as unknown as RpcClient;
  const { error } = await rpc.rpc("accept_organization_invitation", {
    invitation_token: params.token,
    recipient_user_id: params.userId,
    recipient_email: params.email,
  });
  if (error) {
    if (
      isDatabaseSignal(error, "invalid_invitation") ||
      isDatabaseSignal(error, "invitation_email_mismatch")
    ) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Invito non valido o non più disponibile.",
      });
    }
    if (isDatabaseSignal(error, "team_seat_limit_reached")) {
      throw teamSeatLimitError();
    }
    if (isDatabaseSignal(error, "team_plan_mismatch")) {
      throw teamPlanMismatchError();
    }
    if (isDatabaseSignal(error, "account_already_in_team")) {
      throw userFacingError(
        "BAD_REQUEST",
        "Questo account appartiene già a un team."
      );
    }
    throw databaseOperationError("accettare l’invito", error);
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
      .select(
        "id,email,name,piano,seats,trial_schede_usate,schede_mese,trial_immagini_usate,immagini_mese"
      )
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
            trial_immagini_usate: ctx.user.trialImmaginiUsate ?? 0,
            immagini_mese: ctx.user.immaginiMese ?? 0,
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
    const usage = await getUsageSummary({
      ownerUserId: account.ownerUserId,
      plan,
      accessToken: ctx.supabaseAccessToken,
    });

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

    let invitations: Array<{
      id: string;
      email: string;
      token: string;
      status: string;
      created_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
    }> = [];

    // Only managers need the full sent-invitation list. Staff and standalone
    // users should not depend on team-invitation read permissions just to open
    // the Gestione page. Use the signed-in user's token so RLS validates the
    // manager-scoped read without requiring the service-role admin client.
    if (account.role === "manager") {
      const { data, error: invitationError } = await db
        .from("organization_invitations")
        .select("id,email,token,status,created_at,accepted_at,revoked_at")
        .eq("owner_user_id", account.ownerUserId)
        .order("created_at", { ascending: false });
      if (invitationError)
        throw databaseOperationError(
          "caricare gli inviti del team",
          invitationError
        );
      invitations = data ?? [];
    }

    // Received invites are scoped to the authenticated user's verified email by
    // RLS. Use the signed-in user's token here so opening Gestione does not
    // depend on elevated service-role access to the custom `app` schema.
    const { data: receivedInvitations, error: receivedInvitationError } =
      await db
        .from("organization_invitations")
        .select("id,owner_user_id,token,status,created_at")
        .eq("email", ctx.user.email.toLowerCase())
        .eq("status", "pending")
        .order("created_at", { ascending: false });
    if (receivedInvitationError)
      throw databaseOperationError(
        "caricare gli inviti ricevuti",
        receivedInvitationError
      );

    const receivedInvitationOwnerIds = [
      ...new Set(
        (receivedInvitations ?? []).map(invitation => invitation.owner_user_id)
      ),
    ];
    const receivedInvitationOwners = new Map<
      string,
      { id: string; email: string | null; name: string | null }
    >();

    if (receivedInvitationOwnerIds.length > 0) {
      const { data: ownerProfiles, error: ownerProfilesError } = await db
        .from("profiles")
        .select("id,email,name")
        .in("id", receivedInvitationOwnerIds);
      if (ownerProfilesError)
        throw databaseOperationError(
          "caricare i Manager degli inviti ricevuti",
          ownerProfilesError
        );

      for (const ownerProfile of ownerProfiles ?? []) {
        receivedInvitationOwners.set(ownerProfile.id, ownerProfile);
      }
    }

    const seatsCount = Math.min(
      subscription?.seats_count ?? ownerProfile.seats ?? 1,
      TeamLimits.maxSeats
    );
    const pendingInvitationsCount = (invitations ?? []).filter(
      invitation => invitation.status === "pending"
    ).length;
    const receivedInvitationsCount = receivedInvitations?.length ?? 0;
    const hasTeamContext =
      account.role === "staff" ||
      seatsCount > 1 ||
      memberIds.length > 0 ||
      pendingInvitationsCount > 0 ||
      receivedInvitationsCount > 0;

    return {
      role: account.role,
      hasTeamContext,
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
        limit: usage.sheets.limit,
        used: usage.sheets.used,
        remaining: usage.sheets.remaining,
        sheets: usage.sheets,
        images: usage.images,
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
        const owner = receivedInvitationOwners.get(invitation.owner_user_id);
        return {
          id: invitation.id,
          token: invitation.token,
          status: invitation.status,
          createdAt: invitation.created_at,
          owner: {
            id: owner?.id ?? invitation.owner_user_id,
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
          .select("id,email,is_team_manager,piano")
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

      const data = await createInvitationAtomically({
        ownerUserId: supabaseUserId,
        email: input.email,
      });
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
      const { error } = await adminAppDb()
        .from("organization_invitations")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("owner_user_id", supabaseUserId)
        .eq("status", "pending");
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

      await acceptInvitationAtomically({
        token: input.token,
        userId: supabaseUserId,
        email: ctx.user.email.toLowerCase(),
      });
      return { success: true };
    }),

  removeMember: authedQuery
    .input(z.object({ memberUserId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      await requireManager(supabaseUserId, ctx.supabaseAccessToken);
      const { error } = await adminAppDb()
        .from("seat_assignments")
        .delete()
        .eq("owner_user_id", supabaseUserId)
        .eq("member_user_id", input.memberUserId);
      if (error)
        throw databaseOperationError("rimuovere il membro dal team", error);
      return { success: true };
    }),

  leaveTeam: authedQuery.mutation(async ({ ctx }) => {
    const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
    const account = await getAccountContext(
      supabaseUserId,
      ctx.supabaseAccessToken
    );
    if (account.role !== "staff") {
      throw userFacingError(
        "BAD_REQUEST",
        "Solo un membro staff può uscire da un team."
      );
    }

    const { error } = await adminAppDb()
      .from("seat_assignments")
      .delete()
      .eq("owner_user_id", account.ownerUserId)
      .eq("member_user_id", supabaseUserId);
    if (error) throw databaseOperationError("uscire dal team", error);
    return { success: true };
  }),
});
