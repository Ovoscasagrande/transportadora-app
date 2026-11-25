/* ==========================================================================
   TELAS — núcleo
   Cada tela: { titulo, render(main), acao?, abas? }
   ========================================================================== */

/* ---------------------------------------------------------------- INÍCIO */
TELAS.inicio = {
  titulo: 'Início',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(4);

    const [veiculos, excecoes, custo, desp, abast, mots] = await Promise.all([
      q('veiculos', 'id,placa,modelo,km_atual,ativo'),
      q('vw_excecoes', '*'),
      // custo da frota: só gerência. Conferente recebe [] e a tela esconde o card.
      (ME?.perfil === 'gerencia'
        ? sb.rpc('custo_frota').then(r => r.data || [])
        : Promise.resolve([])),
      // fatos para o gráfico: as TABELAS base, nunca a view de custo
      q('despesas', 'id,data,valor,categoria,descricao,status,veiculo_id,motorista_id'),
      q('abastecimentos', 'id,data,valor_total,veiculo_id,motorista_id,combustivel,litros,posto'),
      q('motoristas', 'id,nome')
    ]);
    const st = Analytics.state;
    st.reset();

    const ativos = veiculos.filter(v => v.ativo);
    const totalCusto = custo.reduce((s, c) => s + Number(c.total || 0), 0);
    const totalKm = custo.reduce((s, c) => s + Number(c.km || 0), 0);
    const rkm = totalKm > 0
      ? custo.filter(c => c.km > 0).reduce((s, c) => s + Number(c.total), 0)
        / custo.filter(c => c.km > 0).reduce((s, c) => s + Number(c.km), 0)
      : null;

    const criticas = excecoes.filter(e => e.gravidade >= 3);
    const atencao = excecoes.filter(e => e.gravidade === 2);

    main.innerHTML = `
      ${ME?.perfil === 'gerencia' ? `
      <div class="destaque">
        <div class="rot">Custo da frota</div>
        <div class="big">${totalCusto ? brl(totalCusto) : '—'}</div>
        <div class="divisao">
          <div><div class="k">Por km</div><div class="x">${rkm ? brl(rkm) : '—'}</div></div>
          <div><div class="k">Km rodado</div><div class="x">${num(totalKm)}</div></div>
          <div><div class="k">Caminhões</div><div class="x">${ativos.length}</div></div>
        </div>
        <div id="ini-alerta"></div>
      </div>

      <div class="secao-topo mt4"><h2>Custo no tempo</h2></div>
      <div class="seg" id="seg-metrica-ini" style="margin-bottom:8px"></div>
      <div class="seg" id="seg-periodo-ini"></div>
      <div id="chips-ini"></div>
      <div id="bc-ini"></div>
      <div class="grafico" id="gr-ini"></div>
      <div class="dica centro" id="gr-ini-nota"></div>
      ` : ''}

      ${excecoes.length ? `
      <section class="secao">
        <div class="secao-topo">
          <h2>Exceções · ${excecoes.length}</h2>
          <button class="mais" data-ir="excecoes">ver todas</button>
        </div>
        <div class="linhas">
          ${excecoes.slice(0, 5).map(excLinha).join('')}
        </div>
        ${excecoes.length > 5 ? `<p class="dica mt2">Mais ${excecoes.length - 5} exceções — toque em ver todas.</p>` : ''}
      </section>` : `
      <section class="secao">
        <div class="linhas"><div class="vazio"><div class="ic">✓</div>Nenhuma pendência. Frota em dia.</div></div>
      </section>`}

      <section class="secao">
        <div class="secao-topo"><h2>Custo por caminhão</h2></div>
        <div class="linhas">
          ${custo.length ? custo.map(c => `
            <button class="linha" data-ir="custo" data-id="${c.veiculo_id}">
              <div class="corpo">
                <div class="titulo">${esc(c.placa)}</div>
                <div class="sub">${num(c.km)} km${c.kml ? ' · ' + Number(c.kml).toFixed(2).replace('.', ',') + ' km/L' : ''}</div>
              </div>
              <div class="dir">
                <div class="valor">${c.rkm ? brl(c.rkm) : '—'}<small>por km</small></div>
              </div>
              <span class="seta">›</span>
            </button>`).join('') : '<div class="vazio"><div class="ic">🚚</div>Nenhum caminhão cadastrado.</div>'}
        </div>
      </section>

      <div class="central mt4">
        <button class="btn fantasma mini" id="bt-sair">Sair</button>
      </div>`;

    main.querySelectorAll('[data-ir]').forEach(b => {
      b.onclick = () => ir(b.dataset.ir, {});
    });
    const bs = $('bt-sair');
    if (bs) bs.onclick = sair;

    /* ------------------------------------------------- camada analítica --- */
    const fatosIni = [
      ...Analytics.fatosDeAbastecimentos(abast, veiculos, mots),
      ...Analytics.fatosDeDespesas(desp, veiculos, mots)
    ];

    // base de métrica do Início (km vem do custo da RPC, receita dos recebimentos)
    const { data: recsIni } = await sb.from('recebimentos').select('veiculo_id,total,status');
    const receitaIni = {};
    (recsIni || []).forEach(r => {
      const placa = veiculos.find(v => v.id === r.veiculo_id)?.placa;
      if (placa) receitaIni[placa] = (receitaIni[placa] || 0) + Number(r.total || 0);
    });
    const baseMetricaIni = Analytics.montarBaseMetrica({
      fatos: fatosIni, veiculos, custoRpc: custo, receitaPorPlaca: receitaIni
    });
    const temReceitaIni = Object.values(receitaIni).some(v => v > 0);

    function desenharInicio() {
      const base = Analytics.filtrarFatos(fatosIni, st);
      const mt = st.metrica;

      // alerta no card: quem está fora do padrão, em uma linha
      const diagIni = Analytics.diagnosticoPorCaminhao(
        baseMetricaIni, Analytics.agruparPor(base, 'placa'), mt);
      const alerta = $('ini-alerta');
      if (alerta) {
        alerta.innerHTML = diagIni.outliers.length
          ? `<div style="margin-top:12px;padding-top:11px;border-top:1px solid rgba(255,255,255,.14)">
               <div class="pq" style="color:var(--atencao);font-weight:750;font-size:12.5px">
                 <i class="farol atencao" style="display:inline-block;margin-right:5px"></i>
                 ${diagIni.outliers.map(l => esc(l.placa)).join(', ')}
                 ${diagIni.outliers.length > 1 ? 'estão' : 'está'} acima de 15% da média
               </div>
               <div class="pq" style="color:var(--ink-3);margin-top:3px;font-size:11.5px">
                 ${diagIni.outliers.map(l => l.vilao
                   ? esc(l.placa) + ': ' + esc((Analytics.ROTULO_CATEGORIA[l.vilao.categoria] || l.vilao.categoria)) + ' acima do padrão'
                   : esc(l.placa) + ': sem vilão claro').join(' · ')}
               </div>
             </div>`
          : (diagIni.linhas.length
              ? `<div class="pq" style="margin-top:11px;padding-top:10px;border-top:1px solid rgba(255,255,255,.14);color:var(--ok);font-weight:650;font-size:12px">
                   <i class="farol ok" style="display:inline-block;margin-right:5px"></i>Frota dentro do padrão
                 </div>`
              : '');
      }

      const bc = $('bc-ini');
      const niveis = [{ rot: 'Visão geral' }];
      if (st.nivel !== 'macro') niveis.push({ rot: st.dimensao === 'placa' ? 'Caminhão' : 'Categoria' });
      bc.innerHTML = st.nivel === 'macro' ? '' :
        `<div class="breadcrumb">${niveis.map((n, i) =>
          `<button data-bc class="${i === niveis.length - 1 ? 'atual' : ''}">${esc(n.rot)}</button>`
          + (i < niveis.length - 1 ? '<span class="sep">›</span>' : '')).join('')}</div>`;
      bc.querySelectorAll('[data-bc]').forEach(b => {
        b.onclick = () => { if (b.classList.contains('atual')) return;
          st.nivel = 'macro'; st.dimensao = 'placa'; desenharInicio(); };
      });

      Analytics.renderChips('chips-ini', st, desenharInicio);

      const gr = document.getElementById('gr-ini');
      if (!base.length) {
        if (gr) gr.style.display = 'none';
        $('gr-ini-nota').innerHTML = Analytics.vazioAnalitico();
        return;
      }
      gr.style.display = '';
      $('gr-ini-nota').innerHTML = '';

      if (!Analytics.temEcharts()) {
        $('gr-ini-nota').textContent = 'Gráfico indisponível (a biblioteca não carregou). Os números acima continuam corretos.';
        return;
      }

      if (st.nivel === 'macro') {
        const serie = Analytics.agruparPorPeriodo(base, st.periodo).map(pt => {
          const doPeriodo = base.filter(f => Analytics.chavePeriodo(f.data, st.periodo) === pt.chave);
          return { ...pt, valorMetrica: Analytics.valorDaMetrica(baseMetricaIni, doPeriodo, null, mt) };
        }).filter(s2 => s2.valorMetrica != null);

        if (!serie.length) {
          gr.style.display = 'none';
          $('gr-ini-nota').textContent = mt === 'receita'
            ? 'Sem recebimento lançado, o % da receita não pode ser calculado.'
            : 'Sem km apurado no período, o custo por km não pode ser calculado.';
          return;
        }
        gr.style.display = '';
        Analytics.graficoPeriodo('gr-ini', serie.map(s2 => ({ ...s2, valor: s2.valorMetrica })), {
          periodo: st.periodo,
          cor: Analytics.cores.custo,
          metrica: mt,
          merge: true,
          onDrill: () => { st.nivel = 'dimensao'; st.dimensao = 'placa'; desenharInicio(); }
        });
        $('gr-ini-nota').textContent = 'Toque numa barra para ver por caminhão.';
      } else if (st.dimensao === 'placa') {
        Analytics.graficoDimensao('gr-ini', Analytics.agruparPor(base, 'placa'), {
          onDrill: g => { st.placa = g.chave; st.dimensao = 'categoria'; desenharInicio(); }
        });
        $('gr-ini-nota').textContent = 'Toque num caminhão para filtrar e ver a categoria.';
      } else {
        const grupos = Analytics.agruparPor(base, 'categoria');
        Analytics.graficoDimensao('gr-ini', grupos.map(g => ({
          ...g, chave: Analytics.ROTULO_CATEGORIA[g.chave] || g.chave
        })), {
          onDrill: g => {
            const alvo = base.filter(f =>
              (Analytics.ROTULO_CATEGORIA[f.categoria] || f.categoria) === g.chave);
            Analytics.abrirOrigem({
              titulo: g.chave,
              subtitulo: st.placa ? 'Caminhão ' + st.placa : 'Toda a frota',
              fatos: alvo, totalEsperado: g.valor
            });
          }
        });
        $('gr-ini-nota').textContent = 'Toque numa categoria para auditar os registros.';
      }
    }

    if (ME?.perfil === 'gerencia') {
      Analytics.seletorMetrica('seg-metrica-ini', st, desenharInicio,
        temReceitaIni ? ['valor', 'rkm', 'receita'] : ['valor', 'rkm']);
      Analytics.seletorPeriodo('seg-periodo-ini', st, desenharInicio);
      desenharInicio();
    }

    // resumo por gravidade
    if (criticas.length) {
      const p = el('div', { className: 'cartao mt2' });
      p.style.borderColor = 'rgba(226,85,85,.4)';
      p.innerHTML = `<p class="pq"><b style="color:var(--critico)">${criticas.length} crítica${criticas.length > 1 ? 's' : ''}</b>
        <span class="txt3"> · </span><b style="color:var(--atencao)">${atencao.length} de atenção</b></p>`;
      main.querySelector('.destaque').after(p);
    }
  }
};

