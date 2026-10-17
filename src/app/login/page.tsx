import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoadingState } from "@/components/ui/loading-state";
import { Navbar } from "@/components/site/navbar";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser, oidcEnabled } from "@/lib/auth";

export const metadata = { title: "Sign in - quizza" };

function safeNext(next: string | undefined): string | undefined {
  // internal paths only, never an open redirect
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
    ? next
    : undefined;
}

async function Inner({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const dest = safeNext(next);
  const user = await getCurrentUser();
  if (user) redirect(dest ?? "/dashboard");
  return (
    <AuthForm initialError={error} next={dest} oidcAvailable={oidcEnabled()} />
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  return (
    <>
      <Navbar />
      <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-dots px-5 py-12">
        <Suspense fallback={<LoadingState label="Making yourself at home…" />}>
          <Inner searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}
