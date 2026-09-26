import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { PrivacyPolicy } from "@/components/settings/LegalDocuments";

export const Route = createFileRoute("/privacidade")({
  head: () => ({ meta: [{ title: "Política de Privacidade — Norte" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="norte-page pb-12">
      <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft size={17} /> Norte
      </Link>
      <PrivacyPolicy />
    </main>
  );
}
