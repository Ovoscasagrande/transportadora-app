/* ==========================================================================
   TRANSPORTADORA CASAGRANDE
   App de uma empresa só: sem multiempresa, sem frete.
   O que este app controla: caminhão, motorista, jornada, carregamento,
   combustível, despesa, manutenção, documento, disponibilidade e custo.
   ========================================================================== */

/* ------------------------------------------------------------------ config */
const CONFIG = {
  supabaseUrl: 'https://pupcqyhdzfuczayeiqis.supabase.co',
  supabaseKey: 'sb_publishable_0zBdcSHn2CCx0FMwNtPYeg_b5cAyarG'
};

/* ------------------------------------------------------------------ estado */
let sb = null;         // cliente supabase
let ME = null;         // { id, nome, perfil }
let rotaAtual = '';
const cache = {};      // cache por tela, limpo ao trocar de tela
let pilha = [];        // histórico interno (voltar)

/* ------------------------------------------------------------------ utils */
const $ = id => document.getElementById(id);
const el = (tag, attr = {}, html) => {
  const n = document.createElement(tag);
  Object.assign(n, attr);
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const brl = v => v == null || isNaN(v) ? '—'
  : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCurto = v => {
  if (v == null || isNaN(v)) return '—';
  const n = Number(v);
  if (Math.abs(n) >= 1000) return 'R$ ' + (n / 1000).toFixed(1).replace('.', ',') + 'k';
  return 'R$ ' + n.toFixed(0);
};
const num = (v, dec = 0) => v == null || isNaN(v) ? '—'
  : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const km = v => v == null || isNaN(v) ? '—' : num(v) + ' km';
/* Data sem hora.
   PEGADINHA que custou dado errado: new Date('2026-10-16') é meia-noite em UTC;
   no Brasil (UTC-3) isso vira 15/10 às 21h, e a data aparece UM DIA ANTES em
   todo lugar. Aqui a data pura é montada no fuso local, sem passar por UTC.
   Vale para data de entrega, vencimento de CNH/CRLV, data de despesa. */
const dataBR = d => {
  if (!d) return '—';
  const m = typeof d === 'string' && d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x)) return '—';
  return x.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};
const dataHoraBR = d => {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x)) return '—';
  return x.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    + ' ' + x.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
const hojeISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
/** "1.234,56" ou "1234.56" → 1234.56 */
const parseNum = v => {
  if (v == null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v).trim().replace(/\s/g, '').replace(/R\$/g, '');
  if (!s) return null;
  const temVirgula = s.includes(',');
  const limpo = temVirgula ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = parseFloat(limpo);
  return isNaN(n) ? null : n;
};
const diasEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

function toast(msg, erro = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = erro ? 'on erro' : 'on';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = ''; }, 2800);
}

/* ------------------------------------------------------------------ modal */
/* ==========================================================================
   ÍCONES — Lucide com fallback SVG embutido
   O motorista fica sem sinal no pátio: se o ícone dependesse do CDN, a tela
   ficaria com quadrados vazios justamente onde o app é mais usado.
   ========================================================================== */
const ICONES_SVG = {
  truck:'<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  home:'<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  'alert-triangle':'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
  receipt:'<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  wallet:'<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  route:'<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  'bar-chart':'<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>',
  ticket:'<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  'plus-circle':'<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  'user-plus':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  'id-card':'<path d="M16 10h2"/><path d="M16 14h2"/><path d="M6.17 15a3 3 0 0 1 5.66 0"/><circle cx="9" cy="11" r="2"/><rect x="2" y="5" width="20" height="14" rx="2"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  wrench:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  moon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  'log-out':'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  'chevron-left':'<path d="m15 18-6-6 6-6"/>',
  'chevron-right':'<path d="m9 18 6-6-6-6"/>',
  'more-horizontal':'<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  camera:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  'file-text':'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  'check-circle':'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  fuel:'<line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  'trending-down':'<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  'trending-up':'<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  'circle-alert':'<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  'wifi-off':'<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
  'refresh-cw':'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  circle:'<circle cx="12" cy="12" r="10"/>',
  'user-check':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>'
};

function temLucide() { return typeof window.lucide !== 'undefined'; }

