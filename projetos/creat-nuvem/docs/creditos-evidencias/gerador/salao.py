from base import svg, sombra, W, H
from barbearia import tesoura as tesoura_b, pente as pente_b

# paleta do nicho na demo: blush e vinho, neutros puxados para o vinho
BLUSH = '#FBF1EE'; ROSA = '#F3D2D0'; ROSA2 = '#E9B9B8'
VINHO = '#A8123A'; VINHO2 = '#6E0B26'; FUNDO = '#2A1418'
OURO = '#C9A063'; OURO2 = '#9C7740'; MALVA = '#D9BEC4'
CROMO = '#D3CBCD'; CROMO2 = '#9A8C90'; BRANCO = '#FFFBF8'
TINTA = '#1E0D11'; SOMBRA_C = '#1E0D11'
CORES = ['#A8123A', '#E8574B', '#D8A48F', '#F28CA6', '#2A1418', '#8E5BB0', '#C9A063']


def frasco(x, y, cor, s=1.0, tampa=TINTA, aberto=False):
    """vidro de esmalte: corpo quadrado de cantos vivos, gargalo, tampa alta"""
    corpo = (f'<rect class="t" x="-70" y="-150" width="140" height="150" rx="26" fill="#F7E9EA"/>'
             f'<rect x="-58" y="-128" width="116" height="116" rx="18" fill="{cor}"/>'
             f'<path class="br" d="M-46 -116 V-40"/><path class="br" stroke-width="5" d="M46 -110 V-90" opacity=".5"/>'
             f'<rect class="t" x="-70" y="-150" width="140" height="150" rx="26" fill="none"/>'
             f'<rect class="t" x="-30" y="-176" width="60" height="30" rx="6" fill="#F7E9EA"/>')
    capa = '' if aberto else f'<rect class="t" x="-34" y="-330" width="68" height="160" rx="14" fill="{tampa}"/><path class="br" stroke-width="5" d="M-18 -310 V-200" opacity=".4"/>'
    return f'<g transform="translate({x} {y}) scale({s})">{sombra(corpo + capa, 12, 12)}</g>'


def cena1():
    """1 · esmaltes: fileira de vidros, um aberto com o pincel e a pincelada"""
    arco = sombra(f'<path class="t" d="M150 1280 V520 A362 362 0 0 1 874 520 V1280 Z" fill="{VINHO}"/>', 20, 0)
    arco_in = f'<path d="M210 1280 V540 A302 302 0 0 1 814 540 V1280 Z" fill="{VINHO2}" opacity=".35"/>'
    # pinceladas de amostra na parede do arco
    pinc = ''.join(f'<path d="M{330} {360 + i * 66} q90 -26 180 0 t180 0" stroke="{c}" stroke-width="40" stroke-linecap="round" fill="none"/>'
                   f'<path class="f" d="M{330} {360 + i * 66} q90 -26 180 0 t180 0" stroke-opacity=".0"/>' for i, c in enumerate(['#F28CA6', '#E8574B', '#D8A48F']))
    tampo = sombra(f'<rect class="t" x="-20" y="1000" width="{W + 40}" height="320" fill="#FBE6E3"/>', 0, -18) + \
        ''.join(f'<path d="M{80 + i * 170} 1060 q40 60 120 90" stroke="{ROSA2}" stroke-width="5" fill="none"/>' for i in range(6))
    fileira = ''.join(frasco(150 + i * 145, 1000 - (0 if i % 2 else 26), c, 0.92) for i, c in enumerate(['#A8123A', '#F28CA6', '#E8574B', '#2A1418', '#D8A48F', '#8E5BB0']) if i != 2)
    aberto = frasco(440, 1170, '#E8574B', 1.15, aberto=True)
    # tampa deitada com o pincel e a gota
    tampa = (f'<g transform="translate(640 1160) rotate(-78)">'
             + sombra(f'<rect class="t" x="-34" y="-20" width="68" height="170" rx="14" fill="{TINTA}"/>'
                      f'<rect class="t" x="-8" y="-120" width="16" height="104" fill="#5A4048"/>'
                      f'<path class="t" d="M-16 -120 Q0 -190 16 -120 Z" fill="#E8574B"/>', 10, 10) + '</g>')
    gota = f'<path class="t" d="M560 1236 q40 -24 90 -6 q30 14 10 26 q-40 20 -100 -20 Z" fill="#E8574B"/><circle cx="600" cy="1232" r="5" fill="#fff" opacity=".7"/>'
    corpo = '<rect width="1024" height="1280" fill="#F2CFCC"/>' + arco + arco_in + pinc + tampo + fileira + aberto + tampa + gota
    return svg('#F2CFCC', corpo, TINTA, SOMBRA_C)


