-- ============================================================================
-- TRANSPORTADORA CASAGRANDE — schema do app (banco novo, do zero)
-- ============================================================================
-- Princípio: isto NÃO é um TMS. Não existe frete, cotação, CT-e, romaneio.
-- O negócio é: um embarcador fixo, caminhão carrega lá, destino só se sabe na
-- hora. Quem controla a carga é o embarcador. O app controla o CAMINHÃO:
-- km, combustível, despesa, manutenção, documento, disponibilidade e custo.
--
-- Sem coluna `empresa`: o app é de uma empresa só. Essa é a razão de existir
-- da separação. Qualquer `empresa`/`AMBAS`/`TODAS` no código é resquício.
-- ============================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "btree_gist" with schema extensions;  -- necessário para o EXCLUDE abaixo
set search_path = public, extensions;

-- enums --------------------------------------------------------------------
do $$ begin create type perfil_t as enum ('gerencia','conferente','motorista','mecanico'); exception when duplicate_object then null; end $$;
do $$ begin create type jornada_st as enum ('aberta','conferencia','fechada','cancelada'); exception when duplicate_object then null; end $$;
do $$ begin create type despesa_st as enum ('aguardando','aprovada','reprovada'); exception when duplicate_object then null; end $$;
do $$ begin create type os_st as enum ('recebida','em_analise','aguardando_peca','em_execucao','concluida'); exception when duplicate_object then null; end $$;
do $$ begin create type aviso_st as enum ('recebido','em_analise','encaminhado','resolvido'); exception when duplicate_object then null; end $$;
do $$ begin create type multa_st as enum ('aguardando_ciencia','em_recurso','paga','arquivada'); exception when duplicate_object then null; end $$;

-- 1. usuários --------------------------------------------------------------
create table if not exists usuarios (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  perfil      perfil_t not null default 'motorista',
  telefone    text,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- 2. motoristas ------------------------------------------------------------
create table if not exists motoristas (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid unique references usuarios(id) on delete set null,
  nome           text not null,
  cpf            text,
  cnh            text,
  cnh_categoria  text,
  cnh_validade   date,
  contato        text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now()
);

-- 3. veículos (só cavalo mecânico — a frota não puxa carreta nossa) --------
create table if not exists veiculos (
  id                     uuid primary key default gen_random_uuid(),
  placa                  text not null unique,
  renavam                text,
  marca                  text,
  modelo                 text,
  ano                    int,
  cor                    text,
  km_atual               numeric(12,1),          -- odômetro confiável
  intervalo_oleo_km      int,                    -- ex.: 40000
  ultima_troca_oleo_km   numeric(12,1),
  ultima_troca_oleo_data date,
  ativo                  boolean not null default true,
  criado_em              timestamptz not null default now()
);

-- quem dirige o quê
create table if not exists veiculo_motorista (
  motorista_id uuid not null references motoristas(id) on delete cascade,
  veiculo_id   uuid not null references veiculos(id) on delete cascade,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),
  primary key (motorista_id, veiculo_id)
);

-- 4. jornadas --------------------------------------------------------------
-- Uma jornada é um período com o caminhão. Pode conter VÁRIOS carregamentos
-- (o motorista volta ao embarcador e carrega de novo) — é o fluxo real.
create table if not exists jornadas (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_id          uuid not null references veiculos(id),
  motorista_id        uuid not null references motoristas(id),
  km_inicial          numeric(12,1) not null,
  km_final            numeric(12,1),
  inicio              timestamptz not null default now(),
  fim                 timestamptz,
  status              jornada_st not null default 'aberta',
  ocorrencias         text,
  motivo_cancelamento text,
  cancelada_por       uuid references usuarios(id),
  cancelada_em        timestamptz,
  conferida_por       uuid references usuarios(id),
  conferida_em        timestamptz,
  criado_em           timestamptz not null default now(),
  constraint km_ordem check (km_final is null or km_final >= km_inicial),
  constraint uma_aberta_por_veiculo exclude (veiculo_id with =) where (status = 'aberta')
);

