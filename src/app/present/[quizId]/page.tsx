import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { LoadingState } from "@/components/ui/loading-state";
import { getQuizForEdit } from "@/lib/actions/quiz";
import { getCurrentUser } from "@/lib/auth";
import { Navbar } from "@/components/site/navbar";
import { Launch } from "@/components/live/launch";

export const metadata = { title: "Launch - quizza" };

async function Loaded({ quizId }: { quizId: string }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const quiz = await getQuizForEdit(quizId);
  if (!quiz) notFound();
  if (quiz.ownerId && quiz.ownerId !== user.id) redirect("/dashboard");
  return (
    <Launch
      quizId={quiz.id}
      title={quiz.title}
      questionCount={quiz.questions.length}
    />
  );
}

async function Resolver({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  return <Loaded quizId={quizId} />;
}

export default function PresentPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  return (
    <>
      <Navbar />
      <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-dots px-5 py-12">
        <Suspense fallback={<LoadingState label="Warming up your room…" />}>
          <Resolver params={params} />
        </Suspense>
      </main>
    </>
  );
}
