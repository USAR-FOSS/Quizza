import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ResultsView } from "@/components/live/results-view";

export const metadata = { title: "Results - quizza" };

async function Resolved({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ResultsView code={code} />;
}

export default function ResultsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper-2">
          <Loader2 className="size-8 animate-spin text-grape" />
        </div>
      }
    >
      <Resolved params={params} />
    </Suspense>
  );
}
