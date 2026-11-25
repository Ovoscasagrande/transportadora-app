/* ==========================================================================
   TELAS — relatório, CNH e cadastro (pedido de 23/11)

   1. TELAS.relatorio   — aba do motorista: médias, viagens, reembolso
   2. TELAS['minha-cnh']— CNH: abrir, baixar, atualizar; alerta de 30 dias
   3. TELAS.cadastro    — gerência: cadastrar motorista e caminhão

   Por que relatório separado de "Meus gastos":
   "Meus gastos" é lista (o que lancei). Relatório é média (como estou indo).
   São perguntas diferentes e o motorista faz as duas. Misturar as duas numa
   tela só é o que faz o motorista parar de abrir.

   Regra de escopo, sempre: aqui NUNCA aparece custo da frota, resultado da
   empresa ou valor de outro motorista. Só o que é dele.
   ========================================================================== */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
               'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesLabel = iso => {
  if (!iso) return '—';
  const [a, m] = String(iso).split('-');
  return `${MESES[Number(m) - 1]}/${String(a).slice(2)}`;
};

/* --------------------------------------------------------- MEU RELATÓRIO */
TELAS.relatorio = {
  titulo: 'Meu relatório',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(5);

    const { data: linhas, error } = await sb.from('vw_motorista_relatorio')
      .select('*').order('mes', { ascending: false });

    if (error) {
      main.innerHTML = `<div class="vazio">Não consegui carregar seu relatório.</div>`;
      console.error(error);
      return;
    }
    if (!linhas?.length) {
      main.innerHTML = `<div class="vazio"><div class="ic">📊</div>Você ainda não tem viagem registrada.
        <div class="pq mt3">Quando a primeira jornada fechar, suas médias aparecem aqui.</div></div>`;
      return;
    }

    const atual = linhas[0];
    const anteriores = linhas.slice(1);
    const n = x => Number(x || 0);

    // comparação com o mês anterior: mostra tendência, não só número solto
    const ant = anteriores[0];
    const delta = (a, b) => {
      if (!b || !n(b)) return null;
      return ((n(a) - n(b)) / n(b)) * 100;
    };

    const seta = (d, bomSubir = true) => {
      if (d == null || !isFinite(d)) return '';
      const subiu = d > 0.5, caiu = d < -0.5;
      if (!subiu && !caiu) return '<span class="pq txt3">estável</span>';
      const bom = bomSubir ? subiu : caiu;
      return `<span class="pq" style="color:${bom ? 'var(--ok)' : 'var(--atencao)'}">
        ${subiu ? '▲' : '▼'} ${Math.abs(d).toFixed(0)}%</span>`;
    };

    const kmViagem = delta(atual.km_por_viagem, ant?.km_por_viagem);
    const viagens = delta(atual.viagens, ant?.viagens);
    const consumo = delta(atual.km_por_litro, ant?.km_por_litro);
    const kmTotal = delta(atual.km, ant?.km);

    main.innerHTML = `
      <div class="destaque">
        <div class="rot">${mesLabel(atual.mes)} · resumo do mês</div>
        <div class="big">${num(atual.viagens)} <span style="font-size:15px;font-weight:600;color:var(--ink-3)">viagens</span></div>
        <div class="divisao">
          <div><div class="k">Km rodado</div><div class="x">${num(atual.km)}</div></div>
          <div><div class="k">Média/viagem</div><div class="x">${num(atual.km_por_viagem)} km</div></div>
          <div><div class="k">Horas</div><div class="x">${n(atual.horas).toFixed(0)} h</div></div>
        </div>
      </div>

      ${n(atual.a_receber) > 0 || n(atual.reembolso_pago) > 0 ? `
      <div class="cartao" style="border-color:rgba(240,169,59,.45)">
        <div class="pq txt3" style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">Ainda tenho a receber</div>
        <div class="num" style="font-size:24px;font-weight:750;color:var(--atencao);margin-top:2px">${brl(atual.a_receber || 0)}</div>
        <div class="pq txt3" style="margin-top:3px;line-height:1.5">
          ${n(atual.reembolso_pendente) > 0 ? brl(atual.reembolso_pendente) + ' aguardando aprovação' : ''}
          ${n(atual.reembolso_pendente) > 0 && n(atual.reembolso_aprovado) > 0 ? ' · ' : ''}
          ${n(atual.reembolso_aprovado) > 0 ? brl(atual.reembolso_aprovado) + ' aprovado, esperando pagamento' : ''}
        </div>
        ${n(atual.reembolso_pago) > 0
          ? `<div class="pq" style="margin-top:7px;color:var(--ok);font-weight:650">✓ ${brl(atual.reembolso_pago)} já pago a você</div>` : ''}
      </div>` : ''}

      <section class="secao">
        <div class="secao-topo"><h2>Como você está rodando</h2></div>
        <div class="cartao">
          ${[
            ['Km por viagem', num(atual.km_por_viagem) + ' km', kmViagem, true],
            ['Viagens no mês', num(atual.viagens), viagens, true],
            ['Km por litro', n(atual.km_por_litro).toFixed(2).replace('.', ',') + ' km/L', consumo, true],
            ['Km por hora', n(atual.km_por_hora).toFixed(1).replace('.', ',') + ' km/h', null, true],
            ['Horas por viagem', n(atual.horas_por_viagem).toFixed(1).replace('.', ',') + ' h', null, false]
          ].map(([rot, val, d, bom]) => `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--line)">
              <div class="pq txt2">${rot}</div>
              <div style="display:flex;align-items:center;gap:9px">
                ${d != null ? seta(d, bom) : ''}
                <div class="num" style="font-size:15px;font-weight:700">${val}</div>
              </div>
            </div>`).join('')}
          <div style="display:flex;justify-content:space-between;padding:11px 0">
            <div class="pq txt2">Abastecimentos</div>
            <div class="num" style="font-size:15px;font-weight:700">${num(atual.abastecimentos)}</div>
          </div>
        </div>
        ${ant ? `<p class="dica mt2">A comparação é com ${mesLabel(ant.mes)}.</p>` : ''}
      </section>

      <div class="secao-topo mt4"><h2>Meus números no tempo</h2></div>
      <div class="seg" id="seg-metrica-mot" style="margin-bottom:8px"></div>
      <div class="grafico" id="gr-mot"></div>
      <div class="dica centro" id="gr-mot-nota"></div>

      <div class="secao-topo mt4"><h2>Onde foi meu gasto</h2></div>
      <div class="grafico alto" id="gr-mot-gasto"></div>
      <div class="dica centro" id="gr-mot-gasto-nota"></div>

      <section class="secao">
        <div class="secao-topo"><h2>Reembolso</h2></div>
        <div class="cartao">
          <div style="display:flex;justify-content:space-between;padding:9px 0">
            <span class="pq txt2">Aguardando</span>
            <span class="num" style="font-weight:700;color:var(--atencao)">${brl(atual.reembolso_pendente)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:9px 0">
            <span class="pq txt2">Já aprovado</span>
            <span class="num" style="font-weight:700;color:var(--ok)">${brl(atual.reembolso_aprovado)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:9px 0">
            <span class="pq txt2">Pago a você</span>
            <span class="num" style="font-weight:700;color:var(--ok)">${brl(atual.reembolso_pago)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:9px 0">
            <span class="pq txt2">Reprovado</span>
            <span class="num" style="font-weight:700;color:var(--critico)">${brl(atual.reembolso_reprovado)}</span>
          </div>
        </div>
        <p class="dica mt2">Reprovado tem motivo no lançamento — corrija e envie de novo.</p>
      </section>

      ${anteriores.length ? `
      <section class="secao">
        <div class="secao-topo"><h2>Meses anteriores</h2></div>
        <div class="linhas">
          ${anteriores.map(m => `
            <div class="linha" style="pointer-events:none">
              <div class="corpo">
                <div class="titulo">${mesLabel(m.mes)}</div>
                <div class="sub">${num(m.km)} km · ${n(m.km_por_litro).toFixed(2).replace('.', ',')} km/L</div>
              </div>
              <div class="dir"><div class="valor">${num(m.viagens)}<small>viagens</small></div></div>
            </div>`).join('')}
        </div>
      </section>` : ''}`;

    /* ------------------------------------------------- gráficos do motorista
       Só dados DELE: vêm das policies (motorista_id = privado.meu_motorista()).
       Nunca custo da frota, receita da empresa ou valor de outro motorista.
    */
    desenhaGraficosMotorista(main);
  }
};

