// Sem API bíblica conectada ainda — lista fixa e isolada, escolhida de forma
// determinística pelo dia do ano (não repete a cada render, não exige estado).
// Ponto de integração futuro: trocar `verseOfDay()` por uma chamada de API
// mantendo a mesma assinatura de retorno ({ reference, text }).

import { nowDate } from "./test-clock";

export type Verse = { reference: string; text: string };

const VERSES: Verse[] = [
  {
    reference: "Provérbios 16:3",
    text: "Consagre ao Senhor tudo o que você faz, e os seus planos serão bem-sucedidos.",
  },
  {
    reference: "Isaías 41:10",
    text: "Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus.",
  },
  {
    reference: "Filipenses 4:6",
    text: "Não andem ansiosos por coisa alguma, mas em tudo, pela oração e súplicas, apresentem seus pedidos a Deus.",
  },
  {
    reference: "Mateus 6:33",
    text: "Busquem, pois, em primeiro lugar o Reino de Deus e a sua justiça, e todas essas coisas lhes serão acrescentadas.",
  },
  { reference: "Salmos 46:10", text: "Aquietai-vos, e sabei que eu sou Deus." },
  {
    reference: "Josué 1:9",
    text: "Não fui eu que ordenei a você? Seja forte e corajoso! Não se apavore, nem se desanime, pois o Senhor, o seu Deus, estará com você.",
  },
  {
    reference: "Romanos 8:28",
    text: "Sabemos que Deus age em todas as coisas para o bem daqueles que o amam.",
  },
  { reference: "Salmos 23:1", text: "O Senhor é o meu pastor; nada me faltará." },
  {
    reference: "Provérbios 3:5-6",
    text: "Confie no Senhor de todo o coração e não se apoie em seu próprio entendimento.",
  },
  {
    reference: "João 14:27",
    text: "Deixo-lhes a paz; a minha paz lhes dou. Não a dou como o mundo a dá. Não se perturbe o seu coração.",
  },
  {
    reference: "Salmos 37:4",
    text: "Agrade-se do Senhor, e ele atenderá aos desejos do seu coração.",
  },
  {
    reference: "Lamentações 3:22-23",
    text: "As misericórdias do Senhor são a causa de não sermos consumidos; elas se renovam cada manhã.",
  },
  {
    reference: "Gálatas 6:9",
    text: "Não nos cansemos de fazer o bem, pois no tempo próprio colheremos, se não desanimarmos.",
  },
  {
    reference: "1 Pedro 5:7",
    text: "Lancem sobre ele toda a sua ansiedade, porque ele tem cuidado de vocês.",
  },
  {
    reference: "Hebreus 11:1",
    text: "Ora, a fé é a certeza daquilo que esperamos e a prova das coisas que não vemos.",
  },
];

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function verseOfDay(date: Date = nowDate()): Verse {
  return VERSES[dayOfYear(date) % VERSES.length];
}

const MESSAGES = [
  "Um momento de presença pode mudar o ritmo do seu dia.",
  "Separe alguns minutos para desacelerar.",
  "Este espaço é seu.",
  "Não precisa ser perfeito — só presente.",
  "Um respiro antes de seguir em frente.",
];

export function contextualMessage(date: Date = nowDate()): string {
  return MESSAGES[dayOfYear(date) % MESSAGES.length];
}
