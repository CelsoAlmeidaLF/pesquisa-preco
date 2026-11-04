#!/usr/bin/env python3
"""
Infrastructure / scripts/build_data.py

Generates src/infrastructure/data/*.js from the raw files in data/raw/.
No number reaches the app by hand: everything comes from DIEESE/Conab, FipeZAP or IBGE.

The build stops with an error when a source does not close:
  - a name that is not in the IBGE table;
  - gasto / preco differs from the Decreto-Lei 399 quantity of the region;
  - the sum of the items differs from the published total;
  - the database total differs from Table 1 of the DIEESE PDF;
  - Table 1 percentage or work time differs from the formula.

Usage:
  python3 scripts/build_data.py            rebuild from data/raw/
  python3 scripts/build_data.py --baixar   download the sources again first

Requires pdftotext (poppler-utils). Standard library only.
"""
import hashlib
import html
import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'data' / 'raw'
OUT = ROOT / 'src' / 'infrastructure' / 'data'

PERIOD_LABEL = 'setembro de 2026'
PERIOD_FORM = '092026'
COLLECTED_AT = '2026-11-04'
MINIMUM_WAGE = 1621.00

USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36'
DIEESE_QUERY_URL = 'https://www.dieese.org.br/cesta/produto'
DOWNLOADS = {
    'dieese/202609cestabasica.pdf': 'https://www.dieese.org.br/analisecestabasica/2026/202609cestabasica.pdf',
    'dieese/metodologiaCestaBasica2016.pdf': 'https://www.dieese.org.br/metodologia/metodologiaCestaBasica2016.pdf',
    'fipezap/fipezap-serieshistoricas.xlsx': 'https://downloads.fipe.org.br/indices/fipezap/fipezap-serieshistoricas.xlsx',
    'fipezap/fipezap-202609-comercial.pdf': 'https://downloads.fipe.org.br/indices/fipezap/fipezap-202609-comercial.pdf',
    'fipezap/fipezap-202609-residencial-locacao.pdf': 'https://downloads.fipe.org.br/indices/fipezap/fipezap-202609-residencial-locacao.pdf',
    'fipezap/fipezap-202609-residencial-venda-publico.pdf': 'https://downloads.fipe.org.br/indices/fipezap/fipezap-202609-residencial-venda-publico.pdf',
    'ibge/ibge_estados.json': 'https://servicodados.ibge.gov.br/api/v1/localidades/estados',
    'ibge/ibge_municipios.json': 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios',
}

# DIEESE database product codes
PRODUCTS = {
    1: 'total', 2: 'meat', 3: 'milk', 4: 'beans', 5: 'rice', 6: 'flour', 7: 'potato',
    8: 'tomato', 9: 'bread', 10: 'coffee', 11: 'banana', 12: 'sugar', 13: 'oil', 14: 'butter',
}
ITEMS = [p for p in PRODUCTS.values() if p != 'total']

