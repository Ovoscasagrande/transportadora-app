/* ==========================================================================
   MELHORIAS OPERACIONAIS (M2 a M6) — componentes reutilizáveis

   M2 Checklist rápido (15s)      -> abreChecklist() / salvaChecklist()
   M3 km/L com alerta de queda    -> rendimentoPorPlaca() / seloRendimento()
   M4 Semáforo preventivo         -> semaforoOleo() / semaforoDoc()
   M5 Auditoria pedágio x jornada -> renderAuditoriaPedagio()
   M6 Fechamento líquido          -> renderFechamentoLiquido()
   ========================================================================== */

/* ======================================================= M4 SEMÁFORO ===== */
function barraPreventiva({ rotulo, valorTexto, pct, estado, dica }) {
  const cls = estado === 'critico' ? 'prev-critico'
            : estado === 'atencao' ? 'prev-atencao' : 'prev-ok';
  const largura = Math.max(0, Math.min(100, pct == null ? 0 : pct));
  return '<div class="preventivo ' + cls + '">' +
    '<div class="prev-topo"><span class="prev-rot">' + esc(rotulo) + '</span>' +
    '<span class="prev-val">' + esc(valorTexto) + '</span></div>' +
    '<div class="prev-barra"><i style="width:' + largura + '%"></i></div>' +
    (dica ? '<div class="pq txt3" style="font-size:10.5px">' + esc(dica) + '</div>' : '') +
    '</div>';
}

function semaforoOleo(v) {
  const kmAtual = Number(v.km_atual || 0);
  const interv = Number(v.intervalo_oleo_km || 0);
  const ultima = v.ultima_troca_oleo_km;

  if (!interv) {
    return barraPreventiva({ rotulo: 'Óleo', valorTexto: 'sem intervalo',
      pct: 0, estado: 'atencao', dica: 'Configurar o intervalo de troca' });
  }
  if (ultima == null) {
    // caso real dos 2 caminhões hoje: sem isso o alerta NUNCA dispara
    return barraPreventiva({ rotulo: 'Óleo', valorTexto: 'configurar',
      pct: 0, estado: 'atencao',
      dica: 'Falta o km da última troca — o alerta não funciona sem ele' });
  }
  const rodado = kmAtual - Number(ultima);
  const restante = interv - rodado;
  const pct = interv > 0 ? (restante / interv) * 100 : 0;
  const estado = restante <= 0 ? 'critico' : pct <= 20 ? 'atencao' : 'ok';
  return barraPreventiva({
    rotulo: 'Óleo',
    valorTexto: restante <= 0 ? 'passou ' + num(-restante) + ' km' : 'faltam ' + num(restante) + ' km',
    pct: pct, estado: estado,
    dica: num(rodado) + ' km de ' + num(interv)
  });
}

function semaforoDoc(rotulo, vencimento) {
  if (!vencimento) {
    return barraPreventiva({ rotulo: rotulo, valorTexto: 'sem validade',
      pct: 0, estado: 'atencao', dica: 'Cadastrar o vencimento' });
  }
  const dias = diasAte(vencimento);
  const pct = Math.max(0, Math.min(100, (dias / 365) * 100));
  const estado = dias < 0 ? 'critico' : dias <= 30 ? 'atencao' : 'ok';
  return barraPreventiva({
    rotulo: rotulo,
    valorTexto: dias < 0 ? 'venceu há ' + Math.abs(dias) + 'd' : dias + ' dias',
    pct: pct, estado: estado, dica: dataBR(vencimento)
  });
}

/** Dias entre hoje e uma data pura (YYYY-MM-DD). Sem passar por UTC. */
function diasAte(dataISO) {
  if (!dataISO) return null;
  const m = String(dataISO).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const alvo = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
}

/* ========================================================= M3 km/L ===== */
/* Abastecimento `parcial` NÃO fecha ciclo: só vale quando o tanque completou,
   senão o km/L sai errado para baixo e o motorista leva culpa indevida. */
