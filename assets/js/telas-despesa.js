/* ==========================================================================
   TELAS — despesa

   Por que esta tela existe:
   A view vw_excecoes aponta "despesa_pendente → conferente" desde o primeiro dia.
   Só que a tela de destino ('despesas') NUNCA foi escrita — o botão da exceção
   chamava uma rota inexistente e caía no Início. Resultado real, encontrado hoje:
   7 despesas, R$ 2.280,00 parados esperando aprovação que ninguém tinha como dar.

   A regra que eu imponho aqui: aprovar tem que ser UM toque, com o valor e o
   comprovante à vista. Se aprovar exigir abrir outra tela, o dinheiro fica parado.

   Em 23/11 ganhou a camada analítica: período → placa → categoria → origem.
   O cuidado principal é que APROVAR continua sendo um toque; o gráfico é
   apoio, não obstáculo.
   ========================================================================== */

const DESP_LABEL = {
  aguardando: { rot: 'aguardando', cls: 'atencao' },
  aprovada: { rot: 'aprovada', cls: 'ok' },
  reprovada: { rot: 'reprovada', cls: 'critico' },
  reembolsada: { rot: 'pago', cls: 'marca' }
};

TELAS.despesas = {
  titulo: 'Despesas',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(5);

    const [lista, veics, mots] = await Promise.all([
      q('despesas', '*, veiculos(placa), motoristas(nome)'),
      q('veiculos', 'id,placa'),
      q('motoristas', 'id,nome')
    ]);

    const podeDecidir = ['gerencia', 'conferente'].includes(ME?.perfil);
    const st = Analytics.state;
    st.reset();

    const todos = lista || [];
    const pend = todos.filter(d => d.status === 'aguardando')
      .sort((a, b) => new Date(a.data) - new Date(b.data));
    const aPagar = todos.filter(d => d.status === 'aprovada')
      .sort((a, b) => new Date(a.data) - new Date(b.data));
    const decididas = todos.filter(d => !['aguardando', 'aprovada'].includes(d.status))
      .sort((a, b) => new Date(b.data) - new Date(a.data));

    const somaPend = pend.reduce((s, d) => s + Number(d.valor || 0), 0);
    const somaAPagar = aPagar.reduce((s, d) => s + Number(d.valor || 0), 0);

    const linhaD = (d, mostraAcoes) => {
      const s = DESP_LABEL[d.status] || DESP_LABEL.aguardando;
      const placa = d.veiculos?.placa || '—';
      const motor = d.motoristas?.nome || null;
      return `<div class="cartao" data-desp="${esc(d.id)}" style="padding:13px 14px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
          <div style="min-width:0">
            <div style="font-size:14.5px;font-weight:750;letter-spacing:-.01em">
              ${esc(d.categoria || 'Despesa')}
              <span class="tag ${s.cls}" style="margin-left:6px">${s.rot}</span>
            </div>
            <div class="pq txt3" style="margin-top:3px">
              ${esc(placa)}${motor ? ' · ' + esc(motor.split(' ')[0]) : ''} · ${dataBR(d.data)}
            </div>
            ${d.descricao ? `<div class="pq txt2" style="margin-top:4px">${esc(d.descricao)}</div>` : ''}
            ${d.motivo_reprovacao ? `<div class="pq" style="margin-top:4px;color:var(--critico)">Motivo: ${esc(d.motivo_reprovacao)}</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div class="num" style="font-size:17px;font-weight:700;letter-spacing:-.02em">${brl(d.valor)}</div>
          </div>
        </div>
        ${mostraAcoes && podeDecidir ? `
        <div style="display:flex;gap:8px;margin-top:11px">
          <button class="btn mini" data-ok="${esc(d.id)}" style="flex:1">Aprovar</button>
          <button class="btn mini fantasma" data-rec="${esc(d.id)}" style="flex:1">Reprovar</button>
          ${d.foto_path ? `<button class="btn mini sec" data-foto="${esc(d.id)}">Foto</button>` : ''}
        </div>` : `
        ${d.foto_path ? `<div style="margin-top:9px"><button class="btn mini fantasma" data-foto="${esc(d.id)}">Ver comprovante</button></div>` : ''}`}
      </div>`;
    };

    main.innerHTML = `
      <div class="destaque">
        <div class="rot">Aguardando aprovação</div>
        <div class="big" id="kpi-pend">${brl(somaPend)}</div>
        <div class="divisao">
          <div><div class="k">Lançamentos</div><div class="x" id="kpi-qtd">${pend.length}</div></div>
          <div><div class="k">Mais antiga</div><div class="x">${pend.length ? dataBR(pend[0].data).slice(0, 5) : '—'}</div></div>
          <div><div class="k">A pagar</div><div class="x" id="kpi-pagar">${brl(somaAPagar)}</div></div>
        </div>
      </div>

      <div class="secao-topo mt4"><h2>Análise</h2></div>
      <div class="seg" id="seg-periodo"></div>
      <div id="chips-desp"></div>
      <div id="bc-desp"></div>
      <div class="grafico" id="gr-desp"></div>
      <div class="dica centro" id="gr-desp-nota"></div>

      ${pend.length ? `
      <section class="secao">
        <div class="secao-topo">
          <h2>Esperando você · ${pend.length}</h2>
          ${podeDecidir && pend.length > 1 ? '<button class="mais" id="bt-todas">aprovar todas</button>' : ''}
        </div>
        <div class="linhas">${pend.map(d => linhaD(d, true)).join('')}</div>
      </section>` : `
      <section class="secao">
        <div class="linhas"><div class="vazio"><div class="ic">✓</div>Nada aguardando aprovação.</div></div>
      </section>`}

      ${aPagar.length ? `
      <section class="secao">
        <div class="secao-topo">
          <h2>Aprovadas a pagar · ${aPagar.length}</h2>
          ${podeDecidir ? '<button class="mais" id="bt-pagar">marcar pagas</button>' : ''}
        </div>
        <div class="cartao" style="border-color:rgba(30,90,168,.35);margin-bottom:var(--s2)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span class="pq txt2">Total a reembolsar</span>
            <span class="num" style="font-size:17px;font-weight:750">${brl(somaAPagar)}</span>
          </div>
        </div>
        <div class="linhas">${aPagar.map(d => linhaD(d, false)).join('')}</div>
      </section>` : ''}

      <section class="secao">
        <div class="secao-topo"><h2>Já decididas · ${decididas.length}</h2></div>
        <div class="linhas">
          ${decididas.length ? decididas.slice(0, 30).map(d => linhaD(d, false)).join('')
            : '<div class="vazio" style="padding:26px 16px">Nenhuma despesa decidida ainda.</div>'}
        </div>
      </section>

      <p class="dica mt4" style="text-align:center">
        Despesa reprovada não entra no custo da frota. Aguardando entra — é dinheiro que já saiu.
      </p>`;

    /* ------------------------------------------------- camada analítica --- */
    const fatos = Analytics.fatosDeDespesas(todos, veics, mots);

    function desenhar() {
      const base = Analytics.filtrarFatos(fatos, st);

      // KPIs do topo acompanham o filtro cruzado
      const p = base.filter(f => f.status === 'aguardando');
      const ap = base.filter(f => f.status === 'aprovada');
      $('kpi-pend').textContent = brl(p.reduce((s, f) => s + f.valor, 0));
      $('kpi-qtd').textContent = p.length;
      $('kpi-pagar').textContent = brl(ap.reduce((s, f) => s + f.valor, 0));

      // breadcrumb
      const bc = $('bc-desp');
      const niveis = [{ nivel: 'macro', rot: 'Visão geral' }];
      if (st.nivel !== 'macro') niveis.push({ nivel: 'dimensao', rot: st.dimensao === 'placa' ? 'Caminhão' : 'Categoria' });
      if (st.nivel === 'origem') niveis.push({ nivel: 'origem', rot: 'Origem' });
      bc.innerHTML = st.nivel === 'macro' ? '' :
        `<div class="breadcrumb">${niveis.map((n, i) =>
          `<button data-bc="${n.nivel}" class="${i === niveis.length - 1 ? 'atual' : ''}">${esc(n.rot)}</button>`
          + (i < niveis.length - 1 ? '<span class="sep">›</span>' : '')).join('')}</div>`;
      bc.querySelectorAll('[data-bc]').forEach(b => {
        b.onclick = () => {
          if (b.classList.contains('atual')) return;
          st.nivel = 'macro'; st.dimensao = 'placa';
          desenhar();
        };
      });

      Analytics.renderChips('chips-desp', st, desenhar);

      if (!base.length) {
        $('gr-desp').innerHTML = '';
        const g = document.getElementById('gr-desp');
        if (g) g.style.display = 'none';
        $('gr-desp-nota').innerHTML = Analytics.vazioAnalitico();
        return;
      }
      document.getElementById('gr-desp').style.display = '';
      $('gr-desp-nota').innerHTML = '';

      if (!Analytics.temEcharts()) {
        $('gr-desp-nota').textContent = 'Gráfico indisponível (a biblioteca não carregou). Os números acima continuam corretos.';
        return;
      }

      if (st.nivel === 'macro') {
        const serie = Analytics.agruparPorPeriodo(base, st.periodo);
        Analytics.graficoPeriodo('gr-desp', serie, {
          periodo: st.periodo,
          cor: Analytics.cores.custo,
          onDrill: () => {
            // nível 2: passa a mostrar a dimensão; o filtro de período já está na série
            st.nivel = 'dimensao'; st.dimensao = 'placa';
            desenhar();
          }
        });
        $('gr-desp-nota').textContent = 'Toque numa barra para ver por caminhão.';
      } else if (st.nivel === 'dimensao' && st.dimensao === 'placa') {
        const grupos = Analytics.agruparPor(base, 'placa');
        Analytics.graficoDimensao('gr-desp', grupos, {
          onDrill: g => {
            // clicar numa placa filtra tudo e desce para categoria
            st.placa = g.chave;
            st.dimensao = 'categoria';
            desenhar();
          }
        });
        $('gr-desp-nota').textContent = 'Toque num caminhão para filtrar e ver as categorias.';
      } else {
        const grupos = Analytics.agruparPor(base, 'categoria');
        Analytics.graficoDimensao('gr-desp', grupos.map(g => ({
          ...g, chave: Analytics.ROTULO_CATEGORIA[g.chave] || g.chave
        })), {
          onDrill: g => {
            // nível 3: os registros que somam
            const alvo = base.filter(f =>
              (Analytics.ROTULO_CATEGORIA[f.categoria] || f.categoria) === g.chave);
            Analytics.abrirOrigem({
              titulo: g.chave,
              subtitulo: st.placa ? 'Caminhão ' + st.placa : 'Todos os caminhões',
              fatos: alvo,
              totalEsperado: g.valor
            });
          }
        });
        $('gr-desp-nota').textContent = 'Toque numa categoria para auditar os registros.';
      }
    }

    Analytics.seletorPeriodo('seg-periodo', st, desenhar);
    desenhar();

    /* --------------------------------------------------------- ações ---- */
    const achar = id => todos.find(d => d.id === id);

    main.querySelectorAll('[data-ok]').forEach(b => {
      b.onclick = async e => {
        e.stopPropagation();
        b.disabled = true; b.textContent = '…';
        const { error } = await sb.from('despesas').update({
          status: 'aprovada', aprovada_por: ME.id,
          aprovada_em: new Date().toISOString()
        }).eq('id', b.dataset.ok);
        if (error) { b.disabled = false; b.textContent = 'Aprovar'; toast(error.message); return; }
        toast('Despesa aprovada');
        TELAS.despesas.render(main);
      };
    });

    main.querySelectorAll('[data-rec]').forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        const d = achar(b.dataset.rec);
        modal({
          titulo: 'Reprovar despesa',
          campos: [{
            id: 'rp-motivo', label: 'Motivo (o motorista precisa saber)', tipo: 'textarea',
            ph: 'ex.: comprovante ilegível, valor diferente da nota'
          }],
          textoBotao: 'Reprovar',
          aoSalvar: async v => {
            const motivo = (v['rp-motivo'] || '').trim();
            if (!motivo) throw new Error('Escreva o motivo — sem isso o motorista não entende.');
            const { error } = await sb.from('despesas').update({
              status: 'reprovada', motivo_reprovacao: motivo,
              aprovada_por: ME.id, aprovada_em: new Date().toISOString()
            }).eq('id', d.id);
            if (error) throw error;
            toast('Despesa reprovada');
            TELAS.despesas.render(main);
          }
        });
      };
    });

    main.querySelectorAll('[data-foto]').forEach(b => {
      b.onclick = async e => {
        e.stopPropagation();
        await verComprovante(achar(b.dataset.foto));
      };
    });

    const bt = $('bt-todas');
    if (bt) bt.onclick = () => modal({
      titulo: `Aprovar ${pend.length} despesas`,
      campos: [{
        id: 'ap-conf', label: `São ${brl(somaPend)} no total. Digite APROVAR para confirmar.`,
        ph: 'APROVAR'
      }],
      textoBotao: 'Aprovar todas',
      aoSalvar: async v => {
        if ((v['ap-conf'] || '').trim().toUpperCase() !== 'APROVAR') throw new Error('Digite APROVAR para confirmar.');
        const { error } = await sb.from('despesas').update({
          status: 'aprovada', aprovada_por: ME.id, aprovada_em: new Date().toISOString()
        }).in('id', pend.map(d => d.id));
        if (error) throw error;
        toast(`${pend.length} despesas aprovadas`);
        TELAS.despesas.render(main);
      }
    });

    const bp = $('bt-pagar');
    if (bp) bp.onclick = () => modal({
      titulo: `Marcar ${aPagar.length} como pagas`,
      campos: [{
        id: 'pg-conf',
        label: `São ${brl(somaAPagar)}. Digite PAGO para confirmar — isso encerra a cobrança do motorista.`,
        ph: 'PAGO'
      }],
      textoBotao: 'Marcar pagas',
      aoSalvar: async v => {
        if ((v['pg-conf'] || '').trim().toUpperCase() !== 'PAGO') {
          throw new Error('Digite PAGO para confirmar.');
        }
        const { error } = await sb.from('despesas').update({
          status: 'reembolsada', reembolsada_em: new Date().toISOString()
        }).in('id', aPagar.map(d => d.id));
        if (error) throw error;
        toast(`${aPagar.length} despesas marcadas como pagas`);
        TELAS.despesas.render(main);
      }
    });
  }
};

/** abre o comprovante — URL assinada do bucket, se o arquivo existir */
async function verComprovante(d) {
  const caminhos = ['comprovantes', 'despesas', 'fotos'];
  for (const bucket of caminhos) {
    const { data, error } = await sb.storage.from(bucket)
      .createSignedUrl(d.foto_path, 300);
    if (!error && data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
      return;
    }
  }
  // o arquivo está no Storage do projeto ANTIGO, que não foi copiado ainda.
  // Dizer isso é melhor que abrir uma tela em branco e o Francisco achar que quebrou.
  modal({
    titulo: 'Comprovante não disponível',
    campos: [{
      id: 'cp-none', label: 'O arquivo não foi copiado do banco antigo',
      valor: d.foto_path, dica: `O lançamento de ${brl(d.valor)} está correto — só a foto ficou
        para trás. O arquivo está no Storage do projeto antigo, neste caminho.
        Quando eu copiar os buckets, esta foto aparece aqui.`
    }],
    textoBotao: 'Entendi',
    aoSalvar: async () => {}
  });
}
