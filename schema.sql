-- ============================================
-- Schema do Supabase para Rank Farm
-- Rode este SQL no SQL Editor do Supabase Dashboard
-- ============================================

-- Extensão para UUID
create extension if not exists pgcrypto;

-- ============================================
-- Tabela: usuários
-- ============================================
create table if not exists users (
  id uuid default gen_random_uuid() primary key,
  username text unique not null,
  apelido text unique not null,
  role text default 'user' constraint users_role_check check (role in ('user','moderador','admin')),
  is_admin boolean default false,
  avatar_url text,
  session_token text,
  password_hash text,
  total_segundos integer default 0,
  criado_em timestamptz default now()
);

-- ============================================
-- Tabela: sessões de farm
-- ============================================
create table if not exists sessoes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id) on delete cascade,
  inicio timestamptz,
  ultima_atividade timestamptz,
  fim timestamptz,
  segundos_acumulados integer default 0,
  status text default 'ativa' check (status in ('ativa','pausada','encerrada','expirada')),
  validada_por uuid references users(id)
);

-- ============================================
-- Tabela: regras (editável pelo admin)
-- ============================================
create table if not exists regras (
  id uuid default gen_random_uuid() primary key,
  texto text default '',
  atualizado_em timestamptz default now()
);

-- ============================================
-- Tabela: log de auditoria
-- ============================================
create table if not exists logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id) on delete set null,
  sessao_id uuid references sessoes(id) on delete set null,
  acao text not null,
  detalhe text,
  admin_id uuid references users(id) on delete set null,
  criado_em timestamptz default now()
);

-- ============================================
-- Tabela: lucros diários (para a página de Saldos)
-- ============================================
create table if not exists lucros_diarios (
  id uuid default gen_random_uuid() primary key,
  data text unique not null,
  valor_total numeric(12,2) not null default 0,
  criado_por uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

-- ============================================
-- Tabela: pagamentos (confirmação de pagamento semanal)
-- ============================================
create table if not exists pagamentos (
  id uuid default gen_random_uuid() primary key,
  lucro_diario_id uuid references lucros_diarios(id) on delete set null,
  data text not null,
  user_id uuid not null references users(id) on delete restrict,
  horas_farmadas numeric(10,2) not null default 0,
  valor_calculado numeric(12,2) not null default 0,
  pago boolean default false,
  pago_em timestamptz,
  created_at timestamptz default now()
);

-- ============================================
-- Tabela: fechamentos semanais (histórico de semanas fechadas)
-- ============================================
create table if not exists fechamentos_semanais (
  id uuid default gen_random_uuid() primary key,
  data_inicio text not null,
  data_fim text not null,
  lucro_total numeric(12,2) not null default 0,
  total_horas numeric(10,2) not null default 0,
  detalhes_json text not null default '[]',
  fechado_por uuid not null references users(id) on delete restrict,
  request_id uuid unique,
  created_at timestamptz default now()
);

-- ============================================
-- Tabela: penalidades (apenas admin pode adicionar/remover)
-- ============================================
create table if not exists penalidades (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references users(id) on delete restrict,
  admin_id uuid not null references users(id) on delete restrict,
  motivo text not null,
  valor numeric(12,2) not null default 0,
  created_at timestamptz default now()
);

-- ============================================
-- Índices para performance
-- ============================================
create index if not exists idx_sessoes_user_id on sessoes(user_id);
create index if not exists idx_sessoes_status on sessoes(status);
create index if not exists idx_sessoes_inicio on sessoes(inicio);
create index if not exists idx_users_username on users(username);
create index if not exists idx_users_apelido on users(apelido);
create index if not exists idx_users_session_token on users(session_token);
create index if not exists idx_lucros_diarios_data on lucros_diarios(data);
create index if not exists idx_pagamentos_data on pagamentos(data);
create index if not exists idx_pagamentos_user_id on pagamentos(user_id);
create index if not exists idx_penalidades_user_id on penalidades(user_id);
create index if not exists idx_penalidades_created_at on penalidades(created_at);
create index if not exists idx_logs_criado_em on logs(criado_em);
create index if not exists idx_logs_sessao_id on logs(sessao_id);
create index if not exists idx_fechamentos_semanais_datas on fechamentos_semanais(data_inicio, data_fim);

-- Fecha o ciclo numa única transação e evita duplicar uma solicitação repetida.
create or replace function fechar_semana_atomico(
  p_data_inicio text,
  p_data_fim text,
  p_lucro_total numeric,
  p_total_horas numeric,
  p_detalhes jsonb,
  p_fechado_por uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_detalhe text;
begin
  if p_request_id is null then
    raise exception 'Identificador da solicitação é obrigatório';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_request_id::text)::bigint);

  select id into v_id
  from fechamentos_semanais
  where request_id = p_request_id;

  if v_id is not null then
    return jsonb_build_object('id', v_id, 'repetido', true);
  end if;

  insert into fechamentos_semanais (
    data_inicio, data_fim, lucro_total, total_horas, detalhes_json, fechado_por, request_id
  ) values (
    p_data_inicio,
    p_data_fim,
    round(coalesce(p_lucro_total, 0), 2),
    round(coalesce(p_total_horas, 0), 2),
    coalesce(p_detalhes, '[]'::jsonb)::text,
    p_fechado_por,
    p_request_id
  ) returning id into v_id;

  delete from lucros_diarios
  where data >= p_data_inicio and data <= p_data_fim;

  v_detalhe := format('Semana %s a %s arquivada. Lucro bruto: R$ %s; horas totais: %s.',
    p_data_inicio, p_data_fim, to_char(coalesce(p_lucro_total, 0), 'FM999999990D00'),
    to_char(coalesce(p_total_horas, 0), 'FM999999990D00'));

  insert into logs (user_id, admin_id, acao, detalhe, criado_em)
  values (p_fechado_por, p_fechado_por, 'admin:fechar_semana', v_detalhe, now());

  return jsonb_build_object('id', v_id, 'repetido', false);
end;
$$;

revoke all on function fechar_semana_atomico(text, text, numeric, numeric, jsonb, uuid, uuid) from public;
grant execute on function fechar_semana_atomico(text, text, numeric, numeric, jsonb, uuid, uuid) to service_role;

-- ============================================
-- Comentários
-- ============================================
comment on table users is 'Usuários do Rank Farm';
comment on table sessoes is 'Sessões de farm com controle de tempo';
comment on table regras is 'Regras do sistema, editável pelo admin';
comment on table logs is 'Log de auditoria de ações';
comment on table lucros_diarios is 'Lucros diários registrados pelo admin';
comment on table pagamentos is 'Pagamentos confirmados semanalmente';
comment on table fechamentos_semanais is 'Histórico de semanas fechadas';
comment on table penalidades is 'Penalidades aplicadas aos jogadores';