def cena2():
    """2 · bancada da manicure, vista de cima: almofada, lixa, alicate, algodão, tigela"""
    veios = ''.join(f'<path d="M{-100 + i * 180} 0 q120 400 -40 700 t80 700" stroke="{ROSA2}" stroke-width="4" fill="none" opacity=".8"/>' for i in range(8))
    toalha = sombra(f'<rect class="t" x="90" y="120" width="520" height="420" rx="18" fill="{VINHO}" transform="rotate(-6 350 330)"/>', 16, 16) + \
        f'<path d="M110 470 L620 418" stroke="{VINHO2}" stroke-width="12" transform="rotate(-6 350 330)"/>'
    almofada = sombra(f'<rect class="t" x="150" y="180" width="380" height="260" rx="130" fill="{ROSA}" transform="rotate(-6 340 310)"/>', 14, 14) + \
        f'<path class="f" d="M190 300 Q340 250 500 290" transform="rotate(-6 340 310)"/>'
    lixa = (f'<g transform="translate(700 260) rotate(62)">' + sombra(
        f'<rect class="t" x="-230" y="-34" width="460" height="68" rx="34" fill="{FUNDO}"/>'
        f'<rect x="-216" y="-22" width="432" height="22" rx="11" fill="{OURO}"/>', 12, 12) + '</g>')
    alicate = (f'<g transform="translate(330 760) rotate(-24)">' + sombra(
        f'<path class="t" d="M0 0 Q-200 -50 -330 -30 Q-340 -10 -330 6 Q-200 0 0 20 Z" fill="{CROMO}"/>'
        f'<path class="t" d="M0 0 Q-200 30 -330 70 Q-334 90 -320 96 Q-200 60 0 20 Z" fill="{CROMO}"/>'
        f'<path class="t" d="M0 0 L90 -14 Q104 6 90 26 L0 20 Z" fill="{CROMO2}"/>'
        f'<path class="t" d="M-150 -20 q30 40 0 70" fill="none"/>', 12, 12)
        + '<circle class="t" cx="0" cy="10" r="12" fill="#fff"/><path class="br" d="M-60 -6 L-300 -20"/></g>')
    tigela = sombra(f'<circle class="t" cx="760" cy="760" r="150" fill="{BRANCO}"/>', 14, 14) + \
        f'<circle class="t" cx="760" cy="760" r="112" fill="#CFE6EE"/><path class="br" d="M690 700 q30 -30 80 -30"/><path class="f" d="M720 790 q40 -16 80 0" opacity=".5"/>'
    algodao = ''.join(sombra(f'<path class="t" d="M{x - 50} {y} q-10 -50 40 -50 q20 -40 60 -10 q50 -10 46 40 q30 40 -14 56 q-30 34 -70 14 q-50 20 -62 -50 Z" fill="#FFFFFF"/>', 8, 8) for x, y in [(180, 1010), (290, 1080), (190, 1140)])
    palito = f'<g transform="translate(560 1040) rotate(-30)">' + sombra(f'<rect class="t" x="-160" y="-10" width="320" height="20" rx="10" fill="#E3B27E"/>', 8, 8) + '</g>'
    vidros = frasco(780, 1180, '#A8123A', 0.8) + frasco(910, 1120, '#F28CA6', 0.7, tampa=OURO)
    corpo = '<rect width="1024" height="1280" fill="#F5DCD8"/>' + veios + toalha + almofada + lixa + alicate + tigela + algodao + palito + vidros
    return svg(BLUSH, corpo, TINTA, SOMBRA_C)


