# Refinamento da Evolução — setembro de 2026

- Corpo preservado, com caminhos vetoriais separados sobre o atlas. Sem blur; a área visível e o alvo clicável são o mesmo caminho. Divisões do peitoral, tríceps, abdômen, pernas e costas; trapézio e lombar explicitamente identificados.
- Regiões anatômicas não são novas medições: o catálogo persistido mantém Costas como grupo de trapézio/lombar/dorsal. Não há reclassificação automática do histórico nem migração de banco.
- Volume: séries diretas relativas ao máximo do período. Progressão: no mínimo três sessões comparáveis do mesmo exercício/equipamento, referência com mais sessões, sem escolher apenas a que melhorou. Resultados mistos não são escondidos numa média; ausência de dados é neutra.
- Lista de exercícios diretamente abaixo do mapa. Mantidos busca, ordenação, acesso a todos os exercícios e aba Desempenho.
- Detalhe: sessões/dias registrados, melhor registro histórico para a referência escolhida, gráfico consultável de carga ou repetições e histórico de todas as séries do período. Melhor registro não é automaticamente um novo PR.
- Perfil de repetições em gaveta: faixas 1–5, 6–12, 13+, filtro por músculo, acesso aos exercícios. Não prescreve ciclos nem classifica hipertrofia; histórico não diferencia aquecimento.
- Distribuição e medidas preservadas. Filtros e cards harmonizados com preto/grafite/verde do Norte.

Validação: `npm test`, `npx tsc --noEmit`, build e `node scripts/check-evolution.mjs` (fixtures isoladas, sem escritas em produção).
