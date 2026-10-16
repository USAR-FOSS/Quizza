"use server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { quizzes } from "@/lib/db/schema";
import { resolveSession } from "@/lib/sessions";

/** Owners can recover control on a new device without exposing keys publicly. */
export async function recoverHostToken(code: string): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const session = await resolveSession(code);
  if (!session) return null;
  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.id, session.quizId),
    columns: { ownerId: true },
  });
  return quiz?.ownerId === user.id ? session.hostToken : null;
}

export async function endOwnedSession(code: string) {
  const token = await recoverHostToken(code);
  if (!token) throw new Error("Only the owner can end this session.");
  const session = await resolveSession(code);
  if (!session || session.status === "ended") return;
  const { sessions } = await import("@/lib/db/schema");
  await db
    .update(sessions)
    .set({ status: "ended", endedAt: new Date() })
    .where(eq(sessions.id, session.id));
  const { publishState } = await import("@/lib/realtime/snapshot");
  await publishState(session.id);
}
