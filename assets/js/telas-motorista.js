/* ==========================================================================
   TELAS — motorista

   O que o Francisco pediu (23/11): "quero que os motoristas tenham acesso a
   esses doc quando iniciarem a viagem, ideia que funciona no app da OVOS".

   Então o CRLV do caminhão aparece no lugar onde ele é necessário: na tela
   "Meu dia", no cartão do caminhão, ANTES de sair — e não escondido num menu
   de documentos que ninguém abre no pátio, com caminhão ligado.

   Regra de escopo: o motorista vê o caminhão, o documento e a jornada dele.
   Não vê custo, valor de despesa de outro, nem resultado da empresa.
   ========================================================================== */

/** caminhão que o motorista está usando agora, ou o do último dia */
async function meuCaminhao() {
  const { data: abertas } = await sb.from('jornadas')
    .select('veiculo_id, veiculos(id,placa,marca,modelo,km_atual)')
    .eq('status', 'aberta').limit(1);
  if (abertas?.length) return abertas[0].veiculos;

  const { data: ultimas } = await sb.from('jornadas')
    .select('veiculo_id, inicio, veiculos(id,placa,marca,modelo,km_atual)')
    .order('inicio', { ascending: false }).limit(1);
  return ultimas?.[0]?.veiculos || null;
}

/** documento mais recente de um caminhão */
async function docDoVeiculo(veiculoId, tipo = 'CRLV-e') {
  const { data } = await sb.from('veiculos_documentos')
    .select('id,tipo,arquivo_path,vencimento')
    .eq('veiculo_id', veiculoId).eq('tipo', tipo)
    .order('vencimento', { ascending: false }).limit(1);
  return data?.[0] || null;
}

/** abre o PDF do documento numa aba. O bucket é privado: assina por 5 min. */
async function abrirDocumento(doc) {
  if (!doc?.arquivo_path) { toast('Nenhum arquivo anexado', true); return; }
  const { data, error } = await sb.storage.from('documentos')
    .createSignedUrl(doc.arquivo_path, 300);
  if (error || !data?.signedUrl) {
    toast('Não consegui abrir o documento', true);
    console.error(error);
    return;
  }
  window.open(data.signedUrl, '_blank');
}

