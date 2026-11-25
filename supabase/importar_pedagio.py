#!/usr/bin/env python3
"""
Lê o extrato de pedágio (relatório CGMP) e devolve as passagens em JSON.

Formato real ("Relatório de Lançamentos", CGMP):
    Data               Veículo   Tipo      Descrição                       Valor (R$)
    06/11/2026 04:15   UQA6I75   PASSAGEM  SP348, KM77+430, NORTE, ITUPEVA   R$28,60
                                                                 SP348, KM39+047, NORTE, FRANCO DA
    06/11/2026 03:50   UQA6I75   PASSAGEM                                      R$29,00
                                                                     ROCHA
    Total (R$)                                                          457,35

O ponto difícil: quando a praça é longa, o pdftotext joga o começo dela numa
linha solta ANTES da linha de valor, e o fim numa linha DEPOIS. É por isso que
um parser ingênuo gera praça trocada — e praça trocada não é só cosmético, é o
sinal de que a linha foi mal lida, e aí o valor também pode estar.

Estratégia: manter a ordem dos itens (linha-de-valor ou linha-de-texto) e
decidir a quem pertence cada texto pela vizinhança:
  - se a linha de valor tem praça VAZIA, os textos imediatamente anteriores
    são dela (eram o começo da praça);
  - se a linha de valor tem praça, os textos seguintes pertencem à PRÓXIMA
    entrada quando essa próxima também está sem praça; senão são continuação
    desta.

Uso:
    python3 importar_pedagio.py arquivo.pdf
"""
import json
import re
import subprocess
import sys

RE_VALOR = re.compile(
    r'^\s*(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2})\s+([A-Z0-9]{7})\s+(\S+)\s+(.*?)\s+R\$\s*([\d.,]+)\s*$'
)
RE_TOTAL = re.compile(r'Total \(R\$\)\s+([\d.,]+)')
RE_CABECALHO = ('Nome:', 'CPF', 'Data ', 'Atenciosamente', 'CGMP', 'AVENIDA',
                'Central', 'Relatório', 'Total', 'Permanência')


def num_brl(txt):
    """'1.234,56' -> 1234.56"""
    txt = txt.strip().replace('R$', '').replace(' ', '')
    if ',' in txt:
        txt = txt.replace('.', '').replace(',', '.')
    return round(float(txt), 2)


def eh_texto_praca(ln):
    """Linha que só pode ser continuação de praça: sem valor, sem data."""
    r = ln.strip()
    if not r or 'R$' in r:
        return False
    if re.match(r'^\s*\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}', ln):
        return False
    if any(r.startswith(p) for p in RE_CABECALHO):
        return False
    return bool(re.match(r'^[A-ZÀ-Ú0-9\s,+/º°.\-]+$', r))


def extrai(caminho_pdf):
    txt = subprocess.run(['pdftotext', '-layout', caminho_pdf, '-'],
                         capture_output=True, text=True, check=True).stdout
    linhas = txt.splitlines()

    # 1) tokeniza preservando a ordem
    itens = []
    for ln in linhas:
        m = RE_VALOR.match(ln)
        if m:
            data, hora, placa, tipo, praca, valor = m.groups()
            itens.append({'tipo': 'val', 'data': data, 'hora': hora, 'placa': placa,
                          'tipo_tx': tipo, 'praca': re.sub(r'\s+', ' ', praca).strip(' ,'),
                          'valor': num_brl(valor)})
        elif eh_texto_praca(ln):
            itens.append({'tipo': 'txt', 'texto': re.sub(r'\s+', ' ', ln).strip(' ,')})

    # 2) atribui cada texto de praça à entrada certa
    for i, it in enumerate(itens):
        if it['tipo'] != 'val':
            continue

        # 2a) praça vazia -> o texto imediatamente ANTERIOR é o começo dela
        if not it['praca']:
            antes = []
            j = i - 1
            while j >= 0 and itens[j]['tipo'] == 'txt' and not itens[j].get('_usado'):
                antes.insert(0, itens[j])
                j -= 1
            if antes:
                it['praca'] = ' '.join(a['texto'] for a in antes)
                for a in antes:
                    a['_usado'] = True

    for i, it in enumerate(itens):
        if it['tipo'] != 'val':
            continue

        # 2b) texto imediatamente seguinte: continuação desta entrada,
        #     a menos que a PRÓXIMA entrada também esteja sem praça
        j = i + 1
        seguintes = []
        while j < len(itens) and itens[j]['tipo'] == 'txt' and not itens[j].get('_usado'):
            seguintes.append(itens[j])
            j += 1
        if not seguintes:
            continue

        prox = next((x for x in itens[i + 1:] if x['tipo'] == 'val'), None)
        if prox and not prox['praca']:
            continue          # deixa para a próxima entrada (que está vazia)

        it['praca'] = (it['praca'] + ' ' + ' '.join(s['texto'] for s in seguintes)).strip(' ,')
        for s in seguintes:
            s['_usado'] = True

    passagens = [{
        'data': it['data'], 'hora': it['hora'], 'placa': it['placa'],
        'tipo': it['tipo_tx'], 'praca': re.sub(r'\s+', ' ', it['praca']).strip(' ,'),
        'valor': it['valor']
    } for it in itens if it['tipo'] == 'val']

    total = None
    for ln in linhas:
        mt = RE_TOTAL.search(ln)
        if mt:
            total = num_brl(mt.group(1))

    soma = round(sum(p['valor'] for p in passagens), 2)
    return {
        'arquivo': caminho_pdf,
        'passagens': passagens,
        'quantidade': len(passagens),
        'soma_calculada': soma,
        'total_declarado_no_pdf': total,
        'confere': (total is None) or abs(soma - total) < 0.02,
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('uso: python3 importar_pedagio.py arquivo.pdf', file=sys.stderr)
        sys.exit(1)
    r = extrai(sys.argv[1])
    print(json.dumps(r, ensure_ascii=False, indent=1))
    print(f"\n>> {r['quantidade']} passagens · soma R$ {r['soma_calculada']:.2f} · "
          f"PDF R$ {(r['total_declarado_no_pdf'] or 0):.2f} · "
          f"{'CONFERE' if r['confere'] else 'DIVERGENTE'}", file=sys.stderr)
