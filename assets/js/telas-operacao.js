/* ==========================================================================
   TELAS — operação
   Jornada, carregamento, veículo, motorista, abastecimento, despesa, oficina
   ========================================================================== */

/* ------------------------------------------------------------- JORNADAS */
TELAS.jornadas = {
  titulo: 'Jornadas',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(5);
    const lista = await q('jornadas', '*, veiculos(placa), motoristas(nome)');
    if (!lista.length) {
      main.innerHTML = `<div class="vazio"><div class="ic">🛣️</div>Nenhuma jornada ainda.</div>`;
      return;
    }
    const abertas = lista.filter(j => j.status === 'aberta');
    const emConf = lista.filter(j => j.status === 'conferencia');
    const outras = lista.filter(j => !['aberta','conferencia'].includes(j.status))
      .sort((a, b) => new Date(b.inicio) - new Date(a.inicio));

    const linhaJ = j => {
      const rodado = j.km_final != null ? Number(j.km_final) - Number(j.km_inicial) : null;
      const horas = j.fim ? (new Date(j.fim) - new Date(j.inicio)) / 3600000 : null;
      const tag = { aberta: 'ok', conferencia: 'atencao', fechada: '', cancelada: 'critico' }[j.status];
      return `<button class="linha" data-j="${j.id}">
        <div class="corpo">
          <div class="titulo">${esc(j.veiculos?.placa || '—')}
            <span class="tag ${tag}" style="margin-left:6px">${esc(j.status)}</span></div>
          <div class="sub">${esc(j.motoristas?.nome || '—')} · saiu ${dataHoraBR(j.inicio)}</div>
        </div>
        <div class="dir">
          <div class="valor">${rodado != null ? num(rodado) : '—'}<small>km</small></div>
          ${horas != null ? `<div class="pq txt3" style="margin-top:2px">${horas.toFixed(1).replace('.', ',')} h</div>` : ''}
        </div>
      </button>`;
    };

    main.innerHTML = `
      ${abertas.length ? `<section class="secao">
        <div class="secao-topo"><h2>Em andamento · ${abertas.length}</h2></div>
        <div class="linhas">${abertas.map(linhaJ).join('')}</div>
      </section>` : ''}
      ${emConf.length ? `<section class="secao">
        <div class="secao-topo"><h2>Aguardando sua conferência · ${emConf.length}</h2></div>
        <div class="linhas">${emConf.map(linhaJ).join('')}</div>
        <p class="dica">O motorista finalizou. Abra, confira os gastos e aprove para fechar.</p>
      </section>` : ''}
      <section class="secao">
        <div class="secao-topo"><h2>${abertas.length ? 'Anteriores' : 'Todas'}</h2></div>
        <div class="linhas">${outras.length ? outras.slice(0, 40).map(linhaJ).join('')
          : '<div class="vazio">Nenhuma jornada encerrada.</div>'}</div>
      </section>`;

    main.querySelectorAll('[data-j]').forEach(b => {
      b.onclick = () => { ir('jornada', {}); TELAS.jornada.render($('tela'), b.dataset.j); };
    });
  }
};

