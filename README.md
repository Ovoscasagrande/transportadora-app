# TRANSPORTADORA CASAGRANDE · app

App de controle de frota. **Não é TMS.**

## O que este app é

Uma transportadora com **um cliente fixo**: carrega sempre no mesmo embarcador.
Quem vai receber a carga é o cliente do embarcador, e só se sabe quando o caminhão
chega para carregar. O embarcador controla a carga; **nós controlamos o caminhão**.

Por isso não existe frete, cotação, tabela de preço, CT-e, MDF-e ou romaneio como
núcleo. O que existe:

| Domínio | O que controla |
|---|---|
| Caminhão | placa, odômetro, CRLV-e, troca de óleo, ativo/inativo |
| Motorista | CNH, categoria, validade, contato |
| Jornada | saída, retorno, km, ocorrência |
| Carregamento | cada vez que carrega no embarcador — fila e tempo |
| Combustível | litros, R$/L, odômetro, comprovante |
| Despesa | categoria, valor, aprovação, comprovante |
| Oficina | OS, diagnóstico, peças, mão de obra |
| Documento | CRLV-e com vencimento |

E, acima de tudo: **custo por caminhão e R$/km.**

## Estrutura

```
index.html
assets/css/app.css        design system
assets/js/app.js          núcleo: config, utils, navegação, login
assets/js/telas.js        início, pendências, custo
assets/js/telas-operacao.js  jornada, veículo, motorista, abas
assets/js/telas-despesa.js   despesa: aprovar, reprovar, comprovante
assets/js/telas-motorista.js meu dia + CRLV, gastos, avisos; oficina do mecânico
assets/js/telas-motorista2.js relatório do motorista, CNH (abrir/baixar/atualizar)
assets/js/telas-cadastro.js  gerência: cadastrar caminhão e motorista (com login)
assets/js/telas-jornada-mot.js fluxo do motorista: iniciar → lançar gasto → finalizar
assets/js/telas-recebimento.js receita: foto do resumo, lançamento, confirmação
assets/js/telas-pedagio.js   importação do extrato + conferência; gasto manual
scripts/importar_pedagio.py  lê o PDF de pedágio (CGMP) -> JSON
supabase/schema.sql       banco do zero
```

## Colocar no ar

### 1. Banco (Supabase novo)

Rode `supabase/schema.sql` no SQL Editor do projeto novo. Ele cria:

- as tabelas (`veiculos`, `motoristas`, `jornadas`, `jornada_carregamentos`,
  `abastecimentos`, `despesas`, `multas`, `ordens_servico`, `avisos`,
  `veiculos_documentos`, `trocas_oleo`, `usuarios`, `notificacoes`, `auditoria`);
- duas views que o app consulta direto:
  - `vw_custo_veiculo` — custo por caminhão, R$/km, km/L, fila média
  - `vw_excecoes` — uma fila só de pendências, agrupada por causa e dono
- RLS por perfil (gerência, conferente, motorista, mecânico)
- tipos de despesa já semeados

**Não existe coluna `empresa`.** O app é de uma empresa só — é a razão da separação.

### 2. Ligar o app — JÁ LIGADO ✅

```js
const CONFIG = {
  supabaseUrl: 'https://pupcqyhdzfuczayeiqis.supabase.co',
  supabaseKey: 'sb_publishable_0zBdcSHn2CCx0FMwNtPYeg_b5cAyarG'
};
```

Projeto: **TRANSPORTADORA CASAGRANDE** (`pupcqyhdzfuczayeiqis`, região us-east-1).
Schema aplicado, 2 views criadas, RLS testada, avisos de segurança do Supabase em zero.

### 3. Criar o primeiro usuário

1. Supabase → Authentication → Users → Add user (e-mail + senha)
2. Copie o UUID e rode:

```sql
insert into usuarios (id, nome, perfil)
values ('COLE-O-UUID', 'Francisco', 'gerencia');
```

Sem essa linha o login entra mas o app recusa: *"Seu usuário ainda não está
liberado"*. É proposital — nenhum usuário existe por acidente.

### 4. Publicar

Qualquer host estático serve (GitHub Pages, Cloudflare Pages, Vercel).
É HTML/CSS/JS puro, sem build.

## Decisões que valem saber

**Custo por km não divide pelo km de outro caminhão.** Se um caminhão gastou e não
tem km apurado, o custo aparece no card dele mas fica fora do divisor do R$/km da
frota. Um número honesto com aviso é melhor que um número bonito e errado.

**Despesa reprovada não entra no custo.** Aprovada e aguardando entram — aguardando
é dinheiro que já saiu do bolso.

**Manutenção é classificada por categoria.** Pneu, peça, óleo, oficina, freio,
suspensão e elétrica vão para manutenção, não para "despesas soltas". O regex está
em `vw_custo_veiculo`.

**Conferência não é auditoria.** Jornada fechada entra em `conferencia` e só sai
de lá quando alguém confere. Jornada parada em conferência há mais de 2 dias vira
exceção — é dinheiro sem número.

**Motorista não vê custo da frota.** Não é permissão, é foco: o app do motorista
mostra o dia dele, não o resultado da empresa.

