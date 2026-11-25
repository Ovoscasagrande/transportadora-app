TRANSPORTADORA CASAGRANDE — app de controle de frota
=====================================================

O QUE É
App de controle de frota: um cliente fixo, dois caminhões. Não é TMS.
Controla caminhão, motorista, jornada, custo por km e a receita do embarcador.
A dor que originou tudo: "não sei quanto cada caminhão custa."

COMO ABRIR
    cd transportadora-app
    python3 -m http.server 8000
    # abra http://localhost:8000
HTML/CSS/JS puro, sem build. Banco e login já configurados em assets/js/app.js.

POR ONDE COMEÇAR
1. LEIA-PRIMEIRO-HANDOFF.md — o documento principal. Negócio, decisões e o
   porquê de cada uma, pendências e armadilhas já pagas.
   Seção 13 = camada analítica (gráficos). Seção 14 = diagnóstico operacional
   (métrica alternável, outliers, composição). Leia antes de mexer nelas.
2. telas/INDICE-DAS-TELAS.md — o que cada tela faz, com as capturas.
3. assets/js/app.js — núcleo.
4. assets/js/analytics-engine.js — motor dos gráficos.
5. README.md — manual técnico.

DIAGNÓSTICO OPERACIONAL (novo)
Tela Custo e card do Início mostram:
- Métrica alternável: Valor Total / Custo por KM / % da Receita.
- Ranking de caminhões ordenado, com linha da média da frota. Acima de 15%
  da média fica vermelho, com badge do "vilão" (a categoria que mais pesa
  acima do padrão da frota).
- Composição empilhada por placa: Combustível, Pedágio, Manutenção/Oficina,
  Despesas de Viagem. Clicar num segmento abre a gaveta filtrada em placa +
  categoria, com os registros que somam aquele valor.

PERFIS
gerencia (tudo) · conferente (aprova) · mecanico (oficina) ·
motorista (só o dele — nunca o custo da frota)

ESTADO DO BANCO
Zerado. Cadastro pronto (6 usuários, 3 motoristas, 2 caminhões, CRLV e CNH).
As capturas usam dados de demonstração: mostram layout, não o banco.

PENDÊNCIAS
1. Leitura automática da foto do resumo de frete — estrutura pronta, sem chave
   de modelo de visão no ambiente. Não simule que existe.
2. Funcionamento offline no app do motorista.
