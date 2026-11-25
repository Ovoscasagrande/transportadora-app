/* ==========================================================================
   TELAS — fluxo do motorista: iniciar jornada → lançar gasto → finalizar

   Pedido de 23/11 pelo Francisco:
   "quero que ele crie uma tela para ele iniciar jornada, depois ele inclui
    gastos, e finaliza jornada. pegue a ideia com o CASA, só que o do CASA é
    mais complexo pois exige roteiro; aqui, só vai pegar o km inicial (deixe
    travado, com o KM que ele terminou a última jornada), e incluir gastos
    com foto, gastos como combustível/pernoite/descarga"

   Traduzindo o pedido em regras que eu tenho que fazer valer:
   1. KM inicial TRAVADO — vem do fim da última jornada, não se digita.
      Isso é o que impede o buraco de km: se ele digitar, um dia digita a mais
      e o custo por km do caminhão sai errado para sempre.
   2. Gastos DURANTE a jornada, com foto.
   3. Finalizar pedindo o km final.

   O que eu adicionei por conta, e por quê:
   - A tela gira em torno de UM estado: "tem jornada aberta ou não". Sem isso
     o motorista não sabe o que fazer ao abrir o app.
   - Foto obrigatória no gasto. Sem papel, a conferência reprova e o dinheiro
     dele fica parado. Melhor exigir na hora do que reprovar depois.
   - Confirmação com o total antes de finalizar: é a última chance de lançar
     o que esqueceu.
   - Km final não pode ser menor que o inicial, e um salto grande pede confirmação
     (erro de digitação de um dígito é comum e contamina o custo).
   ========================================================================== */