# Decreto-Lei 399/1938, table in the DIEESE methodology. Oil is in 900 ml units and
# banana in dozens, the units in which the DIEESE database reports the average price.
QUANTITIES = {
    1: dict(meat=6.0, milk=7.5, beans=4.5, rice=3.0, flour=1.5, potato=6.0, tomato=9.0, bread=6.0, coffee=0.6, banana=7.5, sugar=3.0, oil=1.0, butter=0.75),
    2: dict(meat=4.5, milk=6.0, beans=4.5, rice=3.6, flour=3.0, potato=0.0, tomato=12.0, bread=6.0, coffee=0.3, banana=7.5, sugar=3.0, oil=1.0, butter=0.75),
    3: dict(meat=6.6, milk=7.5, beans=4.5, rice=3.0, flour=1.5, potato=6.0, tomato=9.0, bread=6.0, coffee=0.6, banana=7.5, sugar=3.0, oil=1.2, butter=0.75),
}
DECREE_REGION_BY_UF = {
    **{uf: 1 for uf in 'ES MG RJ SP GO DF'.split()},
    **{uf: 2 for uf in 'AL BA CE MA PB PE PI RN SE AC AP AM PA RO RR TO'.split()},
    **{uf: 3 for uf in 'PR RS SC MT MS'.split()},
}
CAPITAL_UF = {
    'Aracaju': 'SE', 'Belém': 'PA', 'Belo Horizonte': 'MG', 'Boa Vista': 'RR', 'Brasília': 'DF',
    'Campo Grande': 'MS', 'Cuiabá': 'MT', 'Curitiba': 'PR', 'Florianópolis': 'SC', 'Fortaleza': 'CE',
    'Goiânia': 'GO', 'João Pessoa': 'PB', 'Macapá': 'AP', 'Maceió': 'AL', 'Manaus': 'AM', 'Natal': 'RN',
    'Palmas': 'TO', 'Porto Alegre': 'RS', 'Porto Velho': 'RO', 'Recife': 'PE', 'Rio Branco': 'AC',
    'Rio de Janeiro': 'RJ', 'Salvador': 'BA', 'São Luís': 'MA', 'São Paulo': 'SP', 'Teresina': 'PI', 'Vitória': 'ES',
}
# Text of the September 2026 report: black beans in the South, Rio de Janeiro and Vitória
BLACK_BEANS_CAPITALS = {'Curitiba', 'Florianópolis', 'Porto Alegre', 'Rio de Janeiro', 'Vitória'}

# Municipalities of the state of São Paulo listed in the original page (fontes/index.html)
ORIGINAL_SP_MUNICIPALITIES = [
    'São Paulo', 'Santo André', 'São Bernardo do Campo', 'São Caetano do Sul', 'Guarulhos', 'Osasco', 'Barueri',
    'Santos', 'Praia Grande', 'Campinas', 'Jundiaí', 'Piracicaba', 'Americana', 'São José dos Campos', 'Taubaté',
    'Sorocaba', 'Ribeirão Preto', 'Franca', 'São Carlos', 'Araraquara', 'Bauru', 'São José do Rio Preto', 'Marília',
    'Presidente Prudente', 'Registro',
]
# Local survey, not comparable: other month and other collection. Press source checked on 2026-11-04.
LOCAL_BASKETS = {
    'Campinas': dict(
        value=832.99, period='ago/2026', source='Observatório PUC-Campinas, via Correio da Manhã',
        url='https://www.correiodamanha.com.br/nacional/sao-paulo/campinas/2026/10/328069-cesta-basica-sobe-287-em-agosto-e-atinge-rs-83299-em-campinas.html',
    ),
}


class SourceError(Exception):
    pass


def fail(message):
    raise SourceError(message)


def fetch(url, data=None):
    request = urllib.request.Request(url, data=data, headers={'User-Agent': USER_AGENT, 'Referer': 'https://www.dieese.org.br/cesta/'})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def download_sources():
    for relative, url in DOWNLOADS.items():
        target = RAW / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(fetch(url))
        print(f'Baixado: {relative}')
    for code in PRODUCTS:
        for data_type in (4, 5):  # 4 = average price, 5 = monthly spending
            body = urllib.parse.urlencode({
                'farinha': 'true', 'produtos': code, 'tipoDado': data_type, 'cidades': 0,
                'dataInicial': PERIOD_FORM, 'dataFinal': PERIOD_FORM,
            }).encode()
            (RAW / 'dieese' / f'p{code}_t{data_type}.html').write_bytes(fetch(DIEESE_QUERY_URL, body))
            time.sleep(0.7)
    print('Baixado: banco de dados do DIEESE')


def br_number(text):
    return None if text == '-' else float(text.replace('.', '').replace(',', '.'))