/** HTML de um ícone: Lucide se carregou, senão sprite embutido. */
function icon(nome, extra) {
  const cls = extra ? ' ' + extra : '';
  if (temLucide() && window.lucide.icons && window.lucide.icons[nome]) {
    return '<i class="ic' + cls + '" data-lucide="' + nome + '"></i>';
  }
  const d = ICONES_SVG[nome];
  if (!d) return '';
  return '<i class="ic' + cls + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg></i>';
}

function desenhaIcones() {
  if (!window.lucide || !window.lucide.createIcons) return;
  try { window.lucide.createIcons(); } catch (e) {}
}

function aplicaIcones() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    if (el.dataset.pronto === '1') return;
    el.innerHTML = icon(el.dataset.icon);
    el.dataset.pronto = '1';
  });
  desenhaIcones();
}

/* ==========================================================================
   TEMA — escuro/claro, persistido, sincronizado com o ECharts
   ========================================================================== */
const CHAVE_TEMA = 'transp-tema';

function temaAtual() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function aplicaTema(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(CHAVE_TEMA, t); } catch (e) {}
  const b = document.getElementById('btn-tema');
  if (b) b.innerHTML = icon(t === 'light' ? 'moon' : 'sun');
  if (window.Analytics && window.Analytics.aoTrocarTema) {
    try { window.Analytics.aoTrocarTema(t); } catch (e) {}
  }
  desenhaIcones();
}

function alternaTema() { aplicaTema(temaAtual() === 'light' ? 'dark' : 'light'); }

function iniciaTema() {
  let salvo = null;
  try { salvo = localStorage.getItem(CHAVE_TEMA); } catch (e) {}
  // Padrão = ESCURO (Azul Noturno da marca). Não seguimos a preferência do
  // sistema: a identidade visual da Casagrande é escura, e abrir no claro
  // descaracterizaria a marca. O botão de tema continua disponível.
  aplicaTema(salvo || 'dark');
}

function modal({ titulo, campos = [], textoBotao = 'Salvar', aoSalvar, perigo = false }) {
  const m = $('modal');
  m.innerHTML = `<h3>${esc(titulo)}</h3>`;

  campos.forEach(c => {
    const wrap = el('div', { className: 'campo' });
    wrap.innerHTML = `<label for="${c.id}">${esc(c.label)}</label>`;
    let inp;
    if (c.tipo === 'textarea') {
      inp = el('textarea', { id: c.id, placeholder: c.ph || '' });
      inp.value = c.valor ?? '';
    } else if (c.tipo === 'select') {
      inp = el('select', { id: c.id });
      inp.innerHTML = c.opcoes.map(o =>
        `<option value="${esc(o[0])}" ${String(o[0]) === String(c.valor) ? 'selected' : ''}>${esc(o[1])}</option>`
      ).join('');
    } else if (c.tipo === 'password') {
      const wrapS = el('div', { className: 'campo-senha' });
      inp = el('input', { id: c.id, type: 'password', placeholder: c.ph || '' });
      const olho = el('button', { type: 'button', className: 'olho', 'aria-label': 'Mostrar senha' });
      olho.innerHTML = icon('sun');
      olho.onclick = function () {
        inp.type = inp.type === 'text' ? 'password' : 'text';
      };
      wrapS.append(inp, olho);
      wrap.appendChild(wrapS);
      if (c.dica) wrap.appendChild(el('p', { className: 'dica' }, esc(c.dica)));
      m.appendChild(wrap);
      return;
    } else if (c.tipo === 'file') {
      inp = el('input', { id: c.id, type: 'file', accept: c.aceita || 'application/pdf,image/*' });
    } else {
      inp = el('input', { id: c.id, type: c.tipo || 'text', placeholder: c.ph || '' });
      if (c.modo) inp.inputMode = c.modo;
      if (c.max && c.tipo === 'date') inp.max = c.max;
      inp.value = c.valor ?? '';
    }
    wrap.appendChild(inp);
    if (c.dica) wrap.appendChild(el('p', { className: 'dica' }, esc(c.dica)));
    m.appendChild(wrap);
  });

  const acoes = el('div', { className: 'acoes' });
  const bCanc = el('button', { className: 'btn fantasma', type: 'button' }, 'Cancelar');
  const bOk = el('button', { className: `btn ${perigo ? 'perigo' : ''}`, type: 'button' }, textoBotao);
  bCanc.onclick = fecharModal;
  bOk.onclick = async () => {
    const vals = {};
    campos.forEach(c => { vals[c.id] = $(c.id)?.value ?? ''; });
    bOk.disabled = true;
    try {
      const r = await aoSalvar(vals);
      if (r !== false) fecharModal();
    } catch (e) {
      toast(e.message || 'Erro ao salvar', true);
    } finally { bOk.disabled = false; }
  };
  acoes.append(bCanc, bOk);
  m.appendChild(acoes);
  $('veu').classList.add('on');
  setTimeout(() => m.querySelector('input,textarea,select')?.focus(), 80);
}
function fecharModal() { $('veu').classList.remove('on'); $('modal').innerHTML = ''; }
$('veu').addEventListener('click', e => { if (e.target.id === 'veu') fecharModal(); });

