/* ==========================================================================
   LEITOR DE PEDÁGIO (PDF do cartão CGMP) — roda no NAVEGADOR

   Por que assim: o usuário escolhe o PDF e o app lê sozinho. Antes eu pedia
   para colar um JSON gerado por script Python — isso é gambiarra de
   programador e não tem lugar num app que o dono usa no celular.

   O formato do relatório CGMP:
       Data               Veículo  Tipo      Descrição                      Valor (R$)
       06/11/2026 04:15   UQA6I75  PASSAGEM  SP348, KM77+430, NORTE, ITUPEVA  R$28,60
                                                                  SP348, KM39+047, NORTE, FRANCO DA
       06/11/2026 03:50   UQA6I75  PASSAGEM                                    R$29,00
                                                                            ROCHA
       Total (R$)                                                          457,35

   O ponto difícil: quando a praça é longa, o PDF joga o começo dela numa linha
   ANTES da linha de valor e o fim numa linha DEPOIS. Parser ingênuo embaralha
   as praças — e praça trocada é sinal de que a linha foi mal lida.

   Mesma lógica do script Python que testei nos arquivos reais
   (26 passagens / R$ 457,35 e 24 / R$ 442,45, os dois fechando no centavo).
   ========================================================================== */

const LeitorPedagio = (() => {

  // a praça pode estar VAZIA: (.*?) em vez de (\S+) .*?
  const RE_VALOR = /^\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+([A-Z0-9]{7})\s+(\S+)\s*(.*?)\s*R\$\s*([\d.,]+)\s*$/;
  const RE_TOTAL = /Total\s*\(R\$\)\s*([\d.,]+)/i;
  const CABECALHO = ['Nome:', 'CPF', 'Data ', 'Atenciosamente', 'CGMP', 'AVENIDA',
                     'Central', 'Relatório', 'Total', 'Permanência'];

  /** '1.234,56' -> 1234.56 */
  function numBR(txt) {
    let t = String(txt).replace(/R\$|\s/g, '');
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    const v = parseFloat(t);
    return isFinite(v) ? Math.round(v * 100) / 100 : 0;
  }

  /** Linha que só pode ser pedaço de praça: sem valor, sem data, só texto. */
  function ehTextoPraca(ln) {
    const r = String(ln).trim();
    if (!r || r.indexOf('R$') >= 0) return false;
    if (/^\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/.test(ln)) return false;
    for (let i = 0; i < CABECALHO.length; i++) {
      if (r.indexOf(CABECALHO[i]) === 0) return false;
    }
    return /^[A-ZÀ-Ú0-9\s,+\/º°.\-]+$/.test(r);
  }

  /**
   * Recebe o texto extraído do PDF (uma linha por linha) e devolve as passagens.
   * Esta é a função que faz o trabalho — testável isoladamente.
   */
  function interpretaTexto(texto) {
    const linhas = String(texto).split(/\r?\n/);

    // 1) tokeniza preservando a ordem: linha de valor ou pedaço de praça
    const itens = [];
    linhas.forEach(ln => {
      const m = ln.match(RE_VALOR);
      if (m) {
        itens.push({
          tipo: 'val', data: m[1], hora: m[2], placa: m[3], tipoTx: m[4],
          praca: m[5].replace(/\s+/g, ' ').replace(/^[ ,]+|[ ,]+$/g, ''),
          valor: numBR(m[6])
        });
      } else if (ehTextoPraca(ln)) {
        itens.push({ tipo: 'txt', texto: ln.replace(/\s+/g, ' ').replace(/^[ ,]+|[ ,]+$/g, '') });
      }
    });

    // 2) praça vazia -> o texto imediatamente ANTERIOR é o começo dela
    itens.forEach((it, i) => {
      if (it.tipo !== 'val' || it.praca) return;
      const antes = [];
      let j = i - 1;
      while (j >= 0 && itens[j].tipo === 'txt' && !itens[j].usado) { antes.unshift(itens[j]); j--; }
      if (antes.length) {
        it.praca = antes.map(a => a.texto).join(' ');
        antes.forEach(a => { a.usado = true; });
      }
    });

    // 3) texto seguinte: continuação desta entrada, a menos que a PRÓXIMA
    //    também esteja sem praça (aí pertence a ela)
    itens.forEach((it, i) => {
      if (it.tipo !== 'val') return;
      const seg = [];
      let j = i + 1;
      while (j < itens.length && itens[j].tipo === 'txt' && !itens[j].usado) { seg.push(itens[j]); j++; }
      if (!seg.length) return;

      let prox = null;
      for (let k = i + 1; k < itens.length; k++) if (itens[k].tipo === 'val') { prox = itens[k]; break; }
      if (prox && !prox.praca) return;   // deixa para a próxima

      it.praca = (it.praca + ' ' + seg.map(s => s.texto).join(' ')).replace(/^[ ,]+|[ ,]+$/g, '');
      seg.forEach(s => { s.usado = true; });
    });

    const passagens = itens.filter(i => i.tipo === 'val').map(i => ({
      data: i.data, hora: i.hora, placa: i.placa, tipo: i.tipoTx,
      praca: i.praca.replace(/\s+/g, ' ').replace(/^[ ,]+|[ ,]+$/g, ''),
      valor: i.valor
    }));

    let total = null;
    linhas.forEach(ln => {
      const mt = ln.match(RE_TOTAL);
      if (mt) total = numBR(mt[1]);
    });

    const soma = Math.round(passagens.reduce((s, p) => s + p.valor, 0) * 100) / 100;
    return {
      passagens: passagens,
      quantidade: passagens.length,
      soma: soma,
      totalNoPdf: total,
      confere: total == null ? null : Math.abs(soma - total) < 0.02
    };
  }

  /**
   * Lê um arquivo PDF (File) e devolve o resultado.
   * Usa pdf.js no navegador — nada sai do aparelho do usuário.
   */
  async function lerPDF(file) {
    if (typeof window.pdfjsLib === 'undefined') {
      throw new Error('O leitor de PDF não carregou. Verifique a conexão e recarregue.');
    }
    const buf = await file.arrayBuffer();
    const doc = await window.pdfjsLib.getDocument({ data: buf }).promise;

    let texto = '';
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();

      /* O pdf.js devolve as palavras SOLTAS, cada uma com sua posição.
         Palavras da mesma linha visual compartilham o mesmo `y` (transform[5]).
         Sem agrupar por y e sem juntar com ESPAÇO, "19/11/2026" "11:44"
         "UQU4A94" viram "19/11/202611:44UQU4A94" e o parser não reconhece
         nada — foi exatamente o que aconteceu: 29 de 31 passagens lidas. */
      const itens = content.items
        .filter(it => it.str && it.str.trim() !== '')
        .map(it => ({
          x: it.transform[4],
          y: Math.round(it.transform[5] * 10) / 10,
          txt: it.str
        }));

      // agrupa por y (tolerância de 2 pontos para linhas levemente tortas)
      const linhas = [];
      itens.forEach(it => {
        let linha = null;
        for (let i = linhas.length - 1; i >= 0 && i >= linhas.length - 40; i--) {
          if (Math.abs(linhas[i].y - it.y) <= 2) { linha = linhas[i]; break; }
        }
        if (!linha) { linha = { y: it.y, itens: [] }; linhas.push(linha); }
        linha.itens.push(it);
      });

      // ordena por y (topo -> base) e, dentro da linha, por x
      linhas.sort((a, b) => b.y - a.y);
      linhas.forEach(l => {
        l.itens.sort((a, b) => a.x - b.x);
        // junta com ESPAÇO: é o que separa data/hora/placa/valor
        texto += l.itens.map(i => i.txt).join(' ').replace(/\s+/g, ' ').trim() + '\n';
      });
    }

    return interpretaTexto(texto);
  }

  return { lerPDF, interpretaTexto, numBR };
})();

window.LeitorPedagio = LeitorPedagio;
