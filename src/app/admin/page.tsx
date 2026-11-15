import { redirect } from "next/navigation";
import { getCurrentUser, isUserAdmin } from "@/lib/auth";
import { AdminOverviewClient } from "@/components/admin/admin-overview";
import { QuizBuddy } from "@/components/ui/quiz-buddy";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Platform Administration · Quizza",
};

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/admin");
  }

  if (!isUserAdmin(user)) {
    return (
      <main className="page-enter mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
        <QuizBuddy mood="thinking" />
        <p className="eyebrow mt-4 text-coral">Access Restricted</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">
          Admin privileges required
        </h1>
        <p className="mb-7 mt-3 text-ink-soft">
          Your account ({user.email || user.name}) does not have administrative access.
          Contact your platform administrator or configure ADMIN_EMAILS.
        </p>
        <Button href="/dashboard">Back to Dashboard</Button>
      </main>
    );
  }

  return <AdminOverviewClient />;
}