/* ------------------------------------------------------------------ telas */
const TELAS = {};
let navegou = false;

function ir(nome, opts = {}) {
  if (!TELAS[nome]) { console.warn('tela inexistente:', nome); nome = 'inicio'; }
  if (rotaAtual && rotaAtual !== nome && !opts.voltar) pilha.push(rotaAtual);
  if (opts.voltar) pilha.pop();
  rotaAtual = nome;
  Object.keys(cache).forEach(k => delete cache[k]);

  const tela = TELAS[nome];
  $('topo-titulo').textContent = typeof tela.titulo === 'function' ? tela.titulo() : tela.titulo;
  const voltar = $('topo-volta');
  voltar.classList.toggle('esconde', !pilha.length);
  voltar.onclick = () => ir(pilha[pilha.length - 1], { voltar: true });

  const acao = $('topo-acao');
  if (tela.acao) {
    acao.textContent = tela.acao.rotulo;
    acao.classList.remove('esconde');
    acao.onclick = () => tela.acao.clique();
  } else acao.classList.add('esconde');

  $('tela').innerHTML = '';
  if (window.Analytics && window.Analytics.limparGraficos) {
    try { window.Analytics.limparGraficos(); } catch (e) {}
  }
  desenhaTab(nome);
  fechaMais();
  Promise.resolve(tela.render($('tela'))).catch(e => {
    console.error(e);
    $('tela').innerHTML = `<div class="vazio"><div class="ic">⚠</div>Erro ao carregar: ${esc(e.message || e)}</div>`;
  });
  window.scrollTo(0, 0);
}

/* Abas por perfil. `grupo` só aparece na sidebar do desktop. */
const ABAS_POR_PERFIL = {
  gerencia: [
    { rota:'inicio', rotulo:'Início', icone:'home', grupo:'Operação' },
    { rota:'excecoes', rotulo:'Pendências', icone:'alert-triangle', grupo:'Operação' },
    { rota:'jornadas', rotulo:'Jornadas', icone:'route', grupo:'Operação' },
    { rota:'despesas', rotulo:'Despesas', icone:'receipt', grupo:'Financeiro' },
    { rota:'gasto-manual', rotulo:'Lançar gasto', icone:'plus-circle', grupo:'Financeiro' },
    { rota:'recebimentos', rotulo:'Recebimentos', icone:'wallet', grupo:'Financeiro' },
    { rota:'pedagio', rotulo:'Pedágio', icone:'ticket', grupo:'Financeiro' },
    { rota:'custo', rotulo:'Custo', icone:'bar-chart', grupo:'Financeiro' },
    { rota:'veiculos', rotulo:'Caminhões', icone:'truck', grupo:'Frota' },
    { rota:'motoristas', rotulo:'Motoristas', icone:'id-card', grupo:'Frota' },
    { rota:'cadastro', rotulo:'Cadastro', icone:'user-plus', grupo:'Frota' },
    { rota:'usuarios', rotulo:'Usuários', icone:'user-check', grupo:'Frota' }
  ],
  conferente: [
    { rota:'inicio', rotulo:'Início', icone:'home', grupo:'Operação' },
    { rota:'excecoes', rotulo:'Pendências', icone:'alert-triangle', grupo:'Operação' },
    { rota:'jornadas', rotulo:'Jornadas', icone:'route', grupo:'Operação' },
    { rota:'despesas', rotulo:'Despesas', icone:'receipt', grupo:'Financeiro' },
    { rota:'gasto-manual', rotulo:'Lançar gasto', icone:'plus-circle', grupo:'Financeiro' },
    { rota:'recebimentos', rotulo:'Recebimentos', icone:'wallet', grupo:'Financeiro' },
    { rota:'conferencia', rotulo:'Conferência', icone:'check-circle', grupo:'Operação' }
  ],
  mecanico: [
    { rota:'oficina', rotulo:'Oficina', icone:'wrench', grupo:'Oficina' },
    { rota:'veiculos', rotulo:'Caminhões', icone:'truck', grupo:'Oficina' }
  ],
  motorista: [
    { rota:'meu-dia', rotulo:'Meu dia', icone:'home', grupo:'Meu dia' },
    { rota:'jornada-motorista', rotulo:'Jornada', icone:'truck', grupo:'Meu dia' },
    { rota:'relatorio', rotulo:'Relatório', icone:'bar-chart', grupo:'Meu dia' },
    { rota:'meus-gastos', rotulo:'Gastos', icone:'receipt', grupo:'Meu dia' },
    { rota:'minha-cnh', rotulo:'CNH', icone:'id-card', grupo:'Meu dia' },
    { rota:'avisos', rotulo:'Avisos', icone:'bell', grupo:'Meu dia' }
  ]
};

