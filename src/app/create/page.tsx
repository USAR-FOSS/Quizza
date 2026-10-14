import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
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
        <Suspense fallback={<Loader2 className="size-8 animate-spin text-grape" />}>
          <Gate />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
