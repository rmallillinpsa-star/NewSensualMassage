create extension if not exists pgcrypto;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.admin_profiles ap
    where ap.user_id = auth.uid()
      and ap.is_active = true
  );
$$;

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  site_key text unique not null check (site_key in ('diamond', 'elite', 'manila')),
  slug text unique not null,
  name text unique not null,
  address text,
  phone text,
  email text,
  whatsapp_number text,
  viber_number text,
  wechat_id text,
  telegram_username text,
  map_link text,
  logo_url text,
  logo_path text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  name text not null,
  description text not null,
  duration text,
  female_rate numeric(12,2) not null default 0,
  male_rate numeric(12,2) not null default 0,
  category text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  slug text not null unique,
  gender text not null check (gender in ('Female', 'Male')),
  role text,
  specialty text,
  age integer,
  height text,
  weight text,
  bio text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_images (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  image_url text,
  storage_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.promos (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  title text not null,
  description text not null,
  label text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.slides (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  title text,
  subtitle text,
  image_url text not null,
  image_path text,
  alt_text text,
  button_text text,
  button_link text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.home_sections (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  section_key text not null,
  title text not null,
  description text not null,
  image_url text,
  image_path text,
  button_text text,
  button_link text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, section_key)
);

create table if not exists public.rates (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  key text not null,
  label text not null,
  amount numeric(12,2) not null default 0,
  category text not null default 'service' check (category in ('service', 'taxi')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  key text not null,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, key)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete set null,
  branch_name text,
  timestamp timestamptz not null default now(),
  name text not null,
  phone text,
  service text,
  female_therapist_count integer not null default 0,
  male_therapist_count integer not null default 0,
  booking_date date,
  booking_time text,
  female_therapists text,
  male_therapists text,
  estimated_service_cost numeric(12,2) not null default 0,
  taxi_fare numeric(12,2) not null default 0,
  total_estimate numeric(12,2) not null default 0,
  agreement text default 'No',
  notes text,
  status text not null default 'New' check (status in ('New', 'Confirmed', 'Completed', 'Cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists admin_profiles_set_updated_at on public.admin_profiles;
create trigger admin_profiles_set_updated_at before update on public.admin_profiles
for each row execute function public.set_updated_at();

drop trigger if exists branches_set_updated_at on public.branches;
create trigger branches_set_updated_at before update on public.branches
for each row execute function public.set_updated_at();

drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at before update on public.services
for each row execute function public.set_updated_at();

drop trigger if exists staff_set_updated_at on public.staff;
create trigger staff_set_updated_at before update on public.staff
for each row execute function public.set_updated_at();

drop trigger if exists promos_set_updated_at on public.promos;
create trigger promos_set_updated_at before update on public.promos
for each row execute function public.set_updated_at();

drop trigger if exists slides_set_updated_at on public.slides;
create trigger slides_set_updated_at before update on public.slides
for each row execute function public.set_updated_at();

drop trigger if exists home_sections_set_updated_at on public.home_sections;
create trigger home_sections_set_updated_at before update on public.home_sections
for each row execute function public.set_updated_at();

drop trigger if exists rates_set_updated_at on public.rates;
create trigger rates_set_updated_at before update on public.rates
for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at before update on public.settings
for each row execute function public.set_updated_at();

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at before update on public.bookings
for each row execute function public.set_updated_at();

alter table public.admin_profiles enable row level security;
alter table public.branches enable row level security;
alter table public.services enable row level security;
alter table public.staff enable row level security;
alter table public.staff_images enable row level security;
alter table public.promos enable row level security;
alter table public.slides enable row level security;
alter table public.home_sections enable row level security;
alter table public.rates enable row level security;
alter table public.settings enable row level security;
alter table public.bookings enable row level security;

drop policy if exists "public can read active branches" on public.branches;
create policy "public can read active branches"
on public.branches
for select
to anon, authenticated
using (active = true);

drop policy if exists "public can read active services" on public.services;
create policy "public can read active services"
on public.services
for select
to anon, authenticated
using (active = true);

drop policy if exists "public can read active staff" on public.staff;
create policy "public can read active staff"
on public.staff
for select
to anon, authenticated
using (active = true);

drop policy if exists "public can read staff images" on public.staff_images;
create policy "public can read staff images"
on public.staff_images
for select
to anon, authenticated
using (true);

drop policy if exists "public can read active promos" on public.promos;
create policy "public can read active promos"
on public.promos
for select
to anon, authenticated
using (active = true);

drop policy if exists "public can read active slides" on public.slides;
create policy "public can read active slides"
on public.slides
for select
to anon, authenticated
using (active = true);

drop policy if exists "public can read active home sections" on public.home_sections;
create policy "public can read active home sections"
on public.home_sections
for select
to anon, authenticated
using (active = true);

drop policy if exists "public can read active rates" on public.rates;
create policy "public can read active rates"
on public.rates
for select
to anon, authenticated
using (active = true);

drop policy if exists "public can read settings" on public.settings;
create policy "public can read settings"
on public.settings
for select
to anon, authenticated
using (true);

drop policy if exists "public can create bookings" on public.bookings;
create policy "public can create bookings"
on public.bookings
for insert
to anon, authenticated
with check (true);

drop policy if exists "admins can manage admin profiles" on public.admin_profiles;
create policy "admins can manage admin profiles"
on public.admin_profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage branches" on public.branches;
create policy "admins can manage branches"
on public.branches
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage services" on public.services;
create policy "admins can manage services"
on public.services
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage staff" on public.staff;
create policy "admins can manage staff"
on public.staff
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage staff images" on public.staff_images;
create policy "admins can manage staff images"
on public.staff_images
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage promos" on public.promos;
create policy "admins can manage promos"
on public.promos
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage slides" on public.slides;
create policy "admins can manage slides"
on public.slides
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage home sections" on public.home_sections;
create policy "admins can manage home sections"
on public.home_sections
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage rates" on public.rates;
create policy "admins can manage rates"
on public.rates
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage settings" on public.settings;
create policy "admins can manage settings"
on public.settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can view bookings" on public.bookings;
create policy "admins can view bookings"
on public.bookings
for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can update bookings" on public.bookings;
create policy "admins can update bookings"
on public.bookings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', true)
on conflict (id) do nothing;

drop policy if exists "public can read site media" on storage.objects;
create policy "public can read site media"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'site-media');

drop policy if exists "admins can upload site media" on storage.objects;
create policy "admins can upload site media"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'site-media' and public.is_admin());

drop policy if exists "admins can update site media" on storage.objects;
create policy "admins can update site media"
on storage.objects
for update
to authenticated
using (bucket_id = 'site-media' and public.is_admin())
with check (bucket_id = 'site-media' and public.is_admin());

drop policy if exists "admins can delete site media" on storage.objects;
create policy "admins can delete site media"
on storage.objects
for delete
to authenticated
using (bucket_id = 'site-media' and public.is_admin());