## O que falta construir

- [x] tela de despesa com aprovação em um toque (gerência e conferente)
- [x] telas do motorista: meu dia + CRLV, relatório, gastos, CNH, avisos; oficina do mecânico
- [x] aba de cadastro da gerência (caminhão e motorista, criando o login junto)
- [x] CNH com alerta de 30 dias e atualização pelo próprio motorista
- [x] tela de abastecimento e gasto pelo motorista (com foto do comprovante)
- [ ] funcionamento offline no app do motorista
- [ ] upload de comprovante pelo motorista (Storage) — bucket `documentos` já existe;
      o CRLV dos 2 caminhões já está lá
- [ ] conferência da jornada item por item
- [ ] OS de oficina pela tela
- [ ] relatório por período (hoje o custo é acumulado desde o início)
- [ ] PWA (manifest + service worker)


## Documento do caminhão (CRLV) — 23/11/2026

O motorista abre o CRLV na tela **Meu dia**, no cartão do caminhão, antes de sair —
não num menu escondido. É o momento em que ele precisa do documento (blitz, fiscalização).

- **Bucket** `documentos` (privado; RLS: logado lê, gerência/conferente escreve).
- **Caminho** `veiculos/<id-do-veiculo>/crlv-2026.pdf`
- **Abertura** por URL assinada de 5 min (`createSignedUrl`) — o bucket não é público.
- **Vencimento** 31/12/2026 (exercício 2026, emitido em 25/06/2026 pelo DETRAN-SP).
- O app avisa em âmbar a partir de 45 dias do vencimento, e em vermelho se venceu.


## CNH e relatório do motorista — 23/11/2026

### CNH
- Tabela `motoristas_documentos` (tipo, arquivo_path, vencimento, categoria, numero).
  Antes o motorista era só número + data: não havia onde guardar o PDF nem histórico.
- Arquivos em `documentos/motoristas/<id>/cnh-*.pdf`, bucket privado, URL assinada.
- **Download**: `createSignedUrl` com `download`, para baixar com nome legível.
- **Atualização**: o próprio motorista envia o arquivo novo; ao enviar, o cadastro
  em `motoristas` é sincronizado (cnh, categoria, validade).
- **Alerta**: 30 dias antes o aviso aparece na tela *Meu dia* (vermelho), com atalho
  para atualizar. Antes de 30 ainda há faixa âmbar entre 31 e 90 dias.

### Relatório (`vw_motorista_relatorio`)
View por motorista/mês com `security_invoker = true` (a RLS vale).
Entrega: viagens, km, horas, km/viagem, km/hora, km/litro, preço médio do litro,
reembolso pendente/aprovado/reprovado e contagem de lançamentos.
O app compara com o mês anterior e mostra a seta de tendência.
**Nunca** inclui custo da frota — isso é do dono, não do motorista.

### RLS do motorista nas próprias coisas
Até 23/11 ele não conseguia ler as próprias despesas, abastecimentos nem avisos
(as policies eram só gerência/conferente) — a aba de gastos abria vazia.
Agora tem SELECT e INSERT do que é dele (`motorista_id = privado.meu_motorista()`).


## Fluxo do motorista: iniciar → lançar gasto → finalizar — 23/11/2026

Pedido do Francisco, inspirado no app da OVOS/CASA, mas sem roteiro:
"aqui só vai pegar o km inicial (deixe travado, com o KM que ele terminou a
última jornada), e incluir gastos com foto — combustível/pernoite/descarga".

### Tela `jornada-motorista`
Gira em torno de UM estado: **tem jornada aberta ou não**. Ao abrir, o motorista
sabe imediatamente o que fazer.

**Sem jornada aberta:** mostra "Última viagem terminou em 28.722 km" e esse é o
km inicial da próxima. **Não é editável** — é o que impede o buraco de km
(se ele digitar, um dia digita a mais e o R$/km do caminhão sai errado para
sempre). Escolhe o caminhão (o app sugere o de odômetro mais próximo) e inicia.

**Com jornada aberta:** mostra a placa, km da saída, hora, horas rodando e os
gastos da jornada com total. Dois botões:
- **Combustível** — litros, valor, odômetro, posto, tipo (S10/S500/ARLA) e foto.
  O preço/litro é calculado (valor ÷ litros), não digitado. Atualiza o odômetro
  do caminhão.
- **+ Gasto** — pernoite, descarga, alimentação, pedágio, lavagem, outro; valor,
  descrição e foto. Entra como `aguardando` aprovação.

**Finalizar** pede o km final. Travas:
- km final não pode ser menor que o da saída;
- km final igual ao inicial é recusado ("você não rodou?");
- salto acima de 1.500 km pede confirmação (dígito trocado é comum);
- ao fechar, a jornada vai para `conferencia` — quem aprova é a conferência.

### Foto obrigatória, de propósito
Sem comprovante a conferência não aprova, e o dinheiro do motorista fica parado.
Melhor exigir na hora do que reprovar depois. Vai para
`documentos/comprovantes/<uid-do-motorista>/...` — a policy só deixa ele escrever
na própria pasta.

