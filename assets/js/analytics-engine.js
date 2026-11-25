/* ==========================================================================
   ANALYTICS ENGINE — ECharts + drill-down + cross-filtering

   Por que este arquivo existe separado:
   Cinco telas da gerência precisam da mesma coisa: agrupar fatos por período,
   clicar para descer o nível, e ver os registros que somam um valor. Se cada
   tela fizesse isso do seu jeito, teríamos cinco jeitos de errar. Aqui é um só.

   Regras do HANDOFF que este módulo respeita:
   1. CUSTO NUNCA vem da view direto. Ele chega pronto, via rpc('custo_frota').
      Este módulo não consulta custo; ele recebe os fatos já filtrados.
   2. Data pura (YYYY-MM-DD) NUNCA passa por new Date(). Ver `diaISO()`.
   3. Anti-duplo-toque e debounce ficam intactos nas telas; aqui não se escreve
      no banco, só se lê.

   Degradação: se o CDN do ECharts não carregar (offline, bloqueio), o módulo
   avisa e as telas continuam funcionando com os KPIs e as listas — nenhuma
   tela quebra, nenhum erro no console.
   ========================================================================== */

/* ------------------------------------------------------------- estado ---- */
const AnalyticsState = {
  periodo: 'mes',          // dia | semana | mes | tudo
  placa: null,             // filtro cruzado
  motorista: null,
  nivel: 'macro',          // macro | placa | categoria
  dimensao: 'placa',       // qual dimensão está aberta no nível 2
  metrica: 'valor',        // valor | rkm | receita  (visão de diagnóstico)

  reset() {
    this.placa = null;
    this.motorista = null;
    this.nivel = 'macro';
    this.dimensao = 'placa';
  },
  chips() {
    const c = [];
    if (this.placa) c.push({ tipo: 'placa', rot: 'Caminhão ' + this.placa });
    if (this.motorista) c.push({ tipo: 'motorista', rot: this.motorista });
    return c;
  },
  temFiltro() { return !!(this.placa || this.motorista); }
};

/* -------------------------------------------------------------- util ----- */

/** Data pura -> 'YYYY-MM-DD' SEM passar por new Date() (regra do HANDOFF). */
function diaISO(valor) {
  if (!valor) return null;
  if (typeof valor === 'string') {
    const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = valor instanceof Date ? valor : new Date(valor);
  if (isNaN(d)) return null;
  // usa componentes locais: toISOString() converte para UTC e volta um dia
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Chave do período a que um dia pertence. */
function chavePeriodo(dia, periodo) {
  if (!dia) return null;
  const [a, m, d] = dia.split('-').map(Number);
  if (periodo === 'dia') return dia;
  if (periodo === 'mes') return `${a}-${String(m).padStart(2, '0')}`;
  if (periodo === 'tudo') return 'total';
  // semana ISO aproximada: segunda-feira como início
  const dt = new Date(a, m - 1, d);          // componentes locais, sem UTC
  const dow = (dt.getDay() + 6) % 7;         // 0 = segunda
  dt.setDate(dt.getDate() - dow);
  return diaISO(dt);
}

/** Rótulo legível do período. */
function rotuloPeriodo(chave, periodo) {
  if (!chave) return '—';
  if (periodo === 'mes') {
    const [a, m] = chave.split('-');
    return `${MESES_CURTOS[Number(m) - 1]}/${a.slice(2)}`;
  }
  if (periodo === 'tudo') return 'Tudo';
  const [, m, d] = chave.split('-');
  return `${d}/${m}`;
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                      'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** ECharts carregou? */
function temEcharts() {
  return typeof window.echarts !== 'undefined';
}

/* ------------------------------------------------------------- tema ------ */

/* Paleta oficial Casagrande: Azul Glacial + Verde Energia como base,
   completando com tons que se leem bem sobre o Azul Noturno. */
const ANALYTICS_CORES = {
  custo: '#7FBCCE',      // Azul Glacial — custo
  receita: '#AFD66B',    // Verde Energia — receita
  alerta: '#E9B44C',
  critico: '#E4695F',
  neutro: '#6FA3C7',
  serie: ['#7FBCCE', '#AFD66B', '#E9B44C', '#E4695F', '#6FA3C7', '#9AD5E4', '#C3E38A']
};

/** Opções-base: deixa os gráficos com a mesma cara em qualquer tela. */
function baseOpcoesAnalytics(extra = {}) {
  const escuro = document.documentElement.dataset.theme !== 'light';
  return Object.assign({
    color: ANALYTICS_CORES.serie,
    backgroundColor: 'transparent',
    animationDuration: 420,
    animationEasing: 'cubicOut',
    universalTransition: { enabled: true, divideShape: 'clone' },
    textStyle: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: escuro ? '#EAEAE8' : '#010D23'
    },
    grid: { left: 8, right: 12, top: 26, bottom: 6, containLabel: true },
    tooltip: {
      trigger: 'axis',
      confine: true,                     // não sai da tela no mobile
      backgroundColor: escuro ? '#0A1B31' : '#FFFFFF',
      borderColor: escuro ? 'rgba(127,188,206,.26)' : 'rgba(1,13,35,.14)',
      borderWidth: 1,
      padding: [9, 11],
      textStyle: { fontSize: 12, color: escuro ? '#EAEAE8' : '#010D23' },
      extraCssText: 'border-radius:9px;box-shadow:0 6px 22px rgba(0,0,0,.16)'
    },
    xAxis: {
      type: 'category',
      axisLine: { lineStyle: { color: escuro ? 'rgba(127,188,206,.22)' : 'rgba(1,13,35,.14)' } },
      axisTick: { show: false },
      axisLabel: { fontSize: 10.5, color: escuro ? '#7F97AC' : '#68809A' }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: escuro ? 'rgba(127,188,206,.10)' : 'rgba(1,13,35,.07)' } },
      axisLabel: {
        fontSize: 10,
        color: escuro ? '#7F97AC' : '#68809A',
        formatter: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v
      }
    }
  }, extra);
}

