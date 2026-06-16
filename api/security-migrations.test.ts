import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hardeningSql = readFileSync(
  "db/migrations/023_security_hardening.sql",
  "utf8"
);
const passwordResetSql = readFileSync(
  "db/migrations/024_password_reset_audit.sql",
  "utf8"
);
const emailConfirmationSql = readFileSync(
  "db/migrations/025_email_confirmation_audit.sql",
  "utf8"
);

describe("security hardening migration", () => {
  it("does not leave sviluppo as a public default or active plan", () => {
    expect(hardeningSql).toContain("where code = 'sviluppo'");
    expect(hardeningSql).toContain("set active = false");
    expect(hardeningSql).toContain("alter column piano set default 'trial'");
    expect(hardeningSql).toContain("alter column plan set default 'trial'");
  });

  it("blocks direct entitlement and subscription self-writes", () => {
    expect(hardeningSql).toContain("profile_entitlement_fields_admin_only");
    expect(hardeningSql).toContain("subscription_admin_only");
    expect(hardeningSql).toContain(
      'drop policy if exists "sub owner read/write"'
    );
  });

  it("binds generated illustration cache rows to owner and sheet", () => {
    expect(hardeningSql).toContain("owner_user_id uuid");
    expect(hardeningSql).toContain("sheet_id uuid");
    expect(hardeningSql).toContain("idx_illustrations_owner_sheet_cache_key");
  });

  it("adds atomic quota and invitation RPCs while revoking direct user execution", () => {
    expect(hardeningSql).toContain("app.consume_sheet_usage");
    expect(hardeningSql).toContain("usage_counted_admin_only");
    expect(hardeningSql).toContain("app.create_organization_invitation");
    expect(hardeningSql).toContain("app.accept_organization_invitation");
    expect(hardeningSql).toContain(
      "revoke execute on function app.get_usage_pool_owner(uuid)"
    );
    expect(hardeningSql).toContain("team_seat_limit_reached");
    expect(hardeningSql).toContain("invalid_invitation");
  });
});

describe("password reset audit migration", () => {
  it("stores hashed reset identifiers without direct user access", () => {
    expect(passwordResetSql).toContain("app.password_reset_requests");
    expect(passwordResetSql).toContain("email_hash text not null");
    expect(passwordResetSql).toContain("client_ip_hash text not null");
    expect(passwordResetSql).toContain(
      "alter table app.password_reset_requests enable row level security"
    );
    expect(passwordResetSql).toContain(
      "revoke all on table app.password_reset_requests from public, anon, authenticated"
    );
    expect(passwordResetSql).toContain(
      "grant select, insert on table app.password_reset_requests to service_role"
    );
  });
});

describe("email confirmation audit migration", () => {
  it("stores hashed confirmation identifiers without direct user access", () => {
    expect(emailConfirmationSql).toContain("app.email_confirmation_requests");
    expect(emailConfirmationSql).toContain("email_hash text not null");
    expect(emailConfirmationSql).toContain("client_ip_hash text not null");
    expect(emailConfirmationSql).toContain(
      "alter table app.email_confirmation_requests enable row level security"
    );
    expect(emailConfirmationSql).toContain(
      "revoke all on table app.email_confirmation_requests from public, anon, authenticated"
    );
    expect(emailConfirmationSql).toContain(
      "grant select, insert on table app.email_confirmation_requests to service_role"
    );
  });
});
