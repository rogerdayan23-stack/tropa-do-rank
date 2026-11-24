-- Execute no SQL Editor do Supabase antes de publicar as rotas que usam
-- session_id e fechar_semana_atomico.

begin;

alter table public.logs
  add column if not exists sessao_id uuid references public.sessoes(id) on delete set null;
create index if not exists idx_logs_sessao_id on public.logs(sessao_id);

-- Recupera o vínculo dos registros antigos pela sessão que ainda estava
-- aberta no momento do evento. O app só permite uma sessão por jogador.
update public.logs l
set sessao_id = (
  select s.id
  from public.sessoes s
  where s.user_id = l.user_id
    and (s.fim is null or s.fim >= l.criado_em)
  order by case when s.fim is null then 1 else 0 end,
           s.fim asc nulls last,
           s.inicio desc nulls last
  limit 1
)
where l.sessao_id is null
  and l.user_id is not null
  and l.acao in ('iniciar_sessao','pausar_sessao','retomar_sessao','encerrar_sessao',
                 'admin:pausar_sessao','admin:retomar_sessao');

alter table public.fechamentos_semanais
  add column if not exists request_id uuid;
create unique index if not exists idx_fechamentos_request_id
  on public.fechamentos_semanais(request_id)
  where request_id is not null;

-- A migração para UUID interrompe com uma mensagem clara se houver IDs
-- antigos que não possam ser relacionados à tabela users.
do $$
begin
  if exists (select 1 from public.lucros_diarios where criado_por is not null and criado_por !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'lucros_diarios.criado_por contém valores que não são UUID; corrija esses registros antes da migração.';
  end if;
  if exists (select 1 from public.pagamentos where user_id is null or user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'pagamentos.user_id contém valores que não são UUID; corrija esses registros antes da migração.';
  end if;
  if exists (select 1 from public.penalidades where user_id is null or user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or admin_id is null or admin_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'penalidades.user_id/admin_id contém valores que não são UUID; corrija esses registros antes da migração.';
  end if;
  if exists (select 1 from public.fechamentos_semanais where fechado_por is null or fechado_por !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'fechamentos_semanais.fechado_por contém valores que não são UUID; corrija esses registros antes da migração.';
  end if;
  if exists (select 1 from public.pagamentos p left join public.users u on u.id::text = p.user_id where u.id is null) then
    raise exception 'pagamentos contém usuários removidos ou inexistentes; corrija esses registros antes da migração.';
  end if;
  if exists (select 1 from public.penalidades p left join public.users u on u.id::text = p.user_id where u.id is null)
     or exists (select 1 from public.penalidades p left join public.users u on u.id::text = p.admin_id where u.id is null) then
    raise exception 'penalidades contém usuários ou administradores removidos; corrija esses registros antes da migração.';
  end if;
  if exists (select 1 from public.lucros_diarios l left join public.users u on u.id::text = l.criado_por where l.criado_por is not null and u.id is null) then
    raise exception 'lucros_diarios contém criadores removidos ou inexistentes; corrija esses registros antes da migração.';
  end if;
  if exists (select 1 from public.fechamentos_semanais f left join public.users u on u.id::text = f.fechado_por where u.id is null) then
    raise exception 'fechamentos_semanais contém administradores removidos; corrija esses registros antes da migração.';
  end if;
end;
$$;

alter table public.lucros_diarios
  alter column valor_total type numeric(12,2) using round(valor_total::numeric, 2),
  alter column criado_por type uuid using nullif(criado_por, '')::uuid;

-- Alguns pagamentos antigos podem apontar para lucros já removidos pelo
-- fechamento semanal. Mantém o histórico do pagamento e limpa só a referência.
update public.pagamentos p
set lucro_diario_id = null
where p.lucro_diario_id is not null
  and not exists (
    select 1 from public.lucros_diarios l
    where l.id::text = p.lucro_diario_id
  );

alter table public.pagamentos
  alter column lucro_diario_id type uuid using nullif(lucro_diario_id, '')::uuid,
  alter column user_id type uuid using user_id::uuid,
  alter column horas_farmadas type numeric(10,2) using round(horas_farmadas::numeric, 2),
  alter column valor_calculado type numeric(12,2) using round(valor_calculado::numeric, 2);

alter table public.fechamentos_semanais
  alter column lucro_total type numeric(12,2) using round(lucro_total::numeric, 2),
  alter column total_horas type numeric(10,2) using round(total_horas::numeric, 2),
  alter column fechado_por type uuid using fechado_por::uuid;

alter table public.penalidades
  alter column user_id type uuid using user_id::uuid,
  alter column admin_id type uuid using admin_id::uuid,
  alter column valor type numeric(12,2) using round(valor::numeric, 2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pagamentos_user_id_fkey') then
    alter table public.pagamentos add constraint pagamentos_user_id_fkey
      foreign key (user_id) references public.users(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pagamentos_lucro_diario_id_fkey') then
    alter table public.pagamentos add constraint pagamentos_lucro_diario_id_fkey
      foreign key (lucro_diario_id) references public.lucros_diarios(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'penalidades_user_id_fkey') then
    alter table public.penalidades add constraint penalidades_user_id_fkey
      foreign key (user_id) references public.users(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'penalidades_admin_id_fkey') then
    alter table public.penalidades add constraint penalidades_admin_id_fkey
      foreign key (admin_id) references public.users(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lucros_diarios_criado_por_fkey') then
    alter table public.lucros_diarios add constraint lucros_diarios_criado_por_fkey
      foreign key (criado_por) references public.users(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fechamentos_semanais_fechado_por_fkey') then
    alter table public.fechamentos_semanais add constraint fechamentos_semanais_fechado_por_fkey
      foreign key (fechado_por) references public.users(id) on delete restrict;
  end if;
end;
$$;

create or replace function public.fechar_semana_atomico(
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
  if p_data_inicio is null or p_data_fim is null or p_data_inicio > p_data_fim then
    raise exception 'Período semanal inválido';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_request_id::text)::bigint);

  select id into v_id
  from public.fechamentos_semanais
  where request_id = p_request_id;
  if v_id is not null then
    return jsonb_build_object('id', v_id, 'repetido', true);
  end if;

  insert into public.fechamentos_semanais (
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

  delete from public.lucros_diarios
  where data >= p_data_inicio and data <= p_data_fim;

  v_detalhe := format(
    'Semana %s a %s arquivada. Lucro bruto: R$ %s; horas totais: %s.',
    p_data_inicio, p_data_fim,
    to_char(coalesce(p_lucro_total, 0), 'FM999999990D00'),
    to_char(coalesce(p_total_horas, 0), 'FM999999990D00')
  );
  insert into public.logs (user_id, admin_id, acao, detalhe, criado_em)
  values (p_fechado_por, p_fechado_por, 'admin:fechar_semana', v_detalhe, now());

  return jsonb_build_object('id', v_id, 'repetido', false);
end;
$$;

revoke all on function public.fechar_semana_atomico(text, text, numeric, numeric, jsonb, uuid, uuid) from public;
grant execute on function public.fechar_semana_atomico(text, text, numeric, numeric, jsonb, uuid, uuid) to service_role;

commit;
