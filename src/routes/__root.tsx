import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { WelcomeScreen } from "../components/WelcomeScreen";
import { OnboardingFlow } from "../components/OnboardingFlow";
import { Home, Plus, BarChart3, CalendarDays, CalendarRange } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthGate, SignInScreen } from "../components/AuthGate";
import { hasLinkedAccount } from "../lib/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Essa rota não existe — talvez você tenha pulado um passo.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Voltar para hoje
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo travou aqui</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tenta de novo — se persistir, volta para a tela de hoje.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Tentar de novo
          </button>
          <a href="/" className="rounded-md border border-border bg-surface px-4 py-2 text-sm">
            Ir para hoje
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0F0F0F" },
      { title: "Norte — Agenda Inteligente" },
      {
        name: "description",
        content:
          "Não é só agenda. É um sistema de vida que aprende seus hábitos e te confronta quando você se engana.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="dark">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

type NavItem = { to: string; label: string; icon: typeof Home; primary?: boolean };
const navItems: NavItem[] = [
  { to: "/", label: "Hoje", icon: Home },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/criar", label: "", icon: Plus, primary: true },
  { to: "/planejamento", label: "Plano", icon: CalendarRange },
  { to: "/dashboard", label: "Espelho", icon: BarChart3 },
];

function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-center justify-around px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to;
          if (item.primary) {
            return (
              <Link
                key={item.to}
                to={item.to}
                className="interactive-press -mt-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_28px_-8px_oklch(0.82_0.18_145/0.55)]"
              >
                <Icon className="h-6 w-6" strokeWidth={2.5} />
              </Link>
            );
          }
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`interactive-press flex min-w-16 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] ${active ? "text-primary" : "text-muted-foreground"}`}
            >
              <Icon className="h-5 w-5" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [entered, setEntered] = useState(false);
  const [demo, setDemo] = useState(false);
  const [manualLogin, setManualLogin] = useState(false);

  function markEntered() {
    try {
      sessionStorage.setItem("norte-welcome-entered", "true");
    } catch {
      /* Keep the in-memory choice. */
    }
    setEntered(true);
  }

  /** Uma entrada nova na demo (clicou "Ver o Norte em ação" na vitrine) tem que
   * começar do zero — nunca puxar conversa de uma tentativa anterior de demo, nem
   * de qualquer uso real que essa mesma sessão anônima já tenha tido antes. Isso
   * NÃO roda de novo ao retomar depois do redirect do Google/Apple/e-mail (aquele
   * caso chega com "?onboarding=account" na URL, não passa por aqui), então a
   * conversa da demo continua sobrevivendo até a conta ser criada de verdade. */
  function resetDemoConversation() {
    try {
      const stale = Object.keys(localStorage).filter(
        (key) => key.startsWith("norte-chat:") || key.startsWith("norte-demo-replies:"),
      );
      stale.forEach((key) => localStorage.removeItem(key));
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith("norte-demo-replies:"))
        .forEach((key) => sessionStorage.removeItem(key));
    } catch {
      /* Sem storage disponível — a demo só não vai lembrar de nada, o que já é o objetivo. */
    }
  }

  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("onboarding") === "account") {
        sessionStorage.setItem("norte-onboarding-stage", "account");
      }
      // Quem já tem uma conta real vinculada a este aparelho nunca precisa ver a
      // vitrine de novo — vai direto pro app de verdade, que já sabe pedir login
      // sozinho (AuthGate) se a sessão tiver expirado.
      const returning = hasLinkedAccount();
      setEntered(returning || sessionStorage.getItem("norte-welcome-entered") === "true");
      setDemo(!returning && Boolean(sessionStorage.getItem("norte-onboarding-stage")));
    } catch {
      /* Storage may be unavailable in private browsers. */
    }
  }, []);

  if (pathname === "/" && manualLogin)
    return (
      <SignInScreen
        subtitle="Entre com seu e-mail e senha pra continuar de onde parou."
        onBack={() => setManualLogin(false)}
        onSuccess={() => {
          setManualLogin(false);
          markEntered();
        }}
      />
    );
  if (pathname === "/" && demo)
    return (
      <QueryClientProvider client={queryClient}>
        <div className="mx-auto min-h-svh max-w-md bg-background">
          <OnboardingFlow onBack={() => setDemo(false)} />
        </div>
      </QueryClientProvider>
    );
  if (pathname === "/" && !entered)
    return (
      <WelcomeScreen
        onEnter={() => {
          resetDemoConversation();
          try {
            sessionStorage.setItem("norte-onboarding-stage", "demo");
          } catch {
            /* Keep the in-memory choice. */
          }
          setDemo(true);
        }}
        onLogin={() => setManualLogin(true)}
      />
    );
  // O admin é um painel próprio (desktop-first, sidebar) — nunca herda a casca
  // de app mobile (largura de 448px, navegação inferior) das telas do Norte.
  const isAdmin = pathname.startsWith("/admin");
  return (
    <QueryClientProvider client={queryClient}>
      <div
        className={isAdmin ? "bg-background" : "mx-auto min-h-screen max-w-md bg-background pb-28"}
      >
        <AuthGate>
          <div key={pathname} className={isAdmin ? undefined : "page-enter"}>
            <Outlet />
          </div>
          {!isAdmin && <BottomNav />}
        </AuthGate>
      </div>
    </QueryClientProvider>
  );
}
