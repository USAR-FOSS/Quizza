import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getQuizForEdit } from "@/lib/actions/quiz";
import { Builder } from "@/components/builder/builder";
import type { QuizWithQuestions } from "@/lib/db/schema-types";

export const metadata = { title: "Builder - quizza" };

async function Loaded({ quizId }: { quizId: string }) {
  const quiz = await getQuizForEdit(quizId);
  if (!quiz) notFound();
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
      <Loader2 className="size-8 animate-spin text-grape" />
    </div>
  );
}