/** Gráficos pessoais: km/mês, km/L e composição do gasto. */
async function desenhaGraficosMotorista(main) {
  const nota = () => document.getElementById('gr-mot-nota');
  const notaG = () => document.getElementById('gr-mot-gasto-nota');
  if (!nota()) return;

  if (!window.Analytics || !Analytics.temEcharts()) {
    if (nota()) nota().textContent = 'Gráfico indisponível — os números acima continuam corretos.';
    return;
  }

  // 1) série por mês, a partir da view do relatório (que já é só dele)
  const { data: linhas } = await sb.from('vw_motorista_relatorio')
    .select('*').order('mes', { ascending: true });

  const serie = (linhas || []).map(l => ({
    mes: l.mes,
    km: Number(l.km || 0),
    kml: l.km_por_litro != null ? Number(l.km_por_litro) : null,
    viagens: Number(l.viagens || 0)
  }));

  if (!serie.length) {
    const g = document.getElementById('gr-mot');
    if (g) g.innerHTML = Analytics.vazioAnalitico('Sem viagem registrada ainda');
    if (notaG()) notaG().textContent = '';
    return;
  }

  let metrica = 'km';
  const opcoes = [['km', 'KM do mês'], ['kml', 'KM/L'], ['viagens', 'Viagens']];

  const desenha = () => {
    const usa = serie.filter(p => p[metrica] != null);
    if (!usa.length) {
      const g = document.getElementById('gr-mot');
      if (g) g.innerHTML = Analytics.vazioAnalitico('Sem dado para esta métrica');
      return;
    }
    const el = document.getElementById('gr-mot');
    if (el) el.innerHTML = '';
    Analytics.graficoPeriodo('gr-mot', usa.map(p => ({
      chave: p.mes, valor: p[metrica], qtd: p.viagens, placa: {}, motorista: {}
    })), {
      periodo: 'mes',
      metrica: metrica === 'kml' ? 'rkm' : 'valor',
      rotulo: k => Analytics.rotuloPeriodo(k, 'mes')
    });
  };

  const seg = document.getElementById('seg-metrica-mot');
  if (seg) {
    seg.innerHTML = opcoes.map(([k, r]) =>
      `<button data-m="${k}" class="${k === metrica ? 'on' : ''}">${r}</button>`).join('');
    seg.querySelectorAll('[data-m]').forEach(b => {
      b.onclick = () => {
        metrica = b.dataset.m;
        seg.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b));
        desenha();
      };
    });
  }
  desenha();
  if (nota()) nota().textContent = 'Só os seus números. Comparação com o mês anterior aparece no topo.';

  // 2) composição do meu gasto (dos últimos 6 meses)
  const { data: minhasDesp } = await sb.from('despesas')
    .select('categoria,valor,status,data').order('data', { ascending: false }).limit(300);

  const porCat = {};
  (minhasDesp || []).filter(d => d.status !== 'reprovada').forEach(d => {
    const c = String(d.categoria || 'OUTRO').toUpperCase();
    porCat[c] = (porCat[c] || 0) + Number(d.valor || 0);
  });
  const grupos = Object.keys(porCat).map(k => ({ chave: k, valor: porCat[k], qtd: 1 }))
    .sort((a, b) => b.valor - a.valor).slice(0, 6);

  if (grupos.length) {
    const elG = document.getElementById('gr-mot-gasto');
    if (elG) elG.innerHTML = '';
    Analytics.graficoDimensao('gr-mot-gasto', grupos, {
      onDrill: g => {
        const alvo = (minhasDesp || []).filter(d =>
          String(d.categoria || 'OUTRO').toUpperCase() === g.chave && d.status !== 'reprovada');
        Analytics.abrirOrigem({
          titulo: g.chave, subtitulo: 'Meus lançamentos',
          fatos: alvo.map(d => ({
            id: d.categoria, data: Analytics.diaISO(d.data), valor: Number(d.valor),
            placa: null, motorista: null, categoria: g.chave,
            origem: 'Meu lançamento', detalhe: d.status, status: d.status
          })),
          totalEsperado: g.valor
        });
      }
    });
    if (notaG()) notaG().textContent = 'Toque numa categoria para ver os lançamentos.';
  } else {
    const elG = document.getElementById('gr-mot-gasto');
    if (elG) elG.innerHTML = Analytics.vazioAnalitico('Nenhum gasto lançado por você');
    if (notaG()) notaG().textContent = '';
  }
  desenhaIcones();
}

