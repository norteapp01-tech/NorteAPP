import {
  MIN_BUCKET,
  MIN_GAP,
  MIN_RESOLVED,
  WEEKDAY_PLURAL,
  formatMinutes,
  untouchedLabels,
  weekdayIndex,
  type AgendaAnalysis,
  type Bucket,
  type Comparison,
  type LabelLookup,
} from "./mirror-analytics";

// ---------------------------------------------------------------------------
// Insights do Norte sobre a agenda.
//
// Cada insight vem de uma regra com limite mínimo de dados, diz DE ONDE
// surgiu (`evidence`) e, quando faz sentido, aponta uma ação. Tom humano e sem
// julgamento: o Norte descreve, não cobra — e não faz diagnóstico.
// ---------------------------------------------------------------------------

export type InsightAction =
  | { kind: "agenda"; label: string; date?: string }
  | { kind: "norte"; label: string; prompt: string };

export type Insight = {
  id: string;
  /** Maior = mais relevante; o principal é o primeiro da lista. */
  priority: number;
  tone: "positive" | "attention" | "neutral";
  text: string;
  /** De quais dados a frase saiu. */
  evidence: string;
  action?: InsightAction;
};

const pct = (n: number) => Math.round(n * 100);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function buildInsights(
  a: AgendaAnalysis,
  cmp: Comparison,
  ctx: { labels: LabelLookup[]; scope: string },
): Insight[] {
  const out: Insight[] = [];
  const decided = a.done + a.missed;
  const { scope } = ctx;

  if (a.sufficiency === "none") return out;

  if (a.sufficiency === "low") {
    return [
      {
        id: "poucos-dados",
        priority: 10,
        tone: "neutral",
        text: "Ainda há poucos compromissos encerrados para o Norte apontar padrões.",
        evidence: `${a.total} ${plural(a.total, "compromisso encerrado", "compromissos encerrados")} ${scope}; a partir de ${MIN_RESOLVED} concluídos ou não realizados os padrões aparecem.`,
      },
    ];
  }

  // Quanto do tempo planejado foi para uma área.
  const labelled = a.byLabel.filter((g) => g.key !== "__none");
  const pool = labelled.length ? labelled : a.byCategory;
  const top = pool[0];
  if (
    top &&
    a.time.unionMinutes >= 120 &&
    top.share >= 0.5 &&
    top.done + top.missed + top.cancelled >= 2
  ) {
    const name = labelled.length ? top.name : top.name;
    out.push({
      id: "dominancia",
      priority: 70,
      tone: "neutral",
      text: `${name} ocupou ${pct(top.share)}% do seu tempo planejado ${scope}.`,
      evidence: `${formatMinutes(top.minutes)} de ${formatMinutes(a.time.unionMinutes)} planejados em compromissos já encerrados. É duração planejada, não tempo real.`,
      action: {
        kind: "norte",
        label: "Equilibrar com o Norte",
        prompt: `${name} ocupou ${pct(top.share)}% do meu tempo planejado. Me ajude a equilibrar a próxima semana.`,
      },
    });
  }

  // Compromissos mudados mais de uma vez.
  const repeated = a.movedCommitments.filter((m) => m.moves >= 2);
  if (repeated.length) {
    const byLabel = new Map<string, number>();
    for (const m of repeated)
      if (m.labelId) byLabel.set(m.labelId, (byLabel.get(m.labelId) ?? 0) + 1);
    const [labelId, count] = [...byLabel.entries()].sort((x, y) => y[1] - x[1])[0] ?? [];
    const label = labelId ? ctx.labels.find((l) => l.id === labelId) : undefined;
    const series = repeated.find((m) => m.seriesId);
    let text: string;
    if (label && count >= 2)
      text = `${count} compromissos de ${label.name} foram reagendados mais de uma vez.`;
    else if (repeated.length === 1)
      text = `“${repeated[0].title}” já mudou de horário ${repeated[0].moves} vezes ${scope}.`;
    else text = `${repeated.length} compromissos foram reagendados mais de uma vez ${scope}.`;
    out.push({
      id: "reagendamentos",
      priority: 85,
      tone: "attention",
      text,
      evidence: `Histórico de mudanças de horário ${scope}: ${a.reschedules} ${plural(a.reschedules, "mudança", "mudanças")} em ${a.rescheduledCommitments} ${plural(a.rescheduledCommitments, "compromisso", "compromissos")}.`,
      action: series
        ? { kind: "agenda", label: "Revisar a recorrência" }
        : {
            kind: "norte",
            label: "Escolher um horário melhor",
            prompt: `“${repeated[0].title}” vive mudando de horário. Qual seria um horário mais realista?`,
          },
    });
  }

  // Planejou mais do que cumpre.
  if (
    a.rate !== null &&
    decided >= MIN_RESOLVED &&
    a.rate < 0.6 &&
    (a.overloadedDays > 0 || (a.averageLoad ?? 0) >= 0.5)
  ) {
    out.push({
      id: "excesso",
      priority: 90,
      tone: "attention",
      text: `Você planejou mais do que conseguiu realizar: ${a.done} de ${decided} compromissos.`,
      evidence: `${a.done} concluídos e ${a.missed} não realizados ${scope}; ${a.overloadedDays} ${plural(a.overloadedDays, "dia", "dias")} com agenda muito cheia ou sobreposta.`,
      action: {
        kind: "norte",
        label: "Reorganizar a semana",
        prompt:
          "Planejei mais do que consigo cumprir. Me ajude a reorganizar a próxima semana com menos compromissos.",
      },
    });
  }

  // Cumpre, mas sem folga.
  if (a.rate !== null && decided >= MIN_RESOLVED && a.rate >= 0.7 && (a.averageLoad ?? 0) >= 0.65) {
    out.push({
      id: "sem-folga",
      priority: 60,
      tone: "attention",
      text: "Você manteve o que planejou, mas deixou pouco espaço livre.",
      evidence: `Nos dias com compromissos marcados, em média ${pct(a.averageLoad ?? 0)}% do seu dia habitual esteve ocupado.`,
      action: {
        kind: "norte",
        label: "Reservar tempo livre",
        prompt:
          "Minha agenda está cheia demais. Me ajude a reservar tempo livre na próxima semana.",
      },
    });
  }

  // Turno com melhor taxa.
  const tod = a.timeOfDay.filter((b) => b.done + b.missed >= MIN_BUCKET && b.rate !== null);
  if (tod.length >= 2) {
    const sorted = [...tod].sort((x, y) => y.rate! - x.rate!);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (best.rate! - worst.rate! >= MIN_GAP / 100) {
      out.push({
        id: "turno",
        priority: 80,
        tone: "positive",
        text: `Você costuma cumprir melhor seus compromissos ${best.label}.`,
        evidence: bucketEvidence(best, worst),
        action: {
          kind: "norte",
          label: `Mover para ${best.label}`,
          prompt: `Eu cumpro mais os compromissos ${best.label}. Quais dos meus compromissos da próxima semana vale mover para esse horário?`,
        },
      });
    }
  }
  for (const c of a.categoryTime) {
    if (c.best.rate! - c.worst.rate! >= MIN_GAP / 100) {
      out.push({
        id: `turno-${c.category}`,
        priority: 78,
        tone: "positive",
        text: `Você costuma cumprir melhor ${categoryNoun(c.category)} ${c.best.label}.`,
        evidence: bucketEvidence(c.best, c.worst),
      });
    }
  }

  // Dia da semana que costuma transbordar.
  const byWeekday = new Map<number, { total: number; over: number; lastOver?: string }>();
  for (const d of a.daysStat) {
    if (d.busy === 0 && d.conflicts === 0) continue; // dia sem compromisso não entra na conta
    const w = weekdayIndex(d.date);
    const cur = byWeekday.get(w) ?? { total: 0, over: 0 };
    cur.total += 1;
    if (d.overloaded) {
      cur.over += 1;
      cur.lastOver = d.date;
    }
    byWeekday.set(w, cur);
  }
  const heavyDays = [...byWeekday.entries()]
    .filter(([, v]) => v.total >= 2 && v.over >= 2 && v.over / v.total >= 0.5)
    .sort((x, y) => y[1].over - x[1].over);
  if (heavyDays.length) {
    const [w, v] = heavyDays[0];
    out.push({
      id: "dia-cheio",
      priority: 75,
      tone: "attention",
      text: `Suas ${WEEKDAY_PLURAL[w]} costumam receber mais compromissos do que comportam.`,
      evidence: `${v.over} de ${v.total} ${WEEKDAY_PLURAL[w]} ${scope} com compromissos passaram de 70% do seu dia habitual ocupado ou tiveram horários sobrepostos.`,
      action: { kind: "agenda", label: "Ver esse dia", date: v.lastOver },
    });
  }

  // Duração.
  const { short, long } = a.duration;
  if (
    short.done + short.missed >= 4 &&
    long.done + long.missed >= 4 &&
    short.rate !== null &&
    long.rate !== null
  ) {
    if (short.rate - long.rate >= MIN_GAP / 100) {
      out.push({
        id: "duracao",
        priority: 65,
        tone: "positive",
        text: `Blocos de até 45 minutos tiveram maior taxa de conclusão.`,
        evidence: `${pct(short.rate)}% de conclusão nos blocos curtos (${short.done + short.missed}) contra ${pct(long.rate)}% nos longos (${long.done + long.missed}).`,
        action: {
          kind: "norte",
          label: "Ajustar a duração",
          prompt:
            "Meus blocos curtos rendem mais. Quais compromissos longos da minha semana posso dividir ou encurtar?",
        },
      });
    }
  }

  // Cancelamentos.
  if (a.cancelled >= 3 && a.total > 0 && a.cancelled / a.total >= 0.25) {
    out.push({
      id: "cancelamentos",
      priority: 55,
      tone: "attention",
      text: `${a.cancelled} compromissos foram cancelados — ${pct(a.cancelled / a.total)}% do que estava marcado.`,
      evidence: `${a.cancelled} cancelados de ${a.total} compromissos encerrados ${scope}.`,
    });
  }

  // Rótulo sem nenhum compromisso.
  const untouched = untouchedLabels(a, ctx.labels);
  if (untouched.length && a.total >= MIN_RESOLVED) {
    const l = untouched[0];
    out.push({
      id: "negligenciado",
      priority: 52,
      tone: "neutral",
      text: `Nenhum compromisso de ${l.name} ${scope}.`,
      evidence: `O rótulo ${l.name} existe na sua agenda, mas não teve compromissos encerrados no período.`,
      action: {
        kind: "norte",
        label: `Reservar tempo para ${l.name}`,
        prompt: `Quero reservar tempo para ${l.name} na próxima semana. Onde cabe?`,
      },
    });
  }

  // Comparação com o período anterior.
  if (cmp.rateDelta !== null && cmp.rateDelta >= 10 && decided >= MIN_RESOLVED) {
    out.push({
      id: "melhora",
      priority: 50,
      tone: "positive",
      text: `Sua taxa de realização subiu ${cmp.rateDelta} ${plural(cmp.rateDelta, "ponto", "pontos")} em relação ao período anterior.`,
      evidence: `${pct(a.rate ?? 0)}% agora, contra ${pct((a.rate ?? 0) - cmp.rateDelta / 100)}% no período anterior.`,
    });
  } else if (cmp.rateDelta !== null && cmp.rateDelta <= -10 && decided >= MIN_RESOLVED) {
    out.push({
      id: "queda",
      priority: 58,
      tone: "attention",
      text: `Sua taxa de realização caiu ${Math.abs(cmp.rateDelta)} ${plural(Math.abs(cmp.rateDelta), "ponto", "pontos")} em relação ao período anterior.`,
      evidence: `${pct(a.rate ?? 0)}% agora, contra ${pct((a.rate ?? 0) - cmp.rateDelta / 100)}% no período anterior.`,
    });
  }

  // "Como foi?" — só com respostas suficientes.
  const groups = (
    a.byLabel.filter((g) => g.key !== "__none").length ? a.byLabel : a.byCategory
  ).filter((g) => g.key !== "__none");
  for (const g of groups) {
    const n = g.feeling.leve + g.feeling.neutro + g.feeling.pesado;
    if (n >= 3 && g.feeling.pesado / n >= 0.5) {
      out.push({
        id: `pesado-${g.key}`,
        priority: 62,
        tone: "attention",
        text: `${g.name} tem sido pesado para você.`,
        evidence: `${g.feeling.pesado} de ${n} respostas de “Como foi?” em ${g.name} foram “Pesado”.`,
        action: {
          kind: "norte",
          label: "Aliviar com o Norte",
          prompt: `Meus compromissos de ${g.name} têm sido pesados. Como posso aliviar a próxima semana?`,
        },
      });
    } else if (n >= 3 && g.feeling.leve / n >= 0.6) {
      out.push({
        id: `leve-${g.key}`,
        priority: 45,
        tone: "positive",
        text: `${g.name} costuma ser leve para você.`,
        evidence: `${g.feeling.leve} de ${n} respostas de “Como foi?” em ${g.name} foram “Leve”.`,
      });
    }
  }

  return out.sort((x, y) => y.priority - x.priority);
}

function bucketEvidence(best: Bucket, worst: Bucket): string {
  return `${best.done} de ${best.done + best.missed} concluídos ${best.label}, contra ${worst.done} de ${worst.done + worst.missed} ${worst.label}.`;
}

const CATEGORY_NOUN: Record<string, string> = {
  academia: "seus treinos",
  esportes: "seus esportes",
  leitura: "suas leituras",
  alimentacao: "suas refeições planejadas",
  fe: "seus momentos de fé",
  trabalho: "seus compromissos de trabalho",
  financas: "suas tarefas de finanças",
};
export function categoryNoun(category: string): string {
  return CATEGORY_NOUN[category] ?? "suas atividades";
}

/** A ação prática para a próxima semana: a do insight mais relevante que tem ação. */
export function nextWeekAction(
  insights: Insight[],
): { insight: Insight; action: InsightAction } | null {
  for (const i of insights)
    if (i.action && i.tone !== "positive") return { insight: i, action: i.action };
  for (const i of insights) if (i.action) return { insight: i, action: i.action };
  return null;
}
