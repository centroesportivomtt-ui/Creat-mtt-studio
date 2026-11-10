import math
from base import svg, sombra, W, H

# paleta do nicho na demo: azul de anilha de 20 kg, concreto e aço; anilhas nas cores oficiais
CONC = '#DCE3E9'; CONC2 = '#C6CFD7'; ACO = '#111A22'; ACO2 = '#2A3640'
AZUL = '#1556A8'; AZUL2 = '#0E3E7C'; AZUL3 = '#6FA8F0'
VERM = '#C8202B'; AMAR = '#F2C230'; VERDE = '#2E8B57'
BORR = '#1E2328'; BORR2 = '#343B42'; CROMO = '#C5CCD3'; CROMO2 = '#8C96A0'
TINTA = '#0A1016'; SOMBRA_C = '#0A1016'


def piso(y0):
    pts = ''.join(f'<circle cx="{(i * 97) % W}" cy="{y0 + 20 + (i * 61) % (H - y0)}" r="{3 + i % 3}" fill="{c}" opacity=".55"/>'
                  for i, c in zip(range(90), [CROMO2, AZUL3, '#5A646E'] * 30))
    juntas = ''.join(f'<path d="M{i * 256} {y0} V{H}" stroke="{TINTA}" stroke-width="4" opacity=".5"/>' for i in range(1, 4))
    return f'<rect y="{y0}" width="{W}" height="{H - y0}" fill="{BORR2}"/>{pts}{juntas}<path class="t" d="M0 {y0} H{W}"/>'


def anilha(cx, cy, r, cor, kg, aro=None):
    """anilha vista de frente: aro, face, cubo cromado com o peso em relevo"""
    a = aro or cor
    t = (f'<circle class="t" cx="{cx}" cy="{cy}" r="{r}" fill="{a}"/>'
         f'<circle class="f" cx="{cx}" cy="{cy}" r="{r * .86}" fill="{cor}"/>'
         f'<circle class="f" cx="{cx}" cy="{cy}" r="{r * .5}" fill="{cor}" stroke-opacity=".6"/>'
         f'<circle class="t" cx="{cx}" cy="{cy}" r="{r * .26}" fill="{CROMO}"/>'
         f'<circle class="t" cx="{cx}" cy="{cy}" r="{r * .1}" fill="{ACO}"/>'
         f'<path class="br" d="M{cx - r * .7} {cy - r * .3} A{r * .76} {r * .76} 0 0 1 {cx - r * .2} {cy - r * .72}" opacity=".45"/>')
    if kg:
        fs = r * .2
        t += (f'<text x="{cx}" y="{cy - r * .56}" font-family="Arial Narrow, Arial, sans-serif" font-weight="700" font-size="{fs}" text-anchor="middle" fill="#fff" opacity=".92">{kg} KG</text>')
    return sombra(t, 16, 12)


def cena1():
    """1 · anilhas: a imagem mais forte. Quatro anilhas encostadas na parede e a barra no chão"""
    parede = f'<rect width="{W}" height="900" fill="{CONC}"/>' + ''.join(
        f'<path d="M0 {y} H{W}" stroke="{CONC2}" stroke-width="6"/>' for y in range(110, 900, 130)) + \
        f'<rect y="250" width="{W}" height="70" fill="{AZUL}"/><path class="f" d="M0 250 H{W} M0 320 H{W}"/>'
    corpo = (parede + piso(900)
             + anilha(840, 810, 190, VERDE, 10) + anilha(700, 770, 230, AMAR, 15)
             + anilha(520, 720, 280, AZUL, 20) + anilha(300, 680, 320, VERM, 25))
    # barra no chão, em diagonal, com luva e trava
    barra = (f'<g transform="translate(0 0) rotate(-6 512 1150)">'
             + sombra(f'<rect class="t" x="-40" y="1120" width="760" height="34" rx="8" fill="{CROMO}"/>'
                      + ''.join(f'<path class="ff" d="M{60 + i * 16} 1124 l8 26"/>' for i in range(30))
                      + f'<rect class="t" x="700" y="1100" width="40" height="74" rx="6" fill="{CROMO2}"/>'
                      f'<rect class="t" x="740" y="1112" width="320" height="50" rx="8" fill="{CROMO}"/>'
                      f'<rect class="t" x="780" y="1096" width="54" height="82" rx="10" fill="{AZUL}"/>', 14, 10)
             + f'<path class="br" d="M0 1130 H680 M760 1122 H1040"/></g>')
    corpo += barra
    return svg(CONC, corpo, TINTA, SOMBRA_C)