def secador(x, y, ang, s=1.0):
    corpo = (f'<path class="t" d="M-60 -120 H220 Q300 -120 300 -40 Q300 40 220 40 H-60 Z" fill="{ROSA}"/>'
             f'<rect class="t" x="290" y="-100" width="70" height="120" rx="20" fill="{TINTA}"/>'
             f'<circle class="t" cx="-40" cy="-40" r="96" fill="{ROSA}"/><circle class="t" cx="-40" cy="-40" r="56" fill="{VINHO}"/>'
             + ''.join(f'<path class="ff" stroke="{ROSA}" d="M-40 -40 L{-40 + 50 * __import__("math").cos(a / 6 * 6.283)} {-40 + 50 * __import__("math").sin(a / 6 * 6.283)}"/>' for a in range(6)) +
             f'<path class="t" d="M120 36 L170 330 Q176 360 146 366 L100 370 Q74 366 72 340 L60 36 Z" fill="{ROSA}"/>'
             f'<rect class="t" x="96" y="140" width="34" height="56" rx="10" fill="{VINHO}"/>'
             f'<path class="br" d="M0 -100 H210"/>'
             f'<path class="t" d="M120 366 q20 120 140 140" fill="none"/>')
    return f'<g transform="translate({x} {y}) rotate({ang}) scale({s})">{sombra(corpo, 14, 14)}</g>'


def escova(x, y, ang, s=1.0):
    cerdas = ''.join(f'<path class="ff" d="M{-120 + i * 20} -60 V-80 M{-120 + i * 20} 60 V80"/>' for i in range(13))
    corpo = (f'<rect class="t" x="-140" y="-60" width="270" height="120" rx="40" fill="{OURO}"/>' + cerdas +
             ''.join(f'<circle cx="{-110 + i * 30}" cy="{-30 + (j * 30)}" r="5" fill="{OURO2}"/>' for i in range(8) for j in range(3)) +
             f'<path class="t" d="M130 -26 H430 Q470 0 430 26 H130 Z" fill="{FUNDO}"/>')
    return f'<g transform="translate({x} {y}) rotate({ang}) scale({s})">{sombra(corpo, 12, 12)}</g>'


def cena3():
    """3 · ferramentas do cabelo, vista de cima: secador, escova redonda, tesoura, pente, borrifador, presilhas"""
    listras = ''.join(f'<rect x="{i * 128}" y="0" width="64" height="{H}" fill="{VINHO2}" opacity=".35"/>' for i in range(8))
    borr = (f'<g transform="translate(820 900) rotate(18)">' + sombra(
        f'<rect class="t" x="-60" y="-80" width="120" height="240" rx="30" fill="#F7E9EA"/><rect x="-48" y="0" width="96" height="148" rx="20" fill="#CFE6EE"/>'
        f'<path class="t" d="M-40 -80 V-140 H40 L90 -120 V-100 H30 V-80 Z" fill="{TINTA}"/><path class="t" d="M0 -60 q40 20 30 70" fill="none"/>', 12, 12) + '</g>')
    presilhas = ''.join(f'<g transform="translate({x} {y}) rotate({a})">' + sombra(f'<path class="t" d="M-60 -12 H50 Q70 0 50 12 H-60 Z" fill="{c}"/><path class="t" d="M-60 4 H40" fill="none"/>', 8, 8) + '</g>'
                        for x, y, a, c in [(170, 1150, -20, OURO), (300, 1190, 10, TINTA), (420, 1140, -40, ROSA)])
    corpo = (listras + secador(330, 300, 8, 1.15) + escova(560, 720, -28, 1.0)
             + tesoura_b(160, 830, 28, 1.05, cor_cabo=TINTA).replace('#EFE6D6', VINHO)
             + pente_b(470, 960, 6, 0.9, cor=ROSA2) + borr + presilhas)
    return svg(VINHO, corpo, TINTA, SOMBRA_C, grao=0.07)