/* --------------------------------------------------------------- MEU DIA */
TELAS['meu-dia'] = {
  titulo: 'Meu dia',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(4);

    const [caminhao, jornadas] = await Promise.all([
      meuCaminhao(),
      sb.from('jornadas').select('*, veiculos(placa)')
        .order('inicio', { ascending: false }).limit(8)
        .then(r => r.data || [])
    ]);

    const aberta = jornadas.find(j => j.status === 'aberta');
    const crlv = caminhao ? await docDoVeiculo(caminhao.id) : null;

    // CNH: o alerta de 30 dias precisa aparecer onde o motorista entra,
    // não só se ele abrir a aba da CNH por conta própria.
    // o motorista só tem UM registro de CNH visível (a RLS filtra pelo dele);
    // pego pelo vencimento mais PRÓXIMO e não pelo mais distante, senão uma
    // CNH antiga já substituída poderia esconder a atual.
    const { data: docsCnh } = await sb.from('motoristas_documentos')
      .select('vencimento,numero').eq('tipo', 'CNH');
    const minhaCnh = (docsCnh || [])
      .filter(d => d.vencimento)
      .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))[0] || null;
    let diasCnh = null;
    if (minhaCnh?.vencimento) {
      diasCnh = Math.ceil((new Date(minhaCnh.vencimento + 'T12:00:00') - new Date()) / 86400000);
    }
    const avisoCnh = diasCnh != null && diasCnh <= 30;

    // quantos dias faltam para o CRLV vencer
    let diasCrlv = null;
    if (crlv?.vencimento) {
      diasCrlv = Math.ceil((new Date(crlv.vencimento + 'T12:00:00') - new Date()) / 86400000);
    }
    const crlvAlerta = diasCrlv != null && diasCrlv <= 45;
    const crlvVencido = diasCrlv != null && diasCrlv < 0;

    main.innerHTML = `
      ${avisoCnh ? `
      <button class="cartao" id="bt-cnh-alerta"
        style="width:100%;text-align:left;border-color:rgba(226,85,85,.5);background:var(--critico-bg);cursor:pointer">
        <div style="display:flex;align-items:center;gap:10px">
          <i class="farol critico"></i>
          <div style="flex:1;min-width:0">
            <div class="pq" style="color:var(--critico);font-weight:750">
              ${diasCnh < 0 ? 'Sua CNH está vencida' : 'Sua CNH vence em ' + diasCnh + ' dia' + (diasCnh === 1 ? '' : 's')}
            </div>
            <div class="pq txt3">Toque para enviar a nova</div>
          </div>
          <span class="seta">›</span>
        </div>
      </button>` : ''}

      ${caminhao ? `
      <div class="destaque">
        <div class="rot">Seu caminhão</div>
        <div class="big" style="font-size:34px;letter-spacing:.01em">${esc(caminhao.placa)}</div>
        <div class="pq" style="color:var(--ink-3);margin-top:2px">
          ${esc([caminhao.marca, caminhao.modelo].filter(Boolean).join(' ') || '—')}
          ${caminhao.km_atual != null ? ' · ' + num(caminhao.km_atual) + ' km' : ''}
        </div>

        <button class="btn cheio mt4" id="bt-crlv" style="height:52px;font-size:15px"
          ${crlv ? '' : 'disabled'}>
          ${crlv ? '📄  Abrir CRLV do caminhão' : 'CRLV não anexado'}
        </button>

        ${crlv && crlv.vencimento ? `
        <div style="display:flex;align-items:center;gap:7px;margin-top:10px;justify-content:center">
          <i class="farol ${crlvVencido ? 'critico' : crlvAlerta ? 'atencao' : 'ok'}"></i>
          <span class="pq" style="color:${crlvVencido ? 'var(--critico)' : crlvAlerta ? 'var(--atencao)' : 'var(--ink-3)'}">
            ${crlvVencido ? 'CRLV vencido'
              : crlvAlerta ? `CRLV vence em ${diasCrlv} dia${diasCrlv === 1 ? '' : 's'}`
              : `CRLV em dia · vence ${dataBR(crlv.vencimento)}`}
          </span>
        </div>` : ''}
      </div>` : `
      <div class="vazio"><div class="ic">🚚</div>Nenhum caminhão atribuído a você ainda.</div>`}

      <button class="btn cheio" id="bt-jornada" style="height:54px;font-size:16px;margin-bottom:var(--s4)">
        ${aberta ? 'Finalizar jornada' : 'Iniciar jornada'}
      </button>

      <section class="secao">
        <div class="secao-topo"><h2>${aberta ? 'Viagem em andamento' : 'Minhas viagens'}</h2></div>
        ${aberta ? `
        <div class="cartao">
          <div class="pq txt3">Saiu em ${dataHoraBR(aberta.inicio)}</div>
          ${aberta.km_inicial != null ? `<div class="pq" style="margin-top:4px">Odômetro na saída: <b class="num">${num(aberta.km_inicial)}</b></div>` : ''}
        </div>` : `
        <div class="linhas">
          ${jornadas.length ? jornadas.slice(0, 5).map(j => `
            <div class="linha" style="pointer-events:none">
              <div class="corpo">
                <div class="titulo">${dataBR(j.inicio)}</div>
                <div class="sub">${esc(j.veiculos?.placa || '—')}${j.km_final != null ? ' · ' + num(Number(j.km_final) - Number(j.km_inicial)) + ' km' : ''}</div>
              </div>
              <div class="dir"><div class="valor" style="font-size:11px;font-weight:700;color:var(--ink-3)">${esc(j.status)}</div></div>
            </div>`).join('') : '<div class="vazio">Nenhuma viagem registrada.</div>'}
        </div>`}
      </section>`;

    const bc = $('bt-crlv');
    if (bc) bc.onclick = () => abrirDocumento(crlv);
    const bca = $('bt-cnh-alerta');
    if (bca) bca.onclick = () => ir('minha-cnh');
    const bj = $('bt-jornada');
    if (bj) bj.onclick = () => ir('jornada-motorista');
  }
};

