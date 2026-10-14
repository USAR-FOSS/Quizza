import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { NewQuizForm } from "@/components/builder/new-quiz-form";

export const metadata = { title: "Create a quiz - quizza" };

export default function CreatePage() {
  return (
    <>
      <Navbar />
      <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-dots px-5 py-16">
        <NewQuizForm />
      </main>
      <Footer />
    </>
  );
}
