import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hardeningSql = readFileSync(
  "db/migrations/023_security_hardening.sql",
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
    expect(hardeningSql).toContain(
      "profile_entitlement_fields_admin_only"
    );
    expect(hardeningSql).toContain("subscription_admin_only");
    expect(hardeningSql).toContain("drop policy if exists \"sub owner read/write\"");
  });

  it("binds generated illustration cache rows to owner and sheet", () => {
    expect(hardeningSql).toContain("owner_user_id uuid");
    expect(hardeningSql).toContain("sheet_id uuid");
    expect(hardeningSql).toContain(
      "idx_illustrations_owner_sheet_cache_key"
    );
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