/* ------------------------------------------------------------ MEUS GASTOS */
TELAS['meus-gastos'] = {
  titulo: 'Meus gastos',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(4);

    // Regra do Francisco (25/11): gasto só com jornada aberta. O banco trava,
    // mas a tela explica ANTES de ele preencher tudo e perder o trabalho.
    const { data: aberta } = await sb.from('jornadas')
      .select('id,veiculo_id,destino').eq('status','aberta').limit(1);
    if (!aberta || !aberta.length) {
      main.innerHTML = `
        <div class="vazio" style="padding:40px 20px">
          <div class="ic">🔒</div>
          <p style="font-weight:750;margin:10px 0 6px">Gastos bloqueados</p>
          <p class="pq txt2" style="max-width:280px;margin:0 auto 16px;line-height:1.5">
            Você só pode lançar gastos com a jornada aberta.<br>
            Inicie a jornada na aba <b>Jornada</b> e os gastos liberam.
          </p>
          <button class="btn" id="ir-jornada">Iniciar jornada</button>
        </div>`;
      desenhaIcones();
      const b = $('ir-jornada');
      if (b) b.onclick = () => ir('jornada-motorista');
      return;
    }

    const [dep, abast] = await Promise.all([
      sb.from('despesas').select('*').order('data', { ascending: false }).limit(30)
        .then(r => r.data || []),
      sb.from('abastecimentos').select('*').order('data', { ascending: false }).limit(30)
        .then(r => r.data || [])
    ]);

    const pend = dep.filter(d => d.status === 'aguardando');
    const somaPend = pend.reduce((s, d) => s + Number(d.valor || 0), 0);

    const statusTag = s => ({
      aguardando: '<span class="tag atencao">aguardando</span>',
      aprovada: '<span class="tag ok">aprovada</span>',
      reprovada: '<span class="tag critico">reprovada</span>'
    }[s] || '');

    main.innerHTML = `
      ${pend.length ? `
      <div class="destaque">
        <div class="rot">Aguardando aprovação</div>
        <div class="big">${brl(somaPend)}</div>
        <div class="divisao"><div><div class="k">Lançamentos</div><div class="x">${pend.length}</div></div></div>
      </div>` : ''}

      <section class="secao">
        <div class="secao-topo"><h2>Minhas despesas</h2></div>
        <div class="linhas">
          ${dep.length ? dep.slice(0, 15).map(d => `
            <div class="cartao" style="padding:12px 14px">
              <div style="display:flex;justify-content:space-between;gap:10px">
                <div style="min-width:0">
                  <div style="font-size:14px;font-weight:700">${esc(d.categoria || 'Despesa')} ${statusTag(d.status)}</div>
                  <div class="pq txt3">${dataBR(d.data)}${d.descricao ? ' · ' + esc(d.descricao) : ''}</div>
                  ${d.status === 'reprovada' && d.motivo_reprovacao
                    ? `<div class="pq" style="color:var(--critico);margin-top:3px">${esc(d.motivo_reprovacao)}</div>` : ''}
                </div>
                <div class="num" style="font-size:15px;font-weight:700">${brl(d.valor)}</div>
              </div>
            </div>`).join('') : '<div class="vazio">Você ainda não lançou despesa.</div>'}
        </div>
      </section>

      <section class="secao">
        <div class="secao-topo"><h2>Meus abastecimentos</h2></div>
        <div class="linhas">
          ${abast.length ? abast.slice(0, 12).map(a => `
            <div class="cartao" style="padding:12px 14px">
              <div style="display:flex;justify-content:space-between;gap:10px">
                <div style="min-width:0">
                  <div style="font-size:14px;font-weight:700">${esc(a.combustivel || '—')} · ${num(a.litros, 2)} L</div>
                  <div class="pq txt3">${dataBR(a.data)}${a.posto ? ' · ' + esc(a.posto) : ''}${a.km ? ' · ' + num(a.km) + ' km' : ''}</div>
                </div>
                <div class="num" style="font-size:15px;font-weight:700">${brl(a.valor_total)}</div>
              </div>
            </div>`).join('') : '<div class="vazio">Nenhum abastecimento registrado.</div>'}
        </div>
      </section>

      <p class="dica mt4" style="text-align:center">
        Gastos reprovados mostram o motivo — corrija e lance de novo.
      </p>`;
  }
};

/* ------------------------------------------------------------------ AVISOS */
TELAS.avisos = {
  titulo: 'Avisos',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(3);
    const lista = await sb.from('avisos')
      .select('*, veiculos(placa)').order('criado_em', { ascending: false }).limit(30)
      .then(r => r.data || []);

    main.innerHTML = `
      <div class="linhas">
        ${lista.length ? lista.map(a => `
          <div class="cartao" style="padding:13px 14px">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
              <div style="min-width:0">
                <div style="font-size:14px;font-weight:750">${esc(a.categoria || 'Aviso')}</div>
                <div class="pq txt2" style="margin-top:3px">${esc(a.texto || '')}</div>
                <div class="pq txt3" style="margin-top:4px">${esc(a.veiculos?.placa || '—')} · ${dataBR(a.criado_em)}</div>
              </div>
              <span class="tag ${a.status === 'resolvido' ? 'ok' : 'atencao'}">${esc(a.status || 'recebido')}</span>
            </div>
          </div>`).join('') : '<div class="vazio"><div class="ic">✓</div>Nenhum aviso.</div>'}
      </div>
      <button class="btn cheio mt4" id="bt-aviso">Registrar um problema no caminhão</button>`;

    $('bt-aviso').onclick = async () => {
      const caminhao = await meuCaminhao();
      if (!caminhao) { toast('Nenhum caminhão atribuído', true); return; }
      modal({
        titulo: 'Registrar problema',
        campos: [
          { id: 'av-cat', label: 'O que é', tipo: 'select', opcoes: [
            ['mecanico', 'Motor / mecânica'], ['pneu', 'Pneu'], ['eletrico', 'Elétrica'],
            ['freio', 'Freio'], ['carroceria', 'Carroceria'], ['outro', 'Outro']
          ] },
          { id: 'av-txt', label: 'Descreva o problema', tipo: 'textarea', ph: 'ex.: pneu traseiro direito baixando' }
        ],
        textoBotao: 'Enviar aviso',
        aoSalvar: async v => {
          if (!(v['av-txt'] || '').trim()) throw new Error('Descreva o problema.');
          const { error } = await sb.from('avisos').insert({
            veiculo_id: caminhao.id, categoria: v['av-cat'],
            texto: v['av-txt'].trim(), status: 'recebido'
          });
          if (error) throw error;
          toast('Aviso enviado para a oficina');
          TELAS.avisos.render(main);
        }
      });
    };
  }
};

