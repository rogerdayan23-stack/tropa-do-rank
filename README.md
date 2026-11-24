# Rank dos Cuiudos

Aplicação para acompanhar sessões de farm, ranking, regras e divisão semanal dos lucros da tropa. Feita com Next.js 14, TypeScript, Tailwind CSS e Supabase.

## Tecnologias

- Next.js 14 (App Router) e React 18
- Supabase/PostgreSQL, com autenticação própria por usuário e senha
- Tailwind CSS, Radix UI e Lucide
- Geist e Geist Mono locais em `src/app/fonts`; o build não depende de buscar fontes online
- Deploy preparado para Vercel

## Banco de dados

Para um banco novo, execute [`schema.sql`](./schema.sql) no SQL Editor do Supabase.

Para um banco já existente, faça um backup e execute [`migrations/2026-11-23-operacao-semanal.sql`](./migrations/2026-11-23-operacao-semanal.sql) **antes de publicar as rotas desta versão**. Ela adiciona o vínculo entre logs e sessões, converte valores financeiros para `numeric`, IDs para UUID e instala a função transacional de fechamento semanal. Se a verificação da migração encontrar IDs financeiros inválidos, ela para sem converter os dados; corrija esses registros e rode novamente.

No painel do Supabase, em **Settings → API**, copie:

- `Project URL` para `NEXT_PUBLIC_SUPABASE_URL`
- chave `anon public` para `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- chave `service_role` para `SUPABASE_SERVICE_ROLE_KEY` (somente servidor)

## Configuração local

Copie `.env.example` para `.env.local` e preencha as variáveis. `JWT_SECRET` deve ser aleatório e ter pelo menos 32 caracteres.

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>. O cadastro está disponível na tela de login e exige nome de usuário e senha. A senha é armazenada com bcrypt; após entrar, a sessão persiste em um cookie httpOnly chamado `tropa_session`. Contas novas recebem o papel `user`; a promoção de um Admin Master é feita explicitamente no banco.

## Recursos

- **Início:** resumo semanal de horas e lucro, estimativa do próprio jogador, status da equipe e controles de sessão.
- **Sessões:** iniciar, pausar, retomar e encerrar contagem. O limite por sessão é de cinco horas.
- **Registro de horas:** timeline por sessão com horários e duração dos trechos ativos.
- **Ranking:** semana, mês ou acumulado geral; inclui meta semanal inicial de 10 horas, sequência e recorde de sessão.
- **Saldos:** soma das horas da semana, calcula a taxa horária, desconta penalidades e apresenta lucro e horas por dia.
- **Fechamento semanal:** mostra a conferência por jogador, arquiva o resumo e baixa um comprovante CSV. O fechamento usa uma função SQL transacional e um identificador de solicitação para evitar duplicações em tentativas repetidas.
- **Administração:** usuários, regras, sessões, monitoramento e auditoria com permissões verificadas no servidor.

### Regra financeira

`taxa por hora = lucro bruto semanal ÷ horas totais da equipe`

`valor bruto do jogador = horas do jogador na semana × taxa por hora`

`total a receber = máximo entre zero e (valor bruto − penalidades da semana)`

## Deploy na Vercel

1. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` e `CRON_SECRET` nas variáveis de ambiente.
2. Para banco existente, aplique a migração SQL antes do deploy.
3. Publique o projeto. A rotina diária de timeout é definida em `vercel.json`.
4. Confira a compilação com `npm run build` antes de enviar alterações.

## Comandos

- `npm run dev` — ambiente de desenvolvimento
- `npm run build` — build de produção
- `npm run start` — inicia o build de produção
- `npm run lint` — linter do Next.js
