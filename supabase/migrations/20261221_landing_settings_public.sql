-- The public landing page reads its section toggles (System settings → Platform → Landing Page) as a
-- logged-out visitor, but anonymous users could only read the signup / branding keys: visitors got
-- nothing back and every section showed (code defaults = on), whatever the toggles said.
-- Add the five landing toggles to the keys anonymous visitors may read. No DROP.
alter policy "anon can read auth settings" on public.system_settings
  using (key = any (array[
    'signup_roles_visible', 'signup_flow_per_role', 'role_permissions', 'auto_approve_domains',
    'platform_name', 'platform_tagline', 'brand_logo_url',
    'show_pricing_section', 'show_trusted_by', 'show_stats_section', 'show_testimonials', 'show_promo_video'
  ]));
