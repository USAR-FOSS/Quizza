import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { DemoQuiz } from "@/components/landing/demo-quiz";

export const metadata = { title: "A little test drive · Quizza" };
export default function DemoPage() {
  return (
    <>
      <Navbar />
      <main className="flex flex-1 items-center bg-dots px-5 py-12 sm:py-16">
        <DemoQuiz />
      </main>
      <Footer />
    </>
  );
}
