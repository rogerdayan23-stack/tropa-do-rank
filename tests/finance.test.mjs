import test from "node:test";
import assert from "node:assert/strict";
import {
  arredondarHorasParaMeiaHora,
  calcularSegundosAtivosPorDia,
  calcularTaxaHoraSemana,
  calcularTotalReceber,
} from "../src/lib/finance.mjs";

test("calcula a taxa semanal e trata semanas sem horas", () => {
  assert.equal(calcularTaxaHoraSemana(850, 50), 17);
  assert.equal(calcularTaxaHoraSemana(850, 0), 0);
});

test("arredonda horas para o bloco de meia hora mais próximo", () => {
  assert.equal(arredondarHorasParaMeiaHora(14 * 60 + 59), 0);
  assert.equal(arredondarHorasParaMeiaHora(15 * 60), 0.5);
  assert.equal(arredondarHorasParaMeiaHora(44 * 60 + 59), 0.5);
  assert.equal(arredondarHorasParaMeiaHora(45 * 60), 1);
});

test("desconta penalidades e não permite valor a receber negativo", () => {
  assert.equal(calcularTotalReceber(100.126, 12.12), 88.01);
  assert.equal(calcularTotalReceber(10, 12), 0);
  assert.equal(calcularTotalReceber(-10, 0), 0);
});

test("soma apenas trechos ativos e divide a sessão entre dias UTC", () => {
  const eventos = [
    { acao: "admin:pausar_sessao", criado_em: "2026-01-06T00:30:00.000Z" },
    { acao: "iniciar_sessao", criado_em: "2026-01-05T23:30:00.000Z" },
    { acao: "retomar_sessao", criado_em: "2026-01-06T01:30:00.000Z" },
    { acao: "encerrar_sessao", criado_em: "2026-01-06T02:30:00.000Z" },
  ];
  const desde = Date.parse("2026-01-05T00:00:00.000Z");
  const ate = Date.parse("2026-01-07T00:00:00.000Z");

  assert.deepEqual(
    [...calcularSegundosAtivosPorDia(eventos, desde, ate)],
    [
      ["2026-01-05", 1800],
      ["2026-01-06", 5400],
    ],
  );
});

test("fecha o trecho ainda ativo no limite do período consultado", () => {
  const inicio = Date.parse("2026-02-01T23:50:00.000Z");
  const limite = Date.parse("2026-02-02T00:20:00.000Z");
  const dias = calcularSegundosAtivosPorDia(
    [{ acao: "iniciar_sessao", criado_em: new Date(inicio).toISOString() }],
    inicio,
    limite,
  );

  assert.deepEqual([...dias], [
    ["2026-02-01", 600],
    ["2026-02-02", 1200],
  ]);
});
