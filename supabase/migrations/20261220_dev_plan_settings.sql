-- Development plan base spec (System settings → Spec quality → Plan de desarrollo): the approved
-- spec (normally Spec C), whole, with one development activity per technical object.
insert into public.system_settings (key, value)
values ('dev_plan_settings', '{"base":"approved","fallback":["c","a","b","d"],"full_spec":true,"align_objects":true}'::jsonb)
on conflict (key) do nothing;
