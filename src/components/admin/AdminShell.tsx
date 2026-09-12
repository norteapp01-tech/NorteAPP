import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Compass, LayoutDashboard, Cpu } from "lucide-react";
import { useIsAdmin } from "@/lib/admin/access";

const navItems = [
  { to: "/admin", label: "Visão geral", icon: LayoutDashboard },
  { to: "/admin/ia", label: "Economia da IA", icon: Cpu },
];

/** Layout do Norte Admin — reaproveita os tokens do app (fundo escuro,
 * superfícies grafite, verde de destaque, Inter, raio 1rem). Nunca renderiza
 * conteúdo antes de confirmar acesso: acesso negado nunca mostra dado real. */
export function AdminShell({ children }: { children: ReactNode }) {
  const { isAdmin, role, loading } = useIsAdmin();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-pulse rounded-full bg-primary/40" aria-hidden="true" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Compass className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-lg font-bold">Acesso restrito</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Essa área é só para administradores do Norte. Se isso é um engano, peça a alguém da equipe
          pra te adicionar em admin_memberships.
        </p>
        <Link to="/" className="mt-2 text-sm text-primary">
          Voltar pro app
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface p-5 md:block">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
          <Compass className="h-5 w-5 text-primary" /> Norte Admin
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Papel: {role}</p>
        <nav className="mt-8 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/admin" }}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground [&.active]:bg-surface-2 [&.active]:text-primary"
                activeProps={{ className: "active" }}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-3 md:hidden">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
            <Compass className="h-5 w-5 text-primary" /> Norte Admin
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-3 py-2 md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/admin" }}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs text-muted-foreground [&.active]:bg-primary/15 [&.active]:text-primary"
              activeProps={{ className: "active" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}