/** linha de exceção reutilizável */
function excLinha(e) {
  const nivel = e.gravidade >= 3 ? 'critico' : e.gravidade === 2 ? 'atencao' : 'info';
  let det = e.detalhe || '';
  // a view entrega o número cru; quem formata em pt-BR é o app
  if (e.valor != null) {
    if (e.causa === 'oleo_estourado') det = `Passou ${num(e.valor)} km da troca`;
    else det = `${det} · ${brl(e.valor)}`;
  }
  if (e.detalhe === 'Passou da troca de óleo' && e.valor == null) det = 'Passou da troca de óleo';
  return `<button class="exc" data-exc="${esc(e.causa)}" data-ref="${esc(e.ref_id)}">
    <i class="farol ${nivel}"></i>
    <div class="corpo">
      <div class="t">${esc(e.titulo)}</div>
      <div class="d">${esc(det)}</div>
      <div class="dono"><i>→</i> ${esc(e.dono)}</div>
    </div>
    <span class="seta">›</span>
  </button>`;
}

/* ---------------------------------------------------------------- EXCEÇÕES */
const CAUSA_LABEL = {
  cnh_vencida: 'CNH vencida',
  crlv_vencido: 'CRLV vencido',
  crlv_faltando: 'CRLV faltando',
  oleo_estourado: 'Troca de óleo',
  multa_sem_ciencia: 'Multa sem ciência',
  despesa_pendente: 'Despesa pendente',
  os_aberta: 'Oficina',
  jornada_parada: 'Jornada parada',
  aviso_aberto: 'Aviso do motorista'
};