function rendimentoPorPlaca(abastecimentos, veiculos) {
  const porPlaca = {};
  (abastecimentos || [])
    .filter(a => a.km != null && Number(a.km) > 0)
    .forEach(a => {
      const placa = (veiculos || []).find(v => v.id === a.veiculo_id);
      if (!placa) return;
      const p = placa.placa;
      (porPlaca[p] = porPlaca[p] || []).push({
        id: a.id, km: Number(a.km), litros: Number(a.litros || 0),
        parcial: !!a.parcial, data: a.data, valor: Number(a.valor_total || 0)
      });
    });

  const resultado = {};
  Object.keys(porPlaca).forEach(p => {
    const l = porPlaca[p];
    l.sort((x, y) => x.km - y.km);
    const medias = [];
    let ultimoCompleto = null;
    l.forEach(a => {
      if (ultimoCompleto != null && a.litros > 0) {
        const dist = a.km - ultimoCompleto.km;
        if (dist > 0) medias.push({ kml: dist / a.litros, data: a.data, km: a.km });
      }
      if (!a.parcial) ultimoCompleto = a;
    });
    resultado[p] = {
      media: medias.length ? medias.reduce((s, m) => s + m.kml, 0) / medias.length : null,
      ciclos: medias,
      ultimo: medias[medias.length - 1] || null
    };
  });
  return resultado;
}

function seloRendimento(kmlAtual, media) {
  if (!kmlAtual || !media) return '';
  const queda = ((kmlAtual - media) / media) * 100;
  const valor = kmlAtual.toFixed(2).replace('.', ',') + ' km/L';
  if (queda <= -12) return '<span class="selo-rend critico">' + icon('trending-down') + ' ' + valor + ' · ' + Math.abs(queda).toFixed(0) + '% abaixo</span>';
  if (queda <= -5) return '<span class="selo-rend ruim">' + icon('trending-down') + ' ' + valor + ' · ' + Math.abs(queda).toFixed(0) + '% abaixo</span>';
  return '<span class="selo-rend ok">' + icon('trending-up') + ' ' + valor + '</span>';
}

/* ===================================================== M2 CHECKLIST ===== */
const ITENS_CHECKLIST = [
  { chave: 'pneus',  rotulo: 'Pneus',            icone: 'circle' },
  { chave: 'oleo',   rotulo: 'Óleo e água',      icone: 'fuel' },
  { chave: 'luzes',  rotulo: 'Luzes',            icone: 'sun' },
  { chave: 'freios', rotulo: 'Freios',           icone: 'circle-alert' },
  { chave: 'painel', rotulo: 'Painel/Alertas',   icone: 'bar-chart' },
  { chave: 'crlv',   rotulo: 'CRLV no caminhão', icone: 'file-text' }
];

function abreChecklist(opts) {
  const tipo = (opts && opts.tipo) || 'saida';
  const placa = opts && opts.placa;
  return new Promise(resolve => {
    const estado = {};
    ITENS_CHECKLIST.forEach(i => { estado[i.chave] = null; });

    const desenha = () => {
      const feitos = Object.values(estado).filter(v => v !== null).length;
      const temProb = Object.values(estado).indexOf('problema') >= 0;
      const pronto = feitos === ITENS_CHECKLIST.length;
      const box = document.getElementById('modal');

      box.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:4px">' +
          '<div><h3 style="margin:0">Checklist de ' + (tipo === 'saida' ? 'saída' : 'chegada') + '</h3>' +
          '<div class="pq txt3">' + esc(placa || '') + ' · ' + feitos + '/' + ITENS_CHECKLIST.length + ' verificados</div></div>' +
          '<button class="drawer-x" id="ck-x" aria-label="Fechar">✕</button>' +
        '</div>' +
        '<div class="ck-grade">' +
          ITENS_CHECKLIST.map(i =>
            '<div class="ck-item"><div class="ck-nome">' + icon(i.icone) + ' ' + esc(i.rotulo) + '</div>' +
            '<div class="ck-botoes">' +
              '<button class="ck-botao ' + (estado[i.chave] === 'ok' ? 'on-ok' : '') + '" data-item="' + i.chave + '" data-v="ok">OK</button>' +
              '<button class="ck-botao ' + (estado[i.chave] === 'problema' ? 'on-prob' : '') + '" data-item="' + i.chave + '" data-v="problema">Problema</button>' +
            '</div></div>').join('') +
        '</div>' +
        (temProb ?
          '<div class="campo" style="margin-top:12px"><label for="ck-obs">Descreva o problema (vai para a Oficina)</label>' +
          '<textarea id="ck-obs" placeholder="ex.: pneu traseiro direito baixando"></textarea></div>' : '') +
        '<div class="acoes">' +
          '<button class="btn fantasma" id="ck-cancel">Agora não</button>' +
          '<button class="btn" id="ck-ok" ' + (pronto ? '' : 'disabled') + '>' +
            (tipo === 'saida' ? 'Iniciar jornada' : 'Encerrar') + '</button>' +
        '</div>';

      document.getElementById('veu').classList.add('on');

      const fechar = () => { fecharModal(); resolve(null); };
      document.getElementById('ck-x').onclick = fechar;
      document.getElementById('ck-cancel').onclick = fechar;

      box.querySelectorAll('[data-item]').forEach(b => {
        b.onclick = () => { estado[b.dataset.item] = b.dataset.v; desenha(); };
      });

      const ok = document.getElementById('ck-ok');
      if (ok) ok.onclick = () => {
        const obs = (document.getElementById('ck-obs') || {}).value || '';
        if (temProb && !obs.trim()) { toast('Descreva o problema para a Oficina', true); return; }
        fecharModal();
        resolve({ itens: Object.assign({}, estado), temProblema: temProb, observacao: obs.trim() || null });
      };
    };

    desenha();
  });
}

