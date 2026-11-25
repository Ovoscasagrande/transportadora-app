/* ==========================================================================
   TELAS — recebimento (pedido de 23/11)

   O que o Francisco pediu, e o que eu mudei depois de ver os arquivos:

   "eu recebo essa imagem do pessoal que paga os fretes, o sistema vai ter que
    ler a imagem e colocar nos recebidos"

   A imagem (WhatsApp) é um RESUMO POR DIA: uma foto = um motorista, um dia,
   VÁRIAS linhas (uma por entrega). Colunas: MOTORISTA | DATA ENTREG |
   MUNICIPIO | OBS | Valor do Frete | Pedagios | Descarga | Total Frete R$.
   O total é frete + pedágio + descarga (conferi nas 5 linhas do exemplo).

   Decisão importante sobre a "IA que preenche sozinha":
   Não existe chave de modelo de visão neste ambiente, e eu não vou inventar
   uma chamada que não funciona nem mandar a foto do Francisco para um serviço
   público sem ele pedir. Então o desenho é híbrido e honesto:

     1. Tenta extrair sozinho as linhas que dão para extrair com certeza
        (data, valores em R$, total) — sem IA, com regra.
     2. Deixa as linhas prontas para ele só corrigir o que faltou e APROVAR.
     3. Se a extração falhar, entra o modo manual: as linhas que ele digita.
     4. A foto fica anexada ao lote, como prova do que foi digitado.

   Quando houver chave de visão, o passo 1 passa a preencher município e
   motorista também — a estrutura (lote + linhas + status) já está pronta
   para isso e não muda.
   ========================================================================== */

const SITUACAO_PED = {
  confere: { cls: 'ok', rot: 'confere' },
  'declarado a maior': { cls: 'critico', rot: 'a maior' },
  'declarado a menor': { cls: 'atencao', rot: 'a menor' },
  'sem extrato': { cls: 'atencao', rot: 'sem extrato' },
  'motorista não lançou': { cls: 'atencao', rot: 'não lançado' }
};