/* ------------------------------------------------------- fábrica de instância */

const _graficos = {};   // id -> instância

/**
 * Cria/atualiza um gráfico num container.
 * Devolve a instância, ou null se o ECharts não estiver disponível.
 */
function montarGrafico(containerId, opcoes, opts = {}) {
  if (!temEcharts()) return null;
  const el = document.getElementById(containerId);
  if (!el) return null;

  let g = _graficos[containerId];
  if (!g || g.isDisposed?.()) {
    g = echarts.init(el, null, { renderer: 'canvas' });
    _graficos[containerId] = g;
  }
  // merge:true  -> mesma estrutura, só muda valor => ECharts INTERPOLA (troca
  //                de métrica fica suave em vez de piscar um gráfico novo)
  // merge:false -> estrutura diferente (nível/dimensão nova) => limpa antes,
  //                senão sobra série da visão anterior no gráfico
  g.setOption(opcoes, !opts.merge);
  return g;
}

/**
 * Tema mudou: os gráficos têm cores de eixo/tooltip próprias por tema.
 * Reaplico a camada de estilo em cada instância viva, preservando séries.
 */
function aoTrocarTema() {
  Object.keys(_graficos).forEach(function (id) {
    const g = _graficos[id];
    try {
      if (g.isDisposed && g.isDisposed()) return;
      const at = g.getOption();
      g.setOption({
        backgroundColor: 'transparent',
        textStyle: baseOpcoesAnalytics().textStyle,
        xAxis: (at.xAxis || []).map(function (ax) {
          return Object.assign({}, baseOpcoesAnalytics().xAxis, { type: ax.type, data: ax.data });
        }),
        yAxis: (at.yAxis || []).map(function (ax) {
          return Object.assign({}, baseOpcoesAnalytics().yAxis, { type: ax.type, data: ax.data });
        })
      }, false);
    } catch (e) {}
  });
}

/** Descarta gráficos de containers que saíram da tela. */
function limparGraficos() {
  Object.keys(_graficos).forEach(id => {
    const g = _graficos[id];
    if (!document.getElementById(id)) {
      try { g.dispose(); } catch (_) {}
      delete _graficos[id];
    }
  });
}

/** Redimensiona no resize da janela e na troca de orientação. */
if (typeof window !== 'undefined') {
  let _rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(_rt);
    _rt = setTimeout(() => {
      Object.values(_graficos).forEach(g => {
        try { if (!g.isDisposed?.()) g.resize(); } catch (_) {}
      });
    }, 140);
  });
}

/* -------------------------------------------------------------- fatos ---- */

/* Um "fato" é a menor unidade de qualquer tela analítica. Tudo que é número
   no app vira um destes, e assim o motor consegue somar, agrupar e rastrear
   sem saber de qual tabela veio.

   {
     id        : string  — id do registro na origem (para o drawer)
     data      : 'YYYY-MM-DD'
     valor     : number
     placa     : string|null
     motorista : string|null
     categoria : string   — 'combustivel' | 'despesa' | 'frete' | 'pedagio' ...
     origem    : string   — 'Lançamento manual' | 'Abastecimento' | 'Importação' ...
     detalhe   : string|null
     status    : string|null
   }
*/

/** Converte abastecimentos em fatos. */
function fatosDeAbastecimentos(abast, veiculos, motoristas) {
  const placaDe = id => (veiculos || []).find(v => v.id === id)?.placa || null;
  const nomeDe = id => (motoristas || []).find(m => m.id === id)?.nome || null;
  return (abast || []).map(a => ({
    id: a.id,
    data: diaISO(a.data),
    valor: Number(a.valor_total || 0),
    placa: placaDe(a.veiculo_id),
    motorista: nomeDe(a.motorista_id),
    categoria: 'combustivel',
    origem: 'Abastecimento',
    detalhe: [a.combustivel, a.litros ? num(a.litros, 2) + ' L' : null, a.posto]
      .filter(Boolean).join(' · ') || null,
    status: null
  }));
}

/** Converte despesas em fatos. Despesa reprovada NÃO entra (regra do app). */
function fatosDeDespesas(despesas, veiculos, motoristas) {
  const placaDe = id => (veiculos || []).find(v => v.id === id)?.placa || null;
  const nomeDe = id => (motoristas || []).find(m => m.id === id)?.nome || null;
  return (despesas || [])
    .filter(d => d.status !== 'reprovada')
    .map(d => {
      // MESMA regex da vw_custo_veiculo do banco. Se divergir, o gráfico não
      // fecha com a RPC e o dono vê dois números diferentes para o mesmo custo.
      const cat = String(d.categoria || '').toUpperCase();
      const ehManut = /PE[ÇC]A|PNEU|MANUTEN|BORRACHARI|MEC[AÂ]NIC|[ÓO]LEO|OFICINA|REVIS[AÃ]O|LUBRIFIC|FILTRO|FREIO|SUSPENS|EL[EÉ]TRIC/.test(cat);
      return {
        id: d.id,
        data: diaISO(d.data),
        valor: Number(d.valor || 0),
        placa: placaDe(d.veiculo_id),
        motorista: nomeDe(d.motorista_id),
        categoria: ehManut ? 'manutencao' : 'despesa',
        origem: 'Lançamento manual',
        detalhe: [d.categoria, d.descricao].filter(Boolean).join(' · '),
        status: d.status
      };
    });
}