async function salvaChecklist(o) {
  const dados = {
    jornada_id: o.jornadaId || null,
    veiculo_id: o.veiculoId,
    motorista_id: o.motoristaId,
    tipo: o.tipo,
    itens: o.itens,
    tem_problema: !!o.temProblema,
    observacao: o.observacao || null
  };
  if (!navigator.onLine && window.OfflineSync) {
    await OfflineSync.enfileira({ tabela: 'jornada_checklists', acao: 'insert', dados: dados });
    toast('Checklist salvo no aparelho — envia ao voltar o sinal');
    return true;
  }
  const r = await sb.from('jornada_checklists').insert(dados);
  if (r.error) throw r.error;
  if (o.temProblema) toast('Checklist enviado — a Oficina foi avisada');
  return true;
}

/* ============================================ M5 AUDITORIA PEDÁGIO ===== */
async function renderAuditoriaPedagio(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<div class="esk"></div>'.repeat(2);

  const r = await sb.from('vw_auditoria_pedagio_jornada')
    .select('*').order('data_hora', { ascending: false }).limit(300);

  if (r.error) {
    el.innerHTML = '<div class="cartao" style="padding:13px 15px;border-color:rgba(245,158,11,.35)">' +
      '<div class="pq" style="color:var(--atencao);font-weight:650">' + icon('circle-alert') +
      ' A auditoria precisa da view <code>vw_auditoria_pedagio_jornada</code>. Rode ' +
      '<b>supabase/migracao_melhorias_operacionais.sql</b> no SQL Editor do Supabase.</div></div>';
    desenhaIcones();
    return;
  }

  const lista = r.data || [];
  const suspeitas = lista.filter(p => p.status_auditoria !== 'ok');
  const soma = suspeitas.reduce((s, p) => s + Number(p.valor || 0), 0);
  const ROT = { fora_de_jornada: 'fora de jornada', veiculo_em_oficina: 'em oficina' };

  el.innerHTML =
    '<div class="cartao" style="padding:13px 15px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">' +
        '<div><div class="pq txt3" style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">Passagens suspeitas</div>' +
        '<div class="num" style="font-size:19px;font-weight:750;color:' + (suspeitas.length ? 'var(--critico)' : 'var(--ok)') + '">' + suspeitas.length + '</div></div>' +
        '<div style="text-align:right"><div class="pq txt3" style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">Valor envolvido</div>' +
        '<div class="num" style="font-size:19px;font-weight:750">' + brl(soma) + '</div></div>' +
      '</div>' +
      '<div class="pq txt3" style="margin-top:6px;font-size:11.5px">' + lista.length +
        ' passagens verificadas · ' + (lista.length - suspeitas.length) + ' dentro de jornada</div>' +
    '</div>' +
    (suspeitas.length
      ? '<div class="cartao mt2" style="padding:0;overflow:hidden">' +
        suspeitas.slice(0, 40).map(p =>
          '<div class="aud-linha suspeita"><div style="min-width:0">' +
          '<div style="font-size:13px;font-weight:700">' + dataBR(p.data_hora) + ' · ' + esc(p.placa || '—') +
          ' <span class="tag critico">' + esc(ROT[p.status_auditoria] || p.status_auditoria) + '</span></div>' +
          '<div class="pq txt3">' + esc(p.praca || '—') + '</div></div>' +
          '<div class="num" style="font-size:13px;font-weight:750;color:var(--critico)">' + brl(p.valor) + '</div></div>').join('') +
        '</div><p class="dica mt2">Passagem sem jornada aberta ou com o caminhão em oficina. Confira antes de aceitar.</p>'
      : (lista.length
        ? '<p class="dica mt2" style="color:var(--ok)">Todas as passagens ocorreram dentro de uma jornada válida.</p>'
        : '<div class="vazio mt2"><div class="ic">' + icon('ticket') + '</div>Nenhuma passagem importada ainda.</div>'));
  desenhaIcones();
}