TELAS.excecoes = {
  titulo: 'Pendências',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(6);
    const lista = await q('vw_excecoes', '*');
    if (!lista.length) {
      main.innerHTML = `<div class="vazio"><div class="ic">✓</div>Nada pendente.<br><span class="txt3" style="font-size:12px">Documento, óleo, multa, oficina e despesa em dia.</span></div>`;
      return;
    }
    // agrupa por causa — a causa define o dono
    const grupos = {};
    lista.forEach(e => { (grupos[e.causa] = grupos[e.causa] || []).push(e); });
    const ordem = Object.entries(grupos)
      .sort((a, b) => Math.max(...b[1].map(x => x.gravidade)) - Math.max(...a[1].map(x => x.gravidade)));

    main.innerHTML = ordem.map(([causa, itens]) => `
      <section class="secao">
        <div class="secao-topo">
          <h2>${esc(CAUSA_LABEL[causa] || causa)} · ${itens.length}</h2>
        </div>
        <div class="linhas">${itens.map(excLinha).join('')}</div>
      </section>`).join('');

    main.querySelectorAll('[data-exc]').forEach(b => {
      b.onclick = () => {
        // cada causa leva à tela onde a pendência realmente se resolve.
        // Antes aqui havia 'despesas' e 'multas' — telas que não existiam:
        // o clique caía em silêncio no Início e o dinheiro ficava parado.
        const r = {
          crlv_vencido: 'veiculos', crlv_faltando: 'veiculos', oleo_estourado: 'veiculos',
          cnh_vencida: 'motoristas', despesa_pendente: 'despesas',
          os_aberta: 'veiculos', jornada_parada: 'jornadas', aviso_aberto: 'veiculos'
        }[b.dataset.exc];
        if (r) ir(r); else toast('Sem tela para esta pendência ainda', true);
      };
    });
  }
};

