import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api-client";

const progress = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  api: { getProgress: progress },
}));

import { restorePlayerIdentity, savePlayerIdentity } from "./player-identity";

describe("player identity persistence", () => {
  const entries = new Map<string, string>();
  const identity = { clientToken: "token", participantId: "player", nickname: "Pat", avatarColor: "red" };

  beforeEach(() => {
    entries.clear();
    progress.mockReset().mockResolvedValue({ answered: [] });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, value); },
      removeItem: (key: string) => { entries.delete(key); },
    });
  });

  it("stores separately for each session, even when the join code is reused", async () => {
    savePlayerIdentity("session-a", identity);
    expect(await restorePlayerIdentity("123456", "session-b")).toBeNull();
    expect(await restorePlayerIdentity("123456", "session-a")).toEqual(identity);
  });

  it("only migrates a legacy code-keyed identity after the server accepts it", async () => {
    entries.set("quizza:player:123456", JSON.stringify(identity));
    expect(await restorePlayerIdentity("123456", "session-a")).toEqual(identity);
    expect(entries.get("quizza:player:123456")).toBeUndefined();
    expect(entries.has("quizza:player:session-a")).toBe(true);
  });

  it("discards a stale or account-mismatched token", async () => {
    savePlayerIdentity("session-a", identity);
    progress.mockRejectedValue(new ApiClientError(401, "signin_required", "Sign in"));
    expect(await restorePlayerIdentity("123456", "session-a")).toBeNull();
    expect(entries.size).toBe(0);
  });
});