/** Converte recebimentos em fatos de receita (frete + pedágio + descarga). */
function fatosDeRecebimentos(recs, veiculos, motoristas) {
  const placaDe = id => (veiculos || []).find(v => v.id === id)?.placa || null;
  const nomeDe = id => (motoristas || []).find(m => m.id === id)?.nome || null;
  const fatos = [];
  (recs || []).forEach(r => {
    const base = {
      id: r.id,
      data: diaISO(r.data),
      placa: placaDe(r.veiculo_id),
      motorista: nomeDe(r.motorista_id),
      status: r.status
    };
    if (Number(r.valor_frete) > 0) fatos.push({ ...base, id: r.id + ':frete',
      valor: Number(r.valor_frete), categoria: 'frete', origem: 'Frete',
      detalhe: [r.municipio, r.obs].filter(Boolean).join(' · ') });
    if (Number(r.pedagio) > 0) fatos.push({ ...base, id: r.id + ':pedagio',
      valor: Number(r.pedagio), categoria: 'pedagio', origem: 'Pedágio declarado',
      detalhe: r.municipio });
    if (Number(r.descarga) > 0) fatos.push({ ...base, id: r.id + ':descarga',
      valor: Number(r.descarga), categoria: 'descarga', origem: 'Descarga declarada',
      detalhe: r.municipio });
  });
  return fatos;
}

/** Converte passagens de pedágio em fatos. */
function fatosDePedagios(passagens, veiculos) {
  const placaDe = id => (veiculos || []).find(v => v.id === id)?.placa || null;
  return (passagens || []).map(p => ({
    id: p.id,
    data: diaISO(p.data_hora),
    valor: Number(p.valor || 0),
    placa: p.placa || placaDe(p.veiculo_id),
    motorista: null,
    categoria: 'pedagio_extrato',
    origem: 'Importação pedágio',
    detalhe: p.praca || null,
    status: null
  }));
}

/** Converte OS em fatos de manutenção. */
function fatosDeOrdens(oss, veiculos) {
  const placaDe = id => (veiculos || []).find(v => v.id === id)?.placa || null;
  return (oss || []).map(o => ({
    id: o.id,
    data: diaISO(o.aberta_em),
    valor: Number(o.mao_obra || 0) + Number(o.custos || 0),
    placa: placaDe(o.veiculo_id),
    motorista: null,
    categoria: 'manutencao',
    origem: 'Oficina (OS)',
    detalhe: o.descricao || null,
    status: o.status
  }));
}

/* ----------------------------------------------------- filtro e agregação */

/** Aplica os filtros cruzados do estado. */
function filtrarFatos(fatos, state, opts = {}) {
  let r = fatos.slice();
  if (state.placa && !opts.ignorarPlaca)
    r = r.filter(f => f.placa === state.placa);
  if (state.motorista && !opts.ignorarMotorista)
    r = r.filter(f => f.motorista === state.motorista);
  if (opts.categorias?.length)
    r = r.filter(f => opts.categorias.includes(f.categoria));
  return r;
}

/** Agrupa por período, devolvendo série ordenada + totais. */
function agruparPorPeriodo(fatos, periodo) {
  const mapa = {};
  fatos.forEach(f => {
    const k = chavePeriodo(f.data, periodo);
    if (!k) return;
    if (!mapa[k]) mapa[k] = { chave: k, valor: 0, qtd: 0, placa: {}, motorista: {} };
    mapa[k].valor += f.valor;
    mapa[k].qtd += 1;
    if (f.placa) mapa[k].placa[f.placa] = (mapa[k].placa[f.placa] || 0) + f.valor;
    if (f.motorista) mapa[k].motorista[f.motorista] = (mapa[k].motorista[f.motorista] || 0) + f.valor;
  });
  const chaves = Object.keys(mapa).sort();
  return chaves.map(k => mapa[k]);
}

/** Agrupa por uma dimensão. */
function agruparPor(fatos, dimensao) {
  const mapa = {};
  fatos.forEach(f => {
    const k = dimensao === 'placa' ? (f.placa || 'Sem placa')
            : dimensao === 'motorista' ? (f.motorista || 'Sem motorista')
            : (f.categoria || 'Sem categoria');
    if (!mapa[k]) mapa[k] = { chave: k, valor: 0, qtd: 0 };
    mapa[k].valor += f.valor;
    mapa[k].qtd += 1;
  });
  return Object.values(mapa).sort((a, b) => b.valor - a.valor);
}

/** Variação % contra o período anterior da série. */
function variacao(serie, i) {
  if (i <= 0) return null;
  const ant = serie[i - 1]?.valor || 0;
  if (!ant) return null;
  return ((serie[i].valor - ant) / ant) * 100;
}

/* ------------------------------------------------------------ diagramas -- */

const ROTULO_CATEGORIA = {
  combustivel: 'Combustível',
  despesa: 'Despesas',
  manutencao: 'Manutenção',
  frete: 'Frete',
  pedagio: 'Pedágio',
  pedagio_extrato: 'Pedágio (extrato)',
  descarga: 'Descarga'
};