/* ---------------------------------------------------------------- JORNADA */
TELAS['jornada-motorista'] = {
  titulo: 'Minha jornada',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(4);

    // 1) tenho jornada aberta?
    const { data: abertas } = await sb.from('jornadas')
      .select('*, veiculos(id,placa,marca,modelo,km_atual)')
      .eq('status', 'aberta').limit(1);
    const aberta = abertas?.[0] || null;

    if (aberta) return renderEmAndamento(main, aberta);

    // 2) não tenho: preciso do km final da última e de um caminhão
    const [{ data: ultimas }, { data: veics }, { data: ocupados }, { data: vinculos }] = await Promise.all([
      // km final POR CAMINHÃO: a última jornada fechada de cada veículo.
      // Pegar a última de qualquer um mistura odômetros de caminhões
      // diferentes — bug real: 29.538 (Iveco) travado como saída do Accelo.
      sb.from('jornadas').select('km_final, veiculo_id, fim')
        .not('km_final', 'is', null).neq('status', 'cancelada')
        .order('inicio', { ascending: false }).limit(30),
      sb.from('veiculos').select('id,placa,marca,modelo,km_atual').eq('ativo', true),
      sb.from('jornadas').select('veiculo_id,status').in('status', ['aberta', 'conferencia']),
      // o vínculo: qual caminhão é DELE (a gerência define)
      sb.from('vw_vinculos_ativos').select('veiculo_id,placa,marca,modelo')
        .then(r => r.data || [])
    ]);
    // caminhão com jornada aberta OU em conferência fica bloqueado — é a regra
    // do app antigo: enquanto a conferência não fecha, o km não está apurado.
    const bloqueado = new Set((ocupados || []).map(j => j.veiculo_id));

    // último km FECHADO de cada caminhão (mapa veiculo_id -> km_final)
    const kmPorVeiculo = {};
    (ultimas || []).forEach(j => {
      if (j.km_final == null) return;
      if (!(j.veiculo_id in kmPorVeiculo)) kmPorVeiculo[j.veiculo_id] = Number(j.km_final);
    });
    // vínculo do motorista: o caminhão dele vem PRIMEIRO e marcado
    const vinc = (vinculos || []).find(v => v.veiculo_id) || null;
    const meuVeiculoId = vinc?.veiculo_id || null;

    const caminhoes = (veics || []).map(v => ({
      ...v,
      _bloq: bloqueado.has(v.id),
      _meu: meuVeiculoId === v.id,
      // prioridade: último km fechado DELE; sem jornada, o odômetro cadastrado
      _km: kmPorVeiculo[v.id] != null ? kmPorVeiculo[v.id] : (Number(v.km_atual) || null)
    })).sort((a, b) => (b._meu ? 1 : 0) - (a._meu ? 1 : 0));

    if (!caminhoes.length) {
      main.innerHTML = `<div class="vazio"><div class="ic">🚚</div>Nenhum caminhão ativo para você usar.</div>`;
      return;
    }

    // sugere o caminhão VINCULADO ao motorista; sem vínculo, o mais próximo
    const livres = caminhoes.filter(v => !v._bloq);
    const sugerido = livres.find(v => v._meu) || livres[0] || null;

    main.innerHTML = `
      <div class="destaque">
        <div class="rot">Nenhuma jornada aberta</div>
        <div class="big" style="font-size:22px;line-height:1.25">
          ${sugerido && sugerido._km != null
            ? `O ${esc(sugerido.placa)} saiu da última viagem em <span class="num">${num(sugerido._km)}</span> km`
            : 'Primeira jornada'}
        </div>
        ${sugerido && sugerido._km != null
          ? `<div class="pq txt3" style="margin-top:5px">Este é o km inicial da sua próxima jornada. Não pode ser alterado — é o que mantém o custo do caminhão correto.</div>`
          : `<div class="pq txt3" style="margin-top:5px">Confira o odômetro do caminhão antes de começar.</div>`}
      </div>

      <section class="secao">
        <div class="secao-topo"><h2>Qual caminhão você vai usar</h2></div>
        <div class="linhas">
          ${caminhoes.map(v => `
            <button class="linha ${v.id === sugerido.id && !v._bloq ? 'on' : ''}"
              data-cam="${v.id}" ${v._bloq ? 'disabled style="opacity:.45;pointer-events:none"' : ''}>
              <div class="corpo">
                <div class="titulo">${esc(v.placa)}${v._bloq ? ' 🔒' : ''}</div>
                <div class="sub">${v._bloq ? 'Aguardando conferência da viagem anterior'
                  : esc([v.marca, v.modelo].filter(Boolean).join(' ') || '—')}</div>
              </div>
              <div class="dir"><div class="valor">${v.km_atual != null ? num(v.km_atual) : '—'}<small>km</small></div></div>
            </button>`).join('')}
        </div>
      </section>

      <section class="secao">
        <div class="secao-topo"><h2>Para onde você vai</h2></div>
        <div class="campo" style="margin-bottom:0">
          <label for="jr-destino">Cidade de descarga</label>
          <input id="jr-destino" type="text" placeholder="ex.: RIBEIRÃO PRETO"
                 autocomplete="off" style="text-transform:uppercase">
          <p class="dica">Você descobre ao carregar. Se ainda não souber, pode preencher ao finalizar.</p>
        </div>
      </section>

      <button class="btn cheio" id="bt-iniciar" style="height:54px;font-size:16px;margin-top:var(--s4)">
        Iniciar jornada
      </button>
      <p class="dica centro mt2">Você vai informar o km final quando terminar.</p>`;

    if (!sugerido) {
      main.innerHTML = `<div class="vazio"><div class="ic">🔒</div>Todos os caminhões estão aguardando conferência.
        <div class="pq mt2">Assim que a conferência fechar a viagem anterior, o km libera.</div></div>`;
      return;
    }
    let escolhido = sugerido.id;
    main.querySelectorAll('[data-cam]').forEach(b => {
      b.onclick = () => {
        escolhido = b.dataset.cam;
        main.querySelectorAll('[data-cam]').forEach(x => x.classList.toggle('on', x === b));
      };
    });

    $('bt-iniciar').onclick = async () => {
      const btn = $('bt-iniciar');
      btn.disabled = true; btn.textContent = 'Iniciando…';
      try {
        // km inicial: o fim da última jornada. Se não houver, o odômetro do caminhão.
        const v = caminhoes.find(x => x.id === escolhido);
        const kmIni = (v && v._km != null) ? Number(v._km) : Number(v?.km_atual || 0);
        if (!kmIni) throw new Error('Sem km de referência. A gerência precisa informar o odômetro.');

        const { data: eu } = await sb.from('motoristas').select('id').limit(1);
        const motoristaId = eu?.[0]?.id;
        if (!motoristaId) throw new Error('Seu cadastro de motorista não foi encontrado.');

        // M2 — checklist de 15s ANTES de sair. Marcar problema avisa a Oficina
        // pelo trigger do banco (não é o app que avisa: banco não falha no meio).
        const ck = await Melhorias.abreChecklist({ tipo: 'saida', placa: v && v.placa });
        if (!ck) { btn.disabled = false; btn.textContent = 'Iniciar jornada'; return; }

        const destino = ($('jr-destino')?.value || '').trim().toUpperCase() || null;

        const dadosJornada = {
          veiculo_id: escolhido,
          motorista_id: motoristaId,
          km_inicial: kmIni,
          destino: destino,
          inicio: new Date().toISOString(),
          status: 'aberta'
        };

        // offline: vai para a fila (o motorista está no pátio, sem sinal)
        if (!navigator.onLine && window.OfflineSync) {
          await OfflineSync.enfileira({ tabela: 'jornadas', acao: 'insert', dados: dadosJornada });
          try {
            await Melhorias.salvaChecklist({
              jornadaId: null, veiculoId: escolhido, motoristaId, tipo: 'saida',
              itens: ck.itens, temProblema: ck.temProblema, observacao: ck.observacao
            });
          } catch (e) {}
          toast('Jornada iniciada no aparelho — envia ao voltar o sinal');
          TELAS['jornada-motorista'].render(main);
          return;
        }

        const { error } = await sb.from('jornadas').insert(dadosJornada);
        if (error) throw error;

        try {
          const { data: criada } = await sb.from('jornadas')
            .select('id').eq('status', 'aberta').limit(1);
          await Melhorias.salvaChecklist({
            jornadaId: criada && criada[0] ? criada[0].id : null,
            veiculoId: escolhido, motoristaId, tipo: 'saida',
            itens: ck.itens, temProblema: ck.temProblema, observacao: ck.observacao
          });
        } catch (e) {
          console.error('checklist:', e);
          toast('Jornada iniciada, mas o checklist não foi salvo', true);
        }

        toast('Jornada iniciada. Bom trabalho.');
        TELAS['jornada-motorista'].render(main);
      } catch (e) {
        toast(e.message || 'Não consegui iniciar', true);
        btn.disabled = false; btn.textContent = 'Iniciar jornada';
      }
    };
  }
};

