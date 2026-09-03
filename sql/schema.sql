-- Run this once in Supabase: Project -> SQL Editor -> New query -> paste -> Run

create extension if not exists "pgcrypto";

-- Businesses you provide the service to (cafes, shops, agencies, etc.)
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  monthly_fee numeric(10,2) default 0,
  subscription_status text not null default 'trial', -- trial | active | past_due | canceled
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

-- A "QR group" is one printed QR code. It can point to one or several
-- photo+video items (e.g. a seasonal menu with several dishes behind one code).
create table qr_groups (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  slug text not null unique, -- short public id used in the scan URL
  buttons jsonb not null default '[]', -- [{ "label": "Instagram", "url": "https://...", "icon": "ti-brand-instagram" }]
  created_at timestamptz not null default now()
);

-- One photo+video pair. photo_url is the trigger image, mind_url is the
-- compiled AR target file generated in the browser at upload time.
create table items (
  id uuid primary key default gen_random_uuid(),
  qr_group_id uuid not null references qr_groups(id) on delete cascade,
  name text not null,
  photo_url text not null,
  mind_url text not null,
  video_url text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- One row per scan, for basic analytics. Written by the public scan page.
create table scans (
  id uuid primary key default gen_random_uuid(),
  qr_group_id uuid not null references qr_groups(id) on delete cascade,
  item_id uuid references items(id) on delete set null,
  city text,
  country text,
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table clients enable row level security;
alter table qr_groups enable row level security;
alter table items enable row level security;
alter table scans enable row level security;

-- Admin (you, logged in via Supabase Auth) can do everything.
create policy "admin full access clients" on clients
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin full access qr_groups" on qr_groups
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin full access items" on items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin full access scans" on scans
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- The public scan page (no login) needs to read qr_groups + items to show the AR
-- experience, and needs to insert a row into scans to log a visit.
create policy "public read qr_groups" on qr_groups
  for select using (true);
create policy "public read active items" on items
  for select using (active = true);
create policy "public insert scans" on scans
  for insert with check (true);

-- ---------- Storage ----------
-- Photos, videos, and compiled .mind target files are stored in Cloudflare
-- R2, not in Supabase Storage — see api/get-upload-url.js and the setup
-- notes in ИНСТРУКЦИЯ.md. Supabase here only holds the database (this file).