/* ---------------------------------------------------------------- OFICINA */
TELAS.oficina = {
  titulo: 'Oficina',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(4);

    const [avs, oss, veics] = await Promise.all([
      sb.from('avisos').select('*, veiculos(placa)').order('criado_em', { ascending: false })
        .then(r => r.data || []),
      sb.from('ordens_servico').select('*, veiculos(placa)').order('aberta_em', { ascending: false })
        .then(r => r.data || []),
      sb.from('veiculos').select('id,placa,km_atual,intervalo_oleo_km,ultima_troca_oleo_km')
        .then(r => r.data || [])
    ]);

    const abertos = avs.filter(a => a.status === 'recebido' || a.status === 'em_analise');
    const osAbertas = oss.filter(o => o.status !== 'concluida');

    // óleo: o alerta que estava inerte por falta de dado
    const oleoPend = veics.map(v => {
      if (v.km_atual == null || v.intervalo_oleo_km == null || v.ultima_troca_oleo_km == null) return null;
      const falta = Number(v.km_atual) - (Number(v.ultima_troca_oleo_km) + Number(v.intervalo_oleo_km));
      return falta >= -1000 ? { ...v, falta } : null;
    }).filter(Boolean);

    main.innerHTML = `
      ${oleoPend.length ? `
      <section class="secao">
        <div class="secao-topo"><h2>Troca de óleo</h2></div>
        <div class="linhas">
          ${oleoPend.map(v => `
            <div class="cartao" style="padding:12px 14px">
              <div style="display:flex;justify-content:space-between;gap:10px">
                <div>
                  <div style="font-size:14px;font-weight:750">${esc(v.placa)}</div>
                  <div class="pq txt3">ódio: ${num(v.km_atual)} km</div>
                </div>
                <span class="tag ${v.falta >= 0 ? 'critico' : 'atencao'}">
                  ${v.falta >= 0 ? 'passou ' + num(v.falta) + ' km' : 'faltam ' + num(-v.falta) + ' km'}
                </span>
              </div>
            </div>`).join('')}
        </div>
      </section>` : ''}

      <section class="secao">
        <div class="secao-topo"><h2>Avisos do motorista · ${abertos.length}</h2></div>
        <div class="linhas">
          ${abertos.length ? abertos.map(a => `
            <div class="cartao" style="padding:13px 14px">
              <div style="font-size:14px;font-weight:750">${esc(a.categoria || 'Aviso')} · ${esc(a.veiculos?.placa || '—')}</div>
              <div class="pq txt2" style="margin-top:3px">${esc(a.texto || '')}</div>
              <div class="pq txt3" style="margin-top:5px">${dataHoraBR(a.criado_em)}</div>
            </div>`).join('') : '<div class="vazio"><div class="ic">✓</div>Nenhum aviso aberto.</div>'}
        </div>
      </section>

      <section class="secao">
        <div class="secao-topo"><h2>Ordens de serviço · ${osAbertas.length}</h2></div>
        <div class="linhas">
          ${osAbertas.length ? osAbertas.map(o => `
            <div class="cartao" style="padding:13px 14px">
              <div style="font-size:14px;font-weight:750">${esc(o.veiculos?.placa || '—')}</div>
              <div class="pq txt2" style="margin-top:3px">${esc(o.descricao || '')}</div>
            </div>`).join('') : '<div class="vazio">Nenhuma OS aberta.</div>'}
        </div>
      </section>`;
  }
};