-- 5. carregamentos ✅ o coração do modelo de negócio -----------------------
-- Cada vez que o caminhão carrega no embarcador. Não registra carga: registra
-- o EVENTO, para medir fila, tempo parado e quantas cargas couberam no dia.
create table if not exists jornada_carregamentos (
  id           uuid primary key default gen_random_uuid(),
  jornada_id   uuid not null references jornadas(id) on delete cascade,
  chegada_em   timestamptz not null default now(),   -- quando chegou na fila
  saida_em     timestamptz,                          -- quando saiu carregado
  observacao   text,
  criado_em    timestamptz not null default now()
);
create index if not exists ix_carreg_jornada on jornada_carregamentos(jornada_id);

-- 6. abastecimentos --------------------------------------------------------
create table if not exists abastecimentos (
  id           uuid primary key default gen_random_uuid(),
  jornada_id   uuid references jornadas(id) on delete set null,
  veiculo_id   uuid not null references veiculos(id),
  motorista_id uuid references motoristas(id),
  posto        text,
  combustivel  text default 'Diesel S10',
  litros       numeric(10,3) not null,
  preco_litro  numeric(10,3),
  valor_total  numeric(12,2) not null,
  km           numeric(12,1) not null,     -- odômetro na hora
  data         timestamptz not null default now(),
  foto_path    text,                        -- comprovante (obrigatório no app)
  parcial      boolean not null default false,
  criado_por   uuid references usuarios(id),
  criado_em    timestamptz not null default now()
);
create index if not exists ix_abast_veic_data on abastecimentos(veiculo_id, data);

-- 7. despesas --------------------------------------------------------------
create table if not exists tipos_despesa (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null unique,
  campos jsonb not null default '[]'::jsonb,   -- campos extras por tipo
  ativo  boolean not null default true
);

create table if not exists despesas (
  id                uuid primary key default gen_random_uuid(),
  jornada_id        uuid references jornadas(id) on delete set null,
  veiculo_id        uuid references veiculos(id),
  motorista_id      uuid references motoristas(id),
  categoria         text not null,
  descricao         text,
  valor             numeric(12,2) not null,
  data              timestamptz not null default now(),
  status            despesa_st not null default 'aguardando',
  motivo_reprovacao text,
  foto_path         text,
  extras            jsonb not null default '{}'::jsonb,
  criado_por        uuid references usuarios(id),
  aprovada_por      uuid references usuarios(id),
  aprovada_em       timestamptz,
  criado_em         timestamptz not null default now()
);
create index if not exists ix_desp_veic_data on despesas(veiculo_id, data);

-- 8. multas ----------------------------------------------------------------
create table if not exists multas (
  id                uuid primary key default gen_random_uuid(),
  veiculo_id        uuid not null references veiculos(id),
  motorista_id      uuid references motoristas(id),
  orgao             text,
  valor             numeric(12,2),
  data_infracao     date,
  prazo             date,
  status            multa_st not null default 'aguardando_ciencia',
  notificacao_path  text,
  obs               text,
  cadastrada_por    uuid references usuarios(id),
  criado_em         timestamptz not null default now()
);

-- 9. oficina ---------------------------------------------------------------
create table if not exists ordens_servico (
  id            uuid primary key default gen_random_uuid(),
  veiculo_id    uuid not null references veiculos(id),
  aviso_id      uuid,
  descricao     text not null,
  diagnostico   text,
  servico       text,
  pecas         text,
  mao_obra      numeric(12,2),
  custos        numeric(12,2),
  status        os_st not null default 'recebida',
  aberta_por    uuid references usuarios(id),
  aberta_em     timestamptz not null default now(),
  concluida_em  timestamptz
);

-- 10. avisos do motorista --------------------------------------------------
create table if not exists avisos (
  id           uuid primary key default gen_random_uuid(),
  veiculo_id   uuid not null references veiculos(id),
  motorista_id uuid references motoristas(id),
  categoria    text,
  texto        text not null,
  fotos        jsonb not null default '[]'::jsonb,
  status       aviso_st not null default 'recebido',
  criado_em    timestamptz not null default now()
);

-- 11. documentos do veículo (CRLV-e) ---------------------------------------
create table if not exists veiculos_documentos (
  id           uuid primary key default gen_random_uuid(),
  veiculo_id   uuid not null references veiculos(id) on delete cascade,
  tipo         text not null default 'CRLV-e',
  arquivo_path text not null,
  vencimento   date,
  enviado_por  uuid references usuarios(id),
  criado_em    timestamptz not null default now()
);

