-- ============================================
-- Regras Oficiais – Farm Free Fire
-- Rode no SQL Editor do Supabase (Database > SQL Editor)
--
-- O script só insere se a tabela estiver vazia,
-- portanto é seguro rodar novamente sem sobrescrever
-- edições feitas pelo Admin na página de Regras.
-- ============================================

insert into regras (texto, atualizado_em)
select $regras$
# 📜 REGRAS OFICIAIS — FARM FREE FIRE

> **Objetivo:** garantir uma divisão justa dos lucros, proteger a banca e manter todos os registros organizados e transparentes.

---

## 1. Contagem de Horas

- Somente horas jogadas em **RANK** contam para a divisão do lucro semanal.
- Eventos **não** contam como horas de RANK.

## 2. Eventos

- O dinheiro obtido nos eventos será dividido **igualmente entre todos os jogadores** que participaram daquele evento.
- As horas de eventos **não** serão somadas às horas do RANK.

## 3. Arredondamento

- A contagem será feita de **30 em 30 minutos**, arredondando para o intervalo mais próximo.
- Não serão considerados minutos quebrados.

## 4. Divisão dos Lucros

Todo o lucro semanal do RANK será somado e dividido **proporcionalmente às horas jogadas** por cada participante.

**Exemplo de cálculo — lucro semanal de R$ 850,00:**

| Jogador | Horas | Recebe |
|---|---:|---:|
| CH | 15h | R$ 255,00 |
| TH | 13h | R$ 221,00 |
| DN | 12h | R$ 204,00 |
| KIK | 10h | R$ 170,00 |
| **Total** | **50h** | **R$ 850,00** |

> **Cálculo:** R$ 850,00 ÷ 50h = **R$ 17,00 por hora** — cada jogador recebe o valor por hora multiplicado pelas horas jogadas.

## 5. Entregas Graves

- Uma entregada realmente grave, que prejudique a equipe em um round importante, terá desconto de **R$ 3,00** do responsável, distribuindo **R$ 1,00 para cada um dos outros três jogadores**.
- Em **AP alto**, os valores poderão ser discutidos pelo grupo.
- Os exemplos serão definidos posteriormente.

## 6. Registro no Site

- Todos devem registrar seus horários diretamente no site, clicando em **COMEÇAR** ao iniciar o RANK e em **PARAR** ao terminar ou fazer uma pausa. Ao voltar, clicar novamente em **COMEÇAR**.
- O registro deve ser feito **sempre, sem exceções**.
- Horas, eventos, lucros e penalidades também devem ser registrados no site, para manter tudo organizado e permitir a conferência dos valores.

## 7. Organização dos Dias de RANK

- Os dias de RANK devem ser **combinados previamente no grupo**, com todos cientes e de acordo.
- A preferência é **um dia sim e outro não**, sempre que possível.
- Ninguém poderá jogar escondido ou chamar apenas alguns jogadores por fora.
- Caso alguém jogue sem combinar com o grupo, o lucro daquela sessão será dividido **igualmente entre os quatro jogadores (25% para cada)**.

## 8. Apostas e Banca

- Apostas de valor alto, principalmente em AP alto, deverão ser divididas utilizando o **dinheiro pessoal dos jogadores**, sem retirar dinheiro da banca semanal.
- Todos devem concordar previamente com o valor.

## 9. Transparência e Alterações

- Todos os registros deverão ficar disponíveis para conferência.
- As regras poderão ser modificadas posteriormente, desde que as alterações sejam **combinadas e aprovadas pelo grupo**.

---

**OBJETIVO:** garantir uma divisão justa dos lucros, proteger a banca e manter todos os registros organizados e transparentes.
$regras$, now()
where not exists (select 1 from regras);

-- Para substituir o texto existente pelo padrão acima, rode no SQL Editor:
-- delete from regras;
-- (e depois rode este script novamente)