-- Team beitreten schon bei der Anmeldung
-- Voraussetzung: 20261120090000_feinschliff.sql (team_members, team_join, nexora_workspace).
--
-- Wer bei der Anmeldung einen Einladungscode eingibt, überspringt die übrigen Fragen. Damit
-- Startseite, Fahrplan und Firmenname wie beim Inhaber aussehen, übernimmt die App einmalig
-- dessen Antworten (Firmenname, Phase, Branche, Rechtsform, Schwerpunkte). Diese Funktion
-- liefert sie – nur für Teammitglieder, und nur die Antworten des eigenen Teams.
-- Die Business-Daten selbst (Kunden, Aufträge, Rechnungen, Umsatz …) teilt das Team ohnehin.

create or replace function public.team_answers()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.nexora_workspace() is distinct from auth.uid() then (
    select jsonb_build_object(
      'business_name', p.business_name,
      'stage', p.stage,
      'industry', p.industry,
      'industry_other', p.industry_other,
      'legal_form', p.legal_form,
      'goals', p.goals)
    from public.profiles p
    where p.id = public.nexora_workspace()
  ) end;
$$;

revoke all on function public.team_answers() from public, anon;
grant execute on function public.team_answers() to authenticated;

notify pgrst, 'reload schema';