-- 12. trocas de óleo -------------------------------------------------------
create table if not exists trocas_oleo (
  id             uuid primary key default gen_random_uuid(),
  veiculo_id     uuid not null references veiculos(id) on delete cascade,
  km             numeric(12,1) not null,
  data           date not null default current_date,
  obs            text,
  registrado_por uuid references usuarios(id),
  criado_em      timestamptz not null default now()
);

-- 13. auditoria e notificações --------------------------------------------
create table if not exists auditoria (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios(id),
  acao       text not null,
  detalhe    jsonb not null default '{}'::jsonb,
  criado_em  timestamptz not null default now()
);

create table if not exists notificacoes (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  texto      text not null,
  link       text,
  lida       boolean not null default false,
  criado_em  timestamptz not null default now()
);

-- ============================================================================
-- VIEW: custo por caminhão (o número que o app existente nunca teve)
-- Sem "empresa". Recusada não entra. Manutenção classificada por categoria.
-- ============================================================================
create or replace view vw_custo_veiculo as
with comb as (
  select veiculo_id, sum(valor_total) v, sum(litros) l, count(*) n
  from abastecimentos group by veiculo_id
),
desp as (
  select veiculo_id,
    sum(case when categoria ~* 'pe[çc]a|pneu|manuten|borrachari|mec[aâ]nic|[óo]leo|oficina|revis[aã]o|lubrific|filtro|freio|suspens[aã]o|el[eé]tric' then valor else 0 end) manut,
    sum(case when categoria ~* 'pe[çc]a|pneu|manuten|borrachari|mec[aâ]nic|[óo]leo|oficina|revis[aã]o|lubrific|filtro|freio|suspens[aã]o|el[eé]tric' then 0 else valor end) outros
  from despesas where status <> 'reprovada' group by veiculo_id
),
mlt as (select veiculo_id, sum(coalesce(valor,0)) v, count(*) n from multas group by veiculo_id),
osv as (select veiculo_id, sum(coalesce(mao_obra,0)+coalesce(custos,0)) v, count(*) n from ordens_servico group by veiculo_id),
kmv as (
  select veiculo_id, sum(km_final - km_inicial) km, count(*) n
  from jornadas
  where km_final is not null and status <> 'cancelada'
  group by veiculo_id
),
fila as (
  select j.veiculo_id,
    avg(extract(epoch from (coalesce(c.saida_em, now()) - c.chegada_em))/3600) horas_media_fila,
    count(c.id) carregamentos
  from jornada_carregamentos c join jornadas j on j.id = c.jornada_id
  group by j.veiculo_id
)
select
  v.id veiculo_id, v.placa, v.marca, v.modelo, v.km_atual, v.ativo,
  coalesce(comb.v,0) combustivel,
  coalesce(desp.manut,0) + coalesce(osv.v,0) manutencao,
  coalesce(mlt.v,0) multas,
  coalesce(desp.outros,0) despesas,
  coalesce(comb.v,0)+coalesce(desp.manut,0)+coalesce(osv.v,0)+coalesce(mlt.v,0)+coalesce(desp.outros,0) total,
  coalesce(kmv.km,0) km,
  case when coalesce(kmv.km,0) > 0
       then round((coalesce(comb.v,0)+coalesce(desp.manut,0)+coalesce(osv.v,0)+coalesce(mlt.v,0)+coalesce(desp.outros,0)) / kmv.km, 3)
       else null end rkm,
  case when coalesce(comb.l,0) > 0 then round(kmv.km / comb.l, 2) else null end kml,
  coalesce(fila.carregamentos,0) carregamentos,
  round(coalesce(fila.horas_media_fila,0)::numeric, 2) horas_media_fila
from veiculos v
left join comb on comb.veiculo_id = v.id
left join desp on desp.veiculo_id = v.id
left join mlt  on mlt.veiculo_id  = v.id
left join osv  on osv.veiculo_id  = v.id
left join kmv  on kmv.veiculo_id  = v.id
left join fila on fila.veiculo_id = v.id;