function abasDoPerfil() {
  return ABAS_POR_PERFIL[(ME && ME.perfil)] || ABAS_POR_PERFIL.motorista;
}

/* Mobile: cabem 5 itens. O resto vai para o bottom sheet do "Mais" — melhor
   que espremer 11 abas em 390px e nenhuma ser legível. */
const MAX_TAB_MOBILE = 5;

function desenhaTab(atual) {
  const abas = abasDoPerfil();

  /* ---------- SIDEBAR (desktop) ---------- */
  const nav = $('sb-nav');
  if (nav) {
    const grupos = {};
    abas.forEach(function (a) { (grupos[a.grupo] = grupos[a.grupo] || []).push(a); });
    nav.innerHTML = Object.keys(grupos).map(function (g) {
      return '<div class="sb-grupo">' + esc(g) + '</div>' +
        grupos[g].map(function (a) {
          return '<button data-rota="' + a.rota + '" class="' + (a.rota === atual ? 'on' : '') + '">' +
            icon(a.icone) + '<span>' + esc(a.rotulo) + '</span></button>';
        }).join('');
    }).join('');
    nav.querySelectorAll('[data-rota]').forEach(function (b) {
      b.onclick = function () { pilha = []; ir(b.dataset.rota); };
    });
    const u = $('sb-usuario');
    if (u && ME) {
      const ini = (ME.nome || '?').trim().split(/\s+/).map(function (p) { return p[0]; })
        .slice(0, 2).join('').toUpperCase();
      u.innerHTML = '<div class="sb-avatar">' + esc(ini) + '</div>' +
        '<div style="min-width:0"><div class="sb-u-nome">' + esc(ME.nome || '—') + '</div>' +
        '<div class="sb-u-perfil">' + esc(ME.perfil || '') + '</div></div>';
    }
    const sx = $('sb-sair');
    if (sx) sx.onclick = function () { sair(); };
    desenhaIcones();
  }

  /* ---------- BOTTOM NAV (mobile) ---------- */
  const barra = $('tab');
  if (!abas.length) { barra.classList.add('esconde'); document.body.classList.add('sem-tab'); return; }
  const visiveis = abas.slice(0, MAX_TAB_MOBILE);
  const resto = abas.slice(MAX_TAB_MOBILE);
  const atualNoResto = resto.some(function (a) { return a.rota === atual; });

  barra.classList.remove('esconde');
  document.body.classList.remove('sem-tab');
  barra.innerHTML = visiveis.map(function (a) {
    return '<button data-rota="' + a.rota + '" class="' + (a.rota === atual ? 'on' : '') + '">' +
      '<span class="ic">' + icon(a.icone) + '</span>' + esc(a.rotulo) + '</button>';
  }).join('') + (resto.length
    ? '<button id="bt-mais" class="' + (atualNoResto ? 'on' : '') + '"><span class="ic">' +
      icon('more-horizontal') + '</span>Mais</button>' : '');

  barra.querySelectorAll('[data-rota]').forEach(function (b) {
    b.onclick = function () { pilha = []; ir(b.dataset.rota); };
  });
  const bm = $('bt-mais');
  if (bm) bm.onclick = function () { abreMais(resto, atual); };
  desenhaIcones();
}