/* ---------------------------------------------------------------- CUSTO */
const CATS = {
  combustivel: { cor: '#1E5AA8', rot: 'Combustível' },
  manutencao: { cor: '#F0A93B', rot: 'Manutenção' },
  multas: { cor: '#E25555', rot: 'Multas' },
  despesas: { cor: '#9A6AD9', rot: 'Despesas' }
};

TELAS.custo = {
  titulo: 'Custo por caminhão',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(5);
    // via RPC: motorista não recebe custo (a view devolveria linha com zero)
    const { data: lista, error } = await sb.rpc('custo_frota');
    if (error) { main.innerHTML = `<div class="vazio">Não consegui carregar o custo.</div>`; return; }

    const st = Analytics.state;
    st.reset();

    // Os fatos do gráfico vêm das TABELAS base (é preciso a linha, não o total).
    // O total da RPC é a referência de verdade — o gráfico tem que fechar com ele.
    const [veicsCheios, desp, abast, mots, oss] = await Promise.all([
      q('veiculos', 'id,placa,km_atual,intervalo_oleo_km,ultima_troca_oleo_km'),
      q('despesas', 'id,data,valor,categoria,descricao,status,veiculo_id,motorista_id'),
      q('abastecimentos', 'id,data,valor_total,veiculo_id,motorista_id,combustivel,litros,posto'),
      q('motoristas', 'id,nome'),
      q('ordens_servico', 'id,aberta_em,mao_obra,custos,descricao,status,veiculo_id')
    ]);
    if (!lista.length) {
      main.innerHTML = `<div class="vazio"><div class="ic">🚚</div>Nenhum caminhão cadastrado ainda.
        <div class="mt3"><button class="btn mini" id="bt-novo-veic">Cadastrar caminhão</button></div></div>`;
      $('bt-novo-veic').onclick = () => ir('veiculos');
      return;
    }

    const comKm = lista.filter(c => Number(c.km) > 0);
    const kmTotal = comKm.reduce((s, c) => s + Number(c.km), 0);
    const custoComKm = comKm.reduce((s, c) => s + Number(c.total), 0);
    const custoTotal = lista.reduce((s, c) => s + Number(c.total), 0);
    const rkmFrota = kmTotal > 0 ? custoComKm / kmTotal : null;
    const semKm = lista.filter(c => !(Number(c.km) > 0));

    const ordenado = [...lista].sort((a, b) => Number(b.total) - Number(a.total));

    main.innerHTML = `
      <div class="destaque">
        <div class="rot">Custo total · desde o início</div>
        <div class="big">${brl(custoTotal)}</div>
        <div class="divisao">
          <div><div class="k">Custo por km</div><div class="x">${rkmFrota ? brl(rkmFrota) : '—'}</div></div>
          <div><div class="k">Km rodado</div><div class="x">${num(kmTotal)}</div></div>
        </div>
        ${semKm.length ? `<p class="dica mt3" style="color:var(--atencao)">${semKm.map(c => esc(c.placa)).join(', ')} sem km apurado — o custo aparece, mas fica fora do divisor do R$/km. É de propósito: não atribuo o custo de um caminhão parado ao km de outro.</p>` : ''}
      </div>

      <div class="secao-topo mt4"><h2>Fechamento líquido</h2></div>
      <div id="fechamento-liquido"></div>

      <div class="secao-topo mt4"><h2>Diagnóstico da frota</h2></div>
      <div class="seg" id="seg-metrica-cus" style="margin-bottom:8px"></div>
      <div class="seg" id="seg-periodo-cus"></div>
      <div id="chips-cus"></div>
      <div id="bc-cus"></div>
      <div class="grafico" id="gr-cus"></div>
      <div class="dica centro" id="gr-cus-nota"></div>

      <div class="secao-topo mt4">
        <h2>Caminhões fora do padrão</h2>
        <span class="pq txt3" id="outlier-resumo"></span>
      </div>
      <div class="grafico alto" id="gr-rank"></div>
      <div id="rank-badges"></div>

      <div class="secao-topo mt4"><h2>Composição do custo</h2></div>
      <div class="grafico alto" id="gr-comp"></div>
      <div class="dica centro" id="gr-comp-nota">Toque numa fatia para auditar a placa e a categoria.</div>

      ${ordenado.map(c => {
        const t = Number(c.total) || 0;
        const partes = ['combustivel', 'manutencao', 'multas', 'despesas']
          .map(k => ({ k, v: Number(c[k]) || 0 }))
          .filter(x => x.v > 0);
        return `
        <div class="cartao">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <div style="min-width:0">
              <div style="font-size:17px;font-weight:800;letter-spacing:-.02em">${esc(c.placa)}</div>
              <div class="pq txt3">${esc([c.marca, c.modelo].filter(Boolean).join(' ') || '—')}${c.km_atual != null ? ' <span class=\'txt3\'>· odômetro ' + km(c.km_atual) + '</span>' : ''}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div class="num" style="font-size:20px;font-weight:700;color:var(--brand-luz);letter-spacing:-.03em;line-height:1.1">
                ${c.rkm ? brl(c.rkm) : '—'}
              </div>
              <div style="font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3);margin-top:2px">por km</div>
            </div>
          </div>

          ${t > 0 ? `<div class="composta mt3">
            ${partes.map(p => `<i style="width:${p.v / t * 100}%;background:${CATS[p.k].cor}" title="${CATS[p.k].rot}: ${brl(p.v)}"></i>`).join('')}
          </div>` : '<p class="dica mt3">Nenhum custo lançado.</p>'}

          <div style="display:flex;gap:16px;margin-top:14px;flex-wrap:wrap">
            <div><div class="k" style="font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)">Total</div>
              <div class="num" style="font-size:14px;font-weight:700">${brl(t)}</div></div>
            <div><div style="font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)">Km</div>
              <div class="num" style="font-size:14px;font-weight:700">${num(c.km)}</div></div>
            <div><div style="font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)">km/L</div>
              <div class="num" style="font-size:14px;font-weight:700">${c.kml ? Number(c.kml).toFixed(2).replace('.', ',') : '—'}</div></div>
            <div><div style="font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)">Fila média</div>
              <div class="num" style="font-size:14px;font-weight:700">${c.horas_media_fila > 0 ? Number(c.horas_media_fila).toFixed(1).replace('.', ',') + ' h' : '—'}</div></div>
            ${c.na_fila_agora > 0 ? `<div><div style="font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--atencao)">Na fila</div>
              <div class="num" style="font-size:14px;font-weight:700;color:var(--atencao)">${c.na_fila_agora}</div></div>` : ''}
          </div>

          ${partes.length ? `<div class="legenda">${partes.map(p =>
            `<span><i class="ponto" style="background:${CATS[p.k].cor}"></i>${CATS[p.k].rot} <b>${brl(p.v)}</b></span>`).join('')}</div>` : ''}

          ${window.Melhorias && window.__rendimento ? (function(){
              const r = window.__rendimento[c.placa];
              if (!r || !r.ultimo || !r.media) return '';
              return `<div style="margin-top:9px">${Melhorias.seloRendimento(r.ultimo.kml, r.media)}</div>`;
            })() : ''}

          ${window.Melhorias ? Melhorias.semaforoOleo({
              km_atual: c.km_atual,
              intervalo_oleo_km: (window.__veicPorId && window.__veicPorId[c.veiculo_id] || {}).intervalo_oleo_km,
              ultima_troca_oleo_km: (window.__veicPorId && window.__veicPorId[c.veiculo_id] || {}).ultima_troca_oleo_km
            }) : ''}
        </div>`;
      }).join('')}

      <div class="cartao mt4">
        <div class="secao-topo"><h2>Como é calculado</h2></div>
        <p class="pq txt2" style="line-height:1.6">
          Soma o combustível dos abastecimentos, a manutenção (peças, pneu, óleo, oficina, freio — inclusive mão de obra e custo de OS),
          as multas e as demais despesas. Despesa <b>reprovada</b> não entra.
          O resultado é dividido pelo km das jornadas fechadas.
          Quando a jornada não tem km final, entra a diferença de odômetro entre o primeiro e o último abastecimento.
        </p>
      </div>`;

    /* ------------------------------------------------- camada analítica --- */
    const veicsRef = lista.map(c => ({ id: c.veiculo_id, placa: c.placa }));
    // M3 — rendimento por placa (km/L entre abastecimentos completos).
    if (window.Melhorias) window.__rendimento = Melhorias.rendimentoPorPlaca(abast, veicsRef);
    const fatosCus = [
      ...Analytics.fatosDeAbastecimentos(abast, veicsRef, mots),
      ...Analytics.fatosDeDespesas(desp, veicsRef, mots),
      ...Analytics.fatosDeOrdens(oss, veicsRef)
    ];

    // receita por placa, para a métrica "% da Receita"
    const { data: recs } = await sb.from('recebimentos').select('data,veiculo_id,valor_frete,pedagio,descarga,total,status');
    const receitaPorPlaca = {};
    (recs || []).forEach(r => {
      const placa = veicsRef.find(v => v.id === r.veiculo_id)?.placa;
      if (!placa) return;
      receitaPorPlaca[placa] = (receitaPorPlaca[placa] || 0) + Number(r.total || 0);
    });
    const temReceita = Object.values(receitaPorPlaca).some(v => v > 0);

    // referência de verdade: soma da RPC
    const totalRpc = lista.reduce((s, c) => s + Number(c.total || 0), 0);
    const baseMetrica = Analytics.montarBaseMetrica({
      fatos: fatosCus, veiculos: veicsRef, custoRpc: lista, receitaPorPlaca
    });

    const metrica = () => st.metrica;

    function desenharCusto() {
      const base = Analytics.filtrarFatos(fatosCus, st);
      const mt = metrica();

      const bc = $('bc-cus');
      const niveis = [{ rot: 'Visão geral' }];
      if (st.nivel !== 'macro') niveis.push({ rot: st.dimensao === 'placa' ? 'Caminhão' : 'Categoria' });
      bc.innerHTML = st.nivel === 'macro' ? '' :
        `<div class="breadcrumb">${niveis.map((n, i) =>
          `<button data-bc class="${i === niveis.length - 1 ? 'atual' : ''}">${esc(n.rot)}</button>`
          + (i < niveis.length - 1 ? '<span class="sep">›</span>' : '')).join('')}</div>`;
      bc.querySelectorAll('[data-bc]').forEach(b => {
        b.onclick = () => { if (b.classList.contains('atual')) return;
          st.nivel = 'macro'; st.dimensao = 'placa'; desenharCusto(); };
      });

      Analytics.renderChips('chips-cus', st, desenharCusto);

      /* ---------- 1) gráfico de período, na métrica escolhida ---------- */
      const gr = document.getElementById('gr-cus');
      if (!base.length) {
        if (gr) gr.style.display = 'none';
        $('gr-cus-nota').innerHTML = Analytics.vazioAnalitico();
        $('gr-rank').innerHTML = '';
        $('gr-comp').innerHTML = '';
        $('rank-badges').innerHTML = '';
        $('outlier-resumo').textContent = '';
        return;
      }
      gr.style.display = '';

      if (!Analytics.temEcharts()) {
        $('gr-cus-nota').textContent = 'Gráfico indisponível (a biblioteca não carregou). Os cartões acima continuam corretos.';
        return;
      }

      if (st.nivel === 'macro') {
        // na métrica de valor, a série é o próprio valor por período;
        // nas outras, converto cada período pela mesma regra (km ou receita total)
        const serie = Analytics.agruparPorPeriodo(base, st.periodo).map(pt => {
          const doPeriodo = base.filter(f => Analytics.chavePeriodo(f.data, st.periodo) === pt.chave);
          const v = Analytics.valorDaMetrica(baseMetrica, doPeriodo, null, mt);
          return { ...pt, valorMetrica: v };
        });
        const usa = serie.map(s2 => s2.valorMetrica).filter(v => v != null);
        const comMetrica = serie.filter(s2 => s2.valorMetrica != null);

        if (!comMetrica.length) {
          gr.style.display = 'none';
          $('gr-cus-nota').textContent = mt === 'receita'
            ? 'Sem recebimento lançado, o % da receita não pode ser calculado.'
            : 'Sem km apurado no período, o custo por km não pode ser calculado.';
        } else {
          gr.style.display = '';
          Analytics.graficoPeriodo('gr-cus', comMetrica.map(s2 => ({ ...s2, valor: s2.valorMetrica })), {
            periodo: st.periodo,
            cor: Analytics.cores.custo,
            metrica: mt,
            merge: true,
            onDrill: () => { st.nivel = 'dimensao'; st.dimensao = 'placa'; desenharCusto(); }
          });
          const somaFatos = base.reduce((s2, f) => s2 + f.valor, 0);
          const difere = mt === 'valor' && !st.temFiltro() && Math.abs(somaFatos - totalRpc) > 0.05;
          $('gr-cus-nota').innerHTML = difere
            ? `<span style="color:var(--atencao)">A soma dos lançamentos (${brl(somaFatos)}) não fecha com o total do custo (${brl(totalRpc)}).
               Diferença de ${brl(somaFatos - totalRpc)} — confira antes de usar o gráfico.</span>`
            : 'Toque numa barra para ver por caminhão.';
        }
      } else if (st.dimensao === 'placa') {
        Analytics.graficoDimensao('gr-cus', Analytics.agruparPor(base, 'placa'), {
          onDrill: g => { st.placa = g.chave; st.dimensao = 'categoria'; desenharCusto(); }
        });
        $('gr-cus-nota').textContent = 'Toque num caminhão para filtrar e ver a categoria.';
      } else {
        const grupos = Analytics.agruparPor(base, 'categoria');
        Analytics.graficoDimensao('gr-cus', grupos.map(g => ({
          ...g, chave: Analytics.ROTULO_CATEGORIA[g.chave] || g.chave
        })), {
          onDrill: g => {
            const alvo = base.filter(f =>
              (Analytics.ROTULO_CATEGORIA[f.categoria] || f.categoria) === g.chave);
            Analytics.abrirOrigem({
              titulo: g.chave,
              subtitulo: st.placa ? 'Caminhão ' + st.placa : 'Toda a frota',
              fatos: alvo, totalEsperado: g.valor
            });
          }
        });
        $('gr-cus-nota').textContent = 'Toque numa categoria para auditar os registros.';
      }

      /* ---------- 2) ranking com outliers ---------- */
      const gruposPlaca = Analytics.agruparPor(base, 'placa');
      const diag = Analytics.diagnosticoPorCaminhao(baseMetrica, gruposPlaca, mt);

      if (diag.linhas.length) {
        Analytics.graficoRankingCaminhoes('gr-rank', diag, {
          metrica: mt,
          merge: true,
          onDrill: l => {
            st.placa = l.placa;
            Analytics.abrirOrigem({
              titulo: l.placa,
              subtitulo: 'Custo total do caminhão · ' + fmtMetrica(l.valor, mt),
              fatos: l.fatos,
              totalEsperado: l.fatos.reduce((s2, f) => s2 + f.valor, 0)
            });
          }
        });

        $('outlier-resumo').textContent = diag.outliers.length
          ? diag.outliers.length + ' acima de 15% da média'
          : 'todos dentro do padrão';

        $('rank-badges').innerHTML = diag.outliers.length
          ? diag.outliers.map(l => `
              <div class="cartao" style="padding:10px 13px;margin-top:8px;border-color:rgba(226,85,85,.42)">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
                  <div style="min-width:0">
                    <div style="font-size:13.5px;font-weight:750">
                      <i class="farol critico" style="display:inline-block;margin-right:5px"></i>${esc(l.placa)}
                    </div>
                    <div class="pq txt3">${l.vilao ? esc(vilaoTexto(l.vilao)) : 'acima da média sem vilão claro'}</div>
                  </div>
                  <div class="num" style="font-size:13px;font-weight:750;color:var(--critico)">
                    +${l.acima.toFixed(0)}%
                  </div>
                </div>
              </div>`).join('')
          : '';
      } else {
        $('rank-badges').innerHTML = '';
        $('outlier-resumo').textContent = mt === 'receita'
          ? 'sem receita para comparar' : 'sem km apurado';
        document.getElementById('gr-rank').innerHTML = Analytics.vazioAnalitico('Sem base para comparar');
      }

      /* ---------- 3) composição empilhada ---------- */
      Analytics.graficoComposicao('gr-comp', base, {
        merge: true,
        onSegmento: seg => {
          const fatosSeg = Analytics.fatosDoSegmento(base, seg.placa, seg.categoria);
          Analytics.abrirOrigem({
            titulo: seg.rotulo,
            subtitulo: 'Caminhão ' + seg.placa,
            fatos: fatosSeg,
            totalEsperado: seg.valor
          });
        }
      });
    }

    /** texto do badge do vilão */
    function vilaoTexto(v) {
      const nome = Analytics.ROTULO_CATEGORIA[v.categoria] || v.categoria;
      const sinal = v.excesso > 0 ? '+' : '';
      return `${nome} ${sinal}${v.excesso.toFixed(0)} pontos acima da média da frota`;
    }

    // seletor de métrica: % da receita só aparece quando há receita lançada
    Analytics.seletorMetrica('seg-metrica-cus', st, desenharCusto,
      temReceita ? ['valor', 'rkm', 'receita'] : ['valor', 'rkm']);
    Analytics.seletorPeriodo('seg-periodo-cus', st, desenharCusto);
    desenharCusto();

    // M6 — fechamento líquido. Só gerência/conferente chegam aqui; a RPC barra o resto.
    if (window.Melhorias) Melhorias.renderFechamentoLiquido('fechamento-liquido');
  }
};
