-- Automatización de escenarios alternativos de envío parcial: cuando una
-- operación marítima tiene mercadería divisible o con urgencia parcial, el
-- sistema compara automáticamente el escenario marítimo completo contra
-- variantes con una porción por courier o por aéreo. Todo lo que gobierna la
-- elegibilidad courier y las tarifas de referencia vive en tablas
-- parametrizables (nunca hardcodeado), porque la normativa y las tarifas
-- cambian con el tiempo.

-- ---------------------------------------------------------------------------
-- shipping_scenario_rules: parámetros de elegibilidad courier (y futuros
-- parámetros de escenarios), versionables por vigencia sin tocar código.
-- ---------------------------------------------------------------------------
create table if not exists public.shipping_scenario_rules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  value jsonb not null,
  is_active boolean not null default true,
  source text,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.shipping_scenario_rules;
create trigger set_updated_at before update on public.shipping_scenario_rules for each row execute procedure public.set_updated_at();

insert into public.shipping_scenario_rules (key, description, value, source) values
  ('courier_max_units_same_species', 'Máximo de unidades de la misma especie por envío courier', '3', 'normativa_courier_ar'),
  ('courier_max_weight_per_package_kg', 'Peso máximo por paquete courier (kg)', '50', 'normativa_courier_ar'),
  ('courier_max_fob_usd', 'Valor FOB máximo por envío courier (USD)', '3000', 'normativa_courier_ar'),
  ('courier_duty_exemption_fob_usd', 'Franquicia FOB para derecho de importación y tasa estadística (USD)', '400', 'normativa_courier_ar'),
  ('courier_requires_non_commercial_use', 'El régimen courier exige que el envío no tenga fin comercial', 'true', 'normativa_courier_ar'),
  ('courier_max_uses_per_year', 'Máximo de usos del régimen courier por persona por año', '5', 'normativa_courier_ar')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- courier_rate_table / air_rate_table: tarifas de referencia por franja de