/* ============================================ M6 FECHAMENTO LÍQUIDO ==== */
async function renderFechamentoLiquido(containerId, inicio, fim) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<div class="esk"></div>'.repeat(2);

  const r = await sb.rpc('relatorio_frota_periodo', {
    p_inicio: inicio || null, p_fim: fim || null
  });

  if (r.error) {
    el.innerHTML = '<div class="cartao" style="padding:13px 15px;border-color:rgba(245,158,11,.35)">' +
      '<div class="pq" style="color:var(--atencao);font-weight:650">' + icon('circle-alert') +
      ' O fechamento precisa da função <code>relatorio_frota_periodo</code>. Rode ' +
      '<b>supabase/migracao_melhorias_operacionais.sql</b> no SQL Editor do Supabase.</div></div>';
    desenhaIcones();
    return;
  }

  const lista = r.data || [];
  if (!lista.length) {
    el.innerHTML = '<div class="vazio"><div class="ic">' + icon('wallet') + '</div>Nenhum caminhão ativo.</div>';
    desenhaIcones();
    return;
  }

  const totRec = lista.reduce((s, l) => s + Number(l.receita_confirmada || 0), 0);
  const totCus = lista.reduce((s, l) => s + Number(l.custo_total || 0), 0);
  const totMar = totRec - totCus;
  const pct = totRec > 0 ? (totMar / totRec) * 100 : null;

  el.innerHTML =
    '<div class="cartao" style="padding:15px">' +
      '<div class="pq txt3" style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">' +
        'Fechamento da frota' + (inicio || fim ? ' · período' : ' · tudo') + '</div>' +
      '<div class="liquido">' +
        '<div class="liq-bloco"><div class="liq-rot">Receita confirmada</div><div class="liq-val">' + brl(totRec) + '</div></div>' +
        '<div class="liq-bloco"><div class="liq-rot">Custos totais</div><div class="liq-val">' + brl(totCus) + '</div></div>' +
        '<div class="liq-bloco"><div class="liq-rot">Resultado líquido</div><div class="liq-val ' + (totMar >= 0 ? 'pos' : 'neg') + '">' + brl(totMar) + '</div></div>' +
        '<div class="liq-bloco"><div class="liq-rot">Margem</div><div class="liq-val ' + (pct != null && pct >= 0 ? 'pos' : 'neg') + '">' +
          (pct != null ? pct.toFixed(1).replace('.', ',') + '%' : '—') + '</div></div>' +
      '</div>' +
      (totRec === 0
        ? '<p class="dica mt2" style="color:var(--atencao)">' + icon('circle-alert') +
          ' Sem recebimento confirmado: a margem não pode ser calculada. Confirme os recebimentos.</p>' : '') +
    '</div>' +
    '<div class="cartao mt2" style="padding:0;overflow:hidden">' +
      lista.map(l => {
        const mar = Number(l.margem_liquida || 0);
        return '<div class="aud-linha"><div style="min-width:0;flex:1">' +
          '<div style="font-size:13.5px;font-weight:750">' + esc(l.placa) + '</div>' +
          '<div class="pq txt3">receita ' + brl(l.receita_confirmada) + ' · custo ' + brl(l.custo_total) +
            (l.km_rodado ? ' · ' + num(l.km_rodado) + ' km' : '') +
            (l.kml ? ' · ' + Number(l.kml).toFixed(2).replace('.', ',') + ' km/L' : '') + '</div></div>' +
          '<div style="text-align:right;flex-shrink:0">' +
            '<div class="num" style="font-size:14px;font-weight:750;color:' + (mar >= 0 ? 'var(--ok)' : 'var(--critico)') + '">' + brl(mar) + '</div>' +
            '<div class="pq txt3">' + (l.margem_pct != null ? Number(l.margem_pct).toFixed(1).replace('.', ',') + '%' : '—') + '</div>' +
          '</div></div>';
      }).join('') +
    '</div>' +
    '<p class="dica mt2">Receita confirmada − custos diretos (combustível, manutenção, multas, despesas e pedágio).</p>';
  desenhaIcones();
}

window.Melhorias = {
  barraPreventiva, semaforoOleo, semaforoDoc, diasAte,
  rendimentoPorPlaca, seloRendimento,
  ITENS_CHECKLIST, abreChecklist, salvaChecklist,
  renderAuditoriaPedagio, renderFechamentoLiquido
};
