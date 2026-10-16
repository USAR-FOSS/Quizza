import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getQuizForEdit } from "@/lib/actions/quiz";
import { QuizPreview } from "@/components/builder/quiz-preview";
import { LoadingState } from "@/components/ui/loading-state";
import type { QuizWithQuestions } from "@/lib/db/schema-types";

export const metadata = { title: "Participant preview · Quizza" };
async function Inner({ params }: { params: Promise<{ quizId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { quizId } = await params;
  const quiz = await getQuizForEdit(quizId);
  return <QuizPreview quiz={quiz as QuizWithQuestions} />;
}
export default function PreviewPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  return (
    <Suspense fallback={<LoadingState label="Trying on the player’s shoes…" />}>
      <Inner params={params} />
    </Suspense>
  );
}