### Travas no banco (não só na tela)
- `tg_uma_jornada_aberta`: **uma jornada aberta por motorista**, imposta por
  trigger. A tela pode falhar; o banco não.
- `ins_jornadas`: o motorista só cria jornada em nome próprio, e só `aberta`
  (antes o `WITH CHECK` era `true`, o que deixava criar jornada para outro).
- `mot_jornadas_upd`: o motorista só altera a própria jornada.
- `mot_veiculos_upd`: pode atualizar o odômetro ao fechar.


## O que o app OVOS ensinou (referência cruzada com o CASA — 23/11/2026)

O CASA foi ao código do app OVOS (cg-v181) e devolveu o fluxo real. Adotei cinco
coisas que eu não tinha e que já pegaram erro na operação dele:

| Trava do app OVOS | Situação aqui |
|---|---|
| `CHECK km_final >= km_inicial` **no banco** | ✅ `ck_km_final_maior` (antes só na tela) |
| Trigger copia `km_final` para `veiculos.km_atual` | ✅ `tg_sincroniza_km` (antes era update no cliente, podia ficar pela metade) |
| Caminhão em conferência fica 🔒 | ✅ bloqueado, com motivo na tela |
| Anti-duplicidade (2 lançamentos em <8s) | ✅ caso real: duplo toque do Leonardo, 227 ms |
| Autocorreção de decimal (77.261 → 77 mil L) | ✅ `corrigeDecimal`, com aviso do que corrigiu |
| Status `reembolsada` com data | ✅ **aqui vai além**: o OVOS tinha o status no banco e nunca usava |

### Reembolso fechado (buraco do app antigo)
O motorista do OVOS via "aprovada" e nunca "recebi" — o ciclo parava no meio.
Agora: **pendente → a receber → pago**, e a tela do motorista responde
"Ainda tenho a receber R$ X" com a quebra (aguardando / aprovado esperando
pagamento) e "✓ R$ Y já pago a você". A gerência marca pago de uma vez, com
confirmação digitada e data.

### Ainda em aberto (o CASA listou e eu concordo)
- **Foto do odômetro** no início e no fim da jornada. Hoje o km é digitado e só
  a gerência corrige. Uma foto resolveria disputa de km de forma barata.
- **Km inicial editável com justificativa** e aprovação, em vez de "peça à gerência".
- **Funcionamento offline** — o motorista no pátio do embarcador não tem sinal.


## Recebimentos e pedágio — 23/11/2026

Entra a **receita**. Até aqui o app só sabia custo.

### O modelo (lido da planilha CUSTO_CAMINHÕES_TEIXEIRA)
O pagador manda uma **foto de um resumo por dia**: um motorista, um dia,
várias linhas (uma por entrega). Colunas: MOTORISTA | DATA ENTREG |
MUNICIPIO | OBS | Valor do Frete | Pedagios | Descarga | Total Frete R$.
`total = frete + pedágio + descarga` — conferido nas 5 linhas do exemplo.

Por isso são duas tabelas: `recebimentos_lotes` (a foto) e `recebimentos`
(as linhas). Guardar só as linhas perderia o vínculo com a imagem, que é a
prova que a gerência confere quando desconfia de um valor.

### Sobre "a IA preenche sozinha"
**Não existe chave de modelo de visão neste ambiente**, e eu não vou mandar a
foto do Francisco para um serviço público sem ele pedir. Então o fluxo é:
1. a foto é anexada ao lote (fica como prova);
2. as linhas são lançadas e ficam em `extraido`, esperando confirmação;
3. a gerência confere e confirma.
Quando houver chave de visão, o passo 2 passa a vir preenchido — a estrutura
já está pronta e não muda.

### Pedágio
- Tabela `pedagios`: cada passagem do extrato (data/hora, placa, praça, valor).
- `scripts/importar_pedagio.py` lê o PDF do cartão (CGMP) → JSON.
  **Testado nos 2 arquivos reais: 26 passagens / R$ 457,35 e 24 / R$ 442,45 —
  os dois totais fechando no centavo com o total impresso no PDF.**
- Pegadinha real do PDF: quando a praça é longa, o `pdftotext` joga o começo
  dela numa linha solta ANTES da linha de valor. Parser ingênuo gera praça
  trocada. O script resolve isso e imprime a soma para conferir o PDF.

### Conferência cruzada (`vw_conferencia_pedagio`)
Declarado × extrato, por placa e dia: `confere`, `declarado a maior`,
`declarado a menor` ou `sem extrato`, com a diferença em reais.
Casamento por **placa normalizada** (não por veiculo_id), porque o extrato
pode chegar antes do cadastro do caminhão.
Testado: declarou R$ 500,00, extrato R$ 101,20 em 5 passagens →
"a maior, +R$ 398,80".

### Gasto manual (gerência)
`TELAS['gasto-manual']`: motorista, dia, caminhão, tipo, valor e **foto opcional**.
Entra já como `aprovada` — quem lançou foi a gerência, não o motorista pedindo
reembolso; deixar em `aguardando` faria a própria gerência aprovar o que digitou.
