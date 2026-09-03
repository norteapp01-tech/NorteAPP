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
import { useEffect, type ReactNode } from "react";
import { Home, Plus, BarChart3, CalendarDays, CalendarRange } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthGate } from "../components/AuthGate";

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
                className="-mt-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_28px_-8px_oklch(0.82_0.18_145/0.55)] transition-transform active:scale-95"
              >
                <Icon className="h-6 w-6" strokeWidth={2.5} />
              </Link>
            );
          }
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex min-w-16 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}
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
  return (
    <QueryClientProvider client={queryClient}>
      <div className="mx-auto min-h-screen max-w-md bg-background pb-28">
        <AuthGate>
          <Outlet />
          <BottomNav />
        </AuthGate>
      </div>
    </QueryClientProvider>
  );
}
