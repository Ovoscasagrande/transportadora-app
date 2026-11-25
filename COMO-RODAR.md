# COMO RODAR — leia antes de tudo

## 1. O SQL (obrigatório, uma vez)

Abra o painel do Supabase → **SQL Editor** → **New query** → cole o conteúdo
inteiro de:

    transportadora-app/supabase/migracao_melhorias_operacionais.sql

→ **Run**. É idempotente: pode rodar de novo sem erro.

No fim ele imprime uma conferência com 4 linhas. Todas devem dizer `ok`:
`jornada_checklists` · `relatorio_frota_periodo()` ·
`vw_auditoria_pedagio_jornada` · `trigger do checklist`.

Sem isso, três telas mostram um aviso âmbar explicando o que falta — elas não
quebram, mas o checklist, o fechamento líquido e a auditoria de pedágio não
funcionam.

## 2. O app

    cd transportadora-app
    python3 -m http.server 8000
    # abra http://localhost:8000

HTML/CSS/JS puro, sem build. Banco e login já configurados em
`assets/js/app.js`.

## 3. O que mudou nesta versão

- **Redesign completo**: sidebar no desktop, bottom nav + gaveta no celular,
  tema claro/escuro, ícones vetoriais com fallback offline, tipografia nova.
- **6 melhorias operacionais**: fila offline, checklist de 15 s, alerta de
  queda de km/L, semáforo preventivo (óleo/CNH/CRLV), auditoria de pedágio e
  fechamento líquido por caminhão.

## 4. Onde ler mais

- `transportadora-app/LEIA-PRIMEIRO-HANDOFF.md` — **seção 15** documenta o novo
  design system, as 6 melhorias e como rodar o SQL. As seções 13 e 14 são o
  motor de gráficos ECharts, que foi preservado 100%.
- `transportadora-app/telas/INDICE-DAS-TELAS.md` — as 21 telas.

## 5. Pendência de dado real

Os dois caminhões estão sem `ultima_troca_oleo_km`. Sem esse número o semáforo
de óleo mostra "configurar" em vez de uma barra verde — é proposital: não
invento verde falso. Preencha em **Cadastro → editar caminhão**.