def parse_dieese_table(path):
    source = path.read_text(encoding='utf-8', errors='replace')
    table = re.search(r'id="dados".*?</table>', source, re.S)
    if not table:
        fail(f'{path.name}: tabela do DIEESE não encontrada')
    rows = [
        [html.unescape(re.sub(r'<[^>]+>', '', cell)).strip() for cell in re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', row, re.S)]
        for row in re.findall(r'<tr.*?</tr>', table.group(0), re.S)
    ]
    header, values = rows[0], rows[1]
    if values[0] != '09-2026':
        fail(f'{path.name}: período inesperado {values[0]}')
    # Macaé is in the database but is not a capital and has no data for the period
    return {city: br_number(value) for city, value in zip(header[1:], values[1:]) if city != 'Macaé'}


def parse_table_one():
    text = subprocess.run(
        ['pdftotext', '-layout', str(RAW / 'dieese' / '202609cestabasica.pdf'), '-'],
        capture_output=True, text=True, check=True,
    ).stdout
    pattern = re.compile(r'^\s*([A-ZÀ-Ú][\wÀ-ú ]+?)\s{2,}(\d+,\d\d)\s+(-?\d+,\d\d)\s+(\d+,\d\d)\s+(\d+)h(\d\d)m\s+(-?\d+,\d\d)\s+(-?\d+,\d\d)\s*$', re.M)
    table = {
        m[1]: dict(total=br_number(m[2]), monthlyChange=br_number(m[3]), wagePercent=br_number(m[4]),
                   workHours=int(m[5]), workMinutes=int(m[6]), yearChange=br_number(m[7]), twelveMonthChange=br_number(m[8]))
        for m in pattern.finditer(text)
    }
    if len(table) != 27:
        fail(f'Tabela 1 do DIEESE: {len(table)} capitais em vez de 27')
    needed = re.search(r'deveria\s+ter sido de R\$ ([\d.,]+) ou ([\d,]+) vezes', text)
    if not needed:
        fail('Salário mínimo necessário não encontrado no PDF do DIEESE')
    return table, br_number(needed[1]), br_number(needed[2])


def load_ibge():
    states = json.loads((RAW / 'ibge' / 'ibge_estados.json').read_text(encoding='utf-8'))
    municipalities = json.loads((RAW / 'ibge' / 'ibge_municipios.json').read_text(encoding='utf-8'))
    state_by_uf = {s['sigla']: s for s in states}
    index = {}
    for municipality in municipalities:
        intermediate = municipality['regiao-imediata']['regiao-intermediaria']
        uf = intermediate['UF']['sigla']
        index[(municipality['nome'], uf)] = dict(
            ibgeCode=municipality['id'], name=municipality['nome'], uf=uf, state=intermediate['UF']['nome'],
            macroRegion=intermediate['UF']['regiao']['nome'], intermediateRegion=intermediate['nome'],
            immediateRegion=municipality['regiao-imediata']['nome'],
        )
    return state_by_uf, index


def ibge_lookup(index, name, uf):
    found = index.get((name, uf))
    if not found:
        fail(f'Nome fora da tabela do IBGE: {name} ({uf})')
    return found


def build_basket(index):
    prices = {PRODUCTS[c]: parse_dieese_table(RAW / 'dieese' / f'p{c}_t4.html') for c in PRODUCTS}
    spending = {PRODUCTS[c]: parse_dieese_table(RAW / 'dieese' / f'p{c}_t5.html') for c in PRODUCTS}
    table_one, needed_wage, needed_multiple = parse_table_one()

    capitals = []
    for city, uf in CAPITAL_UF.items():
        place = ibge_lookup(index, city, uf)
        region = DECREE_REGION_BY_UF[uf]
        published = spending['total'][city]
        official = table_one.get(city)
        if not official or official['total'] != published:
            fail(f'{city}: banco de dados ({published}) difere da Tabela 1 do PDF')

        item_sum = 0.0
        for item in ITEMS:
            price, spent, quantity = prices[item][city], spending[item][city], QUANTITIES[region][item]
            if quantity == 0:
                if price is not None:
                    fail(f'{city}: {item} deveria estar fora da cesta da região {region}')
                continue
            if price is None or spent is None:
                fail(f'{city}: falta {item}')
            # The published spending is rounded to cents, and the price is too
            if abs(price * quantity - spent) > 0.005 * quantity + 0.006:
                fail(f'{city}: {item} {price} x {quantity} difere do gasto publicado {spent}')
            item_sum += spent
        if abs(item_sum - published) > 0.07:
            fail(f'{city}: soma dos itens {item_sum:.2f} difere do total {published}')

        wage_percent = published / (MINIMUM_WAGE * 0.925) * 100
        work_minutes = published / MINIMUM_WAGE * 220 * 60
        if abs(wage_percent - official['wagePercent']) > 0.011:
            fail(f'{city}: % do salário mínimo {wage_percent:.2f} difere de {official["wagePercent"]}')
        if abs(work_minutes - (official['workHours'] * 60 + official['workMinutes'])) > 1.01:
            fail(f'{city}: tempo de trabalho difere da Tabela 1')

        capitals.append(dict(
            ibgeCode=place['ibgeCode'], capital=place['name'], uf=uf, state=place['state'], macroRegion=place['macroRegion'],
            decreeRegion=region, beansType='preto' if city in BLACK_BEANS_CAPITALS else 'carioca',
            flourType='mandioca' if region == 2 else 'trigo',
            prices={item: prices[item][city] for item in ITEMS}, publishedTotal=published,
            monthlyChange=official['monthlyChange'], yearChange=official['yearChange'], twelveMonthChange=official['twelveMonthChange'],
            publishedWagePercent=official['wagePercent'], publishedWorkHours=official['workHours'], publishedWorkMinutes=official['workMinutes'],
        ))
    capitals.sort(key=lambda c: c['capital'])
    if abs(max(c['publishedTotal'] for c in capitals) * 3 / 0.3571 - needed_wage) > 0.05:
        fail('Salário mínimo necessário não fecha com 3 cestas / 0,3571')
    return dict(period=PERIOD_LABEL, minimumWage=MINIMUM_WAGE, neededWage=needed_wage, neededWageMultiple=needed_multiple,
                quantities={str(k): v for k, v in QUANTITIES.items()}, capitals=capitals)


def read_xlsx_sheet(path, sheet_name):
    main = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
    rel_id = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
    with zipfile.ZipFile(path) as archive:
        strings = [''.join(t.text or '' for t in si.iter(f'{main}t')) for si in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        targets = {r.get('Id'): r.get('Target') for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheets = {s.get('name'): targets[s.get(rel_id)] for s in workbook.find(f'{main}sheets')}
        target = sheets[sheet_name].lstrip('/')
        target = target if target.startswith('xl/') else f'xl/{target}'
        rows = {}
        for cell in ET.fromstring(archive.read(target)).iter(f'{main}c'):
            value = cell.find(f'{main}v')
            if value is None:
                continue
            column, row = re.match(r'([A-Z]+)(\d+)', cell.get('r')).groups()
            rows.setdefault(int(row), {})[column] = strings[int(value.text)] if cell.get('t') == 's' else value.text
    return rows


def number_or_none(text, digits):
    try:
        return round(float(text), digits)
    except (TypeError, ValueError):
        return None


def percent_or_none(text):
    value = number_or_none(text, 6)
    return None if value is None else round(value * 100, 2)


def market_from_row(row):
    return dict(
        residentialSale=number_or_none(row.get('G'), 0), residentialRent=number_or_none(row.get('K'), 2),
        residentialSaleChange12m=percent_or_none(row.get('F')), residentialRentChange12m=percent_or_none(row.get('J')),
        residentialYield=percent_or_none(row.get('M')),
        commercialSale=number_or_none(row.get('Q'), 0), commercialRent=number_or_none(row.get('U'), 2),
        commercialSaleChange12m=percent_or_none(row.get('P')), commercialRentChange12m=percent_or_none(row.get('T')),
        commercialYield=percent_or_none(row.get('W')),
    )


def build_real_estate(index):
    rows = read_xlsx_sheet(RAW / 'fipezap' / 'fipezap-serieshistoricas.xlsx', 'Resumo')
    if rows[6]['D'] != '46266':  # Excel serial for 2026-09-01
        fail(f'FipeZAP: data de referência inesperada {rows[6]["D"]}')
    national, cities = None, []
    for number in sorted(rows):
        row = rows[number]
        if row.get('A') == 'Índice FipeZAP':
            national = market_from_row(row)
        elif number > 7 and row.get('A') and row.get('C'):
            place = ibge_lookup(index, row['A'], row['C'])
            cities.append(dict(ibgeCode=place['ibgeCode'], city=place['name'], uf=place['uf'], state=place['state'],
                               macroRegion=place['macroRegion'], **market_from_row(row)))
    if len(cities) != 56 or not national:
        fail(f'FipeZAP: {len(cities)} cidades em vez de 56')
    cities.sort(key=lambda c: c['city'])
    return dict(period=PERIOD_LABEL, national=national, cities=cities)


def build_sp_municipalities(index, real_estate, basket):
    in_fipezap = {c['city'] for c in real_estate['cities'] if c['uf'] == 'SP'}
    names = sorted(set(ORIGINAL_SP_MUNICIPALITIES) | in_fipezap)
    capital_total = next(c['publishedTotal'] for c in basket['capitals'] if c['capital'] == 'São Paulo')
    municipalities = []
    for name in names:
        place = ibge_lookup(index, name, 'SP')
        entry = dict(ibgeCode=place['ibgeCode'], municipality=place['name'], intermediateRegion=place['intermediateRegion'],
                     immediateRegion=place['immediateRegion'], basket=None, hasRealEstate=name in in_fipezap)
        if name == 'São Paulo':
            entry['basket'] = dict(value=capital_total, period='set/2026', source='DIEESE/Conab', comparable=True)
        elif name in LOCAL_BASKETS:
            entry['basket'] = dict(LOCAL_BASKETS[name], comparable=False)
        municipalities.append(entry)
    return municipalities


def build_sources():
    def digest(path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    dieese_files = sorted((RAW / 'dieese').glob('p*_t*.html'))
    combined = hashlib.sha256(b''.join(path.read_bytes() for path in dieese_files)).hexdigest()
    files = [dict(file=relative, url=url, sha256=digest(RAW / relative)) for relative, url in DOWNLOADS.items()]
    files.append(dict(file=f'dieese/p*_t*.html ({len(dieese_files)} consultas)', url='https://www.dieese.org.br/cesta/', sha256=combined))
    return dict(collectedAt=COLLECTED_AT, files=files)


def write_module(name, export, value, source_note):
    OUT.mkdir(parents=True, exist_ok=True)
    body = json.dumps(value, ensure_ascii=False, indent=1)
    (OUT / name).write_text(
        f'// Infrastructure: generated by scripts/build_data.py. Do not edit by hand.\n// {source_note}\n'
        f'export const {export} = Object.freeze({body});\n', encoding='utf-8')
    print(f'Gerado: src/infrastructure/data/{name}')


def main():
    if '--baixar' in sys.argv:
        download_sources()
    _, index = load_ibge()
    basket = build_basket(index)
    real_estate = build_real_estate(index)
    municipalities = build_sp_municipalities(index, real_estate, basket)
    write_module('BasketData.js', 'BASKET_DATA', basket, f'Fonte: Conab/DIEESE, {PERIOD_LABEL}; nomes e códigos: IBGE.')
    write_module('RealEstateData.js', 'REAL_ESTATE_DATA', real_estate, f'Fonte: Índice FipeZAP, {PERIOD_LABEL}; nomes e códigos: IBGE.')
    write_module('SaoPauloData.js', 'SAO_PAULO_MUNICIPALITIES', municipalities, 'Nomes, códigos e regiões: IBGE.')
    write_module('SourcesData.js', 'SOURCES_DATA', build_sources(), 'Prova de origem: SHA-256 dos arquivos em data/raw/.')
    print(f'Conferido: 27 capitais, {len(real_estate["cities"])} cidades do FipeZAP, {len(municipalities)} municípios de SP.')


if __name__ == '__main__':
    try:
        main()
    except SourceError as error:
        sys.exit(f'ERRO NA FONTE: {error}')
