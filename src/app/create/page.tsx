import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoadingState } from "@/components/ui/loading-state";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { NewQuizForm } from "@/components/builder/new-quiz-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Create a quiz - quizza" };

async function Gate() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <NewQuizForm />;
}

export default function CreatePage() {
  return (
    <>
      <Navbar />
      <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-dots px-5 py-16">
        <Suspense
          fallback={<LoadingState label="Making room for your next idea…" />}
        >
          <Gate />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