/* -------------------------------------- jornada em andamento: gastos e fim */
async function renderEmAndamento(main, j) {
  const desde = new Date(j.inicio);
  const horas = (Date.now() - desde.getTime()) / 3600000;

  const [{ data: desp }, { data: abast }] = await Promise.all([
    sb.from('despesas').select('*').eq('jornada_id', j.id).order('data'),
    sb.from('abastecimentos').select('*').eq('jornada_id', j.id).order('data')
  ]);

  const lista = [
    ...(abast || []).map(a => ({ ...a, _t: 'comb', rot: a.combustivel || 'Combustível',
      val: Number(a.valor_total || 0), det: `${num(a.litros, 2)} L · ${brl(a.preco_litro)}/L` })),
    ...(desp || []).map(d => ({ ...d, _t: 'desp', rot: d.categoria || 'Despesa',
      val: Number(d.valor || 0), det: d.descricao || '', status: d.status }))
  ].sort((a, b) => new Date(a.data) - new Date(b.data));

  const totalGasto = lista.reduce((s, x) => s + x.val, 0);
  const totalComb = lista.filter(x => x._t === 'comb').reduce((s, x) => s + x.val, 0);

  main.innerHTML = `
    <div class="destaque" style="border-color:rgba(30,90,168,.4)">
      <div class="rot">Em andamento · ${esc(j.veiculos?.placa || '—')}${
        j.destino ? ' → ' + esc(j.destino) : ''
      }</div>
      <div class="big" style="font-size:30px">
        <span class="num">${num(j.km_inicial)}</span>
        <span style="font-size:14px;font-weight:600;color:var(--ink-3)">km na saída</span>
      </div>
      <div class="divisao">
        <div><div class="k">Saiu</div><div class="x">${dataHoraBR(j.inicio).slice(-5)}</div></div>
        <div><div class="k">Rodando há</div><div class="x">${horas.toFixed(1).replace('.', ',')} h</div></div>
        <div><div class="k">Lançamentos</div><div class="x">${lista.length}</div></div>
      </div>
    </div>

    <div style="display:flex;gap:9px;margin-top:var(--s3)">
      <button class="btn" id="bt-comb" style="flex:1;height:48px">⛽ Combustível</button>
      <button class="btn sec" id="bt-desp" style="flex:1;height:48px">+ Gasto</button>
    </div>

    <section class="secao">
      <div class="secao-topo">
        <h2>Gastos desta jornada</h2>
        ${totalGasto > 0 ? `<span class="num" style="font-size:14px;font-weight:700">${brl(totalGasto)}</span>` : ''}
      </div>
      <div class="linhas">
        ${lista.length ? lista.map(x => `
          <div class="cartao" style="padding:12px 14px">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
              <div style="min-width:0">
                <div style="font-size:14px;font-weight:700">
                  ${x._t === 'comb' ? '⛽ ' : ''}${esc(x.rot)}
                  ${x.status === 'reprovada' ? '<span class="tag critico" style="margin-left:5px">reprovada</span>' : ''}
                  ${x.status === 'aprovada' ? '<span class="tag ok" style="margin-left:5px">aprovada</span>' : ''}
                </div>
                <div class="pq txt3">${esc(x.det)}${x.det ? ' · ' : ''}${dataHoraBR(x.data).slice(-5)}</div>
                ${x.status === 'reprovada' && x.motivo_reprovacao
                  ? `<div class="pq" style="color:var(--critico);margin-top:3px">${esc(x.motivo_reprovacao)}</div>` : ''}
              </div>
              <div class="num" style="font-size:15px;font-weight:700">${brl(x.val)}</div>
            </div>
          </div>`).join('')
        : `<div class="vazio" style="padding:24px 16px">
             <div class="ic">🧾</div>Nenhum gasto lançado ainda.
             <div class="pq mt2">Lance cada gasto na hora — com a foto do comprovante.</div>
           </div>`}
      </div>
    </section>

    <button class="btn cheio" id="bt-fim" style="height:52px;font-size:15px;margin-top:var(--s4)">
      Finalizar jornada
    </button>`;

  $('bt-comb').onclick = () => formCombustivel(main, j);
  $('bt-desp').onclick = () => formGasto(main, j);
  $('bt-fim').onclick = () => formFinalizar(main, j);
}

