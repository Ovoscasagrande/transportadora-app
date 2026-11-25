// simula o que o pdf.js entrega: palavras soltas com x/y
const fs = require('fs');
const { execSync } = require('child_process');

function palavrasDoPDF(pdf) {
  const xml = execSync(`pdftotext -bbox "${pdf}" -`, {encoding:'utf8', maxBuffer:1e8});
  const re = /<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>([^<]*)<\/word>/g;
  const itens = [];
  let m;
  while ((m = re.exec(xml))) {
    const txt = m[3].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
    if (!txt.trim()) continue;
    itens.push({ x: parseFloat(m[1]), y: Math.round(parseFloat(m[2])*10)/10, txt });
  }
  return itens;
}

// mesma função do leitor-pedagio.js
function reconstroi(itens) {
  const linhas = [];
  itens.forEach(it => {
    let linha = null;
    for (let i = linhas.length-1; i>=0 && i>=linhas.length-40; i--) {
      if (Math.abs(linhas[i].y - it.y) <= 2) { linha = linhas[i]; break; }
    }
    if (!linha) { linha = { y: it.y, itens: [] }; linhas.push(linha); }
    linha.itens.push(it);
  });
  linhas.sort((a,b)=>b.y-a.y);
  return linhas.map(l => {
    l.itens.sort((a,b)=>a.x-b.x);
    return l.itens.map(i=>i.txt).join(' ').replace(/\s+/g,' ').trim();
  }).join('\n');
}

for (const pdf of process.argv.slice(2)) {
  const txt = reconstroi(palavrasDoPDF(pdf));
  // roda o parser (copia da logica do leitor)
  const RE = /^\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+([A-Z0-9]{7})\s+(\S+)\s*(.*?)\s*R\$\s*([\d.,]+)\s*$/;
  const nums = s => { let t=String(s).replace(/R\$|\s/g,''); if(t.includes(','))t=t.replace(/\./g,'').replace(',','.'); return Math.round(parseFloat(t)*100)/100; };
  let p=[], total=null;
  txt.split('\n').forEach(ln => {
    const m = ln.match(RE);
    if (m) p.push({hora:m[2], praca:m[5].trim(), valor:nums(m[6])});
    const mt = ln.match(/Total\s*\(R\$\)\s*([\d.,]+)/i);
    if (mt) total = nums(mt[1]);
  });
  const soma = Math.round(p.reduce((s,x)=>s+x.valor,0)*100)/100;
  console.log(`${pdf.split('/').pop().slice(0,20)}  lidas=${p.length}  soma=R$${soma.toFixed(2)}  pdf=R$${total}  ${Math.abs(soma-total)<0.02?'CONFERE':'DIVERGE'}`);
}
