create extension if not exists "pgcrypto";

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  contact text,
  country text,
  role text,
  source text,
  product text,
  status text default 'Developing',
  priority text default 'B',
  last_contact date,
  next_followup date,
  blocker text,
  notes text,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  activity_type text not null,
  channel text,
  activity_date date not null default current_date,
  note text,
  next_followup date,
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'General',
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_user_id_idx on public.customers(user_id);
create index if not exists customers_next_followup_idx on public.customers(next_followup);
create index if not exists activities_customer_id_idx on public.activities(customer_id);
create index if not exists knowledge_user_id_idx on public.knowledge_items(user_id);

alter table public.customers enable row level security;
alter table public.activities enable row level security;
alter table public.knowledge_items enable row level security;

drop policy if exists customers_select on public.customers;
drop policy if exists customers_insert on public.customers;
drop policy if exists customers_update on public.customers;
drop policy if exists customers_delete on public.customers;
create policy customers_select on public.customers for select using (auth.uid() = user_id);
create policy customers_insert on public.customers for insert with check (auth.uid() = user_id);
create policy customers_update on public.customers for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy customers_delete on public.customers for delete using (auth.uid() = user_id);

drop policy if exists activities_select on public.activities;
drop policy if exists activities_insert on public.activities;
drop policy if exists activities_update on public.activities;
drop policy if exists activities_delete on public.activities;
create policy activities_select on public.activities for select using (auth.uid() = user_id);
create policy activities_insert on public.activities for insert with check (auth.uid() = user_id);
create policy activities_update on public.activities for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy activities_delete on public.activities for delete using (auth.uid() = user_id);

drop policy if exists knowledge_select on public.knowledge_items;
drop policy if exists knowledge_insert on public.knowledge_items;
drop policy if exists knowledge_update on public.knowledge_items;
drop policy if exists knowledge_delete on public.knowledge_items;
create policy knowledge_select on public.knowledge_items for select using (auth.uid() = user_id);
create policy knowledge_insert on public.knowledge_items for insert with check (auth.uid() = user_id);
create policy knowledge_update on public.knowledge_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy knowledge_delete on public.knowledge_items for delete using (auth.uid() = user_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists customers_touch on public.customers;
create trigger customers_touch before update on public.customers
for each row execute function public.touch_updated_at();

drop trigger if exists knowledge_touch on public.knowledge_items;
create trigger knowledge_touch before update on public.knowledge_items
for each row execute function public.touch_updated_at();
