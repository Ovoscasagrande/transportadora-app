-- ============================================================================
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


-- --------------------------------------------------------------- auth.users
-- O hash bcrypt ($2a$10$) é o mesmo do GoTrue: a pessoa continua entrando com
-- a senha que já usa. A senha em texto nunca passa por aqui.
insert into auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at
) values
('36257a31-1fcc-4e4d-a002-39621b5ee41d', 'negreiros_ponte@hotmail.com', '$2a$10$LNh3taDDvUOZyD3R30.UlObmReND8Rvnf4aj4/Y.DEsQIbqV6dPyC', '2026-11-09T22:08:21.535583+00:00', '2026-11-09T22:08:21.525935+00:00'),
('8c545c51-3b36-49f1-8dfa-7292165d1506', 'patrickcarlos28@icloud.com', '$2a$10$skpcexWiP20b0sxrp8qQHOHEscXdPV4jCDyKihnCW3Ct7eMdKaPv2', '2026-11-09T23:20:51.63425+00:00', '2026-11-09T23:20:51.62466+00:00'),
('f0d8d4fe-1b79-452b-a909-a33fd8b9107e', 'ozariasleonardo02@gmail.com', '$2a$10$/BQim4xT/Si0aPFlDhp3p.RsP7qBMLkDxAxS4FjhmKchXbLPBCmdW', '2026-11-09T23:49:42.284052+00:00', '2026-11-09T23:49:42.273638+00:00'),
('99574be3-1cd5-498d-b218-638731d26b25', 'pomucenoclaudia@gmail.com', '$2a$10$j4fjGpF41ZuvZ8puMR6eyeLadzwGq59sOrq.I7haLbliIXaIbxq9O', '2026-11-10T12:37:52.161801+00:00', '2026-11-10T12:37:52.149289+00:00'),
('11d29023-289c-4aea-b525-93987e54864a', 'damacenovitor1@hotmail.com', '$2a$10$ZBsIXBiO9U6CZdYSLX5D9etxj430JYIcfJ0Jczw7LVIIbs3DhyBS2', '2026-11-09T22:38:22.782555+00:00', '2026-11-09T22:38:22.772369+00:00'),
('cc4b0e93-0271-4932-873c-b7ea68fb4b61', 'fgcasagrandejr@gmail.com', '$2a$10$xoQOtT/PfHSkU9TXDwcP3OxaFf2OBBJ/65k2mU2Tm6AfKgJjgcyYK', '2026-11-07T11:34:37.460375+00:00', '2026-11-07T11:34:37.452954+00:00')
;
-- completa as colunas fixas (não são dado de origem)
update auth.users set
  instance_id = '00000000-0000-0000-0000-000000000000',
  aud = 'authenticated', role = 'authenticated',
  updated_at = now(),
  raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
  raw_user_meta_data = '{}'::jsonb,
  is_sso_user = false, is_anonymous = false
where id in ('36257a31-1fcc-4e4d-a002-39621b5ee41d', '8c545c51-3b36-49f1-8dfa-7292165d1506', 'f0d8d4fe-1b79-452b-a909-a33fd8b9107e', '99574be3-1cd5-498d-b218-638731d26b25', '11d29023-289c-4aea-b525-93987e54864a', 'cc4b0e93-0271-4932-873c-b7ea68fb4b61');


-- ----------------------------------------------------------------- usuarios
insert into usuarios (id, nome, perfil, telefone, ativo) values
('36257a31-1fcc-4e4d-a002-39621b5ee41d', 'Peterson Candido de Negreiros', 'motorista', '19989612520', true),
('8c545c51-3b36-49f1-8dfa-7292165d1506', 'Patrick carlos souza carvalho', 'motorista', '19993452424', true),
('f0d8d4fe-1b79-452b-a909-a33fd8b9107e', 'Leonardo Correa ozarias', 'motorista', '19993098684', true),
('99574be3-1cd5-498d-b218-638731d26b25', 'Cláudia Pomuceno', 'conferente', '19995084172', true),
('11d29023-289c-4aea-b525-93987e54864a', 'Joao vitor damaceno', 'mecanico', '19994659780', true),
('cc4b0e93-0271-4932-873c-b7ea68fb4b61', 'FGCASAGRANDEJR', 'gerencia', null, true)
;


-- ----------------------------------------------------------------- veiculos
insert into veiculos (id, placa, renavam, marca, modelo, ano, cor, km_atual,
                      intervalo_oleo_km, ultima_troca_oleo_km,
                      ultima_troca_oleo_data, ativo) values
