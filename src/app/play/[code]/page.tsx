import { Suspense } from "react";
import { Loader2 } from "lucide-react";
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
          <Loader2 className="size-8 animate-spin text-grape" />
        </div>
      }
    >
      <Resolved params={params} />
    </Suspense>
  );
}
