/** @typedef {{ acao: string, criado_em: string }} EventoContagem */

/** @param {number} lucroBruto @param {number} horasEquipe */
export function calcularTaxaHoraSemana(lucroBruto, horasEquipe) {
  const lucro = Math.max(0, Number(lucroBruto) || 0);
  const horas = Math.max(0, Number(horasEquipe) || 0);
  return horas > 0 ? lucro / horas : 0;
}

/** @param {number} segundos */
export function arredondarHorasParaMeiaHora(segundos) {
  const tempo = Math.max(0, Number(segundos) || 0);
  return Math.round(tempo / 1800) * 0.5;
}

/** @param {number} valorBruto @param {number} penalidades */
export function calcularTotalReceber(valorBruto, penalidades) {
  const bruto = Math.max(0, Number(valorBruto) || 0);
  const desconto = Math.max(0, Number(penalidades) || 0);
  return Math.max(0, Number((bruto - desconto).toFixed(2)));
}

/**
 * Distribui o tempo de farm pelos dias em UTC, contando apenas os trechos
 * entre início/retomada e pausa/encerramento.
 * @param {EventoContagem[]} eventos
 * @param {number} desdeMs
 * @param {number} ateMs
 * @returns {Map<string, number>}
 */
export function calcularSegundosAtivosPorDia(eventos, desdeMs, ateMs) {
  const dias = new Map();
  let inicioAtivo = null;

  const somarTrecho = (inicio, fim) => {
    let cursor = Math.max(inicio, desdeMs);
    const final = Math.min(fim, ateMs);
    while (cursor < final) {
      const data = new Date(cursor);
      const inicioDia = Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate());
      const fimDia = inicioDia + 24 * 60 * 60 * 1000;
      const parteFim = Math.min(final, fimDia);
      const chave = new Date(inicioDia).toISOString().slice(0, 10);
      dias.set(chave, (dias.get(chave) || 0) + Math.floor((parteFim - cursor) / 1000));
      cursor = parteFim;
    }
  };

  const ordenados = [...eventos].sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime());
  for (const evento of ordenados) {
    const acao = evento.acao.replace(/^admin:/, "");
    const instante = new Date(evento.criado_em).getTime();
    if (!Number.isFinite(instante)) continue;

    if (acao === "iniciar_sessao" || acao === "retomar_sessao") {
      if (inicioAtivo !== null) somarTrecho(inicioAtivo, instante);
      inicioAtivo = instante;
    } else if (acao === "pausar_sessao" || acao === "encerrar_sessao") {
      if (inicioAtivo !== null) somarTrecho(inicioAtivo, instante);
      inicioAtivo = null;
    }
  }

  if (inicioAtivo !== null) somarTrecho(inicioAtivo, ateMs);
  return dias;
}