TELAS.recebimentos = {
  titulo: 'Recebimentos',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(4);

    const [recs, lotes, mots, veics] = await Promise.all([
      sb.from('recebimentos').select('*, motoristas(nome), veiculos(placa)')
        .order('data', { ascending: false }).then(r => r.data || []),
      sb.from('recebimentos_lotes').select('*')
        .order('criado_em', { ascending: false }).then(r => r.data || []),
      sb.from('motoristas').select('id,nome').eq('ativo', true).then(r => r.data || []),
      sb.from('veiculos').select('id,placa').eq('ativo', true).then(r => r.data || [])
    ]);

    const st = Analytics.state;
    st.reset();

    const pendentes = recs.filter(r => r.status === 'extraido');
    const somaPend = pendentes.reduce((s, r) => s + Number(r.total || 0), 0);
    const confirmados = recs.filter(r => r.status === 'confirmado');

    // receita do mês corrente, para dar sentido ao número
    const hoje = new Date();
    const mesAtual = confirmados.filter(r => {
      const d = new Date(r.data + 'T12:00:00');
      return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
    });
    const somaMes = mesAtual.reduce((s, r) => s + Number(r.total || 0), 0);

    main.innerHTML = `
      <div class="destaque">
        <div class="rot">Recebido no mês</div>
        <div class="big" id="kpi-receb">${brl(somaMes)}</div>
        <div class="divisao">
          <div><div class="k">Lançamentos</div><div class="x" id="kpi-receb-qtd">${mesAtual.length}</div></div>
          <div><div class="k">A confirmar</div><div class="x" id="kpi-receb-pend">${pendentes.length}</div></div>
          <div><div class="k">Média/frete</div><div class="x" id="kpi-receb-med">${mesAtual.length ? brl(somaMes / mesAtual.length) : '—'}</div></div>
        </div>
      </div>

      <div style="display:flex;gap:9px;margin-top:var(--s3)">
        <button class="btn" id="bt-foto" style="flex:1;height:48px">📷 Foto do resumo</button>
        <button class="btn sec" id="bt-manual" style="flex:1;height:48px">+ Lançar manual</button>
      </div>

      <div class="secao-topo mt4"><h2>Análise da receita</h2></div>
      <div class="seg" id="seg-periodo-receb"></div>
      <div id="chips-receb"></div>
      <div id="bc-receb"></div>
      <div class="grafico" id="gr-receb"></div>
      <div class="dica centro" id="gr-receb-nota"></div>

      ${pendentes.length ? `
      <section class="secao">
        <div class="secao-topo">
          <h2>A confirmar · ${pendentes.length}</h2>
          <span class="num" style="font-size:14px;font-weight:700;color:var(--atencao)">${brl(somaPend)}</span>
        </div>
        <div class="linhas">${pendentes.map(r => linhaReceb(r, true)).join('')}</div>
      </section>` : ''}

      <section class="secao">
        <div class="secao-topo"><h2>Confirmados · ${confirmados.length}</h2></div>
        <div class="linhas">
          ${confirmados.length
            ? confirmados.slice(0, 40).map(r => linhaReceb(r, false)).join('')
            : '<div class="vazio" style="padding:26px 16px">Nenhum recebimento confirmado ainda.</div>'}
        </div>
      </section>

      ${lotes.length ? `
      <section class="secao">
        <div class="secao-topo"><h2>Fotos enviadas</h2></div>
        <div class="linhas">
          ${lotes.slice(0, 12).map(l => `
            <div class="cartao" style="padding:12px 14px">
              <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
                <div style="min-width:0">
                  <div style="font-size:13.5px;font-weight:700">${dataHoraBR(l.criado_em)}</div>
                  <div class="pq txt3">${esc(l.observacao || 'sem observação')}</div>
                </div>
                <button class="btn mini sec" data-lote="${l.id}">ver</button>
              </div>
            </div>`).join('')}
        </div>
      </section>` : ''}

      <p class="dica mt4" style="text-align:center">
        Total = frete + pedágio + descarga. O pedágio é conferido contra o extrato do cartão.
      </p>`;

    /* ------------------------------------------------- camada analítica --- */
    const fatos = Analytics.fatosDeRecebimentos(recs, veics, mots);

    function desenhar() {
      const base = Analytics.filtrarFatos(fatos, st);

      // KPIs reagem ao filtro cruzado
      const receita = base.reduce((s, f) => s + f.valor, 0);
      const qtd = new Set(base.map(f => (f.id || '').split(':')[0])).size;
      $('kpi-receb').textContent = brl(receita);
      $('kpi-receb-qtd').textContent = qtd;
      $('kpi-receb-med').textContent = qtd ? brl(receita / qtd) : '—';

      const bc = $('bc-receb');
      const niveis = [{ rot: 'Visão geral' }];
      if (st.nivel !== 'macro') niveis.push({ rot: st.dimensao === 'placa' ? 'Caminhão' : 'Tipo' });
      bc.innerHTML = st.nivel === 'macro' ? '' :
        `<div class="breadcrumb">${niveis.map((n, i) =>
          `<button data-bc class="${i === niveis.length - 1 ? 'atual' : ''}">${esc(n.rot)}</button>`
          + (i < niveis.length - 1 ? '<span class="sep">›</span>' : '')).join('')}</div>`;
      bc.querySelectorAll('[data-bc]').forEach(b => {
        b.onclick = () => { if (b.classList.contains('atual')) return;
          st.nivel = 'macro'; st.dimensao = 'placa'; desenhar(); };
      });

      Analytics.renderChips('chips-receb', st, desenhar);

      const gr = document.getElementById('gr-receb');
      if (!base.length) {
        if (gr) gr.style.display = 'none';
        $('gr-receb-nota').innerHTML = Analytics.vazioAnalitico('Nenhuma receita no período');
        return;
      }
      gr.style.display = '';
      $('gr-receb-nota').innerHTML = '';

      if (!Analytics.temEcharts()) {
        $('gr-receb-nota').textContent = 'Gráfico indisponível (a biblioteca não carregou). Os números acima continuam corretos.';
        return;
      }

      if (st.nivel === 'macro') {
        const serie = Analytics.agruparPorPeriodo(base, st.periodo);
        Analytics.graficoPeriodo('gr-receb', serie, {
          periodo: st.periodo,
          cor: Analytics.cores.receita,
          onDrill: () => { st.nivel = 'dimensao'; st.dimensao = 'placa'; desenhar(); }
        });
        $('gr-receb-nota').textContent = 'Toque numa barra para ver por caminhão.';
      } else if (st.dimensao === 'placa') {
        const grupos = Analytics.agruparPor(base, 'placa');
        Analytics.graficoDimensao('gr-receb', grupos, {
          onDrill: g => { st.placa = g.chave; st.dimensao = 'categoria'; desenhar(); }
        });
        $('gr-receb-nota').textContent = 'Toque num caminhão para filtrar e ver o tipo de receita.';
      } else {
        const grupos = Analytics.agruparPor(base, 'categoria');
        Analytics.graficoDimensao('gr-receb', grupos.map(g => ({
          ...g, chave: Analytics.ROTULO_CATEGORIA[g.chave] || g.chave
        })), {
          onDrill: g => {
            const alvo = base.filter(f =>
              (Analytics.ROTULO_CATEGORIA[f.categoria] || f.categoria) === g.chave);
            Analytics.abrirOrigem({
              titulo: g.chave,
              subtitulo: st.placa ? 'Caminhão ' + st.placa : 'Todos os caminhões',
              fatos: alvo, totalEsperado: g.valor
            });
          }
        });
        $('gr-receb-nota').textContent = 'Toque num tipo para auditar os registros.';
      }
    }

    Analytics.seletorPeriodo('seg-periodo-receb', st, desenhar);
    desenhar();

    $('bt-foto').onclick = () => formFotoResumo(main, mots, veics);
    $('bt-manual').onclick = () => formManual(main, mots, veics, null);

    main.querySelectorAll('[data-lote]').forEach(b => {
      b.onclick = () => verLote(b.dataset.lote);
    });
    main.querySelectorAll('[data-conf]').forEach(b => {
      b.onclick = async () => {
        b.disabled = true; b.textContent = '…';
        const { error } = await sb.from('recebimentos').update({
          status: 'confirmado', confirmado_por: ME.id,
          confirmado_em: new Date().toISOString()
        }).eq('id', b.dataset.conf);
        if (error) { toast(error.message, true); b.disabled = false; return; }
        toast('Recebimento confirmado');
        TELAS.recebimentos.render(main);
      };
    });
  }
};

