-- ============================================================================
-- MIGRAÇÃO: MELHORIAS OPERACIONAIS (idempotente)
-- ============================================================================
-- Rode este arquivo no SQL Editor do Supabase, INTEIRO, de uma vez.
-- Pode rodar mais de uma vez sem erro (tudo é if not exists / create or replace).
--
-- Cria:
--   1. jornada_checklists          — checklist de saída/chegada + trigger que
--                                    abre aviso automático na Oficina
--   2. relatorio_frota_periodo()   — fechamento líquido por caminhão/período
--   3. vw_auditoria_pedagio_jornada — passagem de pedágio fora de jornada
--
-- Regras do projeto respeitadas (ver LEIA-PRIMEIRO-HANDOFF.md):
--   * view com security_invoker = true (senão vaza dado e ignora a RLS)
--   * grant explícito para authenticated (Supabase não concede sozinho)
--   * motorista NUNCA vê custo/receita: a RPC devolve vazio para ele
--   * mesma regex de manutenção da vw_custo_veiculo
-- ============================================================================

-- ---------------------------------------------------------- 1) CHECKLIST ----
create table if not exists jornada_checklists (
  id           uuid primary key default gen_random_uuid(),
  jornada_id   uuid references jornadas(id) on delete cascade,
  veiculo_id   uuid references veiculos(id),
  motorista_id uuid references motoristas(id),
  tipo         text not null check (tipo in ('saida','chegada')),
  -- itens: { "pneus": "ok", "oleo": "problema", ... } (6 itens)
  itens        jsonb not null default '{}'::jsonb,
  tem_problema boolean not null default false,
  observacao   text,
  criado_em    timestamptz not null default now()
);

create index if not exists ix_checklist_jornada on jornada_checklists(jornada_id);
create index if not exists ix_checklist_veiculo on jornada_checklists(veiculo_id, criado_em desc);

alter table jornada_checklists enable row level security;

drop policy if exists mot_checklist_le on jornada_checklists;
create policy mot_checklist_le on jornada_checklists
  for select to authenticated
  using (
    privado.meu_perfil() in ('gerencia','conferente','mecanico')
    or motorista_id = privado.meu_motorista()
  );

drop policy if exists mot_checklist_ins on jornada_checklists;
create policy mot_checklist_ins on jornada_checklists
  for insert to authenticated
  with check (
    privado.meu_perfil() in ('gerencia','conferente','mecanico')
    or motorista_id = privado.meu_motorista()
  );

grant select, insert on jornada_checklists to authenticated;

-- Trigger: checklist com problema abre aviso para a Oficina.
-- Por que trigger e não um insert do app: o app pode falhar no meio (motorista
-- sem sinal no pátio). No banco, ou os dois registros existem ou nenhum existe.
create or replace function privado.checklist_gera_aviso()
returns trigger
language plpgsql
security definer
set search_path = public, privado
as $$
declare
  v_itens text;
begin
  if new.tem_problema is not true then
    return new;
  end if;

  -- jsonb_each_text devolve (key, value). Nome errado aqui estoura o insert
  -- inteiro e o checklist com problema NÃO geraria aviso — falha silenciosa
  -- justamente no caso que importa.
  select string_agg(chave, ', ')
    into v_itens
  from (
    select key as chave
    from jsonb_each_text(coalesce(new.itens, '{}'::jsonb))
    where value = 'problema'
  ) t;

  insert into avisos (veiculo_id, motorista_id, categoria, texto, status)
  values (
    new.veiculo_id,
    new.motorista_id,
    'Checklist ' || new.tipo,
    'Checklist de ' || new.tipo || ' apontou problema'
      || coalesce(' em: ' || v_itens, '')
      || coalesce('. ' || new.observacao, ''),
    'recebido'
  );

  return new;
end $$;

drop trigger if exists tg_checklist_gera_aviso on jornada_checklists;
create trigger tg_checklist_gera_aviso
  after insert on jornada_checklists
  for each row execute function privado.checklist_gera_aviso();