function abreMais(itens, atual) {
  const veu = $('mais-veu'), sheet = $('mais-sheet');
  if (!veu || !sheet) return;
  sheet.innerHTML = '<div class="alca"></div><h3>Mais telas</h3><div class="mais-grade">' +
    itens.map(function (a) {
      return '<button class="mais-item ' + (a.rota === atual ? 'on' : '') + '" data-rota="' + a.rota + '">' +
        icon(a.icone) + '<span>' + esc(a.rotulo) + '</span></button>';
    }).join('') + '</div>';
  veu.classList.remove('esconde');
  sheet.querySelectorAll('[data-rota]').forEach(function (b) {
    b.onclick = function () { fechaMais(); pilha = []; ir(b.dataset.rota); };
  });
  veu.onclick = function (e) { if (e.target === veu) fechaMais(); };
  desenhaIcones();
}
function fechaMais() { const v = $('mais-veu'); if (v) v.classList.add('esconde'); }

function atualizaConexao() {
  const el = $('status-conexao');
  if (el) {
    el.classList.toggle('off', !navigator.onLine);
    el.style.display = 'inline-block';
  }
  if (window.OfflineSync && window.OfflineSync.atualizaBanner) window.OfflineSync.atualizaBanner();
}

/* ------------------------------------------------------------------ login */
async function entrar(email, senha) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  return data.user;
}
async function carregaPerfil(user) {
  const { data, error } = await sb.from('usuarios').select('id,nome,perfil,ativo').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (!data) {
    // autenticou mas não tem registro em usuarios: é cadastro sem aprovação
    const e = new Error('PENDENTE');
    e.pendente = true;
    throw e;
  }
  if (data.perfil === 'pendente') {
    const e = new Error('PENDENTE');
    e.pendente = true;
    throw e;
  }
  if (!data.ativo) {
    const e = new Error('PENDENTE');
    e.pendente = true;
    throw e;
  }
  return data;
}
function mostraApp() {
  $('login').classList.add('esconde');
  $('app').classList.remove('esconde');
  aplicaIcones();
}

/* ==========================================================================
   RECUPERAÇÃO DE SENHA

   Fluxo (o mesmo do app da OVOS, que é o padrão do Supabase):
   1. "Esqueci minha senha" -> sb.auth.resetPasswordForEmail manda o e-mail
   2. o e-mail traz um link que volta para o app com um token na URL
   3. o app detecta o token, mostra a tela "Nova senha"
   4. sb.auth.updateUser({password}) grava a senha nova

   Duas travas que eu imponho:
   - A resposta é SEMPRE a mesma ("se este e-mail estiver cadastrado..."),
     exista ou não a conta. Senão a tela vira um verificador de quem tem
     acesso ao sistema — informação que não deve vazar.
   - O token do link é de uso único e expira. A tela só aparece se o Supabase
     validar a sessão de recuperação; link velho cai na tela de login.
   ========================================================================== */

/** Manda o e-mail de recuperação. Responde igual exista ou não a conta. */
async function esqueciSenha() {
  const email = ($('lg-email').value || '').trim();
  const msg = $('lg-msg');

  if (!email) {
    msg.style.color = 'var(--atencao)';
    msg.textContent = 'Digite seu e-mail no campo acima e toque de novo.';
    $('lg-email').focus();
    return;
  }

  const btn = $('lg-esqueci');
  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = 'Enviando…';

  try {
    /* O link do e-mail precisa voltar para o app PUBLICADO.
       Se eu usar window.location, quem chamar de localhost recebe um link
       para localhost — e no celular isso é uma página que não abre.
       Fixo a URL de produção e só caio no local quando o app já está lá. */
    const PRODUCAO = 'https://ovoscasagrande.github.io/transportadora-app/';
    const local = /localhost|127\.0\.0\.1|file:/.test(window.location.href);
    const destino = local ? window.location.origin + window.location.pathname : PRODUCAO;

    await sb.auth.resetPasswordForEmail(email, { redirectTo: destino });
  } catch (e) {
    const m = (e && e.message) || '';
    // limite de envio é um problema REAL e diferente de "e-mail não existe":
    // o usuário precisa saber que foi barrado pelo servidor, não que errou.
    if (/rate limit|too many|email rate/i.test(m)) {
      msg.style.color = 'var(--critico)';
      msg.innerHTML = 'O servidor de e-mail atingiu o limite de envios por hora.<br>' +
        '<span class="txt3" style="font-size:11.5px">Tente de novo em 1 hora, ou peça à gerência para redefinir sua senha.</span>';
      return;
    }
    console.warn('reset:', m);
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
    msg.style.color = 'var(--ok)';
    msg.innerHTML = 'Se este e-mail estiver cadastrado, o link de recuperação chega em instantes.<br>' +
      '<span class="txt3" style="font-size:11.5px">Confira também a caixa de spam.</span>';
  }
}

