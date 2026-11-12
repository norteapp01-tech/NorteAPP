-- Extend the existing account reset without dropping another participant's group.
begin;
do $$
declare definition text;
begin
 select pg_get_functiondef('public.reset_my_account_content()'::regprocedure) into definition;
 if position('norte_circles' in definition)>0 then
  raise exception 'Account reset already has community handling; review before applying.';
 end if;
 if position('foreach table_name in array array[' in definition)=0 then
  raise exception 'Unexpected account reset definition; review required.';
 end if;
 definition:=replace(definition,'foreach table_name in array array[', $replacement$
  if exists(select 1 from public.norte_circles c where c.owner_id=account_id and exists(
    select 1 from public.norte_circle_members m where m.circle_id=c.id and m.user_id<>account_id and m.status='active'
  )) then
    raise exception 'Transfira a administração dos grupos com participantes antes de recomeçar.';
  end if;
  delete from public.norte_circles where owner_id=account_id;
  delete from public.norte_social_notifications where user_id=account_id or actor_id=account_id;
  foreach table_name in array array[
    'norte_circle_reactions', 'norte_circle_reports', 'norte_circle_posts',
    'norte_challenge_members', 'norte_circle_shares', 'norte_circle_members',
    'norte_automation_keys', 'habit_settings',
 $replacement$);
 execute definition;
end $$;
commit;