('8696693e-ba1c-493c-9475-5d77a654bcd6', 'UQU4A94', '1500108291', 'Mercedes-Benz', 'Accelo 1117 CE', 2026, 'Branca', 22713, null, null, null, true),
('087d83b3-6c0c-4951-8703-1484984de530', 'UQA6I75', '1499921249', 'Iveco', 'Tector 11-190', 2026, 'Branca', 28722, null, null, null, true)
;


-- --------------------------------------------------------------- motoristas
insert into motoristas (id, usuario_id, nome, cpf, cnh, cnh_categoria,
                        cnh_validade, contato, ativo) values
('5b1d2bde-7a8e-4cd1-a1b0-e2ed19a85cf3', 'f0d8d4fe-1b79-452b-a909-a33fd8b9107e', 'Leonardo Correa ozarias', '46144840850', '07615767682', 'D', '2034-02-14', '19993098684', true),
('4c92c2eb-f2e4-45d6-8e6e-2f3624194ec7', '36257a31-1fcc-4e4d-a002-39621b5ee41d', 'Peterson Candido de Negreiros', '38461642830', '05090273855', 'D', '2035-06-09', '19989612520', true),
('2439a665-d0fc-4d02-8697-86653c1fd314', '8c545c51-3b36-49f1-8dfa-7292165d1506', 'Patrick carlos souza carvalho', '37167143804', '07833605912', 'AD', '2035-11-14', '19993452424', true)
;


-- ----------------------------------------------------------------- jornadas
insert into jornadas (id, veiculo_id, motorista_id, km_inicial, km_final,
                      inicio, fim, status, ocorrencias, motivo_cancelamento,
                      cancelada_por, cancelada_em, conferida_por, conferida_em) values
