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
import { hasLinkedAccount, supabase } from "../lib/supabase/client";
import { SportRecorderProvider } from "../lib/sport-recorder-context";
import { ActiveRecordingBar } from "../components/esportes/ActiveRecordingBar";
import { GymSessionProvider } from "../lib/gym-session-context";
import { WorkoutBubble } from "../components/academia/WorkoutBubble";
import { themeBootScript } from "../lib/theme";

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
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
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
  // A gravação é uma tela cheia dedicada — o nav fixo no rodapé cobria
  // exatamente a fileira de Pausar/Continuar/Finalizar por cima.
  if (pathname === "/esportes/gravar") return null;
  return (
    <nav aria-label="Navegação principal" className="norte-bottom-nav">
      <div className="norte-bottom-nav-items">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to;
          if (item.primary) {
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-label="Adicionar"
                className="interactive-press norte-create-button"
              >
                <Icon className="h-6 w-6" strokeWidth={2.5} />
              </Link>
            );
          }
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={`interactive-press flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[11px] ${active ? "text-primary" : "text-muted-foreground"}`}
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
  const [recovering, setRecovering] = useState(false);

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
      const authReturn = new URLSearchParams(window.location.search).get("auth");
      if (authReturn === "login") setManualLogin(true);
      if (authReturn === "recovery") setRecovering(true);
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

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("auth") !== "login") return;
    let cancelled = false;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled || !data.session || data.session.user.is_anonymous) return;
        try {
          localStorage.setItem("norte_has_account", "1");
        } catch {
          /* Continue in this tab even when storage is unavailable. */
        }
        const url = new URL(window.location.href);
        url.searchParams.delete("auth");
        window.history.replaceState(
          window.history.state,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
        setManualLogin(false);
        setDemo(false);
        markEntered();
      })
      .catch(() => {
        /* Keep the login panel available if the callback could not be verified. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function closeRecovery() {
    const url = new URL(window.location.href);
    url.searchParams.delete("auth");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    setRecovering(false);
  }

  function enterDemo() {
    resetDemoConversation();
    try {
      sessionStorage.setItem("norte-onboarding-stage", "demo");
    } catch {
      /* Keep the in-memory choice. */
    }
    setDemo(true);
  }

  if (pathname === "/" && recovering)
    return (
      <>
        <WelcomeScreen onEnter={enterDemo} onLogin={() => setManualLogin(true)} />
        <SignInScreen
          recovery
          showBackdrop={false}
          onBack={() => {
            closeRecovery();
            setManualLogin(true);
          }}
          onSuccess={() => {
            closeRecovery();
            setManualLogin(false);
            setDemo(false);
            markEntered();
          }}
        />
      </>
    );

  if (pathname === "/" && manualLogin)
    return (
      <>
        <WelcomeScreen onEnter={enterDemo} onLogin={() => setManualLogin(true)} />
        <SignInScreen
          showBackdrop={false}
          subtitle="Use o mesmo método com que criou sua conta para continuar de onde parou."
          onBack={() => setManualLogin(false)}
          onSuccess={() => {
            setManualLogin(false);
            setDemo(false);
            markEntered();
          }}
        />
      </>
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
    return <WelcomeScreen onEnter={enterDemo} onLogin={() => setManualLogin(true)} />;
  const isFullScreenRoute = pathname === "/esportes/gravar";

  return (
    <QueryClientProvider client={queryClient}>
      <div
        className={`norte-app mx-auto min-h-screen max-w-md bg-background ${isFullScreenRoute ? "" : "pb-28"}`}
      >
        <AuthGate>
          <SportRecorderProvider>
            {/* Bolha e painel ficam FORA do `div key={pathname}` de propósito:
                é isso que os mantém montados ao trocar de tela, em vez de
                remontar (e perder o painel aberto) a cada navegação. */}
            <GymSessionProvider>
              <div key={pathname} className="page-enter">
                <Outlet />
              </div>
              <ActiveRecordingBar />
              {/* Depois do nav: bolha e painel são controle de algo em curso e
                  não podem ficar enterrados sob a navegação, que é fixa e
                  ocupa a mesma camada. */}
              <BottomNav />
              <WorkoutBubble />
            </GymSessionProvider>
          </SportRecorderProvider>
        </AuthGate>
      </div>
    </QueryClientProvider>
  );
}