/**
 * Gráfico macro: barras por período, linha de média e clique para drill-down.
 * `onDrill(ponto)` recebe a chave do período clicado.
 */
function graficoPeriodo(containerId, serie, opts = {}) {
  if (!temEcharts() || !serie.length) return null;
  const mt = opts.metrica || 'valor';
  const fmt = v => (fmtMetrica ? fmtMetrica(v, mt) : brl(v));

  const valores = serie.map(s => s.valor);
  const media = valores.reduce((a, b) => a + b, 0) / (valores.length || 1);
  const rot = opts.rotulo || (k => rotuloPeriodo(k, opts.periodo || 'mes'));
  const cor = opts.cor || ANALYTICS_CORES.custo;

  const g = montarGrafico(containerId, baseOpcoesAnalytics({
    tooltip: Object.assign(baseOpcoesAnalytics().tooltip, {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => {
        const p = params[0];
        if (!p) return '';
        const i = p.dataIndex;
        const d = serie[i];
        const v = variacao(serie, i);
        const sinal = v == null ? '<span style="color:#8B94A0">sem base anterior</span>'
          : `<span style="color:${v >= 0 ? '#E25555' : '#2E9E6B'}">
               ${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(0)}%</span>`;
        const porPlaca = Object.entries(d.placa || {})
          .sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([k, val]) => `<div style="display:flex;justify-content:space-between;gap:14px">
              <span style="opacity:.75">${k}</span><b>${brl(val)}</b></div>`).join('');
        return `<div style="font-weight:700;margin-bottom:4px">${rot(d.chave)}</div>
          <div style="font-size:15px;font-weight:750;margin-bottom:2px">${fmt(d.valor)}</div>
          <div style="margin-bottom:5px">${sinal} <span style="opacity:.6">vs período anterior</span></div>
          <div style="opacity:.7;font-size:11px;margin-bottom:4px">${d.qtd} lançamento${d.qtd > 1 ? 's' : ''}</div>
          ${porPlaca}`;
      }
    }),
    xAxis: Object.assign(baseOpcoesAnalytics().xAxis, {
      data: serie.map(s => rot(s.chave))
    }),
    yAxis: baseOpcoesAnalytics().yAxis,
    series: [{
      type: 'bar',
      data: valores,
      barMaxWidth: 46,
      itemStyle: {
        borderRadius: [5, 5, 0, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: cor },
          { offset: 1, color: cor + '66' }
        ])
      },
      emphasis: { itemStyle: { color: cor } },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { type: 'dashed', color: '#8B94A0', width: 1 },
        label: {
          formatter: 'média ' + fmt(media),
          fontSize: 10, color: '#8B94A0', position: 'insideEndTop'
        },
        data: [{ yAxis: media }]
      }
    }],
    yAxis: Object.assign(baseOpcoesAnalytics().yAxis, {
      axisLabel: Object.assign({}, baseOpcoesAnalytics().yAxis.axisLabel,
        { formatter: v => mt === 'receita' ? v.toFixed(0) + '%' : (mt === 'rkm' ? 'R$ ' + v.toFixed(2) : (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)) })
    })
  }), { merge: opts.merge === true });

  if (g && opts.onDrill) {
    g.off('click');
    g.on('click', p => opts.onDrill(serie[p.dataIndex]));
  }
  return g;
}

/**
 * Gráfico de dimensão: barras horizontais por placa/motorista/categoria.
 * `onDrill(chave)` recebe a chave clicada.
 */
function graficoDimensao(containerId, grupos, opts = {}) {
  if (!temEcharts() || !grupos.length) return null;
  const rot = opts.rotulo || (k => k);
  const dados = grupos.slice(0, 8).reverse();   // maior em cima

  const g = montarGrafico(containerId, baseOpcoesAnalytics({
    grid: { left: 8, right: 46, top: 8, bottom: 6, containLabel: true },
    tooltip: Object.assign(baseOpcoesAnalytics().tooltip, {
      trigger: 'item',
      formatter: p => {
        const d = dados[p.dataIndex];
        const totalGrupos = grupos.reduce((s, x) => s + x.valor, 0) || 1;
        const pct = (d.valor / totalGrupos) * 100;
        return `<div style="font-weight:700;margin-bottom:3px">${rot(d.chave)}</div>
          <div style="font-size:15px;font-weight:750">${brl(d.valor)}</div>
          <div style="opacity:.7">${pct.toFixed(1)}% do total · ${d.qtd} lançamento${d.qtd > 1 ? 's' : ''}</div>
          <div style="opacity:.55;font-size:11px;margin-top:4px">clique para ver a origem</div>`;
      }
    }),
    xAxis: Object.assign(baseOpcoesAnalytics().yAxis, { splitLine: { show: false } }),
    yAxis: Object.assign(baseOpcoesAnalytics().xAxis, {
      type: 'category',
      data: dados.map(d => rot(d.chave)),
      axisLabel: { fontSize: 11, color: '#79828E', width: 96, overflow: 'truncate' }
    }),
    series: [{
      type: 'bar',
      data: dados.map(d => d.valor),
      barMaxWidth: 30,
      itemStyle: {
        borderRadius: [0, 5, 5, 0],
        color: p => ANALYTICS_CORES.serie[p.dataIndex % ANALYTICS_CORES.serie.length]
      },
      label: {
        show: true, position: 'right', fontSize: 10.5,
        color: '#79828E', formatter: p => brlCurto(p.value)
      }
    }]
  }));

  if (g && opts.onDrill) {
    g.off('click');
    g.on('click', p => opts.onDrill(dados[p.dataIndex]));
  }
  return g;
}