def halter(x, y, kg, s=1.0):
    """halter sextavado: cabeças de borracha preta, pegada cromada recartilhada"""
    def hexa(cx):
        p = ' '.join(f'{cx + 70 * math.cos(math.radians(30 + 60 * k)):.1f},{y + 70 * math.sin(math.radians(30 + 60 * k)):.1f}' for k in range(6))
        return f'<polygon class="t" points="{p}" fill="{BORR}"/><polygon points="{p}" fill="none" stroke="{BORR2}" stroke-width="10" transform="translate({cx} {y}) scale(.72) translate({-cx} {-y})"/>'
    peg = f'<rect class="t" x="{x - 70}" y="{y - 18}" width="140" height="36" rx="8" fill="{CROMO}"/>' + ''.join(
        f'<path class="ff" d="M{x - 50 + i * 12} {y - 14} l6 28"/>' for i in range(9))
    txt = f'<text x="{x - 120}" y="{y + 12}" font-family="Arial Narrow, Arial, sans-serif" font-weight="700" font-size="34" text-anchor="middle" fill="#fff">{kg}</text>'
    return f'<g transform="translate({x} {y}) scale({s}) translate({-x} {-y})">' + sombra(peg + hexa(x - 120) + hexa(x + 120), 12, 10) + txt + '</g>'


def cena2():
    """2 · halteres no suporte de dois andares"""
    parede = f'<rect width="{W}" height="980" fill="{AZUL}"/>' + ''.join(
        f'<rect x="{i * 128}" y="0" width="6" height="980" fill="{AZUL2}" opacity=".7"/>' for i in range(1, 8))
    espelho = f'<rect class="t" x="60" y="60" width="904" height="300" rx="6" fill="#B9D2EC"/><path d="M200 360 L360 60 H460 L300 360 Z" fill="#fff" opacity=".45"/><path d="M520 360 L640 60 H690 L570 360 Z" fill="#fff" opacity=".3"/>'
    rack = (sombra(f'<path class="t" d="M60 520 L964 520 L964 560 L60 560 Z" fill="{ACO2}"/>'
                   f'<path class="t" d="M60 780 L964 780 L964 820 L60 820 Z" fill="{ACO2}"/>'
                   f'<rect class="t" x="80" y="520" width="40" height="460" fill="{ACO}"/><rect class="t" x="904" y="520" width="40" height="460" fill="{ACO}"/>', 14, 14))
    linha1 = ''.join(halter(225 + i * 290, 470, kg, 0.86) for i, kg in enumerate([10, 12, 14]))
    linha2 = ''.join(halter(225 + i * 290, 720, kg, 0.98) for i, kg in enumerate([16, 18, 20]))
    chao = piso(980) + halter(560, 1150, 8, 0.9)
    toalha = sombra(f'<path class="t" d="M120 1080 h170 l20 120 h-210 z" fill="{CONC}"/><path d="M110 1170 h200" stroke="{AZUL}" stroke-width="12"/>', 10, 10)
    corpo = parede + espelho + rack + linha1 + linha2 + chao + toalha
    return svg(AZUL, corpo, TINTA, SOMBRA_C, grao=0.07)


def cena3():
    """3 · aparelhos: gaiola com a barra no suporte, banco e kettlebell"""
    parede = f'<rect width="{W}" height="940" fill="{CONC}"/>' + ''.join(
        f'<rect x="{80 + i * 96}" y="140" width="48" height="70" rx="4" fill="{CONC2}"/>' for i in range(9))
    faixa = f'<rect y="760" width="{W}" height="40" fill="{AMAR}"/><path class="f" d="M0 760 H{W} M0 800 H{W}"/>'
    furos = lambda x: ''.join(f'<circle cx="{x + 24}" cy="{y}" r="7" fill="{AZUL2}"/>' for y in range(320, 900, 48))
    gaiola = sombra(
        f'<rect class="t" x="170" y="250" width="48" height="740" fill="{AZUL}"/><rect class="t" x="806" y="250" width="48" height="740" fill="{AZUL}"/>'
        f'<rect class="t" x="150" y="230" width="724" height="44" fill="{AZUL}"/>'
        f'<rect class="t" x="130" y="980" width="764" height="30" rx="4" fill="{ACO}"/>', 18, 12) + furos(170) + furos(806)
    ganchos = f'<path class="t" d="M218 560 h40 v40 h-16 v-20 h-24 z" fill="{ACO}"/><path class="t" d="M806 560 h-40 v40 h16 v-20 h24 z" fill="{ACO}"/>'
    barra = sombra(f'<rect class="t" x="-20" y="540" width="1064" height="26" rx="6" fill="{CROMO}"/>', 10, 8) + \
        f'<rect class="t" x="40" y="452" width="56" height="200" rx="12" fill="{VERM}"/><rect class="t" x="928" y="452" width="56" height="200" rx="12" fill="{VERM}"/>' + \
        f'<rect class="t" x="96" y="490" width="30" height="126" rx="6" fill="{AZUL2}"/><rect class="t" x="898" y="490" width="30" height="126" rx="6" fill="{AZUL2}"/>'
    banco = sombra(f'<rect class="t" x="300" y="820" width="430" height="64" rx="22" fill="{BORR}"/>'
                   f'<path class="t" d="M360 884 L330 1010 M670 884 L700 1010" fill="none"/>'
                   f'<rect class="t" x="300" y="1000" width="90" height="22" rx="6" fill="{ACO}"/><rect class="t" x="640" y="1000" width="90" height="22" rx="6" fill="{ACO}"/>', 14, 10) + \
        f'<path class="br" d="M330 836 H700" opacity=".25"/>'
    kett = sombra(f'<path class="t" d="M820 1060 q0 -90 70 -90 q70 0 70 90" fill="none" stroke-width="26"/>'
                  f'<circle class="t" cx="890" cy="1150" r="100" fill="{BORR}"/><rect class="t" x="830" y="1236" width="120" height="20" rx="6" fill="{BORR}"/>', 12, 10) + \
        f'<path d="M820 1060 q0 -90 70 -90 q70 0 70 90" fill="none" stroke="{BORR}" stroke-width="12"/><text x="890" y="1172" font-family="Arial Narrow, Arial, sans-serif" font-weight="700" font-size="54" text-anchor="middle" fill="{AMAR}">16</text>'
    corpo = parede + faixa + piso(940) + gaiola + ganchos + barra + banco + kett
    return svg(CONC, corpo, TINTA, SOMBRA_C)


