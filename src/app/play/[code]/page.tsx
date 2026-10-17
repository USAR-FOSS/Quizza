import { Suspense } from "react";
import { LoadingState } from "@/components/ui/loading-state";
import { Player } from "@/components/live/player";

export const metadata = { title: "Play - quizza" };

async function Resolved({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Player code={code} />;
}

export default function PlayPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper">
          <LoadingState label="Loading room…" />
        </div>
      }
    >
      <Resolved params={params} />
    </Suspense>
  );
}
