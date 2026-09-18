import type { MuscleGroup } from "@/lib/workout-store";

// ---------------------------------------------------------------------------
// Atlas anatômico vetorial segmentado — frente e costas.
//
// A versão anterior pintava elipses e polígonos aproximados POR CIMA de uma
// imagem. O resultado era inevitável: mancha borrada, contorno que não batia
// com o desenho e área de toque fora do lugar em telas diferentes.
//
// Aqui não há imagem por baixo. O corpo É o conjunto das regiões: cada músculo
// é uma forma fechada e regiões vizinhas compartilham EXATAMENTE a mesma
// fronteira, porque as duas são geradas a partir da MESMA costura. Por
// construção não existe vão entre duas regiões nem preenchimento invadindo a
// vizinha — não é uma questão de acertar a curva na mão.
//
// As costuras não são cortes horizontais: a linha do peitoral sobe em direção
// à axila, o trapézio desce no meio das costas, o dorsal afunila na cintura.
// É o que separa uma figura anatômica de um colete pintado.
//
// Cada região é UM path. Esquerda e direita são dois subpaths do MESMO path,
// então o que se vê, o que se toca, o que recebe foco e o que o leitor de tela
// anuncia são o mesmo elemento — e tocar um lado destaca os dois.
//
// Desenho próprio, geométrico, sem obra de terceiros: não há licença de
// imagem envolvida. É uma figura esquemática legível, não uma prancha de
// anatomia médica — e a interface não promete ser uma.
// ---------------------------------------------------------------------------

export const ATLAS_WIDTH = 360;
export const ATLAS_HEIGHT = 700;
/** Eixo de simetria: tudo é desenhado à esquerda dele e espelhado. */
export const CX = 180;

export type Region = { group: MuscleGroup; label: string; d: string };

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------

/** Perfil do tronco: metade da largura total em cada altura. */
type Profile = { y: number; half: number }[];

/** Costura: dado `f` (0 = linha do centro, 1 = borda do corpo), a altura em
 * que duas regiões se encontram. */
type Seam = (f: number) => number;

const round = (n: number) => Math.round(n * 10) / 10;

function halfAt(profile: Profile, y: number): number {
  if (y <= profile[0].y) return profile[0].half;
  const last = profile[profile.length - 1];
  if (y >= last.y) return last.half;
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const b = profile[i];
    if (y <= b.y) {
      const t = (y - a.y) / (b.y - a.y);
      // Suavização cosseno: evita o "bico" da interpolação linear pura nas
      // junções de ombro e quadril.
      const s = (1 - Math.cos(t * Math.PI)) / 2;
      return a.half + (b.half - a.half) * s;
    }
  }
  return last.half;
}

const pt = (x: number, y: number) => `${round(x)} ${round(y)}`;

/**
 * Região lateral do tronco, delimitada por duas costuras.
 *
 * O contorno é percorrido em quatro trechos: costura de cima (do centro para
 * fora), borda externa, costura de baixo (de fora para o centro) e borda
 * interna. Como as costuras são funções, a região vizinha reaproveita a mesma
 * função e as duas formas encostam ponto a ponto.
 */
function sideRegion(
  profile: Profile,
  top: Seam,
  bottom: Seam,
  inner: number,
  outer: number,
  steps = 14,
): string {
  const xAt = (f: number, y: number) => CX - halfAt(profile, y) * f;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = inner + ((outer - inner) * i) / steps;
    const y = top(f);
    pts.push(pt(xAt(f, y), y));
  }
  for (let i = 1; i < steps; i++) {
    const y = top(outer) + ((bottom(outer) - top(outer)) * i) / steps;
    pts.push(pt(xAt(outer, y), y));
  }
  for (let i = steps; i >= 0; i--) {
    const f = inner + ((outer - inner) * i) / steps;
    const y = bottom(f);
    pts.push(pt(xAt(f, y), y));
  }
  for (let i = steps - 1; i > 0; i--) {
    const y = top(inner) + ((bottom(inner) - top(inner)) * i) / steps;
    pts.push(pt(xAt(inner, y), y));
  }
  return `M ${pts.join(" L ")} Z`;
}

/** Região centrada e simétrica (abdômen, lombar): uma forma só, já com os
 * dois lados. */
function centerRegion(profile: Profile, top: Seam, bottom: Seam, frac: number, steps = 14): string {
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = (frac * i) / steps;
    const yTop = top(f);
    const yBottom = bottom(f);
    left.push(pt(CX - halfAt(profile, yTop) * f, yTop));
    right.unshift(pt(CX - halfAt(profile, yBottom) * f, yBottom));
  }
  const half = [...left, ...right];
  const mirrored = half
    .map((p) => {
      const [x, y] = p.split(" ").map(Number);
      return pt(CX * 2 - x, y);
    })
    .reverse();
  return `M ${half.join(" L ")} L ${mirrored.join(" L ")} Z`;
}