def cena4():
    """4 · o espaço: janelão, piso de borracha, caixote, bola, corda e kettlebells em fila"""
    parede = f'<rect width="{W}" height="820" fill="{ACO2}"/>'
    janela = f'<rect class="t" x="90" y="80" width="844" height="520" fill="#BFD8F0"/>' + ''.join(
        f'<path class="t" d="M{90 + i * 211} 80 V600" fill="none"/>' for i in range(1, 4)) + \
        f'<path class="t" d="M90 340 H934" fill="none"/>' + \
        f'<path d="M150 600 L330 80 H420 L240 600 Z" fill="#fff" opacity=".4"/><path d="M560 600 L700 80 H740 L600 600 Z" fill="#fff" opacity=".3"/>'
    luz = f'<path d="M90 600 L-80 1280 H760 L934 600 Z" fill="#BFD8F0" opacity=".12"/>'
    faixa = f'<rect y="700" width="{W}" height="40" fill="{AZUL}"/><path class="f" d="M0 700 H{W} M0 740 H{W}"/>'
    caixote = sombra(f'<path class="t" d="M80 900 L420 900 L440 1130 L60 1130 Z" fill="#B07A4A"/><path class="f" d="M100 960 H400 M90 1070 H420"/>', 16, 12) + \
        f'<rect class="t" x="190" y="990" width="120" height="44" rx="22" fill="#5E3B20"/>'
    bola = sombra(f'<circle class="t" cx="560" cy="1060" r="110" fill="{VERM}"/><path class="f" d="M450 1060 H670 M560 950 Q500 1060 560 1170 M560 950 Q620 1060 560 1170"/>', 14, 10) + \
        f'<path class="br" d="M490 1000 q30 -40 70 -44" opacity=".5"/>'
    def kb(x, y, r, cor, txt):
        return sombra(f'<path class="t" d="M{x - r * .6} {y - r * .7} q0 {-r * .9} {r * .6} {-r * .9} q{r * .6} 0 {r * .6} {r * .9}" fill="none" stroke-width="22"/>'
                      f'<circle class="t" cx="{x}" cy="{y}" r="{r}" fill="{cor}"/>', 10, 8) + \
            f'<path d="M{x - r * .6} {y - r * .7} q0 {-r * .9} {r * .6} {-r * .9} q{r * .6} 0 {r * .6} {r * .9}" fill="none" stroke="{cor}" stroke-width="8"/>' + \
            f'<text x="{x}" y="{y + r * .22}" font-family="Arial Narrow, Arial, sans-serif" font-weight="700" font-size="{r * .55}" text-anchor="middle" fill="#fff">{txt}</text>'
    kbs = kb(770, 1060, 70, BORR, '8') + kb(930, 1050, 82, BORR, '12') + kb(700, 1210, 56, AZUL, '4') + kb(850, 1200, 64, VERDE, '6')
    corda = f'<path class="t" d="M120 1220 q120 -60 240 0 t220 -10" fill="none" stroke-width="12"/><path d="M120 1220 q120 -60 240 0 t220 -10" fill="none" stroke="{AMAR}" stroke-width="5"/>' + \
        f'<rect class="t" x="70" y="1200" width="70" height="30" rx="12" fill="{BORR}" transform="rotate(-20 105 1215)"/><rect class="t" x="570" y="1196" width="70" height="30" rx="12" fill="{BORR}" transform="rotate(14 605 1211)"/>'
    corpo = parede + janela + faixa + piso(820) + luz + caixote + bola + kbs + corda
    return svg(ACO2, corpo, TINTA, SOMBRA_C)


CENAS = {'academia-1': cena1, 'academia-2': cena2, 'academia-3': cena3, 'academia-4': cena4}