/* ------------------------------------------------------------- drawer ---- */

/**
 * Abre o detalhamento (nível 3): os registros que somam exatamente o valor.
 * Desktop: drawer à direita. Mobile: bottom sheet.
 *
 * Recebe os fatos já somados e o total esperado. Se a soma não bater com o
 * total, MOSTRA A DIVERGÊNCIA em vez de esconder — número que não fecha é
 * informação, não estética.
 */
function abrirOrigem({ titulo, fatos, totalEsperado, subtitulo }) {
  const anterior = document.getElementById('analytics-drawer');
  if (anterior) anterior.remove();

  const soma = fatos.reduce((s, f) => s + f.valor, 0);
  const bate = totalEsperado == null || Math.abs(soma - totalEsperado) < 0.02;
  const ordenados = [...fatos].sort((a, b) => (b.data || '').localeCompare(a.data || ''));

  const wrap = document.createElement('div');
  wrap.id = 'analytics-drawer';
  wrap.className = 'drawer-veu';
  wrap.innerHTML = `
    <div class="drawer" role="dialog" aria-modal="true" aria-label="Origem do dado">
      <div class="drawer-topo">
        <div style="min-width:0">
          <div class="drawer-rot">Origem do dado</div>
          <div class="drawer-titulo">${esc(titulo)}</div>
          ${subtitulo ? `<div class="pq txt3">${esc(subtitulo)}</div>` : ''}
        </div>
        <button class="drawer-x" aria-label="Fechar">✕</button>
      </div>

      <div class="drawer-total">
        <div>
          <div class="pq txt3" style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">Soma dos registros</div>
          <div class="num" style="font-size:21px;font-weight:750">${brl(soma)}</div>
        </div>
        <div style="text-align:right">
          <div class="pq txt3" style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">Registros</div>
          <div class="num" style="font-size:21px;font-weight:750">${fatos.length}</div>
        </div>
      </div>

      ${bate ? '' : `<div class="drawer-alerta">
          O total do gráfico era ${brl(totalEsperado)} e a soma dos registros é ${brl(soma)}
          (diferença de ${brl(soma - totalEsperado)}). Confira antes de usar este número.
        </div>`}

      <div class="drawer-lista">
        ${ordenados.length ? ordenados.map(f => `
          <div class="drawer-item">
            <div class="di-linha1">
              <span class="di-data">${dataBR(f.data)}</span>
              ${f.placa ? `<span class="tag">${esc(f.placa)}</span>` : ''}
              ${f.status ? `<span class="tag ${f.status === 'reprovada' ? 'critico' : f.status === 'aguardando' ? 'atencao' : 'ok'}">${esc(f.status)}</span>` : ''}
            </div>
            <div class="di-linha2">${esc(f.origem)}${f.motorista ? ' · ' + esc(f.motorista) : ''}</div>
            ${f.detalhe ? `<div class="di-linha3">${esc(f.detalhe)}</div>` : ''}
            <div class="di-valor num">${brl(f.valor)}</div>
          </div>`).join('')
        : '<div class="vazio" style="padding:30px 16px">Nenhum registro neste recorte.</div>'}
      </div>

      <div class="drawer-rodape">
        <button class="btn cheio" id="drawer-fechar">Fechar</button>
      </div>
    </div>`;

  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('on'));

  const fechar = () => {
    wrap.classList.remove('on');
    setTimeout(() => wrap.remove(), 200);
  };
  wrap.querySelector('.drawer-x').onclick = fechar;
  wrap.querySelector('#drawer-fechar').onclick = fechar;
  wrap.addEventListener('click', e => { if (e.target === wrap) fechar(); });
  document.addEventListener('keydown', function escuta(e) {
    if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', escuta); }
  });
}

/* ------------------------------------------------------------ chips ------ */

/** Renderiza os chips de filtro ativos + botão limpar. */
function renderChips(containerId, state, aoMudar) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const chips = state.chips();
  if (!chips.length) { el.innerHTML = ''; el.classList.add('esconde'); return; }
  el.classList.remove('esconde');
  el.innerHTML = `
    <div class="chips-linha">
      ${chips.map(c => `<button class="chip" data-chip="${esc(c.tipo)}">
        ${esc(c.rot)}<span class="chip-x">✕</span></button>`).join('')}
      <button class="chip chip-limpar" id="chip-limpar">Limpar filtros</button>
    </div>`;
  el.querySelectorAll('[data-chip]').forEach(b => {
    b.onclick = () => {
      if (b.dataset.chip === 'placa') state.placa = null;
      if (b.dataset.chip === 'motorista') state.motorista = null;
      aoMudar();
    };
  });
  const bl = el.querySelector('#chip-limpar');
  if (bl) bl.onclick = () => { state.reset(); aoMudar(); };
}

/* ------------------------------------------------------------ seletor ---- */

/** Seletor de período (dia/semana/mês/tudo) como segmentado. */
function seletorPeriodo(containerId, state, aoMudar) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const opcoes = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['tudo', 'Tudo']];
  el.innerHTML = opcoes.map(([k, r]) =>
    `<button data-p="${k}" class="${state.periodo === k ? 'on' : ''}">${r}</button>`).join('');
  el.querySelectorAll('[data-p]').forEach(b => {
    b.onclick = () => {
      state.periodo = b.dataset.p;
      el.querySelectorAll('[data-p]').forEach(x => x.classList.toggle('on', x === b));
      aoMudar();
    };
  });
}