-- ------------------------------------------- 2) FECHAMENTO LÍQUIDO (RPC) ----
-- Receita confirmada − custos diretos = resultado, por caminhão e período.
-- SECURITY DEFINER porque soma tabelas que o conferente pode não enxergar
-- inteiras; a checagem de perfil na última linha é o que protege.
-- Motorista e mecânico recebem VAZIO (não erro): a tela mostra "sem permissão".
create or replace function public.relatorio_frota_periodo(
  p_inicio date default null,
  p_fim    date default null
)
returns table (
  veiculo_id uuid, placa text, marca text, modelo text,
  km_atual numeric, intervalo_oleo_km integer, ultima_troca_oleo_km numeric,
  receita_confirmada numeric, combustivel numeric, litros numeric,
  manutencao numeric, multas numeric, despesas_operacionais numeric,
  pedagio_extrato numeric, custo_total numeric, margem_liquida numeric,
  margem_pct numeric, km_rodado numeric, rkm numeric, kml numeric
)
language sql
stable
security definer
set search_path = public, privado
as $$
  with permitido as (
    select 1 where privado.meu_perfil() in ('gerencia','conferente')
  ),
  receita as (
    select v.id as veiculo_id, coalesce(sum(r.total), 0) as total
    from veiculos v
    left join recebimentos r
      on r.status = 'confirmado'
     and (
       r.veiculo_id = v.id
       or (r.veiculo_id is null and exists (
             select 1 from jornadas j
             where j.motorista_id = r.motorista_id
               and j.veiculo_id = v.id
               and r.data between j.inicio::date and coalesce(j.fim::date, j.inicio::date)
           ))
     )
     and (p_inicio is null or r.data >= p_inicio)
     and (p_fim is null or r.data <= p_fim)
    group by v.id
  ),
  comb as (
    select a.veiculo_id, coalesce(sum(a.valor_total),0) as valor,
           coalesce(sum(a.litros),0) as litros
    from abastecimentos a
    where (p_inicio is null or a.data::date >= p_inicio)
      and (p_fim is null or a.data::date <= p_fim)
    group by a.veiculo_id
  ),
  -- MESMA regex da vw_custo_veiculo. Se mudar aqui, mude lá também.
  desp as (
    select d.veiculo_id,
      coalesce(sum(case when d.categoria ~* 'pe[çc]a|pneu|manuten|borrachari|mec[aâ]nic|[óo]leo|oficina|revis[aã]o|lubrific|filtro|freio|suspens[aã]o|el[eé]tric'
                        then d.valor else 0 end), 0) as manut,
      coalesce(sum(case when d.categoria ~* 'pe[çc]a|pneu|manuten|borrachari|mec[aâ]nic|[óo]leo|oficina|revis[aã]o|lubrific|filtro|freio|suspens[aã]o|el[eé]tric'
                        then 0 else d.valor end), 0) as outros
    from despesas d
    where d.status <> 'reprovada'
      and (p_inicio is null or d.data::date >= p_inicio)
      and (p_fim is null or d.data::date <= p_fim)
    group by d.veiculo_id
  ),
  osv as (
    select o.veiculo_id,
           coalesce(sum(coalesce(o.mao_obra,0) + coalesce(o.custos,0)), 0) as valor
    from ordens_servico o
    where (p_inicio is null or o.aberta_em::date >= p_inicio)
      and (p_fim is null or o.aberta_em::date <= p_fim)
    group by o.veiculo_id
  ),
  mlt as (
    select m.veiculo_id, coalesce(sum(m.valor),0) as valor
    from multas m
    where (p_inicio is null or m.data_infracao >= p_inicio)
      and (p_fim is null or m.data_infracao <= p_fim)
    group by m.veiculo_id
  ),
  ped as (
    select p.veiculo_id, coalesce(sum(p.valor),0) as valor
    from pedagios p
    where (p_inicio is null or p.data_hora::date >= p_inicio)
      and (p_fim is null or p.data_hora::date <= p_fim)
    group by p.veiculo_id
  ),
  kmv as (
    select j.veiculo_id, coalesce(sum(j.km_final - j.km_inicial),0) as km
    from jornadas j
    where j.km_final is not null
      and j.status <> 'cancelada'
      and (p_inicio is null or j.inicio::date >= p_inicio)
      and (p_fim is null or j.inicio::date <= p_fim)
    group by j.veiculo_id
  )
  select
    v.id, v.placa, v.marca, v.modelo, v.km_atual,
    v.intervalo_oleo_km, v.ultima_troca_oleo_km,
    coalesce(rec.total,0) as receita_confirmada,
    coalesce(comb.valor,0) as combustivel,
    coalesce(comb.litros,0) as litros,
    coalesce(desp.manut,0) + coalesce(osv.valor,0) as manutencao,
    coalesce(mlt.valor,0) as multas,
    coalesce(desp.outros,0) as despesas_operacionais,
    coalesce(ped.valor,0) as pedagio_extrato,
    coalesce(comb.valor,0)+coalesce(desp.manut,0)+coalesce(osv.valor,0)
      +coalesce(mlt.valor,0)+coalesce(desp.outros,0)+coalesce(ped.valor,0) as custo_total,
    coalesce(rec.total,0)
      - (coalesce(comb.valor,0)+coalesce(desp.manut,0)+coalesce(osv.valor,0)
         +coalesce(mlt.valor,0)+coalesce(desp.outros,0)+coalesce(ped.valor,0)) as margem_liquida,
    case when coalesce(rec.total,0) > 0 then
      round(((coalesce(rec.total,0)
        - (coalesce(comb.valor,0)+coalesce(desp.manut,0)+coalesce(osv.valor,0)
           +coalesce(mlt.valor,0)+coalesce(desp.outros,0)+coalesce(ped.valor,0)))
        / coalesce(rec.total,0)) * 100, 1)
      else null end as margem_pct,
    coalesce(kmv.km,0) as km_rodado,
    case when coalesce(kmv.km,0) > 0 then
      round((coalesce(comb.valor,0)+coalesce(desp.manut,0)+coalesce(osv.valor,0)
        +coalesce(mlt.valor,0)+coalesce(desp.outros,0)+coalesce(ped.valor,0))
        / kmv.km, 3) else null end as rkm,
    case when coalesce(comb.litros,0) > 0 and coalesce(kmv.km,0) > 0 then
      round(kmv.km / comb.litros, 2) else null end as kml
  from veiculos v
  left join receita rec on rec.veiculo_id = v.id
  left join comb on comb.veiculo_id = v.id
  left join desp on desp.veiculo_id = v.id
  left join osv  on osv.veiculo_id  = v.id
  left join mlt  on mlt.veiculo_id  = v.id
  left join ped  on ped.veiculo_id  = v.id
  left join kmv  on kmv.veiculo_id  = v.id
  where v.ativo and exists (select 1 from permitido)
  order by v.placa
