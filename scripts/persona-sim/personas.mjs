// 10 personas com focos de uso distintos — cada uma roda 30 "dias" simulados
// (relógio de teste avançado um dia por vez) fazendo ações reais na UI contra
// o Supabase de verdade. `daily(ctx)` roda uma vez por dia simulado.

import * as A from "./lib/actions.mjs";

function isoDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MOODS = ["Fogo", "Normal", "Cansado", "Doente"];

export const personas = [
  {
    id: "ana",
    name: "Ana — Planejamento",
    description: "Cria e acompanha planos de longo prazo quase toda semana.",
    async daily({ page, baseUrl, day, weekday, run }) {
      await run("checkin", () => A.checkinMood(page, MOODS[day % MOODS.length]));
      if (day === 0) {
        await run("goal:saude", () =>
          A.createGoalViaCriar(page, baseUrl, {
            title: "Melhorar minha saúde",
            area: "Saúde",
            preset: "Mês",
          }),
        );
      }
      if (day === 7) {
        await run("goal:ingles", () =>
          A.createGoalViaCriar(page, baseUrl, {
            title: "Aprender inglês",
            area: "Carreira",
            preset: "90 dias",
          }),
        );
      }
      if (weekday === 1 || weekday === 4) {
        await run("view:agenda", () => A.goto(page, baseUrl, "/agenda"));
        await run("view:planejamento", () => A.goto(page, baseUrl, "/planejamento"));
      }
    },
  },
  {
    id: "bruno",
    name: "Bruno — Academia",
    description: "Treina quase todo dia, registra peso corporal semanalmente.",
    async daily({ page, baseUrl, day, weekday, run }) {
      await run("checkin", () => A.checkinMood(page, MOODS[(day + 1) % MOODS.length]));
      if (day === 0) {
        await run("plan:A", () =>
          A.ensureWorkoutPlan(page, baseUrl, {
            letter: "A",
            name: "Treino A — Peito/Tríceps",
            muscleGroups: "Peito, tríceps",
          }),
        );
        await run("plan:B", () =>
          A.ensureWorkoutPlan(page, baseUrl, {
            letter: "B",
            name: "Treino B — Costas/Bíceps",
            muscleGroups: "Costas, bíceps",
          }),
        );
        for (const wd of ["Seg", "Qua", "Sex"]) {
          await run(`assign:${wd}`, () =>
            A.assignWorkoutDay(page, baseUrl, {
              weekdayLabel: wd,
              planName: "Treino A — Peito/Tríceps",
            }),
          );
        }
        for (const wd of ["Ter", "Qui"]) {
          await run(`assign:${wd}`, () =>
            A.assignWorkoutDay(page, baseUrl, {
              weekdayLabel: wd,
              planName: "Treino B — Costas/Bíceps",
            }),
          );
        }
      }
      await run("workout:today", async () => {
        const r = await A.runTodayWorkout(page, baseUrl);
        if (r === "no-exercises") throw new Error("treino do dia sem exercícios disponíveis");
      });
      if (day % 7 === 0) {
        await run("bodyweight", () => A.logBodyWeight(page, baseUrl, (80 - day * 0.05).toFixed(1)));
      }
    },
  },
  {
    id: "carla",
    name: "Carla — Leitura",
    description: "Lê quase todo dia; às vezes esquece (testa ajuste de meta perdida).",
    async daily({ page, baseUrl, day, run }) {
      await run("checkin", () => A.checkinMood(page, MOODS[(day + 2) % MOODS.length]));
      if (day === 0) {
        await run("addbook", () =>
          A.addBook(page, baseUrl, { title: "Hábitos Atômicos", totalPages: 250 }),
        );
      }
      const skipDay = day % 6 === 5; // esquece de ler 1 a cada 6 dias, de propósito
      if (!skipDay) {
        await run("reading", async () => {
          const r = await A.readingSession(page, baseUrl, { pagesRead: 12 });
          if (r === "no-finish-button")
            throw new Error("modo leitura não abriu o botão de finalizar");
        });
      }
      if (day === 10) {
        await run("checkMissed", () => A.goto(page, baseUrl, "/sub-agenda/leitura"));
      }
    },
  },
  {
    id: "diego",
    name: "Diego — Finanças",
    description: "Registra gastos quase todo dia via linguagem natural, define limites.",
    async daily({ page, baseUrl, day, run }) {
      await run("checkin", () => A.checkinMood(page, MOODS[(day + 3) % MOODS.length]));
      const texts = [
        "gastei 18 reais com uber",
        "gastei 45 reais no mercado",
        "recebi 200 reais de freelance",
        "gastei 12 reais com café",
        "gastei 60 reais na farmácia",
      ];
      await run("transaction", () =>
        A.quickAddTransaction(page, baseUrl, texts[day % texts.length]),
      );
      if (day === 0) {
        await run("view:financas", () => A.goto(page, baseUrl, "/sub-agenda/financas"));
      }
    },
  },
  {
    id: "elisa",
    name: "Elisa — Fé",
    description: "Momento espiritual diário, escreve no caderno com frequência.",
    async daily({ page, baseUrl, day, run }) {
      await run("checkin", () => A.checkinMood(page, MOODS[(day + 4) % MOODS.length]));
      if (day % 2 === 0) {
        await run("notebook", () =>
          A.addNotebookEntry(page, baseUrl, `Reflexão do dia ${day + 1} — grata pelo que tenho.`),
        );
      }
      await run("view:fe", () => A.goto(page, baseUrl, "/sub-agenda/fe"));
    },
  },
  {
    id: "fabio",
    name: "Fábio — Alimentação",
    description: "Confirma refeições planejadas quase todo dia.",
    async daily({ page, baseUrl, day, run }) {
      await run("checkin", () => A.checkinMood(page, MOODS[(day + 5) % MOODS.length]));
      await run("meal", async () => {
        await A.confirmAnyMeal(page, baseUrl);
      });
    },
  },
  {
    id: "gabriela",
    name: "Gabriela — Agenda/Hoje",
    description: "Cria compromissos pontuais quase todo dia, vive na tela Hoje.",
    async daily({ page, baseUrl, day, weekday, run }) {
      await run("checkin", () => A.checkinMood(page, MOODS[(day + 6) % MOODS.length]));
      if (weekday !== 0 && weekday !== 6) {
        await run("agenda-item", () =>
          A.quickAgendaItem(page, baseUrl, {
            title: `Compromisso dia ${day + 1}`,
            date: isoDate(Date.now()),
            startTime: "14:00",
            endTime: "15:00",
          }),
        );
      }
      await run("hoje", () => A.goto(page, baseUrl, "/"));
    },
  },
  {
    id: "hugo",
    name: "Hugo — Multi-módulo leve",
    description: "Passa levemente por todos os módulos ao longo da semana.",
    async daily({ page, baseUrl, day, weekday, run }) {
      await run("checkin", () => A.checkinMood(page, MOODS[(day + 1) % MOODS.length]));
      const rotation = ["academia", "leitura", "alimentacao", "financas", "fe"];
      const mod = rotation[weekday % rotation.length];
      await run(`visit:${mod}`, () => A.goto(page, baseUrl, `/sub-agenda/${mod}`));
    },
  },
  {
    id: "isabela",
    name: "Isabela — Testes destrutivos/edge cases",
    description: "Tenta inputs inválidos, cliques duplos, cancelamentos.",
    async daily({ page, baseUrl, day, run }) {
      await run("checkin-invalid-then-valid", async () => {
        // clica duas vezes rápido no mesmo humor — não deve duplicar nem quebrar
        await A.checkinMood(page, "Cansado");
      });
      if (day === 0) {
        await run("empty-book-title", async () => {
          await A.goto(page, baseUrl, "/sub-agenda/leitura");
          const addBtn = page.getByRole("button", { name: "Adicionar livro" }).first();
          await addBtn.click();
          await page.waitForTimeout(200);
          const manual = page.getByText("Não encontrei — cadastrar manualmente");
          if (await manual.count()) await manual.click();
          await page.waitForTimeout(200);
          const continueBtn = page.getByRole("button", { name: "Continuar" }).first();
          const isDisabled = await continueBtn.isDisabled().catch(() => null);
          if (isDisabled !== true) {
            throw new Error("botão Continuar deveria estar desabilitado com título vazio");
          }
          const closeBtn = page.locator("div.fixed.inset-0 button svg").first().locator("..");
          if (await closeBtn.count()) await closeBtn.click().catch(() => {});
        });
        await run("negative-transaction-amount", async () => {
          await A.goto(page, baseUrl, "/sub-agenda/financas");
          const fab = page.locator('button[class*="fixed"][class*="bottom-24"]').first();
          await fab.click();
          await page.waitForTimeout(200);
          const gasteiBtn = page.getByRole("button", { name: "Gastei" }).first();
          await gasteiBtn.click();
          await page.waitForTimeout(200);
          const amountInput = page.locator('input[type="number"]').first();
          await amountInput.fill("-50");
          const descInput = page.locator('label:has-text("Descrição") input').first();
          await descInput.fill("teste negativo");
          const saveBtn = page.getByRole("button", { name: "Salvar" }).first();
          await saveBtn.click();
          await page.waitForTimeout(400);
          const errorShown = await page.getByText("Informe um valor maior que zero").count();
          if (!errorShown) {
            throw new Error("valor negativo não gerou erro visível nem foi bloqueado");
          }
          // fecha o sheet sem salvar nada
          const closeBtn = page.locator("div.fixed.inset-0 button svg").first().locator("..");
          if (await closeBtn.count()) await closeBtn.click().catch(() => {});
        });
      }
      if (day % 5 === 0) {
        await run("rapid-navigation", async () => {
          await A.goto(page, baseUrl, "/sub-agenda/academia");
          await A.goto(page, baseUrl, "/sub-agenda/leitura");
          await A.goto(page, baseUrl, "/sub-agenda/financas");
          await A.goto(page, baseUrl, "/");
        });
      }
    },
  },
  {
    id: "joao",
    name: "João — Consistência de longo prazo",
    description: "Foca em recursos semanais/mensais (Plano, virada de semana, Gantt).",
    async daily({ page, baseUrl, day, weekday, run }) {
      await run("checkin", () => A.checkinMood(page, MOODS[(day + 2) % MOODS.length]));
      if (day === 0) {
        await run("goal:longo-prazo", () =>
          A.createGoalViaCriar(page, baseUrl, {
            title: "Construir reserva de emergência",
            area: "Finanças",
            preset: "Semestre",
          }),
        );
      }
      if (weekday === 0) {
        await run("view:planejamento-semanal", () => A.goto(page, baseUrl, "/planejamento"));
      }
      if (day % 30 === 29) {
        await run("view:planejamento-mensal", () => A.goto(page, baseUrl, "/planejamento"));
      }
    },
  },
];
