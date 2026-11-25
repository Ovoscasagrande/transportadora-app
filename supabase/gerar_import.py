#!/usr/bin/env python3
"""
Gera o SQL de importação a partir dos pacotes JSON extraídos do banco antigo.
Regenera sempre que o dado de origem mudar; nunca editar o .sql à mão.
"""
import json, pathlib, sys, re

A = pathlib.Path('/home/ethos/.assistant/workspace')

def carrega(caminho):
    t = pathlib.Path(caminho).read_text()
    d = json.loads(t)
    if isinstance(d, dict) and 'result' in d:
        t = d['result']
    # a resposta do MCP vem embrulhada em texto com marcadores
    i, f = t.find('[{'), t.rfind('}]') + 2
    if i >= 0 and f > i:
        t = t[i:f]
    d = json.loads(t)
    if isinstance(d, list):
        d = d[0]
    return d['pacote']

# pacote 1 (usuários/veículos/motoristas) veio inline; pacote 2 do arquivo.
P1 = carrega(A / 'work/transp2/p1.json')
P2 = carrega(A / 'artifacts/mcp/supabase_execute_sql_1882499638.txt')

def q(v):
    """literal SQL seguro"""
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, (dict, list)):
        s = json.dumps(v, ensure_ascii=False).replace("'", "''")
        return f"'{s}'::jsonb"
    s = str(v).replace("'", "''")
    return f"'{s}'"

def valores(rows, cols):
    out = []
    for r in rows:
        out.append('(' + ', '.join(
            'null' if c == '__NULL__' else q(r.get(c)) for c in cols) + ')')
    return ',\n'.join(out)

L = []
L.append("""-- ============================================================================
-- IMPORTAÇÃO: dados da TRANSPORTADORA vindos do banco antigo (3 empresas)
-- ============================================================================
-- GERADO por work/transp2/gerar_import.py — não editar à mão.
--
-- Mantém os MESMOS ids da origem. Isso preserva a integridade das FKs
-- (abastecimento→jornada→veículo/motorista) sem remapeamento, e permite
-- conferir linha por linha contra o banco antigo.
--
-- Traz apenas: 2 caminhões, 3 motoristas, 6 usuários, e o histórico deles.
-- Não traz nada de OVOS nem da DISTRIBUIDORA.
-- ============================================================================
begin;

-- trava de segurança: só roda em banco sem gente
do $$
begin
  if (select count(*) from usuarios) > 0 then
    raise exception 'Destino já tem % usuários — importação abortada.', (select count(*) from usuarios);
  end if;
end $$;
""")

# ---------------------------------------------------------------- auth.users
u = P1['usuarios']
L.append(f"""
-- --------------------------------------------------------------- auth.users
-- O hash bcrypt ($2a$10$) é o mesmo do GoTrue: a pessoa continua entrando com
-- a senha que já usa. A senha em texto nunca passa por aqui.
insert into auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at
) values
{valores(u, ['id','email','encrypted_password','email_confirmed_at','created_at'])}
;
-- completa as colunas fixas (não são dado de origem)
update auth.users set
  instance_id = '00000000-0000-0000-0000-000000000000',
  aud = 'authenticated', role = 'authenticated',
  updated_at = now(),
  raw_app_meta_data = '{{"provider":"email","providers":["email"]}}'::jsonb,
  raw_user_meta_data = '{{}}'::jsonb,
  is_sso_user = false, is_anonymous = false
where id in ({', '.join(q(x['id']) for x in u)});
""")

# ---------------------------------------------------------------- usuarios
L.append(f"""
-- ----------------------------------------------------------------- usuarios
insert into usuarios (id, nome, perfil, telefone, ativo) values
{valores(u, ['id','nome','perfil','contato','ativo'])}
;
""")

# ---------------------------------------------------------------- veiculos
v = P1['veiculos']
L.append(f"""
-- ----------------------------------------------------------------- veiculos
insert into veiculos (id, placa, renavam, marca, modelo, ano, cor, km_atual,
                      intervalo_oleo_km, ultima_troca_oleo_km,
                      ultima_troca_oleo_data, ativo) values
{valores(v, ['id','placa','renavam','marca','modelo','ano','cor','km_atual',
             'intervalo_oleo_km','ultima_troca_oleo_km','ultima_troca_oleo_data','ativo'])}
;
""")

# ---------------------------------------------------------------- motoristas
m = P1['motoristas']
L.append(f"""
-- --------------------------------------------------------------- motoristas
insert into motoristas (id, usuario_id, nome, cpf, cnh, cnh_categoria,
                        cnh_validade, contato, ativo) values
{valores(m, ['id','usuario_id','nome','cpf','cnh','cnh_categoria',
             'cnh_validade','contato','ativo'])}
;
""")

# ---------------------------------------------------------------- jornadas
# Referências a usuário (cancelada_por/averiguada_por) que NÃO migraram (ex.:
# usuário QA) precisam virar null, senão a FK quebra. Só mantenho o que existe.
IDS_USU = {x['id'] for x in P1['usuarios']}
for row in P2['jornadas']:
    for campo in ('cancelada_por', 'conferida_por'):
        if row.get(campo) and row[campo] not in IDS_USU:
            row[campo] = None