/** Troca a senha com a sessão de recuperação ativa. */
async function salvarNovaSenha(e) {
  e.preventDefault();
  const a = $('rd-senha').value;
  const b = $('rd-senha2').value;
  const msg = $('rd-msg');
  const btn = $('rd-btn');

  if (a.length < 6) {
    msg.style.color = 'var(--critico)';
    msg.textContent = 'A senha precisa ter pelo menos 6 caracteres.';
    return;
  }
  if (a !== b) {
    msg.style.color = 'var(--critico)';
    msg.textContent = 'As duas senhas não são iguais.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Salvando…';
  try {
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) throw error;

    msg.style.color = 'var(--ok)';
    msg.textContent = 'Senha alterada. Entrando…';
    // limpa o token da URL antes de entrar, para não reabrir esta tela
    history.replaceState(null, '', window.location.pathname);
    setTimeout(() => mostraLogin(), 900);
  } catch (err) {
    msg.style.color = 'var(--critico)';
    msg.textContent = err.message || 'Não consegui salvar a nova senha.';
    btn.disabled = false;
    btn.textContent = 'Salvar senha';
  }
}

/** Detecta o retorno do link de recuperação e abre a tela certa. */
async function checaRecuperacao() {
  if (!sb) return false;

  // o Supabase devolve os tokens no hash (#access_token=...&type=recovery)
  const hash = window.location.hash || '';
  const busca = window.location.search || '';
  const temToken = /access_token|type=recovery|error_description/.test(hash + busca);
  if (!temToken) return false;

  const erroUrl = /error_description=([^&]+)/.exec(hash + busca);
  if (erroUrl) {
    $('lg-msg').style.color = 'var(--critico)';
    $('lg-msg').textContent = 'O link expirou ou já foi usado. Peça outro.';
    history.replaceState(null, '', window.location.pathname);
    mostraLogin();
    return true;
  }

  try {
    // o supabase-js consome o hash sozinho ao iniciar; garanto a sessão
    const { data } = await sb.auth.getSession();
    if (data?.session) {
      $('login').classList.add('esconde');
      $('app').classList.add('esconde');
      $('redefinir').classList.remove('esconde');
      return true;
    }
  } catch (e) {
    console.warn(e);
  }
  return false;
}


/* ==========================================================================
   AUTOCADASTRO COM APROVAÇÃO

   O link do app é público. Então o cadastro cria o usuário como 'pendente':
   ele entra, mas vê "aguardando liberação". A gerência define o perfil.
   O banco força isso (policy `aut_cadastro`), não a tela — testado: tentar
   inserir perfil='gerencia' é recusado pelo Postgres.
   ========================================================================== */

function mostraCadastro() {
  $('login').classList.add('esconde');
  $('redefinir').classList.add('esconde');
  $('aguardando').classList.add('esconde');
  $('app').classList.add('esconde');
  $('cadastro').classList.remove('esconde');
  aplicaIcones();
}

function mostraAguardando() {
  $('login').classList.add('esconde');
  $('cadastro').classList.add('esconde');
  $('redefinir').classList.add('esconde');
  $('app').classList.add('esconde');
  $('aguardando').classList.remove('esconde');
  aplicaIcones();
}