-- ============================================================================
-- VIEW: exceções (uma fila só, por causa e por dono)
-- ============================================================================
create or replace view vw_excecoes as
select 'cnh_vencida' causa, m.id ref_id, m.nome::text titulo,
       'CNH venceu em '||to_char(m.cnh_validade,'DD/MM/YYYY') detalhe, 'gerencia' dono, 3 gravidade
  from motoristas m where m.ativo and m.cnh_validade < current_date
union all
select 'crlv_vencido', v.id, v.placa,
       'CRLV-e venceu em '||to_char(d.vencimento,'DD/MM/YYYY'), 'gerencia', 3
  from veiculos v join lateral (
    select vencimento from veiculos_documentos
    where veiculo_id=v.id and tipo='CRLV-e' order by criado_em desc limit 1) d on true
  where v.ativo and d.vencimento < current_date
union all
select 'crlv_faltando', v.id, v.placa, 'Veículo sem CRLV-e anexado', 'gerencia', 2
  from veiculos v
  where v.ativo and not exists (select 1 from veiculos_documentos d where d.veiculo_id=v.id and d.tipo='CRLV-e')
union all
select 'oleo_estourado', v.id, v.placa,
       'Passou '||to_char(v.km_atual-(v.ultima_troca_oleo_km+v.intervalo_oleo_km),'FM999G999')||' km da troca', 'mecanico', 2
  from veiculos v
  where v.ativo and v.intervalo_oleo_km is not null and v.ultima_troca_oleo_km is not null and v.km_atual is not null
    and v.km_atual >= v.ultima_troca_oleo_km + v.intervalo_oleo_km
union all
select 'multa_sem_ciencia', m.id, v.placa,
       'Multa de '||to_char(coalesce(m.valor,0),'L9G999G990D99')||' sem ciência', 'gerencia', 2
  from multas m join veiculos v on v.id=m.veiculo_id where m.status='aguardando_ciencia'
union all
select 'despesa_pendente', d.id, coalesce(v.placa,'—'),
       d.categoria||' de '||to_char(d.valor,'L9G999G990D99')||' aguardando aprovação', 'conferente', 1
  from despesas d left join veiculos v on v.id=d.veiculo_id where d.status='aguardando'
union all
select 'os_aberta', o.id, v.placa, 'OS aberta: '||left(o.descricao,60), 'mecanico', 1
  from ordens_servico o join veiculos v on v.id=o.veiculo_id where o.status <> 'concluida'
union all
select 'jornada_parada', j.id, v.placa,
       'Em conferência desde '||to_char(j.fim,'DD/MM HH24:MI'), 'conferente', 1
  from jornadas j join veiculos v on v.id=j.veiculo_id
  where j.status='conferencia' and j.fim < now() - interval '2 days'
union all
select 'aviso_aberto', a.id, v.placa, a.categoria||': '||left(a.texto,60), 'mecanico', 2
  from avisos a join veiculos v on v.id=a.veiculo_id where a.status in ('recebido','em_analise');

-- ============================================================================
-- RLS — fechar tudo e abrir por perfil
-- ============================================================================
alter table usuarios            enable row level security;
alter table motoristas          enable row level security;
alter table veiculos            enable row level security;
alter table veiculo_motorista   enable row level security;
alter table jornadas            enable row level security;
alter table jornada_carregamentos enable row level security;
alter table abastecimentos      enable row level security;
alter table tipos_despesa       enable row level security;
alter table despesas            enable row level security;
alter table multas              enable row level security;
alter table ordens_servico      enable row level security;
alter table avisos              enable row level security;
alter table veiculos_documentos enable row level security;
alter table trocas_oleo         enable row level security;
alter table auditoria           enable row level security;
alter table notificacoes        enable row level security;

create or replace function meu_perfil() returns perfil_t
language sql stable security definer set search_path = public as $$
  select perfil from usuarios where id = auth.uid()
$$;

create or replace function meu_motorista() returns uuid
language sql stable security definer set search_path = public as $$
  select id from motoristas where usuario_id = auth.uid() limit 1
$$;

-- cada usuário lê o próprio registro (necessário no login, antes de saber o perfil)
drop policy if exists eu_mesmo on usuarios;
create policy eu_mesmo on usuarios for select to authenticated using (id = auth.uid());

