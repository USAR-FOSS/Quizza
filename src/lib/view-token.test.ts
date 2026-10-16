import { describe, it, expect } from "vitest";
import { signViewToken, verifyViewToken } from "@/lib/view-token";

describe("view token", () => {
  const sid = "s1", qid = "q1", pid = "p1";

  it("round-trips the issued timestamp", () => {
    const t = 1700000000000;
    const token = signViewToken(sid, qid, pid, t);
    expect(verifyViewToken(token, sid, qid, pid)).toBe(t);
  });

  it("rejects a token for a different question/participant/session", () => {
    const token = signViewToken(sid, qid, pid);
    expect(verifyViewToken(token, "other", qid, pid)).toBeNull();
    expect(verifyViewToken(token, sid, "other", pid)).toBeNull();
    expect(verifyViewToken(token, sid, qid, "other")).toBeNull();
  });

  it("rejects a tampered token", () => {
    const token = signViewToken(sid, qid, pid);
    expect(verifyViewToken(token + "x", sid, qid, pid)).toBeNull();
    expect(verifyViewToken("garbage", sid, qid, pid)).toBeNull();
  });
});