async function criarCadastro(e) {
  e.preventDefault();
  const nome = ($('cd-nome').value || '').trim();
  const email = ($('cd-email').value || '').trim().toLowerCase();
  const tel = ($('cd-tel').value || '').replace(/\D/g, '') || null;
  const s1 = $('cd-senha').value;
  const s2 = $('cd-senha2').value;
  const msg = $('cd-msg');
  const btn = $('cd-btn');

  const erro = t => { msg.style.color = 'var(--critico)'; msg.textContent = t; };

  if (!nome) return erro('Informe seu nome.');
  if (!email) return erro('Informe o e-mail.');
  if (s1.length < 6) return erro('A senha precisa ter pelo menos 6 caracteres.');
  if (s1 !== s2) return erro('As duas senhas não são iguais.');

  btn.disabled = true;
  btn.textContent = 'Criando…';
  msg.textContent = '';

  try {
    const { data, error } = await sb.auth.signUp({
      email, password: s1,
      options: { data: { nome }, emailRedirectTo: window.location.origin + window.location.pathname }
    });
    if (error) throw error;

    const uid = data?.user?.id;
    if (!uid) throw new Error('Não consegui criar o cadastro.');

    // Se o projeto exige confirmação de e-mail, o signUp não devolve sessão.
    // Nesse caso o usuário só entra depois de confirmar — aviso, não finjo.
    const temSessao = !!data.session;

    if (temSessao) {
      // com sessão: cria o registro como 'pendente' pelo próprio usuário
      const { error: e2 } = await sb.from('usuarios').insert({
        id: uid, nome, perfil: 'pendente', ativo: true, telefone: tel
      });
      if (e2 && !/duplicate|já existe/i.test(e2.message)) {
        console.warn('registro pendente:', e2.message);
      }
    }

    msg.style.color = 'var(--ok)';
    msg.innerHTML = temSessao
      ? 'Cadastro criado! Aguardando liberação da gerência.'
      : 'Cadastro criado! <b>Confirme seu e-mail</b> e depois entre com a senha.';

    setTimeout(async () => {
      if (temSessao) {
        await sb.auth.signOut();
      }
      mostraAguardando();
    }, 1400);

  } catch (err) {
    const m = err?.message || '';
    if (/already registered|já cadastrado|User already/i.test(m)) {
      erro('Este e-mail já tem cadastro. Use "Esqueci minha senha" se precisar.');
    } else if (/invalid.*email/i.test(m)) {
      erro('E-mail inválido.');
    } else {
      erro(m || 'Não consegui criar o cadastro.');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Criar cadastro';
  }
}

function mostraLogin() {
  $('redefinir').classList.add('esconde');
  $('cadastro').classList.add('esconde');
  $('aguardando').classList.add('esconde');
  $('app').classList.add('esconde');
  $('login').classList.remove('esconde');
  aplicaIcones();
}

function mostraLogin__antigo() {
  $('app').classList.add('esconde');
  $('login').classList.remove('esconde');
}

$('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('lg-btn'), msg = $('lg-msg');
  btn.disabled = true; btn.textContent = 'Entrando…'; msg.textContent = '';
  try {
    const user = await entrar($('lg-email').value.trim(), $('lg-senha').value);
    ME = await carregaPerfil(user);
    mostraApp();
    ir('inicio');
  } catch (err) {
    if (err.pendente) { mostraAguardando(); return; }
    msg.textContent = err.message || 'Não consegui entrar';
    msg.style.color = 'var(--critico)';
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});

async function sair() {
  await sb.auth.signOut();
  ME = null; pilha = []; rotaAtual = '';
  mostraLogin();
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  iniciaTema();
  aplicaIcones();
  window.addEventListener('online', atualizaConexao);
  window.addEventListener('offline', atualizaConexao);
  atualizaConexao();
  const bt = $('btn-tema');
  if (bt) bt.onclick = alternaTema;
  const be = $('lg-esqueci');
  if (be) be.onclick = esqueciSenha;
  const bc = $('lg-cadastrar');
  if (bc) bc.onclick = mostraCadastro;
  const fcad = $('form-cadastro');
  if (fcad) fcad.addEventListener('submit', criarCadastro);
  const bv = $('cd-voltar');
  if (bv) bv.onclick = mostraLogin;
  const as = $('ag-sair');
  if (as) as.onclick = async () => { try { await sb.auth.signOut(); } catch (e) {} mostraLogin(); };
  const fr = $('form-redefinir');
  if (fr) fr.addEventListener('submit', salvarNovaSenha);
  if (!window.supabase) {
    $('lg-msg').textContent = 'Não carregou a biblioteca do Supabase (verifique a internet).';
    return;
  }
  sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

  // volta do e-mail de recuperação? mostra a tela de nova senha
  if (await checaRecuperacao()) return;

  const { data } = await sb.auth.getSession();
  if (data?.session?.user) {
    try {
      ME = await carregaPerfil(data.session.user);
      mostraApp();
      ir('inicio');
    } catch (e) {
      if (e.pendente) { mostraAguardando(); }
      else { mostraLogin(); $('lg-msg').textContent = e.message; }
    }
  }
}

/* ------------------------------------------------------------------ consulta */
async function q(tabela, cols = '*') {
  const { data, error } = await sb.from(tabela).select(cols);
  if (error) throw error;
  return data || [];
}

/* roda depois de todos os scripts carregarem, quando TELAS já existe */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else { boot(); }
