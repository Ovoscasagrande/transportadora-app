================================================================================
TRANSPORTADORA CASAGRANDE — APP DE CONTROLE DE FROTA
Documento de transferência para outra IA (handoff)
Atualizado em: 23/11/2026
================================================================================

LEIA ISTO PRIMEIRO
------------------
Este documento existe para você assumir o app sem precisar descobrir as coisas
do zero — e, principalmente, sem repetir erros que já custaram tempo neste
projeto. Cada decisão estranha que você encontrar no código está explicada
aqui com o motivo. Se for mudar alguma, entenda antes por que está assim.

Se você discordar de uma decisão: ótimo, mas mude com argumento, não por gosto.
Várias dessas escolhas vieram de erro real que apareceu rodando o app.


================================================================================
1. O NEGÓCIO (isto muda tudo)
================================================================================

Uma transportadora. Um cliente fixo (o embarcador). Dois caminhões.
Não é um TMS.

O que isso significa na prática:
- NÃO existe captação de frete, cotação, tabela de preço, CT-e, MDF-e, romaneio.
  Não construa essas telas. Não é o negócio deles.
- A transportadora CONTROLA O CAMINHÃO. O embarcador controla a CARGA.
- O destino só é descoberto quando o caminhão chega para carregar. Por isso
  destino é um campo solto no recebimento, nunca uma entidade de roteirização.
- Frota: 2 caminhões, ambos CAVALO MECÂNICO (sem carreta/implemento).
  Não faz sentido tela de implemento, prancha, reboque.
- É uma empresa só. NÃO existe coluna `empresa` e não deve existir. O app
  nasceu da separação de um sistema multiempresa (OVOS / DISTRIBUIDORA /
  TRANSPORTADORA); qualquer resquício disso é bug.

A dor declarada do dono: "não sei quanto cada caminhão custa."
Toda decisão de prioridade deve passar por essa frase.


================================================================================
2. STACK E COMO RODAR
================================================================================

