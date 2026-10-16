import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { LoadingState } from "@/components/ui/loading-state";
import { getQuizForEdit } from "@/lib/actions/quiz";
import { getCurrentUser } from "@/lib/auth";
import { Builder } from "@/components/builder/builder";
import type { QuizWithQuestions } from "@/lib/db/schema-types";

export const metadata = { title: "Builder - quizza" };

async function Loaded({ quizId }: { quizId: string }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const quiz = await getQuizForEdit(quizId);
  if (!quiz) notFound();
  if (quiz.ownerId && quiz.ownerId !== user.id) redirect("/dashboard");
  return <Builder initial={quiz as unknown as QuizWithQuestions} />;
}

export default function BuildPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  return (
    <Suspense fallback={<BuilderSkeleton />}>
      <Resolver params={params} />
    </Suspense>
  );
}

async function Resolver({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  return <Loaded quizId={quizId} />;
}

function BuilderSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-2">
      <LoadingState label="Opening your question workshop…" />
    </div>
  );
}
