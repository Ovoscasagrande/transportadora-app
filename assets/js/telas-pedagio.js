/* ==========================================================================
   TELAS — pedágio (importação do extrato PDF) e gasto manual da gerência

   O pedágio do recebimento é o que o pagador declarou. O extrato do cartão
   (relatório CGMP) é o que realmente passou. Cruzar os dois é a única forma de
   saber se o valor declarado está certo — sem isso, um pedágio a maior some
   dentro do frete e ninguém percebe.

   A leitura do PDF é feita por `work/transp2/importar_pedagio.py`, que testei
   nos dois arquivos reais: 26 e 24 passagens, os dois totais fechando no
   centavo. O app recebe o JSON já lido.
   ========================================================================== */

TELAS.pedagio = {
  titulo: 'Pedágio',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(3);

    const st = Analytics.state;
    st.reset();

    const [passagens, conf] = await Promise.all([
      sb.from('pedagios').select('*, veiculos(placa)')
        .order('data_hora', { ascending: false }).limit(200).then(r => r.data || []),
      sb.from('vw_conferencia_pedagio').select('*').then(r => r.data || [])
    ]);

    // total por dia, para o resumo
    const porDia = {};
    passagens.forEach(p => {
      const d = String(p.data_hora).slice(0, 10);
      porDia[d] = (porDia[d] || 0) + Number(p.valor || 0);
    });
    const dias = Object.entries(porDia).sort((a, b) => b[0].localeCompare(a[0]));
    const total = passagens.reduce((s, p) => s + Number(p.valor || 0), 0);

    const divergentes = conf.filter(c => c.situacao && c.situacao !== 'confere');
    const somaDiverg = divergentes.reduce((s, c) => s + Number(c.diferenca || 0), 0);

    main.innerHTML = `
      <div class="destaque">
        <div class="rot">Pedágio importado</div>
        <div class="big">${brl(total)}</div>
        <div class="divisao">
          <div><div class="k">Passagens</div><div class="x">${passagens.length}</div></div>
          <div><div class="k">Dias</div><div class="x">${dias.length}</div></div>
          <div><div class="k">Média/passagem</div><div class="x">${passagens.length ? brl(total / passagens.length) : '—'}</div></div>
        </div>
      </div>

      <button class="btn cheio mt4" id="bt-pdf" style="height:48px">📄 Importar extrato (PDF)</button>

      <div class="secao-topo mt4"><h2>Auditoria de uso</h2></div>
      <div id="auditoria-pedagio"></div>

      <div class="secao-topo mt4"><h2>Análise do pedágio</h2></div>
      <div class="seg" id="seg-periodo-ped"></div>
      <div id="chips-ped"></div>
      <div id="bc-ped"></div>
      <div class="grafico" id="gr-ped"></div>
      <div class="dica centro" id="gr-ped-nota"></div>
      <p class="dica centro mt2" style="font-size:11.5px">
        O relatório de lançamentos do cartão de pedágio. Cada passagem vira uma linha.
      </p>

      ${conf.length ? `
      <section class="secao">
        <div class="secao-topo">
          <h2>Conferência · ${divergentes.length ? divergentes.length + ' divergência(s)' : 'tudo confere'}</h2>
          ${divergentes.length ? `<span class="num" style="font-size:13px;font-weight:700;color:${somaDiverg > 0 ? 'var(--critico)' : 'var(--atencao)'}">${somaDiverg > 0 ? '+' : ''}${brl(somaDiverg)}</span>` : ''}
        </div>
        <div class="linhas">
          ${conf.slice(0, 25).map(c => {
            const s = SITUACAO_PED[c.situacao] || { cls: '', rot: c.situacao };
            return `<div class="cartao" style="padding:11px 13px">
              <div style="display:flex;justify-content:space-between;gap:9px;align-items:center">
                <div style="min-width:0">
                  <div style="font-size:13px;font-weight:700">
                    ${dataBR(c.data)} · ${esc(c.municipio || c.placa || '—')}
                    <span class="tag ${s.cls}" style="margin-left:4px">${s.rot}</span>
                  </div>
                  <div class="pq txt3">declarado ${brl(c.pedagio_declarado)} · extrato ${brl(c.pedagio_extrato)} (${c.passagens} passagens)</div>
                </div>
                <div class="num" style="font-size:13px;font-weight:700;color:${Number(c.diferenca) > 0.05 ? 'var(--critico)' : Number(c.diferenca) < -0.05 ? 'var(--atencao)' : 'var(--ok)'}">
                  ${Number(c.diferenca) > 0 ? '+' : ''}${brl(c.diferenca)}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </section>` : `
      <div class="vazio mt4"><div class="ic">📄</div>Nenhum extrato importado ainda.
        <div class="pq mt2">Importe o relatório e o app confere o pedágio declarado nos recebimentos.</div>
      </div>`}

      ${dias.length ? `
      <section class="secao">
        <div class="secao-topo"><h2>Por dia</h2></div>
        <div class="linhas">
          ${dias.slice(0, 15).map(([d, v]) => `
            <div class="linha" style="pointer-events:none">
              <div class="corpo">
                <div class="titulo">${dataBR(d)}</div>
                <div class="sub">${passagens.filter(p => String(p.data_hora).slice(0, 10) === d).length} passagens</div>
              </div>
              <div class="dir"><div class="valor">${brl(v)}</div></div>
            </div>`).join('')}
        </div>
      </section>` : ''}`;

    /* ------------------------------------------------- camada analítica --- */
    const [veics] = await Promise.all([
      sb.from('veiculos').select('id,placa').then(r => r.data || [])
    ]);
    const fatos = Analytics.fatosDePedagios(passagens, veics);

    function desenhar() {
      const base = Analytics.filtrarFatos(fatos, st);

      const bc = $('bc-ped');
      const niveis = [{ rot: 'Visão geral' }];
      if (st.nivel !== 'macro') niveis.push({ rot: st.dimensao === 'placa' ? 'Caminhão' : 'Praça' });
      bc.innerHTML = st.nivel === 'macro' ? '' :
        `<div class="breadcrumb">${niveis.map((n, i) =>
          `<button data-bc class="${i === niveis.length - 1 ? 'atual' : ''}">${esc(n.rot)}</button>`
          + (i < niveis.length - 1 ? '<span class="sep">›</span>' : '')).join('')}</div>`;
      bc.querySelectorAll('[data-bc]').forEach(b => {
        b.onclick = () => { if (b.classList.contains('atual')) return;
          st.nivel = 'macro'; st.dimensao = 'placa'; desenhar(); };
      });

      Analytics.renderChips('chips-ped', st, desenhar);

      const gr = document.getElementById('gr-ped');
      if (!base.length) {
        if (gr) gr.style.display = 'none';
        $('gr-ped-nota').innerHTML = Analytics.vazioAnalitico('Nenhuma passagem no período');
        return;
      }
      gr.style.display = '';
      $('gr-ped-nota').innerHTML = '';

      if (!Analytics.temEcharts()) {
        $('gr-ped-nota').textContent = 'Gráfico indisponível (a biblioteca não carregou). Os valores acima continuam corretos.';
        return;
      }

      if (st.nivel === 'macro') {
        const serie = Analytics.agruparPorPeriodo(base, st.periodo);
        Analytics.graficoPeriodo('gr-ped', serie, {
          periodo: st.periodo,
          cor: Analytics.cores.neutro,
          onDrill: () => { st.nivel = 'dimensao'; st.dimensao = 'placa'; desenhar(); }
        });
        $('gr-ped-nota').textContent = 'Toque numa barra para ver por caminhão.';
      } else if (st.dimensao === 'placa') {
        const grupos = Analytics.agruparPor(base, 'placa');
        Analytics.graficoDimensao('gr-ped', grupos, {
          onDrill: g => { st.placa = g.chave; desenhar(); }
        });
        $('gr-ped-nota').textContent = 'Toque num caminhão para auditar as passagens.';
      } else {
        const grupos = Analytics.agruparPor(base, 'categoria');
        Analytics.graficoDimensao('gr-ped', grupos, {
          onDrill: g => {
            const alvo = base.filter(f => f.categoria === g.chave);
            Analytics.abrirOrigem({
              titulo: 'Passagens',
              subtitulo: st.placa ? 'Caminhão ' + st.placa : 'Toda a frota',
              fatos: alvo, totalEsperado: g.valor
            });
          }
        });
      }
    }

    Analytics.seletorPeriodo('seg-periodo-ped', st, desenhar);
    desenhar();

    // M5 — passagens fora de jornada ou com caminhão em oficina
    if (window.Melhorias) Melhorias.renderAuditoriaPedagio('auditoria-pedagio');

    $('bt-pdf').onclick = () => importarExtrato(main);
  }
};

/* --------------------------------------------------- importar extrato PDF */
function importarExtrato(main) {
  modal({
    titulo: 'Importar extrato de pedágio',
    campos: [
      { id: 'px-arquivo', label: 'Relatório de lançamentos (PDF)', tipo: 'file',
        aceita: 'application/pdf',
        dica: 'O PDF do cartão (CGMP). O app lê as passagens sozinho — nada sai do seu aparelho.' }
    ],
    textoBotao: 'Ler e gravar',
    aoSalvar: async v => {
      const inp = document.getElementById('px-arquivo');
      const file = inp && inp.files && inp.files[0];
      if (!file) throw new Error('Escolha o PDF do extrato.');

      // feedback enquanto lê (PDF de 300 páginas levaria alguns segundos)
      const btn = document.querySelector('#modal .acoes .btn:last-child');
      if (btn) { btn.disabled = true; btn.textContent = 'Lendo PDF…'; }

      let leitura;
      try {
        leitura = await LeitorPedagio.lerPDF(file);
      } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'Ler e gravar'; }
        throw new Error(e.message || 'Não consegui ler este PDF.');
      }

      if (!leitura.passagens.length) {
        if (btn) { btn.disabled = false; btn.textContent = 'Ler e gravar'; }
        throw new Error('Nenhuma passagem encontrada neste PDF. ' +
          'Confira se é o relatório do cartão de pedágio (CGMP).');
      }

      // Se a soma não fecha com o total impresso, eu PARO e mostro.
      // Gravar um extrato mal lido contamina a conferência inteira depois.
      if (leitura.confere === false) {
        if (btn) { btn.disabled = false; btn.textContent = 'Ler e gravar'; }
        throw new Error(`Li ${leitura.quantidade} passagens somando ${brl(leitura.soma)}, ` +
          `mas o total impresso no PDF é ${brl(leitura.totalNoPdf)}. ` +
          `Não vou gravar um extrato que não fecha.`);
      }

      // grava as passagens
      const veics = await sb.from('veiculos').select('id,placa').then(r => r.data || []);
      const mapa = {};
      veics.forEach(x => { mapa[String(x.placa).replace(/[^A-Z0-9]/g, '')] = x.id; });

      const linhas = leitura.passagens.map(p => {
        const [dd, mm, aa] = p.data.split('/');
        return {
          data_hora: new Date(+aa, +mm - 1, +dd, +p.hora.split(':')[0], +p.hora.split(':')[1]).toISOString(),
          placa: p.placa,
          veiculo_id: mapa[p.placa] || null,
          tipo: p.tipo,
          praca: p.praca,
          valor: p.valor,
          importado_por: ME.id
        };
      });

      // em lotes de 100 (o extrato do mês pode ter centenas)
      let gravadas = 0;
      for (let i = 0; i < linhas.length; i += 100) {
        const { error } = await sb.from('pedagios').insert(linhas.slice(i, i + 100));
        if (error) throw new Error('Falha ao gravar: ' + error.message);
        gravadas += Math.min(100, linhas.length - i);
      }

      toast(`${gravadas} passagens importadas · ${brl(leitura.soma)}`);
      TELAS.pedagio.render(main);
    }
  });
}

/* ==========================================================================
   GASTO MANUAL (gerência)

   "temos que ter um campo para incluir gastos manualmente também, indicando
    motorista/dia/caminhão/foto (nessa tela apenas gerência mexe, então posso
    incluir gastos sem foto)"

   Então: foto é opcional aqui, e a despesa já nasce aprovada — é a gerência
   lançando, não o motorista pedindo reembolso. Lançar como 'aguardando' faria
   a própria gerência aprovar o que ela mesma digitou.
   ========================================================================== */
TELAS['gasto-manual'] = {
  titulo: 'Lançar gasto',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(3);

    const [dep, mots, veics] = await Promise.all([
      sb.from('despesas').select('*, motoristas(nome), veiculos(placa)')
        .order('data', { ascending: false }).limit(40).then(r => r.data || []),
      sb.from('motoristas').select('id,nome').eq('ativo', true).then(r => r.data || []),
      sb.from('veiculos').select('id,placa').eq('ativo', true).then(r => r.data || [])
    ]);

    const manuais = dep.filter(d => d.criado_por === ME.id && d.status === 'aprovada');

    main.innerHTML = `
      <button class="btn cheio" id="bt-novo-gasto" style="height:50px">+ Novo gasto manual</button>
      <p class="dica centro mt2">Aqui o gasto entra já aprovado. É a gerência lançando, não o motorista pedindo.</p>

      <section class="secao">
        <div class="secao-topo"><h2>Últimos lançamentos</h2></div>
        <div class="linhas">
          ${dep.length ? dep.slice(0, 25).map(d => `
            <div class="cartao" style="padding:11px 13px">
              <div style="display:flex;justify-content:space-between;gap:9px;align-items:flex-start">
                <div style="min-width:0">
                  <div style="font-size:13.5px;font-weight:700">
                    ${esc(d.categoria)}
                    ${d.foto_path ? '' : '<span class="tag info" style="margin-left:4px">sem foto</span>'}
                  </div>
                  <div class="pq txt3">${dataBR(d.data)}${d.veiculos?.placa ? ' · ' + esc(d.veiculos.placa) : ''}${d.motoristas?.nome ? ' · ' + esc(d.motoristas.nome.split(' ')[0]) : ''}</div>
                  ${d.descricao ? `<div class="pq txt2">${esc(d.descricao)}</div>` : ''}
                </div>
                <div class="num" style="font-size:14px;font-weight:700">${brl(d.valor)}</div>
              </div>
            </div>`).join('') : '<div class="vazio">Nenhum gasto lançado.</div>'}
        </div>
      </section>`;

    $('bt-novo-gasto').onclick = () => formGastoManual(main, mots, veics);
  }
};

function formGastoManual(main, mots, veics) {
  modal({
    titulo: 'Novo gasto manual',
    campos: [
      { id: 'gm-data', label: 'Data', tipo: 'date', valor: hojeISO() },
      { id: 'gm-motorista', label: 'Motorista (opcional)', tipo: 'select',
        opcoes: [['', '— nenhum —'], ...mots.map(m => [m.id, m.nome])] },
      { id: 'gm-veiculo', label: 'Caminhão (opcional)', tipo: 'select',
        opcoes: [['', '— nenhum —'], ...veics.map(v => [v.id, v.placa])] },
      { id: 'gm-cat', label: 'Tipo de gasto', tipo: 'select', opcoes: [
        ['DIESEL', 'Diesel'], ['ARLA', 'ARLA'], ['PERNOITE', 'Pernoite'],
        ['DESCARGA', 'Descarga'], ['ALIMENTACAO', 'Alimentação'],
        ['PEDAGIO', 'Pedágio'], ['PNEU', 'Pneu'], ['MANUTENCAO', 'Manutenção'],
        ['PECAS', 'Peças'], ['LAVAGEM', 'Lavagem'], ['SALARIO', 'Salário'],
        ['HORA_EXTRA', 'Hora extra'], ['OUTRO', 'Outro']
      ] },
      { id: 'gm-desc', label: 'Descrição', ph: 'ex.: diesel posto 22, 31 litros' },
      { id: 'gm-valor', label: 'Valor (R$)', modo: 'decimal', ph: '0,00' },
      { id: 'gm-foto', label: 'Comprovante (opcional)', tipo: 'file', aceita: 'image/*,application/pdf',
        dica: 'Aqui a foto não é obrigatória — é a gerência lançando' }
    ],
    textoBotao: 'Lançar gasto',
    aoSalvar: async v => {
      if (!v['gm-data']) throw new Error('Informe a data.');
      const valor = parseNum(v['gm-valor']);
      if (!valor || valor <= 0) throw new Error('Informe o valor.');

      let fotoPath = null;
      const foto = ($('gm-foto')?.files || [])[0];
      if (foto) {
        fotoPath = `comprovantes/${ME.id}/${Date.now()}-${foto.name.replace(/[^\w.-]/g, '')}`;
        const { error: up } = await sb.storage.from('documentos')
          .upload(fotoPath, foto, { contentType: foto.type || 'image/jpeg' });
        if (up) throw new Error('Falha ao enviar o comprovante: ' + up.message);
      }

      const { error } = await sb.from('despesas').insert({
        data: v['gm-data'],
        motorista_id: v['gm-motorista'] || null,
        veiculo_id: v['gm-veiculo'] || null,
        categoria: v['gm-cat'],
        descricao: v['gm-desc'] || null,
        valor,
        status: 'aprovada',       // já aprovada: quem lançou foi a gerência
        aprovada_por: ME.id,
        aprovada_em: new Date().toISOString(),
        foto_path: fotoPath,
        criado_por: ME.id
      });
      if (error) throw error;
      toast('Gasto lançado');
      TELAS['gasto-manual'].render(main);
    }
  });
}