/* ------------------------------------------------------------- JORNADA */
TELAS.jornada = {
  titulo: 'Jornada',
  render: async (main, id) => {
    main.innerHTML = '<div class="esk"></div>'.repeat(4);
    if (!id) {
      // abre a jornada em andamento, se houver
      const abertas = await q('jornadas', '*, veiculos(placa), motoristas(nome)');
      const aberta = abertas.find(j => j.status === 'aberta');
      if (aberta) return TELAS.jornada.render(main, aberta.id);
      return abrirJornada(main, abertas);
    }

    const [j] = await q('jornadas', '*, veiculos(placa), motoristas(nome)');
    const { data: jj, error } = await sb.from('jornadas')
      .select('*, veiculos(placa,modelo), motoristas(nome)').eq('id', id).single();
    if (error) { main.innerHTML = `<div class="vazio">Jornada não encontrada</div>`; return; }

    const carregs = await q('jornada_carregamentos', '*');
    const meus = carregs.filter(c => c.jornada_id === id).sort((a, b) => new Date(a.chegada_em) - new Date(b.chegada_em));
    const rodado = jj.km_final != null ? Number(jj.km_final) - Number(jj.km_inicial) : null;
    const aberta = jj.status === 'aberta';

    // tempo total em fila
    const emFila = meus.reduce((s, c) => {
      const fim = c.saida_em ? new Date(c.saida_em) : new Date();
      return s + (fim - new Date(c.chegada_em)) / 3600000;
    }, 0);

    main.innerHTML = `
      <div class="cartao">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div>
            <div style="font-size:19px;font-weight:800;letter-spacing:-.02em">${esc(jj.veiculos?.placa || '—')}</div>
            <div class="pq txt3">${esc(jj.motoristas?.nome || '—')}</div>
          </div>
          <span class="tag ${aberta ? 'ok' : jj.status === 'conferencia' ? 'atencao' : ''}">${esc(jj.status)}</span>
        </div>
        <div class="divisao" style="display:flex;gap:16px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line);flex-wrap:wrap">
          <div><div class="k" style="font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)">Saída</div>
            <div class="num" style="font-size:14px;font-weight:700">${dataHoraBR(jj.inicio)}</div></div>
          <div><div style="font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)">Km inicial</div>
            <div class="num" style="font-size:14px;font-weight:700">${num(jj.km_inicial)}</div></div>
          <div><div style="font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)">Percorrido</div>
            <div class="num" style="font-size:14px;font-weight:700;color:var(--brand-luz)">${rodado != null ? num(rodado) + ' km' : '—'}</div></div>
          <div><div style="font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)">Em fila</div>
            <div class="num" style="font-size:14px;font-weight:700;color:${emFila > 8 ? 'var(--atencao)' : 'inherit'}">${emFila > 0 ? emFila.toFixed(1).replace('.', ',') + ' h' : '—'}</div></div>
        </div>
      </div>

      ${jj.ocorrencias ? `<div class="cartao" style="border-color:rgba(240,169,59,.35);margin-top:8px">
        <p class="pq"><b style="color:var(--atencao)">Ocorrência</b><br>${esc(jj.ocorrencias)}</p></div>` : ''}

      <section class="secao mt4">
        <div class="secao-topo">
          <h2>Carregamentos · ${meus.length}</h2>
          ${aberta ? '<button class="mais" id="bt-carga">+ registrar</button>' : ''}
        </div>
        <div class="linhas">
          ${meus.length ? meus.map((c, i) => {
            const dur = c.saida_em
              ? ((new Date(c.saida_em) - new Date(c.chegada_em)) / 3600000)
              : ((new Date() - new Date(c.chegada_em)) / 3600000);
            const naFila = !c.saida_em;
            return `<div class="linha" style="cursor:default">
              <div class="corpo">
                <div class="titulo">${i + 1}º carregamento${naFila ? ' · <span class="tag atencao">na fila</span>' : ''}</div>
                <div class="sub">chegou ${dataHoraBR(c.chegada_em)}${c.saida_em ? ' · saiu ' + dataHoraBR(c.saida_em) : ''}</div>
              </div>
              <div class="dir"><div class="valor" style="color:${dur > 6 ? 'var(--atencao)' : 'inherit'}">${dur.toFixed(1).replace('.', ',')}<small>horas</small></div></div>
            </div>`;
          }).join('') : '<div class="vazio"><div class="ic">📦</div>Nenhum carregamento registrado.<br><span class="pq">Registre cada vez que o caminhão carregar no embarcador.</span></div>'}
        </div>
      </section>

      ${aberta ? `<button class="btn cheio mt4" id="bt-fechar">Finalizar jornada</button>` : ''}`;

    const bc = $('bt-carga');
    if (bc) bc.onclick = () => modal({
      titulo: 'Registrar carregamento',
      campos: [{ id: 'cg-obs', label: 'Observação (opcional)', tipo: 'textarea', ph: 'ex.: voltou e carregou de novo' }],
      textoBotao: 'Registrar chegada',
      aoSalvar: async v => {
        const { error } = await sb.from('jornada_carregamentos')
          .insert({ jornada_id: id, observacao: v['cg-obs'] || null });
        if (error) throw error;
        toast('Carregamento registrado');
        TELAS.jornada.render(main, id);
      }
    });

    const bf = $('bt-fechar');
    if (bf) bf.onclick = () => modal({
      titulo: 'Finalizar jornada',
      campos: [
        { id: 'f-km', label: 'Km final (odômetro)', modo: 'numeric', ph: String(jj.km_inicial) },
        { id: 'f-oc', label: 'Ocorrência (opcional)', tipo: 'textarea' }
      ],
      textoBotao: 'Finalizar',
      aoSalvar: async v => {
        const kmf = parseNum(v['f-km']);
        if (kmf == null) throw new Error('Informe o km final');
        if (kmf < Number(jj.km_inicial)) throw new Error('Km final não pode ser menor que o inicial');
        const { error } = await sb.from('jornadas').update({
          km_final: kmf, fim: new Date().toISOString(),
          ocorrencias: v['f-oc'] || null, status: 'conferencia'
        }).eq('id', id);
        if (error) throw error;
        await sb.from('veiculos').update({ km_atual: kmf }).eq('id', jj.veiculo_id);
        toast('Jornada enviada para conferência');
        pilha = []; ir('jornadas');
      }
    });

  // ---- CONFERÊNCIA: gerência/conferente aprovam ou recusam a jornada fechada
  if (jj.status === 'conferencia' && ['gerencia','conferente'].includes(ME?.perfil)) {
    const div = document.createElement('div');
    div.className = 'secao';
    div.innerHTML = `
      <div class="secao-topo"><h2>Conferência</h2></div>
      <div class="cartao">
        <p class="pq txt2" style="margin-bottom:12px">
          O motorista finalizou esta jornada. Confira o km, o destino e os gastos
          com comprovante antes de aprovar.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" id="cf-ok" style="background:var(--ok);color:#0A1B31">Aprovar e fechar</button>
          <button class="btn sec" id="cf-no">Devolver ao motorista</button>
        </div>
        <p class="dica">Aprovar fecha a jornada e trava o km. Devolver volta para 'aberta' para ele corrigir.</p>
      </div>`;
    main.appendChild(div);

    $('cf-ok').onclick = async () => {
      try {
        const { error } = await sb.from('jornadas').update({ status: 'fechada' }).eq('id', id);
        if (error) throw error;
        toast('Jornada aprovada e fechada');
        pilha = []; ir('jornadas');
      } catch (e) { toast('Não consegui aprovar: ' + e.message, true); }
    };

    $('cf-no').onclick = async () => {
      try {
        const { error } = await sb.from('jornadas').update({ status: 'aberta' }).eq('id', id);
        if (error) throw error;
        toast('Jornada devolvida ao motorista');
        pilha = []; ir('jornadas');
      } catch (e) { toast('Não consegui devolver: ' + e.message, true); }
    };
  }
  }
};