/* ------------------------------------------------------ lançar combustível */
function formCombustivel(main, j) {
  modal({
    titulo: 'Abastecimento',
    campos: [
      { id: 'c-litros', label: 'Litros', modo: 'decimal', ph: '0,00',
        dica: 'Litros que entraram, como está no cupom' },
      { id: 'c-valor', label: 'Valor total (R$)', modo: 'decimal', ph: '0,00' },
      { id: 'c-km', label: 'Odômetro no abastecimento', modo: 'numeric',
        ph: String(Math.round(Number(j.km_inicial))),
        dica: 'O km que aparece no painel agora' },
      { id: 'c-posto', label: 'Posto', ph: 'nome do posto' },
      { id: 'c-comb', label: 'Combustível', tipo: 'select', opcoes: [
        ['S10', 'Diesel S10'], ['S500', 'Diesel S500'], ['ARLA', 'ARLA 32']
      ] },
      { id: 'c-foto', label: 'Foto do cupom', tipo: 'file', aceita: 'image/*',
        dica: 'Obrigatório — é o que a conferência confere' }
    ],
    textoBotao: 'Lançar abastecimento',
    aoSalvar: async v => {
      bloquearDuplicado('comb:' + (v['c-valor'] || ''));
      // tanque do Accelo é 150 L; acima de 500 L só pode ser erro de digitação
      const litros = corrigeDecimal(parseNum(v['c-litros']), 500, 'Litros');
      const valor = corrigeDecimal(parseNum(v['c-valor']), 20000, 'Valor');
      const km = parseNum(v['c-km']);
      if (!litros || litros <= 0) throw new Error('Informe os litros.');
      if (!valor || valor <= 0) throw new Error('Informe o valor total.');
      if (!km) throw new Error('Informe o odômetro.');
      if (km < Number(j.km_inicial)) throw new Error(`O odômetro não pode ser menor que ${num(j.km_inicial)} (km da saída).`);

      const foto = ($('c-foto')?.files || [])[0];
      if (!foto) throw new Error('Anexe a foto do cupom.');
      const path = await enviarComprovante(foto);

      const dadosAbast = {
        jornada_id: j.id, veiculo_id: j.veiculo_id, motorista_id: j.motorista_id,
        posto: v['c-posto'] || null, combustivel: v['c-comb'],
        litros, preco_litro: +(valor / litros).toFixed(3), valor_total: valor,
        km, data: new Date().toISOString(), foto_path: path, parcial: false
      };

      if (!navigator.onLine && window.OfflineSync) {
        await OfflineSync.enfileira({
          tabela: 'abastecimentos', acao: 'insert', dados: dadosAbast,
          foto: foto, fotoNome: foto.name, campoFoto: 'foto_path'
        });
        toast('Abastecimento salvo no aparelho — envia ao voltar o sinal');
        TELAS['jornada-motorista'].render(main);
        return;
      }

      const { error } = await sb.from('abastecimentos').insert(dadosAbast);
      if (error) throw error;

      // mantém o odômetro do caminhão em dia (alimenta o custo e o alerta de óleo)
      if (km > Number(j.km_inicial)) {
        await sb.from('veiculos').update({ km_atual: km }).eq('id', j.veiculo_id);
      }
      toast('Abastecimento lançado');
      TELAS['jornada-motorista'].render(main);
    }
  });
}