/* ------------------------------------------------------- estado vazio ---- */

/** Bloco amigável para quando não há dado no recorte. */
function vazioAnalitico(rotulo = 'Nenhum dado no período') {
  return `<div class="vazio" style="padding:34px 18px">
      <div class="ic">📊</div>${esc(rotulo)}
      <div class="pq mt2">Assim que houver lançamento, o gráfico aparece aqui.</div>
    </div>`;
}


/* ==========================================================================
   DIAGNÓSTICO OPERACIONAL — métrica alternável, outliers e composição
   (pedido de 23/11; respeita as regras do HANDOFF seção 13)

   A pergunta que estas funções respondem não é "quanto gastei", é
   "qual caminhão está fora do padrão, e por causa de quê".
   Por isso tudo aqui é relativo: contra a média da frota, não em valor absoluto.
   ========================================================================== */

/* ------------------------------------------------------- métricas -------- */

const METRICAS = {
  valor:   { rot: 'Valor Total', curto: 'R$',  unidade: 'brl' },
  rkm:     { rot: 'Custo por KM', curto: 'R$/km', unidade: 'brl3' },
  receita: { rot: '% da Receita', curto: '%', unidade: 'pct' }
};

/**
 * Prepara a base do diagnóstico: quanto cada caminhão tem de km e de receita.
 * Sem km o R$/km não existe — e eu prefiro devolver null (a tela avisa) a
 * dividir por zero e mostrar um número inventado.
 */
function montarBaseMetrica({ fatos, veiculos, custoRpc, receitaPorPlaca }) {
  const kmPorPlaca = {};
  (custoRpc || []).forEach(c => {
    kmPorPlaca[c.placa] = Number(c.km || 0);
  });
  const receita = receitaPorPlaca || {};
  return { fatos, kmPorPlaca, receita };
}

/** Valor de uma métrica para um recorte (lista de fatos + a placa, se houver). */
function valorDaMetrica(base, fatos, placa, metrica) {
  if (Array.isArray(base)) base = { kmPorPlaca: {}, receita: {}, fatos: base };
  if (!base.kmPorPlaca) base = { kmPorPlaca: {}, receita: {}, fatos: base.fatos || [] };
  const total = (fatos || []).reduce((s, f) => s + Number(f.valor || 0), 0);
  if (metrica === 'rkm') {
    const km = placa ? Number(base.kmPorPlaca[placa] || 0)
                     : Object.values(base.kmPorPlaca).reduce((s, v) => s + Number(v || 0), 0);
    if (!km) return null;
    return total / km;
  }
  if (metrica === 'receita') {
    const rec = placa ? Number(base.receita[placa] || 0)
                      : Object.values(base.receita).reduce((s, v) => s + Number(v || 0), 0);
    if (!rec) return null;
    return (total / rec) * 100;
  }
  return total;
}

/** Formata conforme a métrica. Nunca inventa: null vira "—". */
function fmtMetrica(v, metrica) {
  if (v == null || !isFinite(v)) return '—';
  if (metrica === 'rkm') return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
  if (metrica === 'receita') return Number(v).toFixed(1).replace('.', ',') + '%';
  return brl(v);
}

/** Seletor segmentado de métrica. */
function seletorMetrica(containerId, state, aoMudar, disponiveis) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const lista = disponiveis || ['valor', 'rkm', 'receita'];
  el.innerHTML = lista.map(k =>
    `<button data-m="${k}" class="${state.metrica === k ? 'on' : ''}">${METRICAS[k].rot}</button>`
  ).join('');
  el.querySelectorAll('[data-m]').forEach(b => {
    b.onclick = () => {
      if (state.metrica === b.dataset.m) return;
      state.metrica = b.dataset.m;
      el.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b));
      aoMudar();
    };
  });
}

/* --------------------------------------------- diagnóstico por caminhão -- */

/**
 * Ranking de custo por caminhão com detecção de outlier.
 *
 * A regra de 15% é do pedido do dono. O "vilão" não é chute: eu comparo a
 * fatia de cada categoria do caminhão com a MESMA fatia na média da frota e
 * aponto a que mais se afasta — é o que explica POR QUE ele está caro.
 * Se nada se destaca, digo isso em vez de inventar culpado.
 */
function diagnosticoPorCaminhao(base, grupos, metrica) {
  const fatosDiag = Array.isArray(base) ? base : (base?.fatos || []);
  // valor de cada placa na métrica escolhida
  const linhas = grupos.map(g => {
    const fatosPlaca = fatosDiag.filter(f => (f.placa || 'Sem placa') === g.chave);
    return {
      placa: g.chave,
      fatos: fatosPlaca,
      valor: valorDaMetrica(base, fatosPlaca, g.chave, metrica),
      qtd: g.qtd
    };
  }).filter(l => l.valor != null);

  if (!linhas.length) return { linhas: [], media: null, outliers: [] };

  const media = linhas.reduce((s, l) => s + l.valor, 0) / linhas.length;
  const LIMITE = 1.15;   // 15% acima da média

  // composição média da frota (só faz sentido na métrica de valor/percentual)
  const totalFrota = fatosDiag.reduce((s, f) => s + Number(f.valor || 0), 0) || 1;
  const fatiaMedia = {};
  fatosDiag.forEach(f => {
    fatiaMedia[f.categoria] = (fatiaMedia[f.categoria] || 0) + f.valor;
  });
  Object.keys(fatiaMedia).forEach(k => { fatiaMedia[k] = fatiaMedia[k] / totalFrota; });

  linhas.forEach(l => {
    l.acima = media > 0 ? ((l.valor - media) / media) * 100 : 0;
    l.outlier = media > 0 && l.valor > media * LIMITE;

    // o vilão: categoria cuja PARTICIPAÇÃO no gasto deste caminhão mais
    // excede a participação dela na frota
    const totalPlaca = l.fatos.reduce((s, f) => s + Number(f.valor || 0), 0) || 1;
    const fatiaPlaca = {};
    l.fatos.forEach(f => { fatiaPlaca[f.categoria] = (fatiaPlaca[f.categoria] || 0) + f.valor; });
    const candidatos = Object.keys(fatiaPlaca).map(k => {
      const p = fatiaPlaca[k] / totalPlaca;
      const m = fatiaMedia[k] || 0;
      return { categoria: k, participacao: p, media: m, excesso: (p - m) * 100 };
    }).sort((a, b) => b.excesso - a.excesso);
    l.vilao = candidatos[0] && candidatos[0].excesso > 3 ? candidatos[0] : null;
  });

  return {
    linhas: linhas.sort((a, b) => b.valor - a.valor),
    media,
    outliers: linhas.filter(l => l.outlier)
  };
}