/** abrir jornada nova */
async function abrirJornada(main, todas) {
  const [veics, mots, abertas] = await Promise.all([
    q('veiculos', 'id,placa,km_atual,ativo'),
    q('motoristas', 'id,nome,ativo'),
    q('jornadas', 'veiculo_id,status')
  ]);
  const vAtivos = veics.filter(v => v.ativo);
  const mAtivos = mots.filter(m => m.ativo);
  const ocupados = new Set(abertas.filter(j => j.status === 'aberta').map(j => j.veiculo_id));
  const livres = vAtivos.filter(v => !ocupados.has(v.id));

  main.innerHTML = `
    <div class="secao">
      ${livres.length ? `<div class="cartao">
        <p class="pq txt2">Nenhuma jornada aberta agora. <b>${livres.length}</b> caminhão${livres.length > 1 ? 's' : ''} livre${livres.length > 1 ? 's' : ''}.</p>
      </div>` : `<div class="cartao" style="border-color:rgba(240,169,59,.35)">
        <p class="pq">Todos os caminhões estão em jornada. Finalize uma antes de abrir outra.</p>
      </div>`}
    </div>
    ${livres.length && mAtivos.length ? `
    <div class="cartao">
      <div class="campo"><label for="nj-veic">Caminhão</label>
        <select id="nj-veic">${livres.map(v => `<option value="${v.id}" data-km="${v.km_atual ?? ''}">${esc(v.placa)}${v.km_atual != null ? ' · ' + num(v.km_atual) + ' km' : ''}</option>`).join('')}</select></div>
      <div class="campo"><label for="nj-mot">Motorista</label>
        <select id="nj-mot">${mAtivos.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label for="nj-km">Km inicial</label>
        <input id="nj-km" inputmode="numeric" placeholder="odômetro agora"></div>
      <button class="btn cheio" id="nj-btn">Abrir jornada</button>
      <p class="dica">O km inicial já vem do odômetro do caminhão. Corrija se estiver diferente.</p>
    </div>` : ''}`;

  const sel = $('nj-veic'), kmInp = $('nj-km');
  if (sel) {
    const sinc = () => { kmInp.value = sel.selectedOptions[0]?.dataset.km || ''; };
    sinc(); sel.onchange = sinc;
  }
  const btn = $('nj-btn');
  if (btn) btn.onclick = async () => {
    const kmi = parseNum($('nj-km').value);
    if (kmi == null) { toast('Informe o km inicial', true); return; }
    const { error } = await sb.from('jornadas').insert({
      veiculo_id: $('nj-veic').value,
      motorista_id: $('nj-mot').value,
      km_inicial: kmi
    });
    if (error) { toast(error.message, true); return; }
    toast('Jornada aberta');
    pilha = []; ir('jornadas');
  };
}

/* ------------------------------------------------------------- VEÍCULOS */
TELAS.veiculos = {
  titulo: 'Caminhões',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(3);
    const [lista, docs] = await Promise.all([
      q('veiculos', '*'),
      q('veiculos_documentos', 'veiculo_id,vencimento,tipo')
    ]);
    const crlv = {};
    docs.filter(d => d.tipo === 'CRLV-e')
      .sort((a, b) => String(b.vencimento).localeCompare(String(a.vencimento)))
      .forEach(d => { if (!crlv[d.veiculo_id]) crlv[d.veiculo_id] = d; });

    main.innerHTML = `
      <div class="linhas">
        ${lista.length ? lista.map(v => {
          const d = crlv[v.id];
          const venc = d?.vencimento && d.vencimento < hojeISO();
          const faltaOleo = (v.km_atual != null && v.intervalo_oleo_km && v.ultima_troca_oleo_km != null)
            ? Number(v.km_atual) - (Number(v.ultima_troca_oleo_km) + Number(v.intervalo_oleo_km)) : null;
          const tags = [];
          if (!d) tags.push('<span class="tag critico">sem CRLV</span>');
          else if (venc) tags.push('<span class="tag critico">CRLV vencido</span>');
          if (faltaOleo != null && faltaOleo >= 0) tags.push('<span class="tag atencao">óleo</span>');
          if (!v.ativo) tags.push('<span class="tag">inativo</span>');
          return `<button class="linha" data-v="${v.id}" style="flex-direction:column;align-items:stretch">
            <div style="display:flex;align-items:center;gap:10px;width:100%">
              <div class="corpo" style="flex:1;min-width:0">
                <div class="titulo">${esc(v.placa)} ${tags.join(' ')}</div>
                <div class="sub">${esc([v.marca, v.modelo].filter(Boolean).join(' ') || '—')}${v.km_atual != null ? ' · ' + num(v.km_atual) + ' km' : ''}</div>
              </div>
              <span class="seta">›</span>
            </div>
            ${window.Melhorias ? `<div style="width:100%;margin-top:6px">
              ${Melhorias.semaforoOleo(v)}
              ${Melhorias.semaforoDoc('CRLV-e', d && d.vencimento)}
            </div>` : ''}
          </button>`;
        }).join('') : '<div class="vazio"><div class="ic">🚚</div>Nenhum caminhão cadastrado.</div>'}
      </div>
      <button class="btn cheio mt4" id="bt-add-v">Cadastrar caminhão</button>`;

    main.querySelectorAll('[data-v]').forEach(b => {
      b.onclick = () => modal({
        titulo: 'Caminhão',
        campos: [
          { id: 'e-placa', label: 'Placa', valor: '' },
          { id: 'e-km', label: 'Km atual (odômetro)', modo: 'numeric' },
          { id: 'e-int', label: 'Intervalo de troca de óleo (km)', modo: 'numeric', ph: '40000' }
        ],
        aoSalvar: async v => {
          const { data: cur } = await sb.from('veiculos').select('*').eq('id', b.dataset.v).single();
          const { error } = await sb.from('veiculos').update({
            placa: v['e-placa'].toUpperCase().replace(/[^A-Z0-9]/g, ''),
            km_atual: parseNum(v['e-km']),
            intervalo_oleo_km: parseNum(v['e-int'])
          }).eq('id', b.dataset.v);
          if (error) throw error;
          toast('Caminhão atualizado');
          TELAS.veiculos.render(main);
        }
      });
    });

    $('bt-add-v').onclick = () => modal({
      titulo: 'Novo caminhão',
      campos: [
        { id: 'n-placa', label: 'Placa', ph: 'ABC1D23' },
        { id: 'n-marca', label: 'Marca', ph: 'Volvo' },
        { id: 'n-modelo', label: 'Modelo', ph: 'FH 540' },
        { id: 'n-ano', label: 'Ano', modo: 'numeric' },
        { id: 'n-km', label: 'Km atual (odômetro)', modo: 'numeric' },
        { id: 'n-int', label: 'Intervalo de troca de óleo (km)', modo: 'numeric', ph: '40000' }
      ],
      textoBotao: 'Cadastrar',
      aoSalvar: async v => {
        const placa = (v['n-placa'] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!placa) throw new Error('Informe a placa');
        const { error } = await sb.from('veiculos').insert({
          placa, marca: v['n-marca'] || null, modelo: v['n-modelo'] || null,
          ano: parseNum(v['n-ano']), km_atual: parseNum(v['n-km']),
          intervalo_oleo_km: parseNum(v['n-int'])
        });
        if (error) throw error;
        toast('Caminhão cadastrado');
        TELAS.veiculos.render(main);
      }
    });
  }
};