$$;

revoke all on function public.relatorio_frota_periodo(date, date) from public, anon;
grant execute on function public.relatorio_frota_periodo(date, date) to authenticated;


-- ------------------------------------ 3) AUDITORIA PEDÁGIO × JORNADA (view) --
-- Cada passagem é classificada pelo que o caminhão estava fazendo:
--   ok                 -> havia jornada aberta naquele horário
--   fora_de_jornada    -> nenhuma jornada cobria o horário
--   veiculo_em_oficina -> havia OS aberta na data (passagem suspeita)
-- Tolerância de 30 min nas bordas: passar na praça pouco antes de abrir a
-- jornada ou pouco depois de fechar não é fraude.
drop view if exists vw_auditoria_pedagio_jornada cascade;

create view vw_auditoria_pedagio_jornada
with (security_invoker = true) as
select
  p.id as pedagio_id,
  p.veiculo_id,
  coalesce(v.placa, p.placa) as placa,
  p.data_hora,
  p.praca,
  p.valor,
  j.id as jornada_id,
  j.inicio as jornada_inicio,
  j.fim as jornada_fim,
  (
    select o.id from ordens_servico o
    where o.veiculo_id = p.veiculo_id
      and o.status <> 'concluida'
      and p.data_hora::date between o.aberta_em::date
          and coalesce(o.concluida_em::date, current_date)
    limit 1
  ) as os_aberta_id,
  case
    when exists (
      select 1 from ordens_servico o
      where o.veiculo_id = p.veiculo_id
        and o.status <> 'concluida'
        and p.data_hora::date between o.aberta_em::date
            and coalesce(o.concluida_em::date, current_date)
    ) then 'veiculo_em_oficina'
    when j.id is not null then 'ok'
    else 'fora_de_jornada'
  end as status_auditoria
from pedagios p
left join veiculos v on v.id = p.veiculo_id
left join lateral (
  select jo.id, jo.inicio, jo.fim
  from jornadas jo
  where jo.veiculo_id = p.veiculo_id
    and jo.status <> 'cancelada'
    and p.data_hora >= jo.inicio - interval '30 minutes'
    and p.data_hora <= coalesce(jo.fim, now()) + interval '30 minutes'
  order by abs(extract(epoch from (p.data_hora - jo.inicio)))
  limit 1
) j on true;

grant select on vw_auditoria_pedagio_jornada to authenticated;


-- ------------------------------------------------------------- CONFERÊNCIA --
-- Rode este select no fim para ver o que foi criado.
select 'jornada_checklists' as objeto,
       case when to_regclass('public.jornada_checklists') is not null then 'ok' else 'FALHOU' end as status
union all
select 'relatorio_frota_periodo()',
       case when exists (select 1 from pg_proc where proname = 'relatorio_frota_periodo') then 'ok' else 'FALHOU' end
union all
select 'vw_auditoria_pedagio_jornada',
       case when to_regclass('public.vw_auditoria_pedagio_jornada') is not null then 'ok' else 'FALHOU' end
union all
select 'trigger do checklist',
       case when exists (select 1 from pg_trigger where tgname = 'tg_checklist_gera_aviso') then 'ok' else 'FALHOU' end;