/** Espelha um path composto só de M/L/Z em torno do eixo. */
export function mirrorX(d: string): string {
  return d.replace(
    /(-?\d+(?:\.\d+)?)\s(-?\d+(?:\.\d+)?)/g,
    (_, x: string, y: string) => `${round(CX * 2 - Number(x))} ${y}`,
  );
}

/** Une o lado esquerdo e seu espelho num path só: um elemento, dois lados. */
function bothSides(d: string): string {
  return `${d} ${mirrorX(d)}`;
}

// --- membros ---------------------------------------------------------------

type Limb = { x: number; y: number; w: number }[];

function pointOnLimb(limb: Limb, t: number) {
  const pos = Math.min(limb.length - 1, Math.max(0, t * (limb.length - 1)));
  const i = Math.floor(pos);
  const j = Math.min(limb.length - 1, i + 1);
  const f = pos - i;
  const a = limb[i];
  const b = limb[j];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, w: a.w + (b.w - a.w) * f };
}

/**
 * Trecho de um membro entre duas frações do comprimento.
 *
 * A largura é aplicada na PERPENDICULAR à linha do membro, então braço e perna
 * inclinados não ficam com a borda cortada na diagonal. Dois trechos que
 * terminam e começam no mesmo `t` encostam exatamente — o músculo É o membro,
 * não uma pintura sobre ele.
 */
function limbSegment(limb: Limb, t0: number, t1: number, steps = 12): string {
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const p = pointOnLimb(limb, t);
    const before = pointOnLimb(limb, Math.max(0, t - 0.015));
    const after = pointOnLimb(limb, Math.min(1, t + 0.015));
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (p.w / 2);
    const ny = (dx / len) * (p.w / 2);
    left.push(pt(p.x - nx, p.y - ny));
    right.unshift(pt(p.x + nx, p.y + ny));
  }
  return `M ${left.join(" L ")} L ${right.join(" L ")} Z`;
}

// ---------------------------------------------------------------------------
// Medidas da figura (≈7,5 cabeças)
// ---------------------------------------------------------------------------

const TORSO: Profile = [
  { y: 84, half: 24 }, // base do pescoço
  { y: 114, half: 70 }, // linha dos ombros
  { y: 152, half: 63 }, // peitoral
  { y: 204, half: 53 }, // últimas costelas
  { y: 256, half: 41 }, // cintura
  { y: 300, half: 49 }, // quadril
  { y: 336, half: 52 }, // crista ilíaca
];

/** Braço esquerdo da tela (o direito de quem é desenhado), do ombro à mão.
 * O primeiro ponto é estreito de propósito: é o que arredonda o deltoide em
 * vez de deixá-lo com topo reto. */
const ARM: Limb = [
  { x: 128, y: 108, w: 14 },
  { x: 121, y: 124, w: 38 },
  { x: 113, y: 154, w: 42 },
  { x: 106, y: 196, w: 37 },
  { x: 100, y: 240, w: 32 },
  { x: 96, y: 280, w: 27 },
  { x: 91, y: 318, w: 26 },
  { x: 85, y: 356, w: 22 },
  { x: 80, y: 392, w: 18 },
];

/** Perna esquerda da tela. A largura do topo faz os dois lados encostarem na
 * virilha sem se sobreporem: 180 − 56/2 = 152, e o espelho começa em 180. */
const LEG: Limb = [
  { x: 152, y: 336, w: 56 },
  { x: 148, y: 382, w: 62 },
  { x: 145, y: 434, w: 55 },
  { x: 143, y: 478, w: 42 },
  { x: 142, y: 508, w: 32 },
  { x: 140, y: 550, w: 40 },
  { x: 141, y: 598, w: 25 },
  { x: 143, y: 638, w: 17 },
];

// --- costuras --------------------------------------------------------------
// Cada costura é usada por DUAS regiões. Mudar uma delas move as duas juntas.

/** Topo do trapézio: sobe do pescoço e desce em direção ao ombro. */
const seamNeck: Seam = (f) => 84 + 22 * f * f;
/** Trapézio → peitoral (frente): desce em diagonal até a axila. */
const seamTrapPec: Seam = (f) => 112 + 22 * f;
/** Linha inferior do peitoral: sobe em direção à axila, como o músculo real. */
const seamPecAbs: Seam = (f) => 206 - 36 * f * f;
/** Fim do abdômen, na altura da crista ilíaca. */
const seamAbsEnd: Seam = (f) => 330 - 26 * f * f;

