/* ==========================================================================
   CONFERÊNCIA (conferente e gerência)

   O trabalho do conferente: olhar cada jornada que o motorista fechou, ver os
   gastos com comprovante, e bater o que foi declarado pelo pagador contra o
   que o motorista registrou.

   O destino é o que fecha essa conta: o pagador diz "RIBEIRÃO PRETO", o
   motorista registrou a cidade ao carregar. Se divergir, alguém precisa olhar.
   ========================================================================== */

TELAS.conferencia = {
  titulo: 'Conferência',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(4);

    const [resumo, lista] = await Promise.all([
      sb.from('vw_conferencia_resumo').select('*').then(r => r.data || []),
      sb.from('vw_conferencia_jornada_recebimento').select('*')
        .order('data', { ascending: false }).limit(300)
        .then(r => r.data || [])
    ]);

    const pendentes = lista.filter(x => x.situacao !== 'confere');
    const totalPend = pendentes.reduce((s, x) => s + Number(x.total || 0), 0);

    const COR = {
      confere:              { cls: 'ok',       rot: 'confere' },
      'destino divergente': { cls: 'critico',  rot: 'destino divergente' },
      'jornada sem destino':{ cls: 'atencao',  rot: 'jornada sem destino' },
      'sem jornada no dia': { cls: 'atencao',  rot: 'sem jornada no dia' }
    };

    main.innerHTML = `
      <div class="destaque">
        <div class="rot">Recebimentos a conferir</div>
        <div class="big">${brl(totalPend)}</div>
        <div class="divisao">
          <div><div class="k">Pendentes</div><div class="x">${pendentes.length}</div></div>
          <div><div class="k">Conferem</div><div class="x">${lista.length - pendentes.length}</div></div>
          <div><div class="k">Total</div><div class="x">${lista.length}</div></div>
        </div>
      </div>

      ${resumo.length ? `
      <section class="secao">
        <div class="secao-topo"><h2>Por situação</h2></div>
        <div class="linhas">
          ${resumo.map(r => {
            const c = COR[r.situacao] || { cls: '', rot: r.situacao };
            return `<div class="linha" style="pointer-events:none">
              <div class="corpo">
                <div class="titulo"><span class="tag ${c.cls}">${esc(c.rot)}</span></div>
                <div class="sub">${r.qtd} recebimento${r.qtd > 1 ? 's' : ''}</div>
              </div>
              <div class="dir"><div class="valor">${brl(r.valor)}</div></div>
            </div>`;
          }).join('')}
        </div>
      </section>` : ''}

      <section class="secao">
        <div class="secao-topo"><h2>${pendentes.length ? 'Precisa de atenção' : 'Tudo conferido'}</h2></div>
        <div class="linhas">
          ${pendentes.length ? pendentes.map(x => {
            const c = COR[x.situacao] || { cls: '', rot: x.situacao };
            return `<div class="cartao" style="padding:13px 14px">
              <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
                <div style="min-width:0">
                  <div style="font-size:14px;font-weight:750">
                    ${esc(x.municipio_declarado || '—')}
                    <span class="tag ${c.cls}" style="margin-left:5px">${c.rot}</span>
                  </div>
                  <div class="pq txt3" style="margin-top:2px">
                    ${dataBR(x.data)}${x.placa ? ' · ' + esc(x.placa) : ''}${x.motorista ? ' · ' + esc(x.motorista.split(' ')[0]) : ''}
                  </div>
                  ${x.destino_da_jornada
                    ? `<div class="pq txt2" style="margin-top:3px">Motorista registrou: <b>${esc(x.destino_da_jornada)}</b></div>`
                    : '<div class="pq txt3" style="margin-top:3px">O motorista não registrou destino nesta jornada.</div>'}
                </div>
                <div class="num" style="font-size:15px;font-weight:750;flex-shrink:0">${brl(x.total)}</div>
              </div>
            </div>`;
          }).join('') : `
            <div class="vazio"><div class="ic">${icon('check-circle')}</div>
              Nenhuma divergência entre jornada e recebimento.</div>`}
        </div>
      </section>

      <p class="dica mt4" style="text-align:center">
        A comparação usa a cidade que o motorista registrou na jornada contra o município que o pagador informou.
      </p>`;

    desenhaIcones();
  }
};