/**
 * Gráfico de ranking (barras horizontais ordenadas) com linha da média.
 * Outlier em cor de alerta + rótulo do vilão.
 */
function graficoRankingCaminhoes(containerId, diag, opts = {}) {
  if (!temEcharts()) return null;
  const metrica = opts.metrica || 'valor';
  const linhas = diag.linhas;
  if (!linhas.length) return null;

  const dados = [...linhas].reverse();     // maior no topo
  const corOk = opts.cor || ANALYTICS_CORES.custo;
  const corAlerta = ANALYTICS_CORES.critico;

  const rotuloVilao = l => {
    if (!l.vilao) return l.outlier ? 'acima da média' : '';
    const nome = ROTULO_CATEGORIA[l.vilao.categoria] || l.vilao.categoria;
    const sinal = l.vilao.excesso > 0 ? '+' : '';
    return `${nome} ${sinal}${l.vilao.excesso.toFixed(0)}pp acima da frota`;
  };

  const g = montarGrafico(containerId, baseOpcoesAnalytics({
    grid: { left: 8, right: 78, top: 30, bottom: 6, containLabel: true },
    tooltip: Object.assign(baseOpcoesAnalytics().tooltip, {
      trigger: 'item',
      formatter: p => {
        const l = dados[p.dataIndex];
        const pct = Math.round(l.acima);
        const sinal = pct > 0 ? '+' : '';
        return `<div style="font-weight:750;margin-bottom:3px">${l.placa}${l.outlier ? ' ⚠' : ''}</div>
          <div style="font-size:15px;font-weight:750">${fmtMetrica(l.valor, metrica)}</div>
          <div style="color:${l.outlier ? corAlerta : '#8B94A0'};font-weight:650">
            ${pct === 0 ? 'na média da frota' : sinal + pct + '% vs média da frota'}</div>
          <div style="opacity:.7;margin-top:3px">${l.qtd} lançamento${l.qtd > 1 ? 's' : ''}</div>
          ${l.vilao ? `<div style="margin-top:4px;font-size:11.5px">Vilão: <b>${rotuloVilao(l)}</b></div>` : ''}
          <div style="opacity:.55;font-size:11px;margin-top:4px">clique para auditar</div>`;
      }
    }),
    xAxis: Object.assign(baseOpcoesAnalytics().yAxis, {
      splitLine: { show: false },
      axisLabel: Object.assign({}, baseOpcoesAnalytics().yAxis.axisLabel,
        { formatter: v => metrica === 'receita' ? v.toFixed(0) + '%' : brlCurto(v) })
    }),
    yAxis: Object.assign(baseOpcoesAnalytics().xAxis, {
      type: 'category',
      data: dados.map(l => l.placa),
      axisLabel: { fontSize: 11.5, color: '#79828E', fontWeight: 600 }
    }),
    series: [{
      type: 'bar',
      data: dados.map(l => ({
        value: l.valor,
        itemStyle: {
          borderRadius: [0, 5, 5, 0],
          color: l.outlier ? corAlerta : corOk
        }
      })),
      barMaxWidth: 34,
      label: {
        show: true, position: 'right', fontSize: 11, fontWeight: 650,
        color: p => (dados[p.dataIndex]?.outlier ? corAlerta : '#79828E'),
        formatter: p => {
          const l = dados[p.dataIndex];
          const pct = Math.round(l.acima);
          const sinal = pct > 0 ? '+' : '';
          return pct === 0 ? fmtMetrica(l.valor, metrica)
            : `${fmtMetrica(l.valor, metrica)}  ${sinal}${pct}%`;
        }
      },
      markLine: {
        silent: true, symbol: 'none',
        lineStyle: { type: 'dashed', color: '#8B94A0', width: 1.4 },
        label: {
          formatter: 'média ' + fmtMetrica(diag.media, metrica),
          fontSize: 10, color: '#8B94A0', position: 'insideEndTop'
        },
        data: [{ xAxis: diag.media }]
      }
    }]
  }), { merge: opts.merge === true });

  if (g && opts.onDrill) {
    g.off('click');
    g.on('click', p => opts.onDrill(dados[p.dataIndex]));
  }
  return g;
}

/* ------------------------------------------- composição empilhada ------- */