('c7b14a33-7025-4726-ae40-b125aa1aca7e', '8696693e-ba1c-493c-9475-5d77a654bcd6', '4c92c2eb-f2e4-45d6-8e6e-2f3624194ec7', 20406, 20677, '2026-11-10T10:01:25.275938+00:00', '2026-11-10T20:58:44.095+00:00', 'fechada', null, null, null, null, 'cc4b0e93-0271-4932-873c-b7ea68fb4b61', '2026-11-11T11:25:59.214+00:00'),
('1ca9f9af-294e-4673-9d03-8e8e1ade48c6', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 27664, 27722, '2026-11-10T08:15:00+00:00', '2026-11-10T16:17:00+00:00', 'cancelada', '…', 'motorista colocou os valores errado dos gastos, vai refazer a jornada', 'cc4b0e93-0271-4932-873c-b7ea68fb4b61', '2026-11-10T19:07:14.04+00:00', null, null),
('d944c191-370b-4c21-8128-508561edee41', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 27664, 27722, '2026-11-10T08:15:00+00:00', '2026-11-10T16:17:00+00:00', 'fechada', null, null, null, null, 'cc4b0e93-0271-4932-873c-b7ea68fb4b61', '2026-11-10T19:18:25.664+00:00'),
('1b12d039-1178-469c-8858-a5c1fe32adb3', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 27731, 27800, '2026-11-11T04:45:12.063147+00:00', '2026-11-11T12:03:24.53+00:00', 'fechada', null, null, null, null, null, '2026-11-11T12:03:46.958+00:00'),
('52d8453c-da0a-43f0-9024-aaf300ad8d3e', '8696693e-ba1c-493c-9475-5d77a654bcd6', '5b1d2bde-7a8e-4cd1-a1b0-e2ed19a85cf3', 21000, 21300, '2026-11-13T08:53:08.316785+00:00', '2026-11-13T22:57:57.049+00:00', 'fechada', null, null, null, null, 'cc4b0e93-0271-4932-873c-b7ea68fb4b61', '2026-11-14T08:56:55.49+00:00'),
('daf4f25c-58f0-4378-99a2-916821d7b00b', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 27389, 28212, '2026-11-13T04:07:00+00:00', '2026-11-13T17:21:00+00:00', 'fechada', null, null, null, null, 'cc4b0e93-0271-4932-873c-b7ea68fb4b61', '2026-11-13T17:35:23.398+00:00'),
('810e4406-2fdd-492a-ae3c-99c3bb39001b', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 28209, 28480, '2026-11-16T11:40:25.12988+00:00', '2026-11-17T00:21:19.687+00:00', 'fechada', null, null, null, null, 'cc4b0e93-0271-4932-873c-b7ea68fb4b61', '2026-11-17T00:32:29.052+00:00'),
('8309e6a7-7e18-4bc1-83a8-c9faac93cfe4', '8696693e-ba1c-493c-9475-5d77a654bcd6', '5b1d2bde-7a8e-4cd1-a1b0-e2ed19a85cf3', 21300, 21500, '2026-11-14T08:58:33.188494+00:00', '2026-11-14T15:10:57.969+00:00', 'fechada', null, null, null, null, 'cc4b0e93-0271-4932-873c-b7ea68fb4b61', '2026-11-16T09:23:28.148+00:00'),
('eeeae829-163e-4b4a-9302-d029b17b36a2', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 28209, 28209, '2026-11-16T05:12:17.645204+00:00', '2026-11-16T05:12:25.899+00:00', 'cancelada', null, 'Duplicou', 'cc4b0e93-0271-4932-873c-b7ea68fb4b61', '2026-11-16T09:23:45.644+00:00', null, null),
('ced5b51f-ebd7-471d-9c36-a5310d36a45c', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 27389, 28209, '2026-11-13T17:39:49.866455+00:00', '2026-11-13T17:50:59.626+00:00', 'fechada', null, null, null, null, 'cc4b0e93-0271-4932-873c-b7ea68fb4b61', '2026-11-14T08:57:33.725+00:00'),
('c4b0c16d-da42-4cb5-bf52-6c8e295273d6', '8696693e-ba1c-493c-9475-5d77a654bcd6', '5b1d2bde-7a8e-4cd1-a1b0-e2ed19a85cf3', 21500, 21860, '2026-11-16T11:21:38.857736+00:00', '2026-11-16T23:36:10.661+00:00', 'fechada', null, null, null, null, 'cc4b0e93-0271-4932-873c-b7ea68fb4b61', '2026-11-17T00:03:26.004+00:00'),
('660e7874-03ac-4f64-9148-28fd07b47128', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 28480, 28597, '2026-11-17T04:58:22.710389+00:00', '2026-11-17T21:47:02.816+00:00', 'fechada', null, null, null, null, 'cc4b0e93-0271-4932-873c-b7ea68fb4b61', '2026-11-18T07:23:33.092+00:00'),
('17d520c8-fbb0-4211-9a3e-8a2258dd7fc0', '8696693e-ba1c-493c-9475-5d77a654bcd6', '5b1d2bde-7a8e-4cd1-a1b0-e2ed19a85cf3', 21860, 22713, '2026-11-17T05:49:49.221239+00:00', '2026-11-18T17:16:37.493+00:00', 'fechada', null, null, null, null, '99574be3-1cd5-498d-b218-638731d26b25', '2026-11-18T18:22:35.509+00:00'),
('2e5c0b31-67cf-402c-b951-e9f1caadff99', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 28597, 28722, '2026-11-18T10:34:03.813361+00:00', '2026-11-18T21:48:41.899+00:00', 'fechada', null, null, null, null, '99574be3-1cd5-498d-b218-638731d26b25', '2026-11-19T09:00:30.482+00:00')
;


-- ------------------------------------------------------ jornada_carregamentos
-- A origem só guarda criado_em (quando o carregamento foi registrado), sem hora
-- de saída. Vira chegada_em; saida_em fica null e o app mostra "na fila".
-- Não invento horário que o dado não tem.
insert into jornada_carregamentos (id, jornada_id, chegada_em, saida_em, observacao) values
('f6927061-aa6e-4740-bea2-02af75a6b571', '1ca9f9af-294e-4673-9d03-8e8e1ade48c6', '2026-11-10T08:15:26.464792+00:00', null, null),
('06c4d4e2-1f98-4d98-b6a4-876886465b5d', '1ca9f9af-294e-4673-9d03-8e8e1ade48c6', '2026-11-10T08:15:40.048018+00:00', null, 'São Roque ')
;


-- ----------------------------------------------------------- abastecimentos
insert into abastecimentos (id, jornada_id, veiculo_id, motorista_id, posto,
                            combustivel, litros, preco_litro, valor_total, km,
                            data, foto_path, parcial, criado_em) values