j = P2['jornadas']
L.append(f"""
-- ----------------------------------------------------------------- jornadas
insert into jornadas (id, veiculo_id, motorista_id, km_inicial, km_final,
                      inicio, fim, status, ocorrencias, motivo_cancelamento,
                      cancelada_por, cancelada_em, conferida_por, conferida_em) values
{valores(j, ['id','veiculo_id','motorista_id','km_inicial','km_final','inicio','fim',
             'status','ocorrencias','motivo_cancelamento','cancelada_por','cancelada_em',
             'conferida_por','conferida_em'])}
;
""")

# ------------------------------------------------------- carregamentos
c = P2['carregamentos']
if c:
    L.append(f"""
-- ------------------------------------------------------ jornada_carregamentos
-- A origem só guarda criado_em (quando o carregamento foi registrado), sem hora
-- de saída. Vira chegada_em; saida_em fica null e o app mostra "na fila".
-- Não invento horário que o dado não tem.
insert into jornada_carregamentos (id, jornada_id, chegada_em, saida_em, observacao) values
{valores(c, ['id','jornada_id','criado_em','__NULL__','observacao'])}
;
""")

# ------------------------------------------------------- abastecimentos
for row in P2['abastecimentos']:
    if row.get('posto') == '__OUTRO__':
        row['posto'] = None
a = P2['abastecimentos']
L.append(f"""
-- ----------------------------------------------------------- abastecimentos
insert into abastecimentos (id, jornada_id, veiculo_id, motorista_id, posto,
                            combustivel, litros, preco_litro, valor_total, km,
                            data, foto_path, parcial, criado_em) values
{valores(a, ['id','jornada_id','veiculo_id','motorista_id','posto','combustivel',
             'litros','preco_litro','valor_total','km','data','foto_path','parcial','criado_em'])}
;
""")

# ------------------------------------------------------- despesas
for row in P2['despesas']:
    if row.get('aprovada_por') and row['aprovada_por'] not in IDS_USU:
        row['aprovada_por'] = None
d = P2['despesas']
L.append(f"""
-- ----------------------------------------------------------------- despesas
insert into despesas (id, jornada_id, veiculo_id, motorista_id, categoria,
                      descricao, valor, data, status, motivo_reprovacao,
                      foto_path, extras, aprovada_por, aprovada_em, criado_em) values
{valores(d, ['id','jornada_id','veiculo_id','motorista_id','categoria','descricao',
             'valor','data','status','motivo_reprovacao','foto_path','extras',
             'aprovada_por','aprovada_em','criado_em'])}
;
""")

# ------------------------------------------------------- documentos
for row in (P2['documentos'] or []):
    if row.get('enviado_por') and row['enviado_por'] not in IDS_USU:
        row['enviado_por'] = None
doc = P2['documentos']
if doc:
    L.append(f"""
-- ------------------------------------------------------- veiculos_documentos
-- O ARQUIVO em si (PDF do CRLV) está no Storage do projeto antigo e precisa ser
-- copiado separadamente. Aqui vai só a referência.
insert into veiculos_documentos (id, veiculo_id, tipo, arquivo_path, vencimento,
                                 enviado_por, criado_em) values
{valores(doc, ['id','veiculo_id','tipo','arquivo_path','vencimento','enviado_por','criado_em'])}
;
""")

# ------------------------------------------------------- trocas de óleo
for row in (P2['trocas'] or []):
    if row.get('registrado_por') and row['registrado_por'] not in IDS_USU:
        row['registrado_por'] = None
t = P2['trocas']
if t:
    L.append(f"""
-- -------------------------------------------------------------- trocas_oleo
insert into trocas_oleo (id, veiculo_id, km, data, obs, registrado_por, criado_em) values
{valores(t, ['id','veiculo_id','km','data','obs','registrado_por','criado_em'])}
;
""")

# ------------------------------------------------------- vínculos
# só vínculos entre motorista e veículo que existem no destino
IDS_MOT = {x['id'] for x in P1['motoristas']}
IDS_VEI = {x['id'] for x in P1['veiculos']}
mv = [x for x in (P2['vinculos'] or [])
      if x['motorista_id'] in IDS_MOT and x['veiculo_id'] in IDS_VEI]
if mv:
    L.append(f"""
-- -------------------------------------------------------- veiculo_motorista
insert into veiculo_motorista (motorista_id, veiculo_id, ativo) values
{valores(mv, ['motorista_id','veiculo_id','ativo'])}
on conflict do nothing;
""")

L.append("""
-- ---------------------------------------------------------------- conferência
-- ajusta o odômetro dos caminhões com o maior km_final das jornadas,
-- e o intervalo de troca de óleo (a origem não tinha: uso 40.000 km, padrão
-- de cavalo mecânico — está marcado para o Francisco confirmar)
update veiculos v set
  km_atual = greatest(coalesce(v.km_atual, 0),
    (select max(j.km_final) from jornadas j
      where j.veiculo_id = v.id and j.km_final is not null and j.status <> 'cancelada')),
  intervalo_oleo_km = coalesce(v.intervalo_oleo_km, 40000);

commit;
""")

sql = '\n'.join(L)
destino = A / 'work/transp2/supabase/importacao_ovos.sql'
destino.write_text(sql)
print(f'{destino}  ({len(sql):,} bytes)')
print(f'  usuarios={len(u)} veiculos={len(v)} motoristas={len(m)}')
print(f'  jornadas={len(j)} carregamentos={len(c or [])} abast={len(a)} despesas={len(d)}')
print(f'  documentos={len(doc or [])} trocas={len(t or [])} vinculos={len(mv or [])}')