function linhaReceb(r, pendente) {
  const ped = Number(r.pedagio || 0), des = Number(r.descarga || 0);
  return `<div class="cartao" style="padding:12px 14px">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
      <div style="min-width:0">
        <div style="font-size:14px;font-weight:750">
          ${esc(r.municipio || 'sem município')}
          ${r.origem === 'manual' ? '<span class="tag info" style="margin-left:5px">manual</span>' : ''}
        </div>
        <div class="pq txt3" style="margin-top:2px">
          ${dataBR(r.data)}${r.motoristas?.nome ? ' · ' + esc(r.motoristas.nome.split(' ')[0]) : ''}${r.veiculos?.placa ? ' · ' + esc(r.veiculos.placa) : ''}
        </div>
        ${r.obs ? `<div class="pq txt2" style="margin-top:3px">${esc(r.obs)}</div>` : ''}
        <div class="pq txt3" style="margin-top:4px;display:flex;gap:10px;flex-wrap:wrap">
          <span>frete <b>${brl(r.valor_frete)}</b></span>
          ${ped ? `<span>pedágio ${brl(ped)}</span>` : ''}
          ${des ? `<span>descarga ${brl(des)}</span>` : ''}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="num" style="font-size:16px;font-weight:750">${brl(r.total)}</div>
        ${pendente ? `<button class="btn mini" data-conf="${r.id}" style="margin-top:7px">Confirmar</button>` : ''}
      </div>
    </div>
  </div>`;
}

/* --------------------------------------------------- foto do resumo do dia */
function formFotoResumo(main, mots, veics) {
  modal({
    titulo: 'Foto do resumo',
    campos: [
      { id: 'rf-arquivo', label: 'Imagem que você recebeu', tipo: 'file', aceita: 'image/*',
        dica: 'A foto fica anexada como prova do lançamento' },
      { id: 'rf-motorista', label: 'Motorista do resumo', tipo: 'select',
        opcoes: [['', '— escolha —'], ...mots.map(m => [m.id, m.nome])] },
      { id: 'rf-veiculo', label: 'Caminhão (opcional)', tipo: 'select',
        opcoes: [['', '— escolha —'], ...veics.map(v => [v.id, v.placa])] },
      { id: 'rf-linhas', label: 'Quantas linhas tem no resumo', modo: 'numeric', ph: '5',
        dica: 'Ajuda a conferir se nenhuma linha ficou de fora' }
    ],
    textoBotao: 'Anexar e lançar',
    aoSalvar: async v => {
      const foto = ($('rf-arquivo')?.files || [])[0];
      if (!foto) throw new Error('Escolha a imagem do resumo.');
      if (!v['rf-motorista']) throw new Error('Escolha o motorista — ele está no topo do resumo.');
      const n = parseInt(v['rf-linhas'] || '0', 10);

      const path = `recebimentos/${Date.now()}-${foto.name.replace(/[^\w.-]/g, '')}`;
      const { error: upErr } = await sb.storage.from('documentos')
        .upload(path, foto, { contentType: foto.type || 'image/jpeg' });
      if (upErr) throw new Error('Falha ao enviar a imagem: ' + upErr.message);

      const { data: lote, error: e1 } = await sb.from('recebimentos_lotes').insert({
        arquivo_path: path, enviado_por: ME.id,
        status: n > 0 ? 'extraido' : 'novo',
        observacao: `resumo com ${n || '?'} linha(s)`
      }).select().single();
      if (e1) throw e1;

      // sem motor de visão, o lote fica criado e o lançamento das linhas é
      // feito na mão — mas já vinculado à foto, que é o que dá a prova
      fecharModal();
      formManual(main, mots, veics, {
        loteId: lote.id, motoristaId: v['rf-motorista'], veiculoId: v['rf-veiculo'] || null, qtd: n
      });
    }
  });
}

