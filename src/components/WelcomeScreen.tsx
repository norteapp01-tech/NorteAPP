import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Utensils } from "lucide-react";
import { DawnMark } from "./ui/app-design-system";
import "./welcome.css";
import "./welcome-live.css";

const scenes = [
  {
    name: "Reorganização",
    message: "Acordei doente. Reorganize meu dia.",
    reply: "Deixei só o essencial.",
  },
  {
    name: "Planejamento",
    message: "Quero abrir uma loja em 90 dias. Monte uma proposta.",
    reply: "Transformei seu objetivo nos próximos passos.",
  },
  {
    name: "Finanças",
    message: "Gastei R$ 23 em uma barra de proteína.",
    reply: "Gasto registrado na categoria Alimentação.",
    title: "Fale o gasto. Veja para onde o dinheiro vai.",
    description: "Registre movimentações em segundos e acompanhe seus gastos por categoria.",
  },
  {
    name: "Alimentação",
    message: "Almocei frango grelhado com arroz e legumes. Registra para mim.",
    reply: "Refeição registrada.",
    title: "Conte o que comeu. O Norte registra.",
    description: "Reutilize sua refeição cadastrada e atualize as metas do dia.",
  },
];

function ExampleCard({ index }: { index: number }) {
  if (index === 0)
    return (
      <div className="welcome-card welcome-agenda-card">
        {[
          ["10:00", "Entregar relatório", "mantido", "kept"],
          ["14:00", "Reunião", "amanhã", "tomorrow"],
        ].map(([time, title, status, tone]) => (
          <div className="welcome-appointment" key={title}>
            <b>{time}</b>
            <div>
              <strong>{title}</strong>
            </div>
            <span className={`welcome-status ${tone}`}>
              <i aria-hidden="true" />
              {status}
            </span>
          </div>
        ))}
        <p className="welcome-note">Você decide o que muda.</p>
      </div>
    );
  if (index === 1)
    return (
      <div className="welcome-card">
        <small>PROPOSTA DE PLANEJAMENTO</small>
        <h3>Abrir loja</h3>
        <p>90 dias</p>
        {[
          ["Pesquisa de mercado", "Analisar concorrência · Definir público-alvo"],
          ["Estruturação do negócio", "Plano de negócios · Buscar fornecedores"],
          ["Inauguração", "Marketing de lançamento · Evento"],
        ].map(([title, text], i) => (
          <div className="welcome-step" key={title}>
            <b>{i + 1}</b>
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          </div>
        ))}
        <p className="welcome-note">Etapas sugeridas · ainda não salvas</p>
        <div className="welcome-example-actions">
          <span>Ajustar proposta</span>
          <span className="filled">Confirmar</span>
        </div>
      </div>
    );
  if (index === 2)
    return (
      <div className="welcome-card">
        <small>MOVIMENTAÇÃO REGISTRADA</small>
        <h3 className="welcome-money">R$ 23,00</h3>
        <strong>Alimentação · barra de proteína</strong>
        <p>11/09/2026</p>
        <div className="welcome-total">
          <span>Gastos do mês</span>
          <b>R$ 23,00</b>
        </div>
        <div className="welcome-total">
          <span>Categoria</span>
          <b>Alimentação</b>
        </div>
        <div className="welcome-example-actions">
          <span>Ajustar registro</span>
        </div>
      </div>
    );
  return (
    <div className="welcome-card">
      <small>REFEIÇÃO REGISTRADA</small>
      <h3 className="welcome-meal">
        <Utensils size={22} />
        Frango grelhado com arroz e legumes
      </h3>
      <p>Almoço</p>
      <div className="welcome-macros">
        {[
          ["Proteína", "38 g"],
          ["Carboidratos", "62 g"],
          ["Gorduras", "18 g"],
          ["Calorias", "570 kcal"],
        ].map(([label, value]) => (
          <div key={label}>
            <p>{label}</p>
            <b>{value}</b>
          </div>
        ))}
      </div>
      <div className="welcome-example-actions">
        <span>Ver alimentação →</span>
      </div>
    </div>
  );
}

