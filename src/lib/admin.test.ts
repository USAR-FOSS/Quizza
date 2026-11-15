import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isUserAdmin } from "./admin-auth.ts";

describe("Platform Admin Privileges", () => {
  const origAdminEmails = process.env.ADMIN_EMAILS;

  it("denies access when user is null or undefined", () => {
    assert.equal(isUserAdmin(null), false);
    assert.equal(isUserAdmin(undefined), false);
  });

  it("grants access when user has admin role in database", () => {
    assert.equal(
      isUserAdmin({
        id: "usr_1",
        email: "regular@quizza.local",
        name: "Admin User",
        avatarUrl: null,
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      true,
    );
  });

  it("denies access for standard host role when not in ADMIN_EMAILS", () => {
    process.env.ADMIN_EMAILS = "root@quizza.local, sysadmin@quizza.local";
    assert.equal(
      isUserAdmin({
        id: "usr_2",
        email: "host@quizza.local",
        name: "Host User",
        avatarUrl: null,
        role: "host",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      false,
    );
  });

  it("grants access when user email matches ADMIN_EMAILS list case-insensitively", () => {
    process.env.ADMIN_EMAILS = "Admin@Quizza.io, Ops-Lead@quizza.io ";
    assert.equal(
      isUserAdmin({
        id: "usr_3",
        email: "ADMIN@quizza.io",
        name: "Env Admin",
        avatarUrl: null,
        role: "host",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      true,
    );
    assert.equal(
      isUserAdmin({
        id: "usr_4",
        email: "ops-lead@quizza.io",
        name: "Ops Lead",
        avatarUrl: null,
        role: "host",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      true,
    );
  });

  it("handles empty or missing ADMIN_EMAILS gracefully", () => {
    delete process.env.ADMIN_EMAILS;
    assert.equal(
      isUserAdmin({
        id: "usr_5",
        email: "someone@quizza.local",
        name: "Someone",
        avatarUrl: null,
        role: "host",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      false,
    );
    process.env.ADMIN_EMAILS = origAdminEmails;
  });
});