def cena4():
    """4 · o espaço: espelho redondo com lâmpadas, cadeira, planta e carrinho"""
    parede = f'<rect width="{W}" height="860" fill="{ROSA}"/>'
    janela = f'<path d="M640 860 V260 A170 170 0 0 1 980 260 V860" fill="{BLUSH}" opacity=".7"/>' + f'<path class="f" d="M640 860 V260 A170 170 0 0 1 980 260 V860 M810 90 V860 M640 480 H980"/>'
    piso = f'<rect y="860" width="{W}" height="420" fill="{VINHO2}"/>' + ''.join(
        f'<circle cx="{(i * 137) % W}" cy="{880 + (i * 53) % 400}" r="{6 + i % 3 * 3}" fill="{c}" opacity=".7"/>' for i, c in zip(range(60), [ROSA, OURO, BLUSH] * 20))
    rodape = f'<path class="t" d="M0 860 H{W}"/>'
    espelho = sombra(f'<circle class="t" cx="330" cy="370" r="230" fill="{OURO}"/>', 16, 16) + \
        f'<circle class="t" cx="330" cy="370" r="196" fill="#E9DDE2"/><path d="M220 520 L400 190 H450 L270 540 Z" fill="#fff" opacity=".5"/>' + \
        ''.join(f'<circle class="t" cx="{330 + 213 * __import__("math").cos(a / 14 * 6.283)}" cy="{370 + 213 * __import__("math").sin(a / 14 * 6.283)}" r="15" fill="#FFF3C4"/>' for a in range(14))
    bancada = sombra(f'<rect class="t" x="60" y="640" width="560" height="44" rx="8" fill="{BRANCO}"/><rect class="t" x="90" y="684" width="500" height="176" fill="{MALVA}"/>', 12, 12) + \
        f'<path class="f" d="M340 684 V860"/><rect class="t" x="290" y="760" width="36" height="12" rx="6" fill="{OURO}"/><rect class="t" x="354" y="760" width="36" height="12" rx="6" fill="{OURO}"/>'
    cadeira = sombra(
        f'<path class="t" d="M220 640 Q220 520 340 520 Q460 520 460 640 V800 H220 Z" fill="{VINHO}"/>'
        f'<rect class="t" x="190" y="790" width="300" height="80" rx="30" fill="{VINHO}"/>'
        f'<rect class="t" x="320" y="870" width="40" height="150" fill="{CROMO}"/>'
        f'<ellipse class="t" cx="340" cy="1030" rx="150" ry="30" fill="{CROMO}"/>', 18, 12) + \
        ''.join(f'<path class="ff" stroke="{VINHO2}" d="M{260 + i * 40} 560 V790"/>' for i in range(5))
    planta = sombra(f'<path class="t" d="M780 1080 L760 940 H900 L880 1080 Z" fill="{OURO}"/>', 12, 12) + ''.join(
        sombra(f'<path class="t" d="M830 940 Q{830 + dx} {940 - h / 2} {830 + dx * 1.6} {940 - h} Q{830 + dx * .2} {940 - h * .6} 830 940 Z" fill="#3A644A"/>', 8, 8)
        for dx, h in [(-120, 300), (-50, 380), (40, 400), (120, 320), (170, 220), (-160, 200)])
    carrinho = sombra(f'<rect class="t" x="560" y="900" width="160" height="16" fill="{CROMO}"/><rect class="t" x="560" y="990" width="160" height="16" fill="{CROMO}"/>'
                      f'<path class="t" d="M570 900 V1080 M710 900 V1080" fill="none"/>'
                      f'<circle class="t" cx="570" cy="1090" r="14" fill="{TINTA}"/><circle class="t" cx="710" cy="1090" r="14" fill="{TINTA}"/>', 10, 10) + \
        frasco(600, 900, '#F28CA6', 0.4) + frasco(660, 900, VINHO, 0.4, tampa=OURO) + \
        sombra(f'<rect class="t" x="580" y="950" width="120" height="40" rx="12" fill="{BRANCO}"/>', 6, 6)
    corpo = parede + janela + piso + rodape + espelho + bancada + cadeira + carrinho + planta
    return svg(ROSA, corpo, TINTA, SOMBRA_C)


CENAS = {'salao-1': cena1, 'salao-2': cena2, 'salao-3': cena3, 'salao-4': cena4}
