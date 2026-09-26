import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/excluir-conta")({
  head: () => ({ meta: [{ title: "Solicitar exclusão de conta — Norte" }] }),
  component: DeleteRequestPage,
});

function DeleteRequestPage() {
  return (
    <main className="norte-page space-y-5 pb-12 text-sm leading-relaxed">
      <Link to="/" className="inline-flex items-center gap-1 text-muted-foreground">
        <ChevronLeft size={17} /> Norte
      </Link>
      <h1 className="text-2xl font-bold">Excluir sua conta e seus dados</h1>
      <p className="text-muted-foreground">
        No aplicativo, abra Configurações → Dados e privacidade → Excluir permanentemente. Se não
        consegue acessar sua conta, solicite a exclusão pelo e-mail abaixo, informando o endereço
        usado no cadastro. Confirmaremos sua identidade antes de executar o pedido.
      </p>
      <a
        className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
        href="mailto:Norteapp01@gmail.com?subject=Exclus%C3%A3o%20de%20conta%20Norte"
      >
        Solicitar exclusão por e-mail
      </a>
      <p className="text-muted-foreground">
        O conteúdo vinculado à conta é removido, ressalvados registros que precisem ser guardados
        por obrigação legal ou exercício de direitos. Assinaturas feitas em lojas ou provedores de
        pagamento devem ser canceladas separadamente.
      </p>
      <Link to="/privacidade" className="text-primary underline underline-offset-4">
        Ler Política de Privacidade
      </Link>
    </main>
  );
}