/* ---------------------------------------------------------------- MINHA CNH */
TELAS['minha-cnh'] = {
  titulo: 'Minha CNH',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(3);

    const ehGestor = ['gerencia', 'conferente'].includes(ME?.perfil);

    const { data: docs } = await sb.from('motoristas_documentos')
      .select('*').eq('tipo', 'CNH').order('criado_em', { ascending: false });

    const { data: mot } = await sb.from('motoristas')
      .select('id,nome,cnh,cnh_categoria,cnh_validade')
      .order('nome');

    // para motorista, a RLS já devolve só o dele
    const eu = ehGestor ? null : (mot?.[0] || null);
    const lista = docs || [];
    const atual = lista[0] || null;

    let dias = null;
    if (atual?.vencimento) {
      dias = Math.ceil((new Date(atual.vencimento + 'T12:00:00') - new Date()) / 86400000);
    }
    const vencido = dias != null && dias < 0;
    const alerta = dias != null && dias >= 0 && dias <= 30;
    const atencao = dias != null && dias > 30 && dias <= 90;

    const corAviso = vencido ? 'var(--critico)' : alerta ? 'var(--critico)' : atencao ? 'var(--atencao)' : 'var(--ink-3)';
    const farol = vencido || alerta ? 'critico' : atencao ? 'atencao' : 'ok';

    main.innerHTML = `
      ${atual ? `
      <div class="destaque">
        <div class="rot">Minha CNH${ehGestor && eu ? ' · ' + esc(eu.nome.split(' ')[0]) : ''}</div>
        <div class="big" style="font-size:26px">
          ${esc(atual.categoria || eu?.cnh_categoria || '—')}
          <span style="font-size:14px;font-weight:600;color:var(--ink-3)">· ${esc(atual.numero || eu?.cnh || '—')}</span>
        </div>
        ${atual.vencimento ? `
        <div style="display:flex;align-items:center;gap:7px;margin-top:9px">
          <i class="farol ${farol}"></i>
          <span class="pq" style="color:${corAviso};font-weight:650">
            ${vencido ? 'VENCEU em ' + dataBR(atual.vencimento)
              : alerta ? 'Sua CNH vence em ' + dias + ' dia' + (dias === 1 ? '' : 's') + ' — atualize agora'
              : 'Vence em ' + dataBR(atual.vencimento) + ' (' + dias + ' dias)'}
          </span>
        </div>` : ''}
      </div>

      ${alerta || vencido ? `
      <div class="cartao" style="border-color:${vencido ? 'rgba(226,85,85,.5)' : 'rgba(226,85,85,.35)'};background:var(--critico-bg)">
        <div class="pq" style="color:var(--critico);font-weight:700;line-height:1.5">
          ${vencido ? 'Sua CNH está vencida. Você não pode dirigir até atualizar.'
                    : 'Sua CNH vence em menos de 30 dias. Envie a nova agora — dirigir com CNH vencida é infração gravíssima.'}
        </div>
      </div>` : ''}

      <div style="display:flex;gap:9px;margin-top:var(--s3)">
        <button class="btn" id="bt-abrir" style="flex:1;height:48px">📄 Abrir</button>
        <button class="btn sec" id="bt-baixar" style="flex:1;height:48px">⬇ Baixar</button>
      </div>
      <button class="btn fantasma cheio mt2" id="bt-nova" style="height:44px">
        Enviar CNH atualizada
      </button>` : `
      <div class="vazio">
        <div class="ic">🪪</div>Nenhuma CNH anexada ainda.
        <div class="mt3"><button class="btn" id="bt-nova">Enviar minha CNH</button></div>
      </div>`}

      ${ehGestor && mot?.length ? `
      <section class="secao">
        <div class="secao-topo"><h2>Motoristas</h2></div>
        <div class="linhas">
          ${mot.map(m => {
            const d = lista.find(x => x.motorista_id === m.id);
            const dv = d?.vencimento || m.cnh_validade;
            const dd = dv ? Math.ceil((new Date(dv + 'T12:00:00') - new Date()) / 86400000) : null;
            return `<div class="cartao" style="padding:12px 14px">
              <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
                <div style="min-width:0">
                  <div style="font-size:14px;font-weight:750">${esc(m.nome)}</div>
                  <div class="pq txt3">${esc(m.cnh_categoria || '—')} · ${esc(m.cnh || 'sem número')}</div>
                </div>
                <div style="text-align:right">
                  ${dv ? `<div class="pq" style="font-weight:700;color:${dd < 0 ? 'var(--critico)' : dd <= 30 ? 'var(--critico)' : dd <= 90 ? 'var(--atencao)' : 'var(--ink-3)'}">${dataBR(dv)}</div>
                  <div class="pq txt3">${dd < 0 ? 'vencida' : dd + ' dias'}</div>` : '<div class="pq txt3">sem validade</div>'}
                  ${d ? '' : '<div class="tag atencao" style="margin-top:4px">sem arquivo</div>'}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </section>` : ''}

      <p class="dica mt4" style="text-align:center">
        O arquivo é privado: só você e a gerência conseguem abrir.
      </p>`;

    const bAbrir = $('bt-abrir');
    const bBaixar = $('bt-baixar');
    if (bAbrir) bAbrir.onclick = () => abrirDocumento(atual);
    if (bBaixar) bBaixar.onclick = () => baixarDocumento(atual);
    $('bt-nova').onclick = () => formularioCnh(main, atual);
  }
};

/** download forçado: cria o link com nome de arquivo legível */
async function baixarDocumento(doc) {
  if (!doc?.arquivo_path) { toast('Nenhum arquivo anexado', true); return; }
  const { data, error } = await sb.storage.from('documentos')
    .createSignedUrl(doc.arquivo_path, 300, { download: 'CNH.pdf' });
  if (error || !data?.signedUrl) { toast('Não consegui baixar', true); return; }
  const a = document.createElement('a');
  a.href = data.signedUrl;
  a.download = `CNH-${doc.numero || 'motorista'}.pdf`;
  a.click();
}

/** formulário de atualização da CNH */
function formularioCnh(main, atual) {
  modal({
    titulo: atual ? 'Enviar CNH atualizada' : 'Enviar minha CNH',
    campos: [
      { id: 'c-num', label: 'Nº de registro da CNH', modo: 'numeric',
        valor: atual?.numero || '', ph: 'só números' },
      { id: 'c-cat', label: 'Categoria', valor: atual?.categoria || '', ph: 'AD, D, E...' },
      { id: 'c-venc', label: 'Validade', tipo: 'date', valor: atual?.vencimento || '' },
      { id: 'c-arq', label: 'Arquivo (PDF ou foto)', tipo: 'file',
        dica: 'O arquivo fica privado. No app, envie o PDF do CNH Digital.' }
    ],
    textoBotao: 'Enviar',
    aoSalvar: async v => {
      const num = (v['c-num'] || '').replace(/\D/g, '');
      const cat = (v['c-cat'] || '').trim().toUpperCase();
      const venc = (v['c-venc'] || '').trim();
      if (!num) throw new Error('Informe o número de registro da CNH.');
      if (!venc) throw new Error('Informe a validade — é o que dispara o alerta.');

      const file = ($('c-arq')?.files || [])[0];
      if (!file) throw new Error('Anexe o arquivo da CNH.');

      // pega o motorista_id do próprio usuário
      const { data: eu } = await sb.from('motoristas').select('id').limit(1);
      const motoristaId = eu?.[0]?.id;
      if (!motoristaId) throw new Error('Seu cadastro de motorista não foi encontrado.');

      const nome = `motoristas/${motoristaId}/cnh-${Date.now()}.pdf`;
      const { error: upErr } = await sb.storage.from('documentos')
        .upload(nome, file, { contentType: file.type || 'application/pdf', upsert: false });
      if (upErr) throw new Error('Falha ao enviar o arquivo: ' + upErr.message);

      const { error } = await sb.from('motoristas_documentos').insert({
        motorista_id: motoristaId, tipo: 'CNH', arquivo_path: nome,
        vencimento: venc, categoria: cat || null, numero: num,
        enviado_por: ME.id
      });
      if (error) throw error;

      // mantém o cadastro em sincronia com o documento mais novo
      await sb.from('motoristas')
        .update({ cnh: num, cnh_categoria: cat || null, cnh_validade: venc })
        .eq('id', motoristaId);

      toast('CNH enviada. A gerência vai conferir.');
      TELAS['minha-cnh'].render(main);
    }
  });
}