/* ------------------------------------------------------------ lançar gasto */
function formGasto(main, j) {
  modal({
    titulo: 'Novo gasto',
    campos: [
      { id: 'g-cat', label: 'Tipo', tipo: 'select', opcoes: [
        ['PERNOITE', 'Pernoite'], ['DESCARGA', 'Descarga'],
        ['ALIMENTACAO', 'Alimentação'], ['PEDAGIO', 'Pedágio'],
        ['LAVAGEM', 'Lavagem'], ['OUTRO', 'Outro']
      ] },
      { id: 'g-valor', label: 'Valor (R$)', modo: 'decimal', ph: '0,00' },
      { id: 'g-desc', label: 'Descrição', ph: 'ex.: descarga 8 pallets',
        dica: 'Ajuda a conferência a aprovar mais rápido' },
      { id: 'g-foto', label: 'Foto do comprovante', tipo: 'file', aceita: 'image/*',
        dica: 'Obrigatório' }
    ],
    textoBotao: 'Lançar gasto',
    aoSalvar: async v => {
      bloquearDuplicado('desp:' + (v['g-valor'] || '') + ':' + (v['g-cat'] || ''));
      const valor = corrigeDecimal(parseNum(v['g-valor']), 50000, 'Valor');
      if (!valor || valor <= 0) throw new Error('Informe o valor.');
      const foto = ($('g-foto')?.files || [])[0];
      if (!foto) throw new Error('Anexe a foto do comprovante.');
      const path = await enviarComprovante(foto);

      const dadosDesp = {
        jornada_id: j.id, veiculo_id: j.veiculo_id, motorista_id: j.motorista_id,
        categoria: v['g-cat'], descricao: v['g-desc'] || null,
        valor, data: new Date().toISOString(), status: 'aguardando',
        foto_path: path
      };

      if (!navigator.onLine && window.OfflineSync) {
        await OfflineSync.enfileira({
          tabela: 'despesas', acao: 'insert', dados: dadosDesp,
          foto: foto, fotoNome: foto.name, campoFoto: 'foto_path'
        });
        toast('Gasto salvo no aparelho — envia ao voltar o sinal');
        TELAS['jornada-motorista'].render(main);
        return;
      }

      const { error } = await sb.from('despesas').insert(dadosDesp);
      if (error) throw error;
      toast('Gasto lançado. Aguardando aprovação.');
      TELAS['jornada-motorista'].render(main);
    }
  });
}

/* Guarda contra duplo toque.
   Caso REAL no app antigo: o Leonardo tocou duas vezes e entraram dois
   lançamentos idênticos em 227 ms. Reprovar e pedir para lançar de novo custa
   mais que travar 8 segundos agora. */
let _ultimoEnvio = { chave: '', quando: 0 };
function bloquearDuplicado(chave) {
  const agora = Date.now();
  if (_ultimoEnvio.chave === chave && agora - _ultimoEnvio.quando < 8000) {
    throw new Error('Este lançamento já foi enviado. Aguarde alguns segundos.');
  }
  _ultimoEnvio = { chave, quando: agora };
}

