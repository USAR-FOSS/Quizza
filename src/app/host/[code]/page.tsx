import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Host } from "@/components/live/host";

export const metadata = { title: "Host - quizza" };

async function Resolved({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Host code={code} />;
}

export default function HostPage({
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
