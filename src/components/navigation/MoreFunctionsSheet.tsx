import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  Dumbbell,
  Footprints,
  HandHeart,
  Home,
  MessageCircle,
  Plus,
  Salad,
  Settings,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

type RouteLink =
  | { to: "/" | "/agenda" | "/planejamento" | "/dashboard" | "/criar"; params?: never }
  | {
      to: "/sub-agenda/$categoria";
      params: { categoria: string };
    };

type Item = RouteLink & {
  label: string;
  icon: LucideIcon;
};

const mainItems: Item[] = [
  { to: "/", label: "Hoje", icon: Home },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  {
    to: "/planejamento",
    label: "Planos",
    icon: CalendarRange,
  },
  { to: "/dashboard", label: "Espelho", icon: BarChart3 },
];

const routineItems: Item[] = [
  {
    to: "/sub-agenda/$categoria",
    params: { categoria: "academia" },
    label: "Academia",
    icon: Dumbbell,
  },
  {
    to: "/sub-agenda/$categoria",
    params: { categoria: "esportes" },
    label: "Esportes",
    icon: Footprints,
  },
  {
    to: "/sub-agenda/$categoria",
    params: { categoria: "leitura" },
    label: "Leitura",
    icon: BookOpen,
  },
  {
    to: "/sub-agenda/$categoria",
    params: { categoria: "alimentacao" },
    label: "Alimentação",
    icon: Salad,
  },
  {
    to: "/sub-agenda/$categoria",
    params: { categoria: "financas" },
    label: "Finanças",
    icon: Wallet,
  },
  {
    to: "/sub-agenda/$categoria",
    params: { categoria: "fe" },
    label: "Fé",
    icon: HandHeart,
  },
];

function FunctionRow({ item, onClose }: { item: Item; onClose: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      params={item.params}
      onClick={onClose}
      className="norte-function-row interactive-press"
    >
      <span className="norte-function-icon">
        <Icon className="h-5 w-5" strokeWidth={1.65} />
      </span>
      <strong className="min-w-0 flex-1">{item.label}</strong>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

export function MoreFunctionsSheet({
  onClose,
  onOpenChat,
  onOpenSettings,
  onNavigate = onClose,
}: {
  onClose: () => void;
  onOpenChat: () => void;
  onOpenSettings: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div
      className="norte-functions-layer"
      role="dialog"
      aria-modal="true"
      aria-label="Mais funções"
    >
      <button className="norte-functions-backdrop" onClick={onClose} aria-label="Fechar menu" />
      <aside className="norte-functions-sheet">
        <header>
          <div>
            <p className="norte-eyebrow">Norte</p>
            <h2>Mais funções</h2>
          </div>
          <button onClick={onClose} className="interactive-press" aria-label="Fechar mais funções">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="norte-functions-scroll">
          <section>
            <h3>Principal</h3>
            <div className="norte-functions-group">
              {mainItems.map((item) => (
                <FunctionRow key={item.label} item={item} onClose={onNavigate} />
              ))}
            </div>
          </section>

          <section>
            <h3>Rotina</h3>
            <div className="norte-functions-group">
              {routineItems.map((item) => (
                <FunctionRow key={item.label} item={item} onClose={onNavigate} />
              ))}
            </div>
          </section>

          <section>
            <h3>Ações rápidas</h3>
            <div className="norte-functions-group">
              <Link
                to="/criar"
                onClick={onNavigate}
                className="norte-function-row interactive-press"
              >
                <span className="norte-function-icon">
                  <Plus className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong>Adicionar</strong>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <button
                onClick={() => {
                  onClose();
                  onOpenChat();
                }}
                className="norte-function-row interactive-press"
              >
                <span className="norte-function-icon">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong>Falar com o Norte</strong>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="norte-function-row interactive-press"
              >
                <span className="norte-function-icon">
                  <Settings className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong>Configurações</strong>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
