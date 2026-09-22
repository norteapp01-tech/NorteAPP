import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { TermsOfUse } from "@/components/settings/LegalDocuments";

export const Route = createFileRoute("/termos")({
  head: () => ({ meta: [{ title: "Termos de Uso — Norte" }] }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <main className="norte-page pb-12">
      <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft size={17} /> Norte
      </Link>
      <TermsOfUse />
    </main>
  );
}