('a9828c7e-f8ae-4b99-83f1-5758ef981e03', '1ca9f9af-294e-4673-9d03-8e8e1ade48c6', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 'POSTO 22 SÃO PAULO', 'S10', 31, 7.09, 219.79, 27722, '2026-11-10T16:17:12.289473+00:00', '8c545c51-3b36-49f1-8dfa-7292165d1506/1794327431311.jpg', false, '2026-11-10T16:17:12.289473+00:00'),
('e83e9438-a8f2-445e-a678-064adc3da221', 'd944c191-370b-4c21-8128-508561edee41', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 'POSTO 22 SÃO PAULO', 'S10', 31, 7.09, 219.79, 27722, '2026-11-10T19:14:01.901836+00:00', '8c545c51-3b36-49f1-8dfa-7292165d1506/1794338041132.jpg', false, '2026-11-10T19:14:01.901836+00:00'),
('b186bac1-82ef-48f0-8798-b22be42bb86a', '810e4406-2fdd-492a-ae3c-99c3bb39001b', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 'POSTO 22 SÃO PAULO', 'S10', 68.2, 7.09, 483.54, 28469, '2026-11-16T19:47:44.246065+00:00', '8c545c51-3b36-49f1-8dfa-7292165d1506/1794858461966.jpg', false, '2026-11-16T19:47:44.246065+00:00'),
('50515621-4180-44d9-b45a-55432a7eaca2', 'c4b0c16d-da42-4cb5-bf52-6c8e295273d6', '8696693e-ba1c-493c-9475-5d77a654bcd6', '5b1d2bde-7a8e-4cd1-a1b0-e2ed19a85cf3', 'POSTO 22 SÃO PAULO', 'S10', 58.17, 7.09, 412.43, 21860, '2026-11-16T23:35:54.557047+00:00', 'f0d8d4fe-1b79-452b-a909-a33fd8b9107e/1794872151995.jpg', false, '2026-11-16T23:35:54.557047+00:00'),
('6236b874-bd8a-45b4-9a0c-e836ad79841c', '660e7874-03ac-4f64-9148-28fd07b47128', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 'POSTO 22 SÃO PAULO', 'S10', 40.16, 7.09, 284.71, 28597, '2026-11-17T21:46:06.569616+00:00', '8c545c51-3b36-49f1-8dfa-7292165d1506/1794951965149.jpg', false, '2026-11-17T21:46:06.569616+00:00'),
('8940db73-fd89-44ce-a9d6-8f9ad8471d52', '17d520c8-fbb0-4211-9a3e-8a2258dd7fc0', '8696693e-ba1c-493c-9475-5d77a654bcd6', '5b1d2bde-7a8e-4cd1-a1b0-e2ed19a85cf3', null, 'S10', 102.71, 7.09, 728.21, 22360, '2026-11-18T12:11:32.968491+00:00', 'f0d8d4fe-1b79-452b-a909-a33fd8b9107e/1795003889348.jpg', false, '2026-11-18T12:11:32.968491+00:00'),
('562f3339-193f-4457-ac92-b4ed623087ea', '17d520c8-fbb0-4211-9a3e-8a2258dd7fc0', '8696693e-ba1c-493c-9475-5d77a654bcd6', '5b1d2bde-7a8e-4cd1-a1b0-e2ed19a85cf3', 'POSTO JONELLUS', 'S10', 66.8, 6.99, 466.91, 22710, '2026-11-18T17:15:10.519603+00:00', 'f0d8d4fe-1b79-452b-a909-a33fd8b9107e/1795022107676.jpg', false, '2026-11-18T17:15:10.519603+00:00'),
('e5c79374-17e2-4f68-ae23-04082d57ff3a', '17d520c8-fbb0-4211-9a3e-8a2258dd7fc0', '8696693e-ba1c-493c-9475-5d77a654bcd6', '5b1d2bde-7a8e-4cd1-a1b0-e2ed19a85cf3', 'POSTO JONELLUS', 'ARLA', 15.95, 2.99, 47.68, 22710, '2026-11-18T17:15:38.831107+00:00', 'f0d8d4fe-1b79-452b-a909-a33fd8b9107e/1795022136596.jpg', false, '2026-11-18T17:15:38.831107+00:00')
;


-- ----------------------------------------------------------------- despesas
insert into despesas (id, jornada_id, veiculo_id, motorista_id, categoria,
                      descricao, valor, data, status, motivo_reprovacao,
                      foto_path, extras, aprovada_por, aprovada_em, criado_em) values