/* ------------------------------------------------------------- MOTORISTAS */
TELAS.motoristas = {
  titulo: 'Motoristas',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(3);
    const [lista, vinculos, veics] = await Promise.all([
      q('motoristas', '*'),
      sb.from('vw_vinculos_ativos').select('*').then(r => r.data || []),
      q('veiculos', 'id,placa,marca,modelo,ativo')
    ]);
    const vinculoDe = {};
    (vinculos || []).forEach(v => { vinculoDe[v.motorista_id] = v; });

    main.innerHTML = `
      <div class="linhas">
        ${lista.length ? lista.map(m => {
          const venc = m.cnh_validade && m.cnh_validade < hojeISO();
          const dias = m.cnh_validade ? diasEntre(hojeISO(), m.cnh_validade) : null;
          const vinc = vinculoDe[m.id];
          return `<div class="linha" style="cursor:default;flex-direction:column;align-items:stretch">
            <div class="corpo" style="width:100%">
              <div class="titulo">${esc(m.nome)}
                ${venc ? '<span class="tag critico">CNH vencida</span>'
                  : (dias != null && dias <= 60) ? `<span class="tag atencao">CNH em ${dias}d</span>` : ''}</div>
              <div class="sub">${m.cnh ? 'CNH ' + esc(m.cnh) + (m.cnh_categoria ? ' · ' + esc(m.cnh_categoria) : '') : 'CNH não cadastrada'}</div>
              <div style="margin-top:7px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span class="pq txt3">Caminhão:</span>
                ${vinc
                  ? `<span class="tag marca" style="font-family:var(--fnum)">${esc(vinc.placa)}</span>
                     <span class="pq txt3">${esc(vinc.marca || '')} ${esc(vinc.modelo || '')}</span>`
                  : '<span class="pq txt3" style="font-style:italic">sem vínculo — escolhe na hora</span>'}
                <button class="btn mini sec" data-vinc="${esc(m.id)}" style="margin-left:auto">${vinc ? 'trocar' : 'vincular'}</button>
              </div>
            </div>
            ${window.Melhorias ? `<div style="width:100%;margin-top:6px">${Melhorias.semaforoDoc('CNH', m.cnh_validade)}</div>` : ''}
          </div>`;
        }).join('') : '<div class="vazio"><div class="ic">🧑‍✈️</div>Nenhum motorista cadastrado.</div>'}
      </div>
      <button class="btn cheio mt4" id="bt-add-m">Cadastrar motorista</button>`;

    // ---- vincular/trocar caminhão do motorista
    main.querySelectorAll('[data-vinc]').forEach(b => {
      b.onclick = () => {
        const mid = b.dataset.vinc;
        const atual = (vinculos || []).find(v => v.motorista_id === mid);
        const livres = (veics || []).filter(v => v.ativo);
        if (!livres.length) { toast('Nenhum caminhão ativo', true); return; }

        modal({
          titulo: atual ? `Trocar caminhão de ${atual.motorista.split(' ')[0]}` : 'Vincular caminhão',
          campos: [
            { id: 'vg-veic', label: 'Caminhão', tipo: 'select',
              valor: atual?.veiculo_id || '',
              opcoes: livres.map(v => [v.id, `${v.placa} — ${v.marca || ''} ${v.modelo || ''}`]) },
            { id: 'vg-obs', label: 'Observação (opcional)', ph: 'ex.: troca de caminhão, turno da noite' }
          ],
          textoBotao: 'Salvar vínculo',
          aoSalvar: async v => {
            // fecha o vínculo atual (histórico preservado) e cria o novo
            if (atual) {
              const { error: e1 } = await sb.from('motorista_veiculo')
                .update({ fim: hojeISO() }).eq('id', atual.id);
              if (e1) throw e1;
            }
            const { error } = await sb.from('motorista_veiculo').insert({
              motorista_id: mid, veiculo_id: v['vg-veic'],
              inicio: hojeISO(), observacao: v['vg-obs'] || null
            });
            if (error) throw error;
            toast('Vínculo salvo');
            TELAS.motoristas.render(main);
          }
        });
      };
    });

    $('bt-add-m').onclick = () => modal({
      titulo: 'Novo motorista',
      campos: [
        { id: 'm-nome', label: 'Nome' },
        { id: 'm-cnh', label: 'CNH' },
        { id: 'm-cat', label: 'Categoria', ph: 'AE' },
        { id: 'm-val', label: 'Validade da CNH', tipo: 'date' },
        { id: 'm-tel', label: 'Contato', ph: '(19) 99999-9999' }
      ],
      textoBotao: 'Cadastrar',
      aoSalvar: async v => {
        if (!v['m-nome']) throw new Error('Informe o nome');
        const { error } = await sb.from('motoristas').insert({
          nome: v['m-nome'], cnh: v['m-cnh'] || null,
          cnh_categoria: v['m-cat'] || null, cnh_validade: v['m-val'] || null,
          contato: v['m-tel'] || null
        });
        if (error) throw error;
        toast('Motorista cadastrado');
        TELAS.motoristas.render(main);
      }
    });
  }
};

/* ==========================================================================
   NAVEGAÇÃO — abas por perfil
   Gerência vê o negócio; motorista vê o dia dele. Não é permissão: é foco.
   ========================================================================== */
/* TELAS.abas não é mais usada: a navegação vive em ABAS_POR_PERFIL (app.js),
   que alimenta a sidebar no desktop e a bottom nav no mobile. */
TELAS.abas = () => [];
