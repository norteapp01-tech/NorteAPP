-- Dois grupos musculares que faltavam no catálogo: trapézio e lombar.
--
-- Até aqui, encolhimento e remada alta caíam em "ombros" ou "costas", e
-- extensão lombar caía em "costas". O mapa corporal passa a desenhar as duas
-- regiões, então elas precisam existir como classificação — senão o corpo
-- mostraria uma área que nenhum exercício consegue alimentar.
--
-- NADA é reclassificado por este arquivo. Exercício já gravado como "costas"
-- continua "costas": adivinhar qual deles era lombar reescreveria o histórico
-- de quem nunca fez essa escolha. Quem quiser separar reclassifica na ficha,
-- e a partir daí as sessões novas já nascem separadas — o retrato
-- (planned_snapshot) preserva o que cada sessão antiga afirmava.
--
-- ALTER TYPE ... ADD VALUE não roda dentro de bloco de transação explícito em
-- toda versão suportada, por isso este arquivo não abre begin/commit.

alter type muscle_group add value if not exists 'trapezio' after 'costas';
alter type muscle_group add value if not exists 'lombar' after 'trapezio';
