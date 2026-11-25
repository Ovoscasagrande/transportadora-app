/* ==========================================================================
   TELA DE USUÁRIOS (gerência)

   Responde a pergunta "quem se cadastrou e ainda não foi liberado?".
   Sem esta tela, o autocadastro criaria gente pendente que nunca é aprovada —
   e a pessoa ficaria presa na tela de espera sem ninguém saber.
   ========================================================================== */

const PERFIL_ROTULO = {
  pendente:   'aguardando liberação',
  motorista:  'Motorista',
  conferente: 'Conferente',
  mecanico:   'Mecânico',
  gerencia:   'Gerência'
};

TELAS.usuarios = {
  titulo: 'Usuários',
  render: async main => {
    main.innerHTML = '<div class="esk"></div>'.repeat(4);

    if (ME?.perfil !== 'gerencia') {
      main.innerHTML = `<div class="vazio"><div class="ic">${icon('circle-alert')}</div>
        Só a gerência gerencia usuários.</div>`;
      desenhaIcones();
      return;
    }

    // pendentes: view que junta usuarios + auth.users (para ter o e-mail)
    const [pend, todos] = await Promise.all([
      sb.from('vw_usuarios_pendentes').select('*').then(r => r.data || []),
      sb.from('usuarios').select('id,nome,perfil,ativo,telefone')
        .order('nome').then(r => r.data || [])
    ]);

    const semPend = pend.filter(p => p.perfil === 'pendente');
    const inativos = pend.filter(p => p.perfil !== 'pendente');

    const cartaoUsuario = (u, pendente) => `
      <div class="cartao" style="padding:13px 14px" data-u="${esc(u.id)}">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
          <div style="min-width:0">
            <div style="font-size:14.5px;font-weight:750">${esc(u.nome || '—')}</div>
            <div class="pq txt3">${esc(u.email || '')}</div>
            <div class="pq txt3" style="margin-top:2px">
              ${u.telefone ? esc(u.telefone) + ' · ' : ''}cadastrou ${dataBR(u.criado_em)}
            </div>
            <div style="margin-top:6px">
              <span class="tag ${pendente ? 'atencao' : u.perfil === 'gerencia' ? 'marca' : 'info'}">
                ${PERFIL_ROTULO[u.perfil] || u.perfil}
              </span>
            </div>
          </div>
          ${pendente
            ? `<button class="btn mini" data-aprovar="${esc(u.id)}">Liberar</button>`
            : `<div style="display:flex;flex-direction:column;gap:5px">
                 <button class="btn mini sec" data-editar="${esc(u.id)}">perfil</button>
                 <button class="btn mini sec" data-senha="${esc(u.email||'')}">senha</button>
               </div>`}
        </div>
      </div>`;

    main.innerHTML = `
      ${semPend.length ? `
      <section class="secao">
        <div class="secao-topo">
          <h2>Aguardando liberação · ${semPend.length}</h2>
        </div>
        <div class="linhas">${semPend.map(u => cartaoUsuario(u, true)).join('')}</div>
        <p class="dica mt2">Quem se cadastrou pelo app entra e vê "aguardando liberação" até você definir o perfil.</p>
      </section>` : `
      <section class="secao">
        <div class="linhas"><div class="vazio"><div class="ic">${icon('check-circle')}</div>
          Nenhum cadastro esperando liberação.</div></div>
      </section>`}

      <section class="secao">
        <div class="secao-topo"><h2>Usuários ativos · ${todos.filter(u => u.perfil !== 'pendente').length}</h2></div>
        <div class="linhas">
          ${todos.filter(u => u.perfil !== 'pendente').map(u => cartaoUsuario({
            ...u, email: (pend.find(p => p.id === u.id) || {}).email || '',
            criado_em: (pend.find(p => p.id === u.id) || {}).criado_em
          }, false)).join('')}
        </div>
      </section>

      <p class="dica mt4" style="text-align:center">
        O perfil define o que a pessoa vê. Motorista nunca vê custo nem receita da empresa.
      </p>`;

    desenhaIcones();

    // ---- liberar: escolhe o perfil e ativa
    main.querySelectorAll('[data-aprovar]').forEach(b => {
      b.onclick = () => {
        const u = semPend.find(x => x.id === b.dataset.aprovar);
        modal({
          titulo: 'Liberar acesso',
          campos: [
            { id: 'ap-perfil', label: `Perfil de ${u.nome}`, tipo: 'select', opcoes: [
              ['motorista', 'Motorista — vê só o dia dele'],
              ['conferente', 'Conferente — aprova despesas e confere'],
              ['mecanico', 'Mecânico — oficina e caminhões'],
              ['gerencia', 'Gerência — vê tudo, inclusive custo e margem']
            ]},
            { id: 'ap-msg', label: 'Aviso', valor: 'A pessoa passa a acessar assim que entrar de novo.' }
          ],
          textoBotao: 'Liberar',
          aoSalvar: async v => {
            const perfil = v['ap-perfil'];
            const { error } = await sb.from('usuarios')
              .update({ perfil, ativo: true }).eq('id', u.id);
            if (error) throw error;

            // se for motorista, cria o registro em motoristas para o app dele funcionar
            if (perfil === 'motorista') {
              const jaTem = await sb.from('motoristas').select('id')
                .eq('usuario_id', u.id).then(r => r.data || []);
              if (!jaTem.length) {
                await sb.from('motoristas').insert({
                  usuario_id: u.id, nome: u.nome, ativo: true
                });
              }
            }
            toast(`${u.nome.split(' ')[0]} liberado como ${PERFIL_ROTULO[perfil]}`);
            TELAS.usuarios.render(main);
          }
        });
      };
    });

    // ---- gerar link de recuperação (para quando o usuário não recebe)
    main.querySelectorAll('[data-senha]').forEach(b => {
      b.onclick = async () => {
        const email = b.dataset.senha;
        if (!email) { toast('Este usuário não tem e-mail cadastrado', true); return; }
        b.disabled = true; b.textContent = '...';
        try {
          const { error } = await sb.auth.resetPasswordForEmail(email, {
            redirectTo: 'https://ovoscasagrande.github.io/transportadora-app/'
          });
          if (error) throw error;
          toast('Link enviado para ' + email);
        } catch (e) {
          const m = (e && e.message) || '';
          toast(/rate limit|too many/i.test(m)
            ? 'Limite do servidor de e-mail atingido — tente em 1 hora'
            : 'Não consegui enviar: ' + m, true);
        } finally {
          b.disabled = false; b.textContent = 'senha';
        }
      };
    });

    // ---- trocar perfil de quem já está ativo
    main.querySelectorAll('[data-editar]').forEach(b => {
      b.onclick = () => {
        const u = todos.find(x => x.id === b.dataset.editar);
        modal({
          titulo: 'Alterar perfil',
          campos: [
            { id: 'ed-nome', label: 'Nome', valor: u.nome },
            { id: 'ed-perfil', label: 'Perfil', tipo: 'select', valor: u.perfil, opcoes: [
              ['motorista', 'Motorista'], ['conferente', 'Conferente'],
              ['mecanico', 'Mecânico'], ['gerencia', 'Gerência'],
              ['pendente', 'Suspender acesso (volta a aguardar)']
            ]},
            { id: 'ed-at', label: 'Situação', tipo: 'select', valor: String(u.ativo), opcoes: [
              ['true', 'Ativo'], ['false', 'Desativado']
            ]}
          ],
          textoBotao: 'Salvar',
          aoSalvar: async v => {
            const { error } = await sb.from('usuarios').update({
              nome: v['ed-nome'], perfil: v['ed-perfil'], ativo: v['ed-at'] === 'true'
            }).eq('id', u.id);
            if (error) throw error;
            toast('Usuário atualizado');
            TELAS.usuarios.render(main);
          }
        });
      };
    });
  }
};
