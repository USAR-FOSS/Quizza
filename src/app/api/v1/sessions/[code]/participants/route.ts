import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { handle, json, parseBody, enforceRateLimit } from "@/lib/api/http";
import { JoinBody } from "@/lib/api/schemas";
import { joinSession } from "@/lib/sessions";
import { getCurrentUser } from "@/lib/auth";
import { generateToken } from "@/lib/codes";

type Ctx = { params: Promise<{ code: string }> };

export const POST = handle<Ctx>(async (req: NextRequest, { params }) => {
  // Shared school/event Wi-Fi often means hundreds of players share one IP.
  await enforceRateLimit(req, "join", 1_500, 60_000);
  const { code } = await params;
  const body = await parseBody(req, JoinBody);

  const user = await getCurrentUser();

  // A stable device id (for one-per-device participation). Set once, reused.
  const jar = await cookies();
  let deviceId = jar.get("quizza_device")?.value ?? null;
  if (!deviceId) {
    deviceId = generateToken();
    jar.set("quizza_device", deviceId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  const participant = await joinSession(code, body, {
    userId: user?.id ?? null,
    deviceId,
  });
  return json(participant, 201);
});
