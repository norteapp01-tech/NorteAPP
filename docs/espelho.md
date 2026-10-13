# Espelho (Fase 3)

O Espelho mostra como a pessoa está vivendo a agenda e as rotinas. Três visões
(Visão geral, Agenda, Rotinas) e quatro períodos (7 dias, 30 dias, 3 meses,
personalizado — sempre terminando hoje, no máximo 366 dias). Tudo é calculado na
hora a partir de dados que o app já guarda; **não há tabela de métricas**.

## Regras de dados

| Termo | Significado |
|---|---|
| Concluído | `status = concluida` |
| Não realizado | planejada/perdida cujo horário **já acabou** (hoje, o que está em andamento não conta) |
| Cancelado | `status = cancelada`. É decisão da pessoa: fora da taxa e do tempo |
| Reagendamento | linha `moved` em `agenda_changes`, contada pela data local em que a mudança aconteceu |
| Taxa de realização | concluídos ÷ (concluídos + não realizados) |
| Futuro | nunca entra; um compromisso só conta depois de acabar |
| Dia inteiro | conta em quantidade, não em horas |
| Meia-noite | o compromisso é um intervalo contínuo; o que invade o 1º dia entra, o que passa do último é cortado |
| Sobreposição | cada minuto vai para **um** compromisso (o que começou antes; rígido desempata). O que estava duplicado aparece como "sobreposto" |
| Google | eventos que vieram do Google ou são somente leitura entram no **tempo e na carga**, mas **não na taxa** (não há "concluir" confiável) |
| Antes/depois da sincronização | o Espelho lê o estado atual do Norte; o histórico de mudanças só registra o que foi feito no Norte |
| Poucos dados | menos de 5 encerrados: mostra números, avisa e não gera padrões. Fatias com menos de 3 compromissos ficam vazias |
| Tempo | só **duração planejada**. O app não mede tempo real e a interface diz isso |

## Origem dos dados

* Compromissos, séries, exceções e rótulos: o mesmo cálculo da Agenda (`buildOccurrences`).
* Reagendamentos: `agenda_changes` (sobrevive à exclusão do compromisso via `subject_title`).
* "Como foi?": `executions.feeling` (migration 0058) — opcional, nunca inferido.
* Isolamento: RLS das tabelas de origem; nada de novo a proteger.

## Arquivos

`src/lib/mirror-analytics.ts` (cálculos), `mirror-insights.ts` (frases + evidência +
ação), `mirror-store.ts` (dados), `src/components/mirror/*` (telas).