/* Autocorreção de decimal.
   Caso REAL no app antigo: motorista digitou 77.261 (com ponto de milhar) e
   viraram 77 mil litros num tanque de 150 L. Aqui: se o número estourar o
   limite físico, divido por 10 e AVISO o que corrigi — corrigir calado é pior
   que não corrigir, porque ele não confere. */
function corrigeDecimal(valor, maximo, unidade) {
  let v = Number(valor);
  if (!isFinite(v) || v <= 0) return valor;
  let voltas = 0;
  while (v > maximo && voltas < 3) { v = +(v / 10).toFixed(3); voltas++; }
  if (v > maximo) throw new Error(`${unidade} acima do possível (máx ${maximo}). Confira o valor.`);
  if (voltas > 0) toast(`${unidade} corrigido para ${v} — confira se está certo`);
  return v;
}

/** sobe a foto para comprovantes/<uid>/ e devolve o caminho */
async function enviarComprovante(file) {
  // offline: marcador. A fila sobe o Blob e troca pelo caminho real.
  if (!navigator.onLine) return 'pendente:' + file.name;
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const nome = `comprovantes/${ME.id}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('documentos')
    .upload(nome, file, { contentType: file.type || 'image/jpeg', upsert: false });
  if (error) throw new Error('Falha ao enviar a foto: ' + error.message);
  return nome;
}

/* --------------------------------------------------------- finalizar jornada */
function formFinalizar(main, j) {
  const kmIni = Number(j.km_inicial);
  modal({
    titulo: 'Finalizar jornada',
    campos: [
      { id: 'f-km', label: 'Km final (painel agora)', modo: 'numeric',
        ph: String(Math.round(kmIni)),
        dica: `Saiu com ${num(kmIni)} km` },
      { id: 'f-dest', label: 'Cidade de descarga', valor: j.destino || '',
        ph: 'ex.: RIBEIRÃO PRETO',
        dica: 'Confirma o destino para a conferência do recebimento' },
      { id: 'f-oc', label: 'Ocorrência (opcional)', tipo: 'textarea',
        ph: 'ex.: ficou 3h na fila do embarcador, pneu furado na volta' }
    ],
    textoBotao: 'Finalizar',
    aoSalvar: async v => {
      const kmf = parseNum(v['f-km']);
      if (kmf == null) throw new Error('Informe o km final.');
      if (kmf < kmIni) throw new Error(`O km final não pode ser menor que o da saída (${num(kmIni)}).`);
      if (kmf === kmIni) throw new Error('O km final está igual ao da saída — você não rodou?');

      const rodado = kmf - kmIni;
      // salto grande costuma ser dígito trocado; confirma em vez de aceitar calado
      if (rodado > 1500) {
        const ok = confirm(`Você rodou ${num(rodado)} km nesta jornada. Está certo?\n\n` +
          `Se digitou a mais, corrija agora — esse número entra no custo do caminhão.`);
        if (!ok) throw new Error('Confira o km final.');
      }

      // M2 — checklist de chegada. Se cancelar, finaliza mesmo assim: travar a
      // finalização por causa do checklist deixaria o motorista preso.
      const ckChegada = await Melhorias.abreChecklist({
        tipo: 'chegada', placa: j.veiculos && j.veiculos.placa
      });

      const destinoFinal = (v['f-dest'] || '').trim().toUpperCase() || j.destino || null;

      const { error } = await sb.from('jornadas').update({
        km_final: kmf, fim: new Date().toISOString(),
        destino: destinoFinal,
        ocorrencias: v['f-oc'] || null, status: 'conferencia'
      }).eq('id', j.id);
      if (error) throw error;

      await sb.from('veiculos').update({ km_atual: kmf }).eq('id', j.veiculo_id);

      if (ckChegada) {
        try {
          await Melhorias.salvaChecklist({
            jornadaId: j.id, veiculoId: j.veiculo_id, motoristaId: j.motorista_id,
            tipo: 'chegada', itens: ckChegada.itens,
            temProblema: ckChegada.temProblema, observacao: ckChegada.observacao
          });
        } catch (e) { console.error('checklist chegada:', e); }
      }

      toast(`Jornada finalizada · ${num(rodado)} km`);
      ir('meu-dia');
    }
  });
}
