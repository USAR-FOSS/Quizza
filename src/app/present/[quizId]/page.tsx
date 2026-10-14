import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getQuizForEdit } from "@/lib/actions/quiz";
import { Navbar } from "@/components/site/navbar";
import { Launch } from "@/components/live/launch";

export const metadata = { title: "Launch - quizza" };

async function Loaded({ quizId }: { quizId: string }) {
  const quiz = await getQuizForEdit(quizId);
  if (!quiz) notFound();
  return (
    <Launch quizId={quiz.id} title={quiz.title} questionCount={quiz.questions.length} />
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
        <Suspense fallback={<Loader2 className="size-8 animate-spin text-grape" />}>
          <Resolver params={params} />
        </Suspense>
      </main>
    </>
  );
}