-- peso, editables por un admin sin deploy. Fila 'default'/'*' como fallback
-- cuando no hay una franja específica para el origen/destino/peso.
-- ---------------------------------------------------------------------------
create table if not exists public.courier_rate_table (
  id uuid primary key default gen_random_uuid(),
  origin_country text not null,
  destination_country text not null,
  weight_from numeric not null default 0,
  weight_to numeric not null,
  estimated_cost_usd numeric not null,
  estimated_days_min integer not null,
  estimated_days_max integer not null,
  provider_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists courier_rate_table_route_idx on public.courier_rate_table (origin_country, destination_country);

insert into public.courier_rate_table (origin_country, destination_country, weight_from, weight_to, estimated_cost_usd, estimated_days_min, estimated_days_max, provider_name) values
  ('China', 'Argentina', 0, 5, 45, 5, 9, 'Courier internacional (referencia)'),
  ('China', 'Argentina', 5, 20, 95, 5, 9, 'Courier internacional (referencia)'),
  ('China', 'Argentina', 20, 50, 180, 6, 10, 'Courier internacional (referencia)'),
  ('*', '*', 0, 5, 60, 5, 10, 'Courier internacional (referencia genérica)'),
  ('*', '*', 5, 20, 120, 5, 10, 'Courier internacional (referencia genérica)'),
  ('*', '*', 20, 50, 220, 6, 12, 'Courier internacional (referencia genérica)')
on conflict do nothing;

create table if not exists public.air_rate_table (
  id uuid primary key default gen_random_uuid(),
  origin text not null,
  destination text not null,
  weight_from numeric not null default 0,
  weight_to numeric not null,
  rate_per_kg numeric not null,
  fuel_surcharge numeric not null default 0,
  estimated_days_min integer not null,
  estimated_days_max integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists air_rate_table_route_idx on public.air_rate_table (origin, destination);

insert into public.air_rate_table (origin, destination, weight_from, weight_to, rate_per_kg, fuel_surcharge, estimated_days_min, estimated_days_max) values
  ('China', 'Argentina', 0, 1000, 4.85, 110, 4, 8),
  ('Países Bajos', 'Argentina', 0, 1000, 5.25, 140, 4, 8),
  ('EE.UU.', 'Argentina', 0, 1000, 3.40, 85, 3, 6),
  ('Brasil', 'Argentina', 0, 1000, 2.10, 50, 2, 5),
  ('*', '*', 0, 1000, 4.00, 75, 4, 9)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- simulation_items: datos de divisibilidad/urgencia cargados en el paso de
-- mercadería del wizard, insumo del optimizador de escenarios.
-- ---------------------------------------------------------------------------
alter table public.simulation_items
  add column if not exists is_divisible boolean not null default false,
  add column if not exists min_separable_qty numeric not null default 0,
  add column if not exists weight_per_unit_kg numeric not null default 0,
  add column if not exists urgency text not null default 'baja' check (urgency in ('baja', 'media', 'alta')),
  add column if not exists partial_urgent_needed boolean not null default false,
  add column if not exists urgent_qty_suggested numeric not null default 0,
  add column if not exists declared_use text not null default 'comercial' check (declared_use in ('comercial', 'muestra', 'repuesto', 'uso_personal', 'otro'));

-- ---------------------------------------------------------------------------
-- simulation_alternative_scenarios: cada escenario generado (marítimo solo,
-- marítimo+courier, marítimo+aéreo, aéreo completo) para una simulación,
-- con su propio desglose de costos, elegibilidad, advertencias y flujo de
-- revisión PJM. Nunca reemplaza a `simulations` (que sigue siendo el
-- escenario marítimo "oficial" cargado por el cliente) — es siempre
-- comparativo/estimativo hasta que un admin lo valide.
-- ---------------------------------------------------------------------------
create table if not exists public.simulation_alternative_scenarios (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.simulations (id) on delete cascade,
  scenario_key text not null check (scenario_key in ('maritime_only', 'maritime_courier', 'maritime_air', 'air_only')),
  status text not null default 'generated' check (status in ('generated', 'preferred', 'requested_review', 'pjm_validated', 'pjm_rejected')),
  eligibility text check (eligibility in ('courier_eligible', 'courier_not_eligible', 'courier_requires_pjm_review')),
  eligibility_reasons text[] not null default '{}',
  recommendation text not null default 'review' check (recommendation in ('recommended', 'review', 'not_eligible')),
  currency text not null default 'USD',
  fob_partial numeric not null default 0,
  weight_partial_kg numeric not null default 0,
  freight numeric not null default 0,
  insurance numeric not null default 0,
  customs_duty numeric not null default 0,
  statistical_rate numeric not null default 0,
  fiscal_credits numeric not null default 0,
  local_costs numeric not null default 0,
  definitive_cost numeric not null default 0,
  cash_required numeric not null default 0,
  unit_cost numeric not null default 0,
  estimated_days_min integer not null default 0,
  estimated_days_max integer not null default 0,
  diff_cash_required numeric not null default 0,
  diff_cash_required_percent numeric not null default 0,
  diff_taxes numeric not null default 0,
  diff_logistics numeric not null default 0,
  diff_days_min integer not null default 0,
  diff_days_max integer not null default 0,
  warnings text[] not null default '{}',
  assumptions jsonb not null default '{}'::jsonb,
  items_split jsonb not null default '{}'::jsonb,
  cost_breakdown jsonb not null default '[]'::jsonb,
  is_preferred boolean not null default false,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists simulation_alternative_scenarios_simulation_id_idx on public.simulation_alternative_scenarios (simulation_id);
create index if not exists simulation_alternative_scenarios_status_idx on public.simulation_alternative_scenarios (status);

drop trigger if exists set_updated_at on public.simulation_alternative_scenarios;
create trigger set_updated_at before update on public.simulation_alternative_scenarios for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- pjm_requests: qué escenario alternativo (si alguno) el cliente marcó como
-- preferido/pidió que PJM analice.
-- ---------------------------------------------------------------------------
alter table public.pjm_requests
  add column if not exists selected_scenario_id uuid references public.simulation_alternative_scenarios (id) on delete set null,
  add column if not exists scenario_review_status text not null default 'none' check (scenario_review_status in ('none', 'requested', 'validated', 'rejected'));

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.shipping_scenario_rules enable row level security;
alter table public.courier_rate_table enable row level security;
alter table public.air_rate_table enable row level security;
alter table public.simulation_alternative_scenarios enable row level security;

-- Reference/rate tables: same pattern as the Sprint 2 catalog — any
-- authenticated user can read (the wizard/scenario generation runs on
-- behalf of a client), only admin_pjm can write.
create policy "shipping_scenario_rules_select_authenticated" on public.shipping_scenario_rules for select
  using (auth.uid() is not null);
create policy "shipping_scenario_rules_write_admin" on public.shipping_scenario_rules for all
  using (public.is_admin_pjm()) with check (public.is_admin_pjm());

create policy "courier_rate_table_select_authenticated" on public.courier_rate_table for select
  using (auth.uid() is not null);
create policy "courier_rate_table_write_admin" on public.courier_rate_table for all
  using (public.is_admin_pjm()) with check (public.is_admin_pjm());

create policy "air_rate_table_select_authenticated" on public.air_rate_table for select
  using (auth.uid() is not null);
create policy "air_rate_table_write_admin" on public.air_rate_table for all
  using (public.is_admin_pjm()) with check (public.is_admin_pjm());

-- simulation_alternative_scenarios: client only ever reads their own
-- simulation's scenarios. Marking one "preferred" or requesting PJM review
-- are client-triggered but system-controlled writes (no user-supplied cost
-- figures), so they go through the service-role client from a server
-- action that first verifies ownership — same pattern as
-- createDefaultChecklistForSimulation (Sprint 3) — rather than a client
-- UPDATE policy, which could not otherwise stop a client from rewriting its
-- own cost fields (RLS WITH CHECK only restricts the value of `status`,
-- not arbitrary other columns).
create policy "alt_scenarios_select_own_or_admin" on public.simulation_alternative_scenarios for select
  using (public.is_admin_pjm() or exists (select 1 from public.simulations s where s.id = simulation_id and s.user_id = auth.uid()));

create policy "alt_scenarios_admin_all" on public.simulation_alternative_scenarios for all
  using (public.is_admin_pjm()) with check (public.is_admin_pjm());