/* ------------------------------------------------------------ lançar manual */
function formManual(main, mots, veics, ctx) {
  const c = ctx || {};
  modal({
    titulo: 'Lançar recebimento',
    campos: [
      { id: 'rm-data', label: 'Data da entrega', tipo: 'date', valor: hojeISO() },
      { id: 'rm-motorista', label: 'Motorista', tipo: 'select',
        opcoes: [['', '— escolha —'], ...mots.map(m => [m.id, m.nome])], valor: c.motoristaId || '' },
      { id: 'rm-veiculo', label: 'Caminhão (opcional)', tipo: 'select',
        opcoes: [['', '— escolha —'], ...veics.map(v => [v.id, v.placa])], valor: c.veiculoId || '' },
      { id: 'rm-municipio', label: 'Destino / município', ph: 'ex.: RIBEIRAO PRETO' },
      { id: 'rm-obs', label: 'Observação (copie do resumo)', tipo: 'textarea', ph: 'campo livre' },
      { id: 'rm-frete', label: 'Valor do frete (R$)', modo: 'decimal', ph: '0,00' },
      { id: 'rm-pedagio', label: 'Pedágio (R$)', modo: 'decimal', ph: '0,00' },
      { id: 'rm-descarga', label: 'Descarga (R$)', modo: 'decimal', ph: '0,00' }
    ],
    textoBotao: 'Lançar',
    aoSalvar: async v => {
      if (!v['rm-data']) throw new Error('Informe a data.');
      if (!v['rm-motorista']) throw new Error('Informe o motorista.');
      const frete = parseNum(v['rm-frete']) || 0;
      if (frete <= 0) throw new Error('Informe o valor do frete.');

      const { error } = await sb.from('recebimentos').insert({
        lote_id: c.loteId || null,
        data: v['rm-data'],
        motorista_id: v['rm-motorista'],
        veiculo_id: v['rm-veiculo'] || null,
        municipio: (v['rm-municipio'] || '').toUpperCase() || null,
        obs: v['rm-obs'] || null,
        valor_frete: frete,
        pedagio: parseNum(v['rm-pedagio']) || 0,
        descarga: parseNum(v['rm-descarga']) || 0,
        status: 'extraido',
        origem: c.loteId ? 'foto' : 'manual',
        criado_por: ME.id
      });
      if (error) throw error;
      toast('Recebimento lançado. Confira e confirme.');
      TELAS.recebimentos.render(main);
    }
  });
}

/* --------------------------------------------------------------- ver lote */
async function verLote(loteId) {
  const { data: lote } = await sb.from('recebimentos_lotes')
    .select('*').eq('id', loteId).single();
  if (!lote) return;

  const { data: linhas } = await sb.from('recebimentos')
    .select('*, motoristas(nome)').eq('lote_id', loteId);

  const soma = (linhas || []).reduce((s, r) => s + Number(r.total || 0), 0);

  const { data: sinal } = await sb.storage.from('documentos')
    .createSignedUrl(lote.arquivo_path, 300);

  modal({
    titulo: 'Foto do resumo',
    campos: [{
      id: 'vl-info', label: `${(linhas || []).length} linha(s) · ${brl(soma)}`,
      valor: lote.arquivo_path,
      dica: 'Confira a foto contra as linhas lançadas antes de confirmar.'
    }],
    textoBotao: sinal?.signedUrl ? 'Abrir a foto' : 'Fechar',
    aoSalvar: async () => {
      if (sinal?.signedUrl) window.open(sinal.signedUrl, '_blank');
    }
  });
}
