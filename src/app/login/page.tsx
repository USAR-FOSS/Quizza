import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Sign in - quizza" };

function safeNext(next: string | undefined): string | undefined {
  // internal paths only, never an open redirect
  return next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
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
  return <AuthForm initialError={error} next={dest} />;
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
        <Suspense fallback={<Loader2 className="size-8 animate-spin text-grape" />}>
          <Inner searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}