const GRUPOS_COMPOSICAO = {
  combustivel: 'Combustível',
  pedagio: 'Pedágio',
  manutencao: 'Manutenção/Oficina',
  despesa: 'Despesas de Viagem'
};

/**
 * Barras empilhadas: para cada caminhão, a fatia de cada grupo de custo.
 * Clicar num segmento abre a origem filtrada naquela placa E naquela categoria
 * — é o pedido do dono e o que dá rastreabilidade de verdade.
 */
function graficoComposicao(containerId, base, opts = {}) {
  if (!temEcharts()) return null;
  // aceita tanto a lista de fatos quanto { fatos: [...] }
  const fatosComp = Array.isArray(base) ? base : (base?.fatos || []);

  const porPlaca = {};
  fatosComp.forEach(f => {
    const placa = f.placa || 'Sem placa';
    if (!porPlaca[placa]) porPlaca[placa] = {};
    // pedagio_extrato entra em Pedágio; combustivel/despesa/manutencao idem
    const grupo = f.categoria === 'pedagio_extrato' ? 'pedagio' : f.categoria;
    if (!GRUPOS_COMPOSICAO[grupo]) return;
    porPlaca[placa][grupo] = (porPlaca[placa][grupo] || 0) + Number(f.valor || 0);
  });

  const placas = Object.keys(porPlaca).sort();
  if (!placas.length) return null;

  const grupos = Object.keys(GRUPOS_COMPOSICAO);
  const series = grupos.map((g, i) => ({
    name: GRUPOS_COMPOSICAO[g],
    tipo: g,
    type: 'bar',
    stack: 'custo',
    barMaxWidth: 54,
    itemStyle: {
      color: ANALYTICS_CORES.serie[i % ANALYTICS_CORES.serie.length],
      borderRadius: i === grupos.length - 1 ? [4, 4, 0, 0] : 0
    },
    emphasis: { focus: 'series' },
    data: placas.map(p => porPlaca[p][g] || 0)
  }));

  const el = montarGrafico(containerId, baseOpcoesAnalytics({
    grid: { left: 8, right: 12, top: 34, bottom: 6, containLabel: true },
    legend: {
      bottom: 0, itemWidth: 9, itemHeight: 9, itemGap: 12,
      textStyle: { fontSize: 10.5, color: '#79828E' }
    },
    tooltip: Object.assign(baseOpcoesAnalytics().tooltip, {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => {
        const total = params.reduce((s, p) => s + Number(p.value || 0), 0);
        const linhas = params.filter(p => p.value > 0).map(p =>
          `<div style="display:flex;justify-content:space-between;gap:14px">
             <span>${p.marker}${p.seriesName}</span>
             <b>${brl(p.value)} · ${((p.value / total) * 100).toFixed(0)}%</b></div>`).join('');
        return `<div style="font-weight:750;margin-bottom:4px">${params[0].axisValue}</div>
          ${linhas}
          <div style="border-top:1px solid #E3E7EC;margin-top:4px;padding-top:4px;
               display:flex;justify-content:space-between;gap:14px">
            <b>Total</b><b>${brl(total)}</b></div>
          <div style="opacity:.55;font-size:11px;margin-top:4px">clique numa fatia para auditar</div>`;
      }
    }),
    xAxis: Object.assign(baseOpcoesAnalytics().xAxis, { data: placas }),
    yAxis: Object.assign(baseOpcoesAnalytics().yAxis,
      { axisLabel: Object.assign({}, baseOpcoesAnalytics().yAxis.axisLabel,
        { formatter: v => brlCurto(v) }) }),
    series
  }), { merge: opts.merge === true });

  if (el && opts.onSegmento) {
    el.off('click');
    el.on('click', p => {
      const grupoTipo = series[p.seriesIndex]?.tipo;
      if (!grupoTipo) return;
      opts.onSegmento({
        placa: p.axisValue,
        categoria: grupoTipo,
        rotulo: GRUPOS_COMPOSICAO[grupoTipo],
        valor: Number(p.value || 0)
      });
    });
  }
  return el;
}

/** Fatos de uma placa + grupo de composição (para a gaveta). */
function fatosDoSegmento(base, placa, grupoCategoria) {
  const fatosSeg = Array.isArray(base) ? base : (base?.fatos || []);
  return fatosSeg.filter(f => {
    const placaF = f.placa || 'Sem placa';
    if (placaF !== placa) return false;
    if (grupoCategoria === 'pedagio')
      return f.categoria === 'pedagio' || f.categoria === 'pedagio_extrato';
    return f.categoria === grupoCategoria;
  });
}

/* --------------------------------------------------- exportar o módulo --- */

window.Analytics = {
  state: AnalyticsState,
  diaISO, chavePeriodo, rotuloPeriodo, MESES_CURTOS,
  temEcharts, cores: ANALYTICS_CORES,
  montarGrafico, limparGraficos,
  fatosDeAbastecimentos, fatosDeDespesas, fatosDeRecebimentos,
  fatosDePedagios, fatosDeOrdens,
  filtrarFatos, agruparPorPeriodo, agruparPor, variacao,
  graficoPeriodo, graficoDimensao,
  abrirOrigem, renderChips, seletorPeriodo, vazioAnalitico, aoTrocarTema,
  ROTULO_CATEGORIA,
  // diagnóstico operacional (23/11)
  METRICAS, seletorMetrica, montarBaseMetrica, valorDaMetrica, fmtMetrica,
  diagnosticoPorCaminhao, graficoRankingCaminhoes,
  GRUPOS_COMPOSICAO, graficoComposicao, fatosDoSegmento
};