- HTML + CSS + JavaScript puro. SEM build, SEM framework, SEM npm.
- Banco e autenticação: Supabase (PostgreSQL + GoTrue + Storage).
- Arquivos: index.html + assets/css/app.css + assets/js/*.js
- Abrir local: index.html com um servidor estático qualquer. Roda de qualquer
  host estático (GitHub Pages, Cloudflare Pages, Vercel).

Projeto Supabase: pupcqyhdzfuczayeiqis (us-east-1)
URL: https://pupcqyhdzfuczayeiqis.supabase.co
A chave publicável está em assets/js/app.js (CONFIG). É chave pública mesmo —
o que protege os dados é Row Level Security, não a chave.

ATENÇÃO: a chave publishable conecta como o papel `anon` do Postgres, não como
`authenticated`. Por isso foi necessário dar GRANT explícito para `anon` nas
views; sem isso a leitura falha com "permission denied" antes mesmo da RLS.

Não há servidor próprio. Nenhuma chave secreta deve existir no front.


================================================================================
3. ARQUITETURA DO FRONT
================================================================================

Padrão de tela (todas seguem):
    TELAS['nome'] = { titulo: '...', render: async main => { ... } }
- `ir('nome')` navega e desenha a aba inferior.
- `TELAS.abas()` retorna as abas por perfil (é o menu; a ordem importa).
- `q(tabela, colunas)` consulta simples via supabase-js.
- `sb.rpc('custo_frota')` para o custo (explicado na seção 5).
- `modal({titulo, campos, aoSalvar})` formulário. Campos suportam tipo:
  text, textarea, select, date, file, password. `modo` define teclado numérico.
- `toast(msg, erro)` aviso rápido.

Helpers de formatação em app.js — USE-OS, não formate na mão:
  brl() valor em R$ · num() número pt-BR · km() quilometragem
  dataBR() data sem hora · dataHoraBR() data com hora

  >>> PEGADINHA QUE JÁ CAUSOU DADO ERRADO <<<
  dataBR() trata data pura (YYYY-MM-DD) SEM passar por new Date().
  Motivo: new Date('2026-10-16') é meia-noite em UTC; no Brasil (UTC-3) isso é
  15/10 às 21h, e TODA data aparecia um dia antes (entrega, CNH, CRLV).
  Se você escrever código novo, nunca faça new Date() em data pura.

Arquivos:
  app.js              núcleo: CONFIG, helpers, navegação, login, modal, toast
  telas.js            inicio, excecoes, custo
  telas-operacao.js   jornadas, jornada, veiculos, motoristas, abas por perfil
  telas-despesa.js    despesas: aprovar, reprovar, marcar pago
  telas-motorista.js  meu-dia (com CRLV), meus-gastos, avisos, oficina
  telas-motorista2.js relatorio do motorista, minha-cnh
  telas-jornada-mot.js fluxo: iniciar jornada -> lançar gasto -> finalizar
  telas-recebimento.js recebimentos (receita)
  telas-pedagio.js    importação de extrato + conferência + gasto manual
  telas-cadastro.js   gerência: cadastrar caminhão e motorista (com login)


================================================================================
4. PERFIS E QUEM ENXERGA O QUÊ
================================================================================

  gerencia     tudo: custo, receita, cadastro, aprovação
  conferente   pendências, despesas (aprova), jornadas, recebimentos
  mecanico     oficina, caminhões
  motorista    SÓ o dele: meu dia, jornada, relatório, gastos, CNH, avisos

REGRA INVIOLÁVEL: motorista NÃO vê custo da frota, resultado da empresa, nem
valor de despesa de outro motorista. Isso não é permissão de tela — está na RLS.

Testado com token real: motorista -> 2 veículos, 2 documentos, 0 despesas de
outros, custo devolve []. Gerência -> tudo.


================================================================================
5. BANCO: DECISÕES QUE PARECEM ESTRANHAS E NÃO SÃO
================================================================================

VIEWS COM `security_invoker = true` — OBRIGATÓRIO
  Sem isso, a view roda com os privilégios de quem a criou e IGNORA a RLS.
  Resultado real que aconteceu: um visitante SEM LOGIN lia o custo da frota
  (R$ 3.754,56). Isso já voltou por acidente uma vez, ao recriar uma view.
  >>> Se você criar ou recriar QUALQUER view, ponha security_invoker = true. <<<
  Confira depois com o advisor de segurança do Supabase.

CUSTO NÃO É LIDO DIRETO DA VIEW PELO APP
  O app chama sb.rpc('custo_frota'). A função checa o perfil e devolve vazio
  para quem não é gerência/conferente.
  Motivo: com security_invoker, o motorista "via" a linha da view com total 0.
  Zero é pior que erro — parece que o caminhão não custou nada.

REGRA DE NEGÓCIO DO CUSTO
  - Despesa com status 'reprovada' NÃO entra no custo.
  - Despesa 'aguardando' ENTRA (é dinheiro que já saiu do bolso).
  - R$/km da frota divide SÓ pela soma dos km dos veículos COM km. Veículo sem
    km fica fora do divisor e recebe aviso âmbar. Não atribua o custo de um
    caminhão parado ao km de outro.
  - Manutenção é classificada por regex de categoria (pneu, peça, óleo,
    oficina, freio, suspensão, elétrica...). Veja vw_custo_veiculo.

FILA DE CARREGAMENTO
  jornada_carregamentos tem chegada_em e saida_em. A fila média só considera
  carregamento COM saída. Usar coalesce(saida_em, now()) gera "221 horas de
  fila" para sempre — foi um bug real. Carregamento aberto é `na_fila_agora`
  (alerta), nunca média.

UMA JORNADA ABERTA POR MOTORISTA — TRAVA NO BANCO
  Trigger tg_uma_jornada_aberta. A tela pode falhar; o banco não.
  Caminhão com jornada em 'aberta' OU 'conferencia' fica bloqueado para uma
  nova jornada (o km ainda não está apurado).

KM INICIAL É TRAVADO
  Vem do km_final da última jornada, via trigger tg_sincroniza_km que copia
  para veiculos.km_atual. Nunca é digitado.
  Motivo: se o motorista digitar, um dia digita a mais e o R$/km do caminhão
  fica errado para sempre — sem ninguém perceber.
  CHECK no banco: ck_km_final_maior (km_final >= km_inicial).

STATUS E CICLOS
  jornada_st:      aberta -> conferencia -> fechada | cancelada
  despesa_st:      aguardando -> aprovada -> reembolsada | reprovada
  recebimentos:    extraido -> confirmado
  O ciclo do reembolso foi FECHADO aqui (o app antigo parava em "aprovada" e o
  motorista nunca via "recebi"). despesas.reembolsada_em guarda a data.

TABELAS PRINCIPAIS
  usuarios, motoristas, veiculos, veiculo_motorista
  jornadas, jornada_carregamentos
  abastecimentos, despesas, multas, ordens_servico, avisos
  veiculos_documentos (CRLV-e), motoristas_documentos (CNH)
  recebimentos, recebimentos_lotes, pedagios, trocas_oleo
  tipos_despesa

VIEWS
  vw_custo_veiculo            custo por caminhão, R$/km, km/L, fila
  vw_excecoes                 fila única de pendências (causa -> dono)
  vw_motorista_relatorio      médias e reembolso por motorista/mês
  vw_conferencia_pedagio      pedágio declarado x extrato do cartão
  vw_conferencia_descarga     descarga declarada x lançada pelo motorista


================================================================================
6. STORAGE
================================================================================

Bucket `documentos` — PRIVADO. Nunca torne público.
  veiculos/<id>/crlv-2026.pdf          CRLV dos caminhões
  motoristas/<id>/cnh-*.pdf            CNH dos motoristas
  comprovantes/<uid>/...               comprovante de gasto/abastecimento
  recebimentos/...                     foto do resumo de frete

Abrir sempre por URL assinada (createSignedUrl, 300 s). O CRLV tem chassi,
RENAVAM e nome do proprietário — link público é vazamento de dado pessoal.

Policy de escrita: o motorista só escreve em comprovantes/<seu-uid>/.
Documento de veículo e de motorista: só gerência/conferente escreve.


================================================================================
7. O QUE JÁ ESTÁ PRONTO
================================================================================

GERÊNCIA
  Início (custo + exceções com dono) · Pendências · Despesas (aprovar,
  reprovar com motivo, marcar pago) · Lançar gasto manual · Jornadas ·
  Recebimentos (foto do resumo) · Pedágio (importar PDF + conferência) ·
  Custo por caminhão · Cadastro (caminhão e motorista com login) ·
  Caminhões · Motoristas

MOTORISTA
  Meu dia (caminhão + CRLV + alerta de CNH 30 dias) · Jornada (iniciar,
  combustível, gasto com foto, finalizar) · Relatório (médias, a receber) ·
  Gastos · CNH (abrir/baixar/atualizar) · Avisos

MECÂNICO
  Oficina (avisos, troca de óleo, OS) · Caminhões

IMPORTADOR DE PEDÁGIO
  scripts/importar_pedagio.py lê o PDF do cartão (CGMP) e devolve JSON.
  TESTADO nos dois arquivos reais: 26 passagens/R$ 457,35 e 24/R$ 442,45,
  os dois fechando no centavo com o total impresso no PDF.
  Pegadinha do PDF: quando a praça é longa, o pdftotext joga o começo dela
  numa linha ANTES da linha de valor e o fim DEPOIS. Parser ingênuo embaralha.


================================================================================
8. O QUE FALTA — COM PRIORIDADE
================================================================================

1) LEITURA AUTOMÁTICA DA FOTO DO RESUMO (pedido explícito do dono)
   Hoje: a foto é anexada ao lote como prova e as linhas são lançadas e
   confirmadas pela gerência.
   Falta: um modelo de visão que leia a imagem e preencha as linhas.
   O ambiente onde o app foi construído NÃO tinha chave de IA — nada foi
   inventado. A estrutura (lote + linhas + status 'extraido') já está pronta:
   quando houver chave, basta preencher as linhas e o resto do fluxo não muda.
   >>> Não faça o app parecer que lê a imagem se não lê. <<<

2) FUNCIONAMENTO OFFLINE (importante de verdade)
   O motorista fica no pátio do embarcador, sem sinal. Hoje, tocar em
   "Iniciar jornada" sem internet dá erro.
   O app antigo resolvia com fila local (localStorage, foto em base64) e
   enviava quando voltava. É a próxima entrega de peso.

3) FOTO DO ODÔMETRO no início e no fim da jornada
   Hoje o km final é digitado e só a gerência corrige. Uma foto resolve
   disputa de km por quase nada.

4) PUBLICAÇÃO
   O app nunca foi publicado. Só rodou local. É o passo mais óbvio.

5) MENORES
   - km inicial editável pelo motorista COM justificativa e aprovação
   - tela de OS de oficina (o mecânico hoje só vê, não abre OS)
   - relatório por período (o custo hoje é acumulado desde o início)


================================================================================
9. ARMADILHAS JÁ PAGAS (não pague de novo)
================================================================================

POSTGRES / SUPABASE
- View sem security_invoker = vazamento de custo para anon. Já aconteceu 2x.
- Supabase NÃO dá GRANT automático em tabela criada por SQL. Sem GRANT a RLS
  barra com "relation does not exist" — mensagem enganosa.
- Inserir em auth.users por SQL deixa colunas de token NULL e o GoTrue devolve
  "500 Database error querying schema" no login. Use coalesce(coluna,'').
  Sintoma: a pessoa NÃO consegue entrar e não é senha errada.
- Não dá para inserir coluna no meio de uma view existente. Use drop + create.
- `grant ... on all views` é sintaxe inválida: views contam como tables.
- Locale do Postgres no Supabase é en_US: to_char com L/G devolve formato
  americano. Formate no cliente (helpers do app.js).

AO TESTAR
- Simular perfil: set local role authenticated;
  set local request.jwt.claim.sub = '<uuid-do-usuario>';
- Para testar login de verdade, gerar senha temporária com
  extensions.crypt('senha', extensions.gen_salt('bf',10)) e RESTAURAR o hash
  original depois. Confirme que a senha de teste morreu.
- RLS esconde dado de teste: se um select vier vazio, pode ser permissão, não
  ausência de dado. Confira com a sessão do perfil dono do registro.

DESIGN / UX
- A exceção é o produto: a tela inicial lidera com pendências e o DONO de cada
  uma, não com KPIs de volume.
- Aprovar tem que ser UM toque, com valor e comprovante à vista.
- Número solto não diz nada; mostre a comparação com o mês anterior.
- Foto obrigatória em gasto do motorista: sem papel a conferência reprova e o
  dinheiro dele trava. Exigir na hora é melhor que reprovar depois.
- Antiduplo toque: 8 s de bloqueio no mesmo valor. Caso real: dois lançamentos
  idênticos em 227 ms.
- Autocorreção de decimal com AVISO: caso real de 77.261 virando 77 mil litros
  num tanque de 150 L. Corrigir calado é pior que não corrigir.


================================================================================
10. COMO TESTAR SEM TOCAR NO BANCO REAL
================================================================================

Existe um preview que monta uma página única com dados em memória:
  work/transp2/preview.py
  - Lê work/transp2/dados_reais.json
  - URL aceita ?tela=<rota>&perfil=gerencia|motorista|mecanico|conferente
  - O objeto `sb` é falso, encadeável (select/insert/update/eq/neq/not/in/
    order/limit/single) e grava em memória
  - Permite testar aprovação e fluxo de ponta a ponta sem tocar no banco

FONTE DE VERDADE É work/transp2/, NÃO artifacts/.
O preview lê de work/. Se você editar só a cópia em artifacts/, vai achar que
o código não funciona. Edite em work/ e copie para artifacts/ no fim.


================================================================================
11. ESTADO ATUAL DO BANCO (23/11/2026)
================================================================================

ZERADO por pedido do dono. Começando do zero.
  usuarios 6 · motoristas 3 · veiculos 2
  veiculos_documentos 2 (CRLV) · motoristas_documentos 2 (CNH)
  jornadas 0 · abastecimentos 0 · despesas 0 · recebimentos 0 · pedagios 0

Ou seja: cadastro pronto para o app funcionar; operação vazia para começar
a lançar de verdade.

PENDÊNCIA DE DADO REAL: os dois caminhões estão sem `ultima_troca_oleo_km`.
Sem esse número o alerta de troca de óleo NUNCA dispara, e a view fica muda
parecendo que está tudo em dia. O intervalo já está confirmado em 40.000 km.
Preencher em Cadastro -> editar caminhão.


================================================================================
12. O QUE O DONO PEDIU E AINDA NÃO FOI FEITO, EM UMA LINHA
================================================================================

"Jogar uma foto e a IA preencher sozinha e eu só aprovar."
  -> falta chave de modelo de visão. Estrutura pronta, leitura não.

Todo o resto do que ele pediu está implementado e testado com dado real.
================================================================================


================================================================================
13. CAMADA ANALÍTICA — ECharts, drill-down e cross-filtering (23/11/2026)
================================================================================

O QUE MUDOU
As cinco telas analíticas da gerência (Início, Despesas, Recebimentos, Pedágio,
Custo) ganharam gráfico interativo em 3 níveis, filtro cruzado e rastreabilidade.
O motor é UM arquivo: `assets/js/analytics-engine.js`. As telas só o consomem.

ARQUIVOS
  assets/js/analytics-engine.js   motor (não tem regra de negócio de tela)
  assets/vendor/echarts.min.js    cópia local (ver fallback abaixo)
  assets/css/app.css              classe .grafico, .breadcrumb, .chip, .drawer

CARREGAMENTO DO ECHARTS — tem fallback, e isso é de propósito
  No index.html:
      <script src="CDN/echarts..."></script>
      <script>window.echarts || document.write('<script src="assets/vendor/echarts.min.js"><\/script>');</script>
  Motivo: o motorista fica no pátio do embarcador SEM SINAL. CDN só deixaria o
  app com gráfico quando há internet. O vendor local cobre o offline.
  Se até o local faltar, `Analytics.temEcharts()` devolve false e as telas
  mostram "Gráfico indisponível — os números acima continuam corretos".
  >>> NUNCA remova essa degradação. Nenhuma tela pode quebrar por falta do gráfico. <<<

AS TRÊS REGRAS DO HANDOFF QUE O MOTOR RESPEITA
  1. CUSTO NUNCA é lido da view pelo gráfico. A tela continua chamando
     rpc('custo_frota') e o gráfico monta os fatos das TABELAS base
     (abastecimentos, despesas, ordens_servico). O total da RPC é a REFERÊNCIA.
  2. Data pura não passa por new Date(). O motor tem `diaISO()` com o mesmo
     cuidado do dataBR(); `chavePeriodo()` usa componentes locais.
  3. Anti-duplo-toque e debounce das telas não foram tocados. O motor só LÊ.

CONFERÊNCIA CONTRA A RPC (importante)
  Na tela de Custo, sem filtro ativo, o motor soma os fatos e compara com o
  total da rpc('custo_frota'). Se divergir, aparece um aviso âmbar em vez do
  incentivo ao clique. Número que não fecha é informação, não estética.
  Isso JÁ PEGOU um erro real de dados de demonstração durante o desenvolvimento.

OS TRÊS NÍVEIS
  Nível 1 (macro)     barras por período (dia/semana/mês/tudo), markLine da
                      média, tooltip com valor + variação % vs período anterior
                      + quantidade + top 3 placas.
  Nível 2 (dimensão)  clique numa barra -> por Placa -> clique numa placa
                      filtra e desce para Categoria.
                      Breadcrumb clicável: Visão geral › Caminhão › Categoria.
  Nível 3 (origem)    clique numa categoria -> drawer (PC) / bottom sheet
                      (mobile) com TODOS os registros que somam o valor:
                      data, placa, motorista/autor, origem, detalhe, valor,
                      e o totalizador. Se a soma não bater com o gráfico,
                      aparece o alerta de divergência no topo do drawer.

ESTADO REATIVO
  `Analytics.state` = { periodo, placa, motorista, nivel, dimensao }
  Cada tela chama `state.reset()` no início do render — senão o filtro de uma
  tela vazaria para a outra.
  Chips de filtro ativo + "Limpar filtros" são desenhados por renderChips().

COMO ESTENDER PARA UMA TELA NOVA (receita)
  1. No render, depois de buscar os dados crus:
        const st = Analytics.state; st.reset();
  2. Monte os fatos com um dos conversores (fatosDeDespesas, fatosDeRecebimentos,
     fatosDePedagios, fatosDeAbastecimentos, fatosDeOrdens). Fato =
        { id, data, valor, placa, motorista, categoria, origem, detalhe, status }
  3. No HTML, os containers: #seg-periodo-X, #chips-X, #bc-X, #gr-X, #gr-X-nota
  4. Uma função `desenhar()` que: filtra (filtrarFatos), atualiza KPIs,
     desenha breadcrumb + chips + gráfico conforme st.nivel, e no último nível
     chama Analytics.abrirOrigem({fatos, totalEsperado}).
  5. Analytics.seletorPeriodo('seg-periodo-X', st, desenhar); desenhar();

ARMADILHAS QUE APARECERAM AQUI
- ECharts injetado INLINE (dentro de <script>texto</script>) NÃO expõe
  window.echarts — o IIFE dele não roda nesse contexto. Tem que ser por
  <script src>. Foi o que me custou 3 tentativas.
- `echarts.setOption(opcoes, true)` com notMerge: sem o `true`, série antiga
  fica vazando ao trocar de nível e o gráfico mostra dado do nível anterior.
- Gráfico em container com display:none nasce com largura 0 e fica invisível.
  Por isso o container é escondido/mostrado ANTES de chamar o gráfico.
- Resize: o motor escuta window.resize com debounce de 140 ms; ao trocar de
  tela, `limparGraficos()` descarta instâncias de containers que saíram.

TESTADO
- 5 telas com dados: gráfico renderiza, drill-down desce os 3 níveis,
  breadcrumb volta, chips filtram, drawer abre com os registros.
- Consistência: fatos = origem = soma dos grupos (R$ 1.068,00 / 5 registros).
- Banco vazio: "Nenhum dado no período", sem canvas, ZERO erro no console.
- Outros perfis: motorista (4 telas), mecânico (2) e conferente (2) carregam
  sem erro — nenhum foi tocado.


================================================================================
14. DIAGNÓSTICO OPERACIONAL — Custo e Início (23/11/2026)
================================================================================

O QUE MUDOU
Tela 06 (Custo) e o card de resumo da 01 (Início) passaram de "quanto gastei"
para "qual caminhão está fora do padrão e por causa de quê".

1) MÉTRICA ALTERNÁVEL (segmented no topo)
   [ Valor Total (R$) ] | [ Custo por KM (R$/km) ] | [ % da Receita ]
   - `Analytics.state.metrica` = valor | rkm | receita
   - `Analytics.seletorMetrica(containerId, state, aoMudar, disponiveis)`
   - `Analytics.valorDaMetrica(base, fatos, placa, metrica)` devolve null
     quando NÃO há base (sem km, sem receita) — e a tela avisa em vez de
     mostrar número inventado. Nunca divida por zero para "ter um gráfico".
   - `Analytics.fmtMetrica(v, metrica)` formata conforme a métrica.
   - A opção "% da Receita" só aparece quando existe recebimento lançado.
   - Ao trocar a métrica, o gráfico é atualizado com `setOption(op, false)`
     (merge), para o ECharts INTERPOLAR em vez de piscar. Ao trocar de nível,
     usa `(op, true)` porque a estrutura muda.
     >>> montarGrafico(id, opcoes, {merge:true}) = interpola; sem merge = limpa.

2) RANKING DE OUTLIERS
   Barras horizontais ordenadas (maior custo no topo) + markLine vertical da
   média da frota. Caminhão >15% acima da média fica VERMELHO e ganha badge.
   O "vilão" não é chute: comparo a PARTICIPAÇÃO de cada categoria no gasto
   do caminhão com a participação dela na frota e aponto a que mais excede
   (só se exceder mais de 3 pontos percentuais; senão digo "sem vilão claro").
   `Analytics.diagnosticoPorCaminhao(base, grupos, metrica)`
   `Analytics.graficoRankingCaminhoes(containerId, diag, {metrica,onDrill})`

3) COMPOSIÇÃO EMPILHADA
   Barra empilhada por placa com 4 grupos: Combustível, Pedágio,
   Manutenção/Oficina, Despesas de Viagem.
   `Analytics.graficoComposicao(containerId, fatosOuBase, {onSegmento})`
   Clicar num segmento abre a gaveta filtrada em PLACA + CATEGORIA.
   `Analytics.fatosDoSegmento(base, placa, grupo)` devolve essa interseção
   (pedágio soma `pedagio` declarado + `pedagio_extrato`).

REGRA NOVA, IMPORTANTE
   A classificação de manutenção no JS tinha uma regex DIFERENTE da
   `vw_custo_veiculo` do banco (faltavam `mecânic`, `borrachari`, `lubrific`).
   Isso fazia o gráfico e a RPC discordarem sobre o mesmo custo.
   >>> A regex de `fatosDeDespesas()` tem que ser IDÊNTICA à da view.
   >>> Se mudar uma, mude a outra. Já aconteceu de divergir.

VALIDAÇÃO FEITA (requisito de entrega)
   - 12 scripts no index.html, todos 200 (zero 404), incluindo o vendor.
   - Gráficos redimensionam corretamente: 900px no desktop, 360px no mobile.
   - Testado com outlier injetado (R$ 6.500 de oficina no UQU4A94):
     barra vermelha, +46%, badge "Manutenção +9 pontos acima da média",
     e a conferência contra a RPC acusou a diferença — funcionando como deve.
   - Sem dados: "Nenhum dado no período", sem canvas, zero erro no console.


================================================================================
15. REDESIGN UI/UX + 6 MELHORIAS OPERACIONAIS (23/11/2026)
================================================================================

## DESIGN SYSTEM NOVO

- **Tipografia**: `Plus Jakarta Sans` (interface) + `JetBrains Mono` (números,
  com `font-variant-numeric: tabular-nums`). Carregadas via Google Fonts; se
  falhar, cai no system-ui.
- **Ícones**: Lucide via CDN, com **fallback SVG embutido** em `ICONES_SVG`
  (app.js). O motorista fica sem sinal no pátio — ícone não pode sumir offline.
  Helper: `icon('truck')` devolve o HTML. `aplicaIcones()` preenche os
  `<span data-icon="...">` e `desenhaIcones()` roda o Lucide quando disponível.
- **Tema**: `html[data-theme="light|dark"]`. `iniciaTema()` lê localStorage,
  cai na preferência do sistema, senão escuro. `alternaTema()` no botão.
  **`Analytics.aoTrocarTema()`** reaplica a camada de estilo dos gráficos
  vivos, para eixo/tooltip não ficarem ilegíveis na troca.
- **Paleta escura**: Obsidian Slate (`--bg:#090B0F`) com Electric Cobalt
  (`--brand:#2563EB`). Tema claro: `--bg:#F6F8FB`, texto `#0F172A`.

### Layout
- **Desktop ≥960px**: `<aside id="sidebar">` fixa de 252px com a marca
  "Casagrande Frota", card do usuário, navegação **agrupada** (Operação,
  Financeiro, Frota) e botão Sair. `<main>` vai a `max-width:1320px` com grids
  `auto-fit minmax(320px,1fr)`. A bottom nav `#tab` é escondida.
- **Mobile <960px**: bottom nav com **no máximo 5 itens + botão "Mais"**, que
  abre um bottom sheet com o resto. Antes eram 11 abas espremidas em 390px.
- **Navegação por perfil** vive em `ABAS_POR_PERFIL` (app.js), não mais em
  `TELAS.abas` (que agora devolve `[]` por compatibilidade).

### ARMADILHA QUE CUSTOU TEMPO
  `#app` e `.conteudo` precisam de **`width:100%;min-width:0` explícitos nos
  DOIS breakpoints**. Num container flex, sem isso o conteúdo colapsa e a tela
  fica inutilizável. Foi bug real nesta entrega.
  >>> Se mexer no layout, teste a largura em 390px E em 1440px. <<<

  Também: o **Lightpanda** (engine do agent-browser) calcula `width:100%` como
  alguns pixels. Se a largura parecer quebrada, confirme no **Chrome** antes de
  sair caçando bug no CSS — foi o que aconteceu aqui.

## SQL — COMO RODAR

Arquivo: `supabase/migracao_melhorias_operacionais.sql` (idempotente, pode rodar
mais de uma vez). No Supabase: **SQL Editor → colar tudo → Run**.

Cria:
1. **`jornada_checklists`** — checklist de saída/chegada. Trigger
   `tg_checklist_gera_aviso`: se `tem_problema = true`, insere automaticamente
   um registro em `avisos` (categoria `Checklist saida|chegada`), que aparece
   na Oficina e em `vw_excecoes`. O aviso é do BANCO, não do app — app pode
   falhar no meio, banco não.
2. **`relatorio_frota_periodo(p_inicio, p_fim)`** — fechamento líquido por
   caminhão: receita confirmada, combustível, manutenção (mesma regex da
   `vw_custo_veiculo`), multas, despesas, pedágio do extrato, custo total,
   margem R$ e %, km rodado, R$/km e km/L. `security definer` com checagem de
   perfil: **motorista e mecânico recebem vazio**.
3. **`vw_auditoria_pedagio_jornada`** (`security_invoker = true`) — classifica
   cada passagem como `ok`, `fora_de_jornada` ou `veiculo_em_oficina`, com
   tolerância de 30 min nas bordas da jornada.

Testado num Postgres local com dados reais: o fechamento calculou
(receita 3.000 − custo 2.191,14 = margem 808,86 / 27%), a auditoria marcou a
passagem fora de jornada, e o trigger gerou o aviso
"Checklist de saida apontou problema em: luzes, pneus".

**PENDÊNCIA DE DADO:** os dois caminhões seguem sem `ultima_troca_oleo_km`.
Sem esse número o semáforo de óleo mostra "configurar" — é proposital, não
inventa verde.

## AS 6 MELHORIAS

Arquivo central: `assets/js/melhorias.js` (expõe `window.Melhorias`).

**M1 — Offline (`assets/js/offline-sync.js`)**
Fila persistente em IndexedDB (fallback localStorage), exposta como
`OfflineSync.enfileira(op)`. Sobe em **ordem cronológica** (senão a despesa
chega antes da jornada e a FK quebra), foto vai como Blob, 3 tentativas por
item, banner no topo com contagem e "Sincronizar agora".
Ligado em: iniciar jornada, abastecimento, despesa. **Só motorista** — gerência
trabalha com rede; fila para ela esconderia erro de gravação.

**M2 — Checklist (15s)**
`Melhorias.abreChecklist({tipo, placa})` → Promise com `{itens, temProblema,
observacao}`. 6 itens, toque OK/Problema. Marcar problema exige observação e
dispara o trigger do banco → aviso na Oficina. Chamado antes de iniciar a
jornada e na finalização (chegada). Se o motorista cancelar, a finalização
continua — travar isso deixaria ele preso.

**M3 — Rendimento km/L**
`rendimentoPorPlaca()` calcula entre abastecimentos **consecutivos**, ignorando
os `parcial` (parcial não fecha ciclo: dividir por litros incompletos dá km/L
errado para baixo e o motorista leva culpa indevida). `seloRendimento()` marca
queda >12% (vermelho) e >5% (âmbar) contra a média histórica da placa.

**M4 — Semáforo preventivo**
`semaforoOleo(v)` e `semaforoDoc(rotulo, vencimento)` → barra de progresso com
cor (verde >20%, âmbar ≤20% ou ≤30 dias, vermelho vencido). Aplicado em:
Custo (cartão do caminhão), Caminhões (óleo + CRLV), Motoristas (CNH).
**Sem dado, mostra "configurar"** — nunca um verde falso.

**M5 — Auditoria pedágio × jornada**
`renderAuditoriaPedagio(id)` na tela de Pedágio. Lista passagens suspeitas com
valor e soma, destaca em vermelho. Se a view não existir, avisa para rodar o
SQL em vez de quebrar.

**M6 — Fechamento líquido**
`renderFechamentoLiquido(id)` na tela de Custo. Receita confirmada − custos =
resultado e margem, por caminhão e total. Sem recebimento confirmado, avisa que
a margem não pode ser calculada.

## ORDEM DOS SCRIPTS NO index.html
```
supabase → echarts (+ fallback) → lucide → app.js → offline-sync.js
→ analytics-engine.js → telas.js → telas-operacao.js → telas-despesa.js
→ telas-motorista.js → telas-motorista2.js → telas-jornada-mot.js
→ telas-recebimento.js → telas-pedagio.js → melhorias.js → telas-cadastro.js
```
`melhorias.js` vem ANTES das telas que o usam em tempo de execução (as chamadas
acontecem dentro de `render`, não no parse — mas manter a ordem evita surpresa).

## VALIDAÇÃO FEITA
- Todos os recursos servidos com HTTP 200, zero 404.
- Desktop 1440×900 (Chrome): app 1280px, main 1028px, sidebar flex, 11 itens.
- Mobile 390×844 (Chrome): sidebar `none`, bottom nav `flex` com 5 + Mais,
  main 390px.
- Gráficos ECharts seguem funcionando (3 canvas na tela de Custo), drill-down e
  gaveta preservados.
- Tema claro/escuro alterna e persiste; gráfico sobrevive à troca.
- Zero erro de console nas telas testadas.
