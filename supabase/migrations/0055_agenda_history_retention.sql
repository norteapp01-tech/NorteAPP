-- Preserva o histórico da Agenda quando o compromisso de origem é removido.
-- O Espelho precisa continuar sabendo o que foi reagendado/cancelado/removido,
-- mesmo quando a linha de `executions` já não existe mais.

begin;

alter table public.agenda_changes
  add column if not exists subject_title text;

alter table public.agenda_changes
  drop constraint if exists agenda_changes_execution_id_fkey;

alter table public.agenda_changes
  add constraint agenda_changes_execution_id_fkey
  foreign key (execution_id) references public.executions (id) on delete set null;

-- As rotinas antigas continuam sendo a origem dos módulos (Academia,
-- Esportes etc.), mas agora o que for configurado pela Agenda também precisa
-- sobreviver às próximas materializações da rotina.
alter table public.routines
  add column if not exists end_time text,
  add column if not exists location text,
  add column if not exists rigid boolean not null default false,
  add column if not exists label_id uuid references public.agenda_labels (id) on delete set null,
  add column if not exists notes text,
  add column if not exists link text,
  add column if not exists all_day boolean not null default false,
  add column if not exists alerts jsonb not null default '[]'::jsonb;

commit;
