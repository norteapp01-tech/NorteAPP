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
  detail: string;
  icon: LucideIcon;
};

const mainItems: Item[] = [
  { to: "/", label: "Hoje", detail: "Seu dia e próximas ações", icon: Home },
  { to: "/agenda", label: "Agenda", detail: "Compromissos com horário", icon: CalendarDays },
  {
    to: "/planejamento",
    label: "Planos",
    detail: "Objetivos, etapas e cronogramas",
    icon: CalendarRange,
  },
  { to: "/dashboard", label: "Espelho", detail: "Visão geral da sua evolução", icon: BarChart3 },
];

const routineItems: Item[] = [
  {
    to: "/sub-agenda/$categoria",
    params: { categoria: "academia" },
    label: "Academia",
    detail: "Treinos, evolução e programa",
    icon: Dumbbell,
  },
  {
    to: "/sub-agenda/$categoria",
    params: { categoria: "esportes" },
    label: "Esportes",
    detail: "Corrida, caminhada e ciclismo",
    icon: Footprints,
  },
  {
    to: "/sub-agenda/$categoria",
    params: { categoria: "leitura" },
    label: "Leitura",
    detail: "Livros, rotina e caderno",
    icon: BookOpen,
  },
  {
    to: "/sub-agenda/$categoria",
    params: { categoria: "alimentacao" },
    label: "Alimentação",
    detail: "Refeições, análise e plano",
    icon: Salad,
  },
  {
    to: "/sub-agenda/$categoria",
    params: { categoria: "financas" },
    label: "Finanças",
    detail: "Visão, registros e objetivos",
    icon: Wallet,
  },
  {
    to: "/sub-agenda/$categoria",
    params: { categoria: "fe" },
    label: "Fé",
    detail: "Registros, orações e Bíblia",
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
      <span className="min-w-0 flex-1">
        <strong>{item.label}</strong>
        <small>{item.detail}</small>
      </span>
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
            <p>Tudo no seu lugar, sem atalhos escondidos.</p>
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
                  <small>Novo compromisso ou plano</small>
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
                  <small>Peça, consulte ou execute por conversa</small>
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
                  <small>Conta, preferências e notificações</small>
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
