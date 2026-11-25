/* ==========================================================================
   TELAS — cadastro (gerência)

   Pedido de 23/11: "uma aba para a gerência cadastrar motoristas e caminhões".
   Até aqui o cadastro existia espalhado: caminhão em TELAS.veiculos (que servia
   tanto para ver quanto para editar), motorista não existia em tela nenhuma.
   A gerência tinha de editar banco à mão.

   Desenho: uma aba, dois blocos, cada item com ação clara.
   - Caminhão: cadastro rápido, com o intervalo de óleo e o CRLV.
   - Motorista: cadastro + criar o login junto (senão a pessoa não entra).
   ========================================================================== */

TELAS.cadastro = {
  titulo: 'Cadastro',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(4);

    const [veics, mots, users, docs] = await Promise.all([
      sb.from('veiculos').select('*').order('placa').then(r => r.data || []),
      sb.from('motoristas').select('*').order('nome').then(r => r.data || []),
      sb.from('usuarios').select('id,perfil,ativo').then(r => r.data || []),
      sb.from('veiculos_documentos').select('veiculo_id,tipo,vencimento').then(r => r.data || [])
    ]);

    const crlv = {};
    docs.filter(d => d.tipo === 'CRLV-e').forEach(d => {
      if (!crlv[d.veiculo_id]) crlv[d.veiculo_id] = d;
    });

    const comLogin = new Set(mots.filter(m => m.usuario_id).map(m => m.id));

    main.innerHTML = `
      <div class="seg" id="seg-cad">
        <button class="on" data-bloco="caminhoes">Caminhões · ${veics.length}</button>
        <button data-bloco="motoristas">Motoristas · ${mots.length}</button>
      </div>

      <div id="bloco-caminhoes">
        <div class="linhas">
          ${veics.length ? veics.map(v => {
            const d = crlv[v.id];
            const dias = d?.vencimento
              ? Math.ceil((new Date(d.vencimento + 'T12:00:00') - new Date()) / 86400000) : null;
            return `<div class="cartao" style="padding:13px 14px">
              <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
                <div style="min-width:0">
                  <div style="font-size:15px;font-weight:800;letter-spacing:.01em">${esc(v.placa)}</div>
                  <div class="pq txt3">${esc([v.marca, v.modelo].filter(Boolean).join(' ') || '—')}${v.ano ? ' · ' + v.ano : ''}</div>
                  <div class="pq txt3" style="margin-top:3px">
                    ${v.km_atual != null ? num(v.km_atual) + ' km' : 'sem odômetro'}
                    ${v.intervalo_oleo_km ? ' · óleo a cada ' + num(v.intervalo_oleo_km) : ''}
                  </div>
                  ${d?.vencimento ? `<div class="pq" style="margin-top:4px;color:${dias < 0 ? 'var(--critico)' : dias <= 45 ? 'var(--atencao)' : 'var(--ink-3)'}">
                    CRLV vence ${dataBR(d.vencimento)}</div>` : '<div class="pq" style="margin-top:4px;color:var(--atencao)">CRLV sem vencimento cadastrado</div>'}
                </div>
                <button class="btn mini sec" data-edit-v="${v.id}">editar</button>
              </div>
            </div>`;
          }).join('') : '<div class="vazio">Nenhum caminhão cadastrado.</div>'}
        </div>
        <button class="btn cheio mt4" id="bt-novo-v">+ Cadastrar caminhão</button>
      </div>

      <div id="bloco-motoristas" class="esconde">
        <div class="linhas">
          ${mots.length ? mots.map(m => {
            const dias = m.cnh_validade
              ? Math.ceil((new Date(m.cnh_validade + 'T12:00:00') - new Date()) / 86400000) : null;
            return `<div class="cartao" style="padding:13px 14px">
              <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
                <div style="min-width:0">
                  <div style="font-size:14.5px;font-weight:750">${esc(m.nome)}</div>
                  <div class="pq txt3">${esc(m.cnh_categoria || '—')} · ${esc(m.cnh || 'sem CNH')}${m.contato ? ' · ' + esc(m.contato) : ''}</div>
                  ${m.cnh_validade ? `<div class="pq" style="margin-top:3px;color:${dias < 0 ? 'var(--critico)' : dias <= 30 ? 'var(--critico)' : dias <= 90 ? 'var(--atencao)' : 'var(--ink-3)'}">
                    CNH ${dias < 0 ? 'vencida' : 'vence ' + dataBR(m.cnh_validade)}</div>` : ''}
                  <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">
                    ${comLogin.has(m.id) ? '<span class="tag ok">com login</span>' : '<span class="tag atencao">sem login</span>'}
                    ${m.ativo ? '' : '<span class="tag">inativo</span>'}
                  </div>
                </div>
                <button class="btn mini sec" data-edit-m="${m.id}">editar</button>
              </div>
            </div>`;
          }).join('') : '<div class="vazio">Nenhum motorista cadastrado.</div>'}
        </div>
        <button class="btn cheio mt4" id="bt-novo-m">+ Cadastrar motorista</button>
      </div>`;

    // alterna os blocos
    main.querySelectorAll('#seg-cad button').forEach(b => {
      b.onclick = () => {
        main.querySelectorAll('#seg-cad button').forEach(x => x.classList.toggle('on', x === b));
        $('bloco-caminhoes').classList.toggle('esconde', b.dataset.bloco !== 'caminhoes');
        $('bloco-motoristas').classList.toggle('esconde', b.dataset.bloco !== 'motoristas');
      };
    });

    /* ------------------------------------------------- caminhão: novo/editar */
    const formVeiculo = (v) => modal({
      titulo: v ? 'Editar ' + v.placa : 'Novo caminhão',
      campos: [
        { id: 'v-placa', label: 'Placa', valor: v?.placa || '', ph: 'ABC1D23' },
        { id: 'v-marca', label: 'Marca', valor: v?.marca || '', ph: 'Iveco' },
        { id: 'v-modelo', label: 'Modelo', valor: v?.modelo || '', ph: 'Tector 11-190' },
        { id: 'v-ano', label: 'Ano', modo: 'numeric', valor: v?.ano || '' },
        { id: 'v-cor', label: 'Cor', valor: v?.cor || '', ph: 'Branca' },
        { id: 'v-renavam', label: 'RENAVAM', modo: 'numeric', valor: v?.renavam || '' },
        { id: 'v-km', label: 'Odômetro atual (km)', modo: 'numeric', valor: v?.km_atual ?? '' },
        { id: 'v-oleo', label: 'Intervalo de troca de óleo (km)', modo: 'numeric',
          valor: v?.intervalo_oleo_km ?? 40000, dica: 'Padrão de cavalo mecânico: 40.000 km' },
        { id: 'v-ultoleo', label: 'Última troca — km do odômetro', modo: 'numeric',
          valor: v?.ultima_troca_oleo_km ?? '',
          dica: 'Sem este número o alerta de óleo não funciona' }
      ],
      textoBotao: v ? 'Salvar' : 'Cadastrar',
      aoSalvar: async val => {
        const placa = (val['v-placa'] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (placa.length < 7) throw new Error('Placa inválida.');
        const dados = {
          placa,
          marca: val['v-marca'] || null,
          modelo: val['v-modelo'] || null,
          ano: parseNum(val['v-ano']),
          cor: val['v-cor'] || null,
          renavam: (val['v-renavam'] || '').replace(/\D/g, '') || null,
          km_atual: parseNum(val['v-km']),
          intervalo_oleo_km: parseNum(val['v-oleo']),
          ultima_troca_oleo_km: parseNum(val['v-ultoleo'])
        };
        const { error } = v
          ? await sb.from('veiculos').update(dados).eq('id', v.id)
          : await sb.from('veiculos').insert(dados);
        if (error) throw new Error(error.message);
        toast(v ? 'Caminhão atualizado' : 'Caminhão cadastrado');
        TELAS.cadastro.render(main);
      }
    });

    $('bt-novo-v').onclick = () => formVeiculo(null);
    main.querySelectorAll('[data-edit-v]').forEach(b => {
      b.onclick = () => formVeiculo(veics.find(v => v.id === b.dataset.editV));
    });

    /* --------------------------------------------- motorista: novo/editar */
    const formMotorista = (m) => modal({
      titulo: m ? 'Editar ' + m.nome.split(' ')[0] : 'Novo motorista',
      campos: [
        { id: 'm-nome', label: 'Nome completo', valor: m?.nome || '' },
        { id: 'm-cpf', label: 'CPF', modo: 'numeric', valor: m?.cpf || '' },
        { id: 'm-cnh', label: 'Nº de registro da CNH', modo: 'numeric', valor: m?.cnh || '' },
        { id: 'm-cat', label: 'Categoria', valor: m?.cnh_categoria || '', ph: 'AD' },
        { id: 'm-venc', label: 'Validade da CNH', tipo: 'date', valor: m?.cnh_validade || '' },
        { id: 'm-tel', label: 'Telefone', modo: 'tel', valor: m?.contato || '', ph: '19999999999' },
        ...(m ? [] : [{ id: 'm-email', label: 'E-mail para login', tipo: 'email',
                        ph: 'motorista@email.com',
                        dica: 'A pessoa entra no app com este e-mail' },
                      { id: 'm-senha', label: 'Senha inicial', tipo: 'password',
                        dica: 'Mínimo 6 caracteres. Peça para trocar depois.' }])
      ],
      textoBotao: m ? 'Salvar' : 'Cadastrar',
      aoSalvar: async val => {
        const nome = (val['m-nome'] || '').trim();
        if (!nome) throw new Error('Informe o nome.');

        if (m) {
          const { error } = await sb.from('motoristas').update({
            nome,
            cpf: (val['m-cpf'] || '').replace(/\D/g, '') || null,
            cnh: (val['m-cnh'] || '').replace(/\D/g, '') || null,
            cnh_categoria: (val['m-cat'] || '').toUpperCase() || null,
            cnh_validade: val['m-venc'] || null,
            contato: (val['m-tel'] || '').replace(/\D/g, '') || null
          }).eq('id', m.id);
          if (error) throw new Error(error.message);
          toast('Motorista atualizado');
        } else {
          const email = (val['m-email'] || '').trim().toLowerCase();
          const senha = val['m-senha'] || '';
          if (!email) throw new Error('Informe o e-mail — é o login dele.');
          if (senha.length < 6) throw new Error('A senha precisa de 6 caracteres ou mais.');

          // 1) cadastro do motorista (sem usuário ainda)
          const { data: novo, error: e1 } = await sb.from('motoristas').insert({
            nome,
            cpf: (val['m-cpf'] || '').replace(/\D/g, '') || null,
            cnh: (val['m-cnh'] || '').replace(/\D/g, '') || null,
            cnh_categoria: (val['m-cat'] || '').toUpperCase() || null,
            cnh_validade: val['m-venc'] || null,
            contato: (val['m-tel'] || '').replace(/\D/g, '') || null,
            ativo: true
          }).select().single();
          if (e1) throw new Error(e1.message);

          // 2) login: cria o usuário no Auth
          const { data: sign, error: e2 } = await sb.auth.signUp({
            email, password: senha,
            options: { data: { nome, perfil: 'motorista' } }
          });
          if (e2) {
            // não deixa motorista órfão: desfaz o cadastro se o login falhar
            await sb.from('motoristas').delete().eq('id', novo.id);
            throw new Error('Cadastro desfeito — falha ao criar o login: ' + e2.message);
          }

          const uid = sign?.user?.id;
          if (!uid) {
            throw new Error('O login foi criado mas exige confirmação de e-mail. ' +
              'Peça para o Supabase desativar a confirmação, ou confirme no painel.');
          }

          // 3) liga o login ao cadastro e cria o perfil
          const { error: e3 } = await sb.from('usuarios').insert({
            id: uid, nome, perfil: 'motorista', ativo: true,
            telefone: (val['m-tel'] || '').replace(/\D/g, '') || null
          });
          if (e3) throw new Error('Login criado, mas o perfil falhou: ' + e3.message);

          await sb.from('motoristas').update({ usuario_id: uid }).eq('id', novo.id);
          toast(`${nome.split(' ')[0]} cadastrado, com login`);
        }
        TELAS.cadastro.render(main);
      }
    });

    $('bt-novo-m').onclick = () => formMotorista(null);
    main.querySelectorAll('[data-edit-m]').forEach(b => {
      b.onclick = () => formMotorista(mots.find(m => m.id === b.dataset.editM));
    });
  }
};