('f6693a59-4628-4d2d-aae4-5445f1c691a2', '8309e6a7-7e18-4bc1-83a8-c9faac93cfe4', '8696693e-ba1c-493c-9475-5d77a654bcd6', '5b1d2bde-7a8e-4cd1-a1b0-e2ed19a85cf3', 'DESCARGA', 'Descarga ', 60, '2026-11-14T12:19:21.167276+00:00', 'aprovada', null, 'f0d8d4fe-1b79-452b-a909-a33fd8b9107e/1794658758775.jpg', '{}'::jsonb, null, '2026-11-16T18:18:35.631+00:00', '2026-11-14T12:19:21.167276+00:00'),
('b84e172d-a0a0-4b62-9c61-e950c9a5b84f', '1ca9f9af-294e-4673-9d03-8e8e1ade48c6', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 'DESCARGA', 'Descarga 7 pallet', 200, '2026-11-10T10:00:31.356326+00:00', 'reprovada', 'lançamento duplicado', '8c545c51-3b36-49f1-8dfa-7292165d1506/1794304827217.jpg', '{}'::jsonb, 'cc4b0e93-0271-4932-873c-b7ea68fb4b61', '2026-11-11T10:23:37.741+00:00', '2026-11-10T10:00:31.356326+00:00'),
('f6969524-9376-43ed-97b3-e265954993b2', '810e4406-2fdd-492a-ae3c-99c3bb39001b', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 'DESCARGA', '8 pallet', 320, '2026-11-16T19:48:46.509794+00:00', 'aguardando', null, '8c545c51-3b36-49f1-8dfa-7292165d1506/1794858525125.jpg', '{}'::jsonb, null, null, '2026-11-16T19:48:46.509794+00:00'),
('fb5759ef-e85d-4483-a053-2d6f9c85127c', 'd944c191-370b-4c21-8128-508561edee41', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 'DESCARGA', '7 pallet ', 200, '2026-11-10T19:15:08.330886+00:00', 'aprovada', null, '8c545c51-3b36-49f1-8dfa-7292165d1506/1794338107509.jpg', '{}'::jsonb, null, '2026-11-16T18:17:50.418+00:00', '2026-11-10T19:15:08.330886+00:00'),
('0f9844c2-e866-49ec-af12-d75120c5e4be', 'd944c191-370b-4c21-8128-508561edee41', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 'PERNOITE', 'Pernoite ', 250, '2026-11-10T19:16:46.545723+00:00', 'aprovada', null, '8c545c51-3b36-49f1-8dfa-7292165d1506/1794338205727.jpg', '{}'::jsonb, null, '2026-11-16T18:18:04.596+00:00', '2026-11-10T19:16:46.545723+00:00'),
('573dbc66-1ea1-48b0-a502-e61ccd97f1a1', 'ced5b51f-ebd7-471d-9c36-a5310d36a45c', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 'DESCARGA', '5 pallet', 90, '2026-11-13T17:50:39.232409+00:00', 'aprovada', null, '8c545c51-3b36-49f1-8dfa-7292165d1506/1794592238260.jpg', '{}'::jsonb, null, '2026-11-16T18:18:09.785+00:00', '2026-11-13T17:50:39.232409+00:00'),
('1b015d51-4f08-44cc-8bc2-8e9f19a32c68', '8309e6a7-7e18-4bc1-83a8-c9faac93cfe4', '8696693e-ba1c-493c-9475-5d77a654bcd6', '5b1d2bde-7a8e-4cd1-a1b0-e2ed19a85cf3', 'PERNOITE', 'Pernoite 13/11', 250, '2026-11-14T09:00:14.335138+00:00', 'aprovada', null, 'f0d8d4fe-1b79-452b-a909-a33fd8b9107e/1794646803563.jpg', '{}'::jsonb, null, '2026-11-16T18:18:13.569+00:00', '2026-11-14T09:00:14.335138+00:00'),
('2407bb41-8e3a-4c4c-9339-972553dbe925', 'c4b0c16d-da42-4cb5-bf52-6c8e295273d6', '8696693e-ba1c-493c-9475-5d77a654bcd6', '5b1d2bde-7a8e-4cd1-a1b0-e2ed19a85cf3', 'DESCARGA', 'Descarga Nagumo ', 780, '2026-11-16T20:00:28.01533+00:00', 'aguardando', null, 'f0d8d4fe-1b79-452b-a909-a33fd8b9107e/1794859225891.jpg', '{}'::jsonb, null, null, '2026-11-16T20:00:28.01533+00:00'),
('a31394a6-f023-4d29-a1ba-2decfe2c6c96', 'c4b0c16d-da42-4cb5-bf52-6c8e295273d6', '8696693e-ba1c-493c-9475-5d77a654bcd6', '5b1d2bde-7a8e-4cd1-a1b0-e2ed19a85cf3', 'PERNOITE', 'Pernoite 16/11', 250, '2026-11-16T20:06:31.913867+00:00', 'aguardando', null, 'f0d8d4fe-1b79-452b-a909-a33fd8b9107e/1794859590051.jpg', '{}'::jsonb, null, null, '2026-11-16T20:06:31.913867+00:00'),
('47dbc862-b138-4395-8752-92cbf7f4ee45', '810e4406-2fdd-492a-ae3c-99c3bb39001b', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 'PERNOITE', '16/11', 250, '2026-11-17T00:20:40.610217+00:00', 'aguardando', null, '8c545c51-3b36-49f1-8dfa-7292165d1506/1794874839373.jpg', '{}'::jsonb, null, null, '2026-11-17T00:20:40.610217+00:00'),
('8f9d20d0-b00c-4817-ae02-45772a336101', '660e7874-03ac-4f64-9148-28fd07b47128', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 'PERNOITE', '17/11', 250, '2026-11-17T21:46:40.216571+00:00', 'aguardando', null, '8c545c51-3b36-49f1-8dfa-7292165d1506/1794951999571.jpg', '{}'::jsonb, null, null, '2026-11-17T21:46:40.216571+00:00'),
('93f27a28-4926-4cdb-9198-35b0c97dcbba', '17d520c8-fbb0-4211-9a3e-8a2258dd7fc0', '8696693e-ba1c-493c-9475-5d77a654bcd6', '5b1d2bde-7a8e-4cd1-a1b0-e2ed19a85cf3', 'PERNOITE', 'Pernoite 17/11', 250, '2026-11-18T09:04:04.270404+00:00', 'aguardando', null, 'f0d8d4fe-1b79-452b-a909-a33fd8b9107e/1794992641941.jpg', '{}'::jsonb, null, null, '2026-11-18T09:04:04.270404+00:00'),
('ca90b4b8-5868-42a2-ad01-bbd73a30d82f', '2e5c0b31-67cf-402c-b951-e9f1caadff99', '087d83b3-6c0c-4951-8703-1484984de530', '2439a665-d0fc-4d02-8697-86653c1fd314', 'DESCARGA', '9 pallet ', 180, '2026-11-18T21:48:28.098521+00:00', 'aguardando', null, '8c545c51-3b36-49f1-8dfa-7292165d1506/1795038505717.jpg', '{}'::jsonb, null, null, '2026-11-18T21:48:28.098521+00:00')
;


