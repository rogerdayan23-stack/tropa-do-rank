-- ============================================
-- Habilita o cargo "moderador" (Co-Admin) na tabela users
-- Rode no SQL Editor do Supabase (Database > SQL Editor)
--
-- O Co-Admin (moderador) pode gerenciar Saldos e Penalidades.
-- O Admin Master (admin) tem controle total, incluindo
-- o gerenciamento de usuários em /admin/usuarios.
-- ============================================

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'users_role_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users drop constraint users_role_check;
  end if;

  alter table public.users
    add constraint users_role_check
    check (role in ('user', 'moderador', 'admin'));
end $$;

-- Garante que nenhum usuário fique sem cargo
update public.users
set role = 'user'
where role is null or btrim(role) = '';

-- Ajusta o flag is_admin para refletir o cargo (usado em telas antigas)
update public.users
set is_admin = (role = 'admin');