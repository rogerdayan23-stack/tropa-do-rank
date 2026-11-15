# Rank Farm

Sistema completo de controle de "farm de rank" para até 4 pessoas, construído com Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Supabase e deploy na Vercel.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui (Radix UI)
- Supabase (Postgres + Auth custom)
- Vercel (deploy + Cron)
- Lucide React (ícones), Sonner (toasts), date-fns

## Banco de dados (Supabase)

1. Crie um projeto no [Supabase Dashboard](https://supabase.com/dashboard).
2. Vá em **SQL Editor** e rode o conteúdo do arquivo [`schema.sql`](./schema.sql).
3. Vá em **Settings > API** e copie:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `Project API keys > anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `Project API keys > service_role secret` → `SUPABASE_SERVICE_ROLE_KEY`

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```bash
cp .env.example .env.local
```

Edite `.env.local` com os valores do Supabase.

## Instalação e execução local

```bash
# Instalar dependências
npm install

# Rodar em desenvolvimento
npm run dev

# Abrir http://localhost:3000
```

O primeiro usuário cadastrado se torna automaticamente o **admin**.

## Fluxo de funcionamento

1. **Login**: informe um apelido único (sem senha). Se não existir, o usuário é criado automaticamente. A sessão persiste via cookie (`tropa_session`).
2. **Dashboard**: clique em **INICIAR FARM** para criar uma sessão ativa. O cronômetro é calculado no servidor (`segundos_acumulados + (now() - inicio)`). Use Pausar / Retomar / Parar.
3. **Persistência**: ao fechar e reabrir o navegador, a sessão ativa é mantida.
4. **Timeout automático**: sessões acima de 8h são encerradas pelo cron do Vercel (a cada 1 min).
5. **Heartbeat**: o frontend envia POST a cada 60s; sem atividade por 15 min, a pausa é automática (aviso exibido).
6. **Histórico**: sessões encerradas com filtros por período.
7. **Ranking**: top usuários com medalhas 🥇🥈🥉.
8. **Perfil**: total, média por sessão, streak e gráfico de 7 dias.
9. **Regras**: texto editável pelo admin; aceite obrigatório na primeira sessão.
10. **Admin**: encerrar/ajustar/cancelar sessões, editar regras, exportar CSV, log de auditoria.

## Deploy na Vercel

1. Faça push do código para um repositório GitHub.
2. Importe o repositório na [Vercel](https://vercel.com).
3. Adicione as mesmas variáveis de ambiente (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) nas **Settings > Environment Variables** da Vercel.
4. O arquivo [`vercel.json`](./vercel.json) configura o Cron que roda `/api/cron/timeout` a cada minuto. Ative o Cron no painel da Vercel (Dashboard > Project > Cron Jobs).
5. Rode `npm run build` localmente para verificar se não há erros de TypeScript antes de fazer push.

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — build de produção
- `npm run start` — servidor de produção
- `npm run lint` — linter

## Estrutura de pastas

```
src/
  app/
    (pages): dashboard, historico, ranking, perfil, regras, admin, login
    api/
      auth/login, auth/logout, auth/me
      sessoes, sessoes/iniciar, sessoes/pausar, sessoes/retomar, sessoes/parar
      heartbeat, ranking, regras
      admin/sessoes, admin/logs, admin/export
      cron/timeout
  components/
    ui/ (shadcn/ui components)
    navbar.tsx, providers.tsx
  lib/
    supabase.ts, supabase-browser.ts, auth.ts, utils.ts
  types/
    database.ts
```

## Regras de negócio resumidas

- Apelido único, sem senha.
- Sessão ativa calculada no servidor.
- Limite de 8h por sessão (expiração automática).
- Heartbeat de 60s; pausa após 15min sem atividade.
- Primeiro usuário cadastrado = admin.
- Regras editáveis apenas pelo admin.