// One clock drives typing, reply, card and scene changes, so pause freezes everything.
export function WelcomeScreen({ onEnter, onLogin }: { onEnter: () => void; onLogin: () => void }) {
  const [active, setActive] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const progress = useRef(0);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const select = useCallback((index: number) => {
    progress.current = 0;
    setElapsed(0);
    setActive((index + scenes.length) % scenes.length);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    const visibility = () => setHidden(document.hidden);
    update();
    visibility();
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (paused || holding || hidden || reduced) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      progress.current += now - previous;
      previous = now;
      if (progress.current >= 5000) {
        progress.current = 0;
        setActive((index) => (index + 1) % scenes.length);
      }
      setElapsed(progress.current);
    }, 30);
    return () => clearInterval(timer);
  }, [paused, holding, hidden, reduced]);

  const scene = scenes[active];
  const characters = reduced
    ? scene.message.length
    : Math.floor(Math.min(1, elapsed / 1000) * scene.message.length);
  const replyVisible = reduced || elapsed >= 1250;
  const cardVisible = reduced || elapsed >= 2250;
  return (
    <main className="welcome-screen welcome-live" data-paused={paused || holding || hidden}>
      <header>
        <div className="welcome-brand">
          <DawnMark />
        </div>
        <p className="welcome-eyebrow">SEU DIA, NO RUMO</p>
        <h1>
          Você vive.
          <br />O Norte organiza.
        </h1>
        <p className="welcome-subtitle">Conte do seu jeito. O Norte transforma intenção em ação.</p>
      </header>
      <section
        className="welcome-carousel"
        aria-label="Exemplos do Norte"
        aria-roledescription="carrossel"
      >
        <div
          className="welcome-live-stage"
          tabIndex={0}
          aria-label="Use as setas ou arraste para mudar de exemplo"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              select(active + (event.key === "ArrowRight" ? 1 : -1));
            }
          }}
          onPointerDown={(event) => {
            gesture.current = { x: event.clientX, y: event.clientY };
            setHolding(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            const origin = gesture.current;
            gesture.current = null;
            setHolding(false);
            if (
              origin &&
              Math.abs(event.clientX - origin.x) > 55 &&
              Math.abs(event.clientY - origin.y) < 60
            ) {
              select(active + (event.clientX < origin.x ? 1 : -1));
            }
          }}
          onPointerCancel={() => {
            gesture.current = null;
            setHolding(false);
          }}
          onLostPointerCapture={() => {
            gesture.current = null;
            setHolding(false);
          }}
        >
          <article key={active} aria-label={scene.name} aria-roledescription="slide">
            <div className="welcome-user-slot">
              <div className="welcome-message" aria-label={scene.message}>
                <span aria-hidden="true">
                  {scene.message.slice(0, characters)}
                  {characters < scene.message.length && <span className="welcome-cursor">▏</span>}
                </span>
              </div>
            </div>
            <div
              className="welcome-reply"
              style={{
                visibility: replyVisible ? "visible" : "hidden",
                opacity: replyVisible ? 1 : 0,
              }}
            >
              <div>
                <DawnMark compact /> Norte
              </div>
              <p>{scene.reply}</p>
            </div>
            <div
              className="welcome-card-reveal"
              style={{
                visibility: cardVisible ? "visible" : "hidden",
                opacity: cardVisible ? 1 : 0,
                transform: cardVisible ? "translateY(0)" : "translateY(8px)",
              }}
            >
              <ExampleCard index={active} />
            </div>
          </article>
        </div>
        <p className="welcome-capabilities" aria-label="Recursos do Norte">
          Agenda <i /> Rotina <i /> Planos <i /> Bem-estar
        </p>
        <div className="welcome-controls">
          <div className="welcome-dots">
            {scenes.map((item, index) => (
              <button
                key={item.name}
                aria-label={`Mostrar ${item.name}`}
                aria-current={index === active ? "true" : undefined}
                onClick={() => select(index)}
              >
                <span />
              </button>
            ))}
          </div>
          {!reduced && (
            <button
              className="welcome-pause"
              aria-label={paused ? "Reproduzir carrossel" : "Pausar carrossel"}
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          )}
        </div>
      </section>
      <footer>
        <button className="welcome-cta" onClick={onEnter}>
          Começar agora
        </button>
        <button className="welcome-login" onClick={onLogin}>
          Já tenho uma conta
        </button>
      </footer>
    </main>
  );
}