-- ------------------------------------------------------- veiculos_documentos
-- O ARQUIVO em si (PDF do CRLV) está no Storage do projeto antigo e precisa ser
-- copiado separadamente. Aqui vai só a referência.
insert into veiculos_documentos (id, veiculo_id, tipo, arquivo_path, vencimento,
                                 enviado_por, criado_em) values
('810f0d1c-5e0f-4eb2-8bcf-7169723341d1', '087d83b3-6c0c-4951-8703-1484984de530', 'CRLV-e', '087d83b3-6c0c-4951-8703-1484984de530/1794261302309.pdf', null, 'cc4b0e93-0271-4932-873c-b7ea68fb4b61', '2026-11-09T21:55:03.586158+00:00'),
('47e6e20a-6b54-4fe5-b253-08287105f491', '8696693e-ba1c-493c-9475-5d77a654bcd6', 'CRLV-e', '8696693e-ba1c-493c-9475-5d77a654bcd6/1794261307935.pdf', null, 'cc4b0e93-0271-4932-873c-b7ea68fb4b61', '2026-11-09T21:55:08.48579+00:00')
;


-- -------------------------------------------------------- veiculo_motorista
insert into veiculo_motorista (motorista_id, veiculo_id, ativo) values
('2439a665-d0fc-4d02-8697-86653c1fd314', '087d83b3-6c0c-4951-8703-1484984de530', true),
('5b1d2bde-7a8e-4cd1-a1b0-e2ed19a85cf3', '8696693e-ba1c-493c-9475-5d77a654bcd6', true),
('4c92c2eb-f2e4-45d6-8e6e-2f3624194ec7', '8696693e-ba1c-493c-9475-5d77a654bcd6', false)
on conflict do nothing;


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
