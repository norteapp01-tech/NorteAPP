import { useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Compass, Pause, Play, Utensils } from "lucide-react";
import "./welcome.css";

const scenes = [
  {
    name: "Planejamento",
    message: "Quero abrir uma loja em 90 dias. Monte uma proposta.",
    reply: "Preparei uma proposta para você revisar.",
    title: "Conte o objetivo. Enxergue o caminho.",
    description: "O Norte transforma uma intenção em um plano estruturado para você revisar.",
  },
  {
    name: "Reorganização",
    message: "Acordei doente. Mostre meus compromissos de hoje para eu decidir o que reagendar.",
    reply: "Seus compromissos de hoje são:",
    title: "Diga como você está. Reorganize o necessário.",
    description: "Veja seus compromissos e decida o que mudar no seu dia.",
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
  if (index === 1)
    return (
      <div className="welcome-card">
        <small>COMPROMISSOS DE HOJE</small>
        {[
          ["10:00", "Entregar relatório", "Trabalho"],
          ["14:00", "Reunião", "Trabalho"],
          ["18:30", "Treino", "Academia"],
        ].map(([time, title, category]) => (
          <div className="welcome-appointment" key={title}>
            <b>{time}</b>
            <div>
              <strong>{title}</strong>
              <p>{category}</p>
            </div>
            <span>Reagendar</span>
          </div>
        ))}
        <p className="welcome-note">Você decide o que muda.</p>
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

export function WelcomeScreen({ onEnter, onLogin }: { onEnter: () => void; onLogin: () => void }) {
  const [viewport, api] = useEmblaCarousel({ loop: true, duration: 25 });
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [restart, setRestart] = useState(0);

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
    if (!api) return;
    const select = () => setActive(api.selectedScrollSnap());
    const down = () => setHolding(true);
    const up = () => {
      setHolding(false);
      setRestart((n) => n + 1);
    };
    api.on("select", select).on("pointerDown", down).on("pointerUp", up);
    return () => {
      api.off("select", select).off("pointerDown", down).off("pointerUp", up);
    };
  }, [api]);
  useEffect(() => {
    if (!api || paused || holding || focused || hidden || reduced) return;
    const timer = window.setTimeout(() => api.scrollNext(), 4000);
    return () => window.clearTimeout(timer);
  }, [api, active, paused, holding, focused, hidden, reduced, restart]);

  return (
    <main className="welcome-screen">
      <header>
        <div className="welcome-brand">
          <Compass aria-hidden="true" /> NORTE
        </div>
        <h1>
          Todo rumo começa
          <br />
          com um Norte.
        </h1>
        <p>
          Você conta o que está acontecendo.
          <br />O Norte organiza o próximo passo.
        </p>
      </header>
      <section
        className="welcome-carousel"
        aria-label="Conheça o Norte"
        aria-roledescription="carrossel"
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
        }}
      >
        <div
          ref={viewport}
          className="welcome-viewport"
          tabIndex={0}
          aria-label="Arraste ou use as setas para trocar de exemplo"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              if (e.key === "ArrowRight") api?.scrollNext(reduced);
              else api?.scrollPrev(reduced);
              setRestart((n) => n + 1);
            }
          }}
        >
          <div className="welcome-track">
            {scenes.map((scene, index) => (
              <article
                className="welcome-slide"
                key={scene.name}
                aria-hidden={active !== index}
                aria-label={`${index + 1} de 4: ${scene.name}`}
                aria-roledescription="slide"
              >
                <div className="welcome-demo">
                  <div className="welcome-chat-brand">
                    <Compass size={18} /> Norte <span>Exemplo</span>
                  </div>
                  <div className="welcome-message">{scene.message}</div>
                  <div className="welcome-reply">
                    <div>
                      <Compass size={14} /> Norte
                    </div>
                    <p>{scene.reply}</p>
                  </div>
                  <ExampleCard index={index} />
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="welcome-caption">
          <h2>{scenes[active].title}</h2>
          <p>{scenes[active].description}</p>
        </div>
        <div className="welcome-controls">
          <div className="welcome-dots">
            {scenes.map((scene, index) => (
              <button
                key={scene.name}
                aria-label={`Mostrar ${scene.name}`}
                aria-current={index === active ? "true" : undefined}
                onClick={() => {
                  api?.scrollTo(index, reduced);
                  setRestart((n) => n + 1);
                }}
              >
                <span />
              </button>
            ))}
          </div>
          {!reduced && (
            <button
              className="welcome-pause"
              aria-label={paused ? "Reproduzir carrossel" : "Pausar carrossel"}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          )}
        </div>
      </section>
      <footer>
        <button className="welcome-cta" onClick={onEnter}>
          Ver o Norte em ação
        </button>
        <button className="welcome-login" onClick={onLogin}>
          Já tenho uma conta
        </button>
      </footer>
    </main>
  );
}
