-- ============================================================
-- Выполни этот SQL в Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Таблица бюджетов (один бюджет на месяц)
create table budgets (
  id uuid default gen_random_uuid() primary key,
  month text not null unique,
  total numeric not null default 0,
  categories jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Таблица транзакций (каждая трата — отдельная строка)
create table transactions (
  id uuid default gen_random_uuid() primary key,
  month text not null,
  transaction_id text not null unique,
  amount numeric not null,
  category text not null,
  note text default '',
  date text not null,
  timestamp bigint not null,
  created_at timestamptz default now()
);

-- Индекс для быстрой выборки транзакций за месяц
create index idx_transactions_month on transactions(month);

-- ============================================================
-- Row Level Security: только залогиненные пользователи
-- Данные общие (household) — оба пользователя видят всё
-- ============================================================
alter table budgets enable row level security;
alter table transactions enable row level security;

create policy "auth_budgets_all" on budgets
  for all using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "auth_transactions_all" on transactions
  for all using (auth.uid() is not null)
  with check (auth.uid() is not null);