/** Trapézio → dorsal (costas): o losango do trapézio desce no MEIO e sobe nas
 * pontas, ao contrário de um corte reto. */
const seamTrapLat: Seam = (f) => 178 - 56 * f * f;
/** Dorsal → lombar: o dorsal afunila e termina na cintura. */
const seamLatLombar: Seam = (f) => 280 - 26 * f * f;
const seamLombarEnd: Seam = (f) => 336 - 18 * f * f;

// ---------------------------------------------------------------------------
// Regiões — frente
// ---------------------------------------------------------------------------

export const FRONT: Region[] = [
  {
    group: "trapezio",
    label: "Trapézio",
    d: bothSides(sideRegion(TORSO, seamNeck, seamTrapPec, 0.04, 0.9)),
  },
  {
    group: "peito",
    label: "Peito",
    // Falha do esterno entre os dois peitorais; não chega à borda das costelas.
    d: bothSides(sideRegion(TORSO, seamTrapPec, seamPecAbs, 0.11, 0.97)),
  },
  {
    group: "abdomen",
    label: "Abdômen",
    d: centerRegion(TORSO, seamPecAbs, seamAbsEnd, 0.8),
  },
  {
    group: "ombros",
    label: "Ombros",
    // Deltoide: capuz arredondado sobre a articulação.
    d: bothSides(limbSegment(ARM, 0, 0.28)),
  },
  { group: "biceps", label: "Bíceps", d: bothSides(limbSegment(ARM, 0.28, 0.58)) },
  { group: "antebraco", label: "Antebraço", d: bothSides(limbSegment(ARM, 0.58, 0.93)) },
  { group: "quadriceps", label: "Quadríceps", d: bothSides(limbSegment(LEG, 0.02, 0.5)) },
  { group: "panturrilhas", label: "Panturrilhas", d: bothSides(limbSegment(LEG, 0.62, 0.93)) },
];

// ---------------------------------------------------------------------------
// Regiões — costas
// ---------------------------------------------------------------------------

export const BACK: Region[] = [
  {
    group: "trapezio",
    label: "Trapézio",
    d: bothSides(sideRegion(TORSO, seamNeck, seamTrapLat, 0.04, 0.9)),
  },
  {
    group: "costas",
    label: "Costas",
    d: bothSides(sideRegion(TORSO, seamTrapLat, seamLatLombar, 0.06, 0.95)),
  },
  {
    group: "lombar",
    label: "Lombar",
    d: centerRegion(TORSO, seamLatLombar, seamLombarEnd, 0.74),
  },
  { group: "ombros", label: "Ombros", d: bothSides(limbSegment(ARM, 0, 0.28)) },
  { group: "triceps", label: "Tríceps", d: bothSides(limbSegment(ARM, 0.28, 0.58)) },
  { group: "antebraco", label: "Antebraço", d: bothSides(limbSegment(ARM, 0.58, 0.93)) },
  { group: "gluteos", label: "Glúteos", d: bothSides(limbSegment(LEG, 0, 0.2)) },
  { group: "posteriores", label: "Posteriores", d: bothSides(limbSegment(LEG, 0.2, 0.5)) },
  { group: "panturrilhas", label: "Panturrilhas", d: bothSides(limbSegment(LEG, 0.62, 0.93)) },
];

// ---------------------------------------------------------------------------
// Estrutura: o que não é grupo muscular classificável
// ---------------------------------------------------------------------------

/** Cabeça, pescoço, flancos, joelhos, mãos e pés. Sem toque, sem foco e sem
 * cor de estímulo — não existe "série de flanco", e pintar essa área
 * sugeriria um registro que não existe. */
export const STRUCTURE: string[] = [
  // Pescoço
  "M 162 68 L 198 68 L 200 92 L 160 92 Z",
  // Tronco inteiro por baixo: costelas e flancos aparecem como corpo, não
  // como músculo sem registro.
  bothSides(sideRegion(TORSO, seamNeck, seamAbsEnd, 0, 1, 20)),
  // Joelho
  bothSides(limbSegment(LEG, 0.5, 0.62, 8)),
  // Mão
  bothSides(limbSegment(ARM, 0.93, 1, 6)),
  // Tornozelo
  bothSides(limbSegment(LEG, 0.93, 1, 6)),
  // Pé
  bothSides("M 134 632 L 153 632 L 156 660 L 126 662 Z"),
];

/** Cabeça, desenhada como elipse pelo componente. */
export const HEAD = { cx: CX, cy: 40, rx: 25, ry: 34 };

/** Grupos que a figura representa. `corpo_inteiro` e `cardio` não são regiões
 * do corpo e aparecem só na lista textual. */
export const MAPPED_GROUPS: MuscleGroup[] = [...new Set([...FRONT, ...BACK].map((r) => r.group))];