-- gestão (gerência e conferente) lê tudo
do $$
declare t text;
begin
  foreach t in array array['usuarios','motoristas','veiculos','veiculo_motorista','jornadas',
                            'jornada_carregamentos','abastecimentos','despesas','multas',
                            'ordens_servico','avisos','veiculos_documentos','trocas_oleo','notificacoes']
  loop
    execute format('drop policy if exists gestao_le on %I', t);
    execute format('create policy gestao_le on %I for select to authenticated using (meu_perfil() in (''gerencia'',''conferente''))', t);
  end loop;
end $$;

-- motorista: vê o que é dele
drop policy if exists mot_jornadas on jornadas;
create policy mot_jornadas on jornadas for select to authenticated
  using (motorista_id = meu_motorista() or meu_perfil() in ('gerencia','conferente'));

drop policy if exists mot_carreg on jornada_carregamentos;
create policy mot_carreg on jornada_carregamentos for select to authenticated
  using (exists (select 1 from jornadas j where j.id=jornada_id
                 and (j.motorista_id = meu_motorista() or meu_perfil() in ('gerencia','conferente'))));

-- insert: qualquer autenticado lança (o app restringe por tela)
do $$
declare t text;
begin
  foreach t in array array['jornadas','jornada_carregamentos','abastecimentos','despesas','avisos',
                            'veiculos','motoristas','veiculo_motorista','trocas_oleo',
                            'veiculos_documentos','multas','ordens_servico']
  loop
    execute format('drop policy if exists ins_%I on %I', t, t);
    execute format('create policy ins_%I on %I for insert to authenticated with check (true)', t, t);
  end loop;
end $$;

-- update/delete: só gerência (conferente aprova despesa)
drop policy if exists upd_jornadas on jornadas;
create policy upd_jornadas on jornadas for update to authenticated
  using (meu_perfil() in ('gerencia','conferente')) with check (true);

drop policy if exists upd_despesas on despesas;
create policy upd_despesas on despesas for update to authenticated
  using (meu_perfil() in ('gerencia','conferente')) with check (true);

do $$
declare t text;
begin
  foreach t in array array['veiculos','motoristas','avisos','multas','ordens_servico',
                            'veiculos_documentos','trocas_oleo','jornada_carregamentos']
  loop
    execute format('drop policy if exists upd_%I on %I', t, t);
    execute format('create policy upd_%I on %I for update to authenticated using (meu_perfil() in (''gerencia'',''conferente'',''mecanico'')) with check (true)', t, t);
    execute format('drop policy if exists del_%I on %I', t, t);
    execute format('create policy del_%I on %I for delete to authenticated using (meu_perfil() = ''gerencia'')', t, t);
  end loop;
end $$;

-- auditoria: leitura só gerência, escrita livre (log)
drop policy if exists aud_ger on auditoria;
create policy aud_ger on auditoria for select to authenticated using (meu_perfil() = 'gerencia');
drop policy if exists aud_ins on auditoria;
create policy aud_ins on auditoria for insert to authenticated with check (true);

-- notificação: cada um vê a sua
drop policy if exists notif_dono on notificacoes;
create policy notif_dono on notificacoes for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());


-- ============================================================================
-- GRANTS — o Supabase cria ae(authenticated) mas não concede privilégio nas
-- tabelas novas criadas por SQL. Sem isto a RLS barra tudo com "does not exist".
-- A RLS acima é quem decide o que cada perfil vê; aqui só se abre o privilégio.
-- ============================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;  -- inclui as views
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on sequences to authenticated;

-- ============================================================================
-- Sementes mínimas
-- ============================================================================
insert into tipos_despesa (nome, campos) values
  ('Pedágio',            '[]'::jsonb),
  ('Alimentação',        '[]'::jsonb),
  ('Estacionamento',     '[]'::jsonb),
  ('Lavagem',            '[]'::jsonb),
  ('Pneu',               '[]'::jsonb),
  ('Óleo e lubrificante','[]'::jsonb),
  ('Peça',               '[{"nome":"Peça"}]'::jsonb),
  ('Oficina',            '[]'::jsonb),
  ('Freio',              '[]'::jsonb),
  ('Elétrica',           '[]'::jsonb),
  ('Chapa e pintura',    '[]'::jsonb),
  ('Seguro',             '[]'::jsonb),
  ('Outros',             '[]'::jsonb)
on conflict (nome) do nothing;
