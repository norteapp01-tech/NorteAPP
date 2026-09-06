-- Humor do dia ("Como você está?") — 1 valor por usuário, escopado por data.
-- Vive em profiles (mesma linha 1:1 por usuário, mesmo espírito de
-- notify_reminders etc. em 0011) em vez de tabela própria: é um valor só,
-- sem histórico a consultar hoje. mood_date != hoje na leitura significa
-- "sem humor definido hoje" (TodayScreen.tsx faz essa comparação).

alter table profiles add column mood_date date;
alter table profiles add column mood_value text;
