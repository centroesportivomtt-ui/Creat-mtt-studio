from base import svg, sombra, xadrez, W, H

# paleta do nicho na demo (poste de barbeiro: marinho, vermelho e creme), neutros puxados para o marinho
CREME = '#E8DCC6'; CREME2 = '#E2D5BF'; BRANCO = '#FBF8F2'
MAR = '#14213D'; MAR2 = '#22345C'; MAR3 = '#34497A'
VERM = '#B3261E'; VERM2 = '#7E1913'; VERM3 = '#D9493C'
CROMO = '#C9CED6'; CROMO2 = '#8B93A1'
MAD = '#8A5A33'; MAD2 = '#5E3B20'; MAD3 = '#B07A4A'
TINTA = '#0E1526'; SOMBRA_C = '#0E1526'


def poste(x, y, w, h):
    """poste de barbeiro: listras em diagonal dentro do vidro, tampas cromadas"""
    cid = f'cp{x}{y}'
    listras = ''.join(
        f'<rect x="{x - 200 + i * 66}" y="{y - 40}" width="22" height="{h + 160}" fill="{c}" transform="rotate(32 {x + w / 2} {y + h / 2})"/>'
        for i, c in enumerate([VERM, MAR2, VERM, MAR2, VERM, MAR2, VERM, MAR2, VERM, MAR2, VERM]))
    return f'''
<clipPath id="{cid}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18"/></clipPath>
{sombra(f'<rect class="t" x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="{BRANCO}"/>', 12, 12)}
<g clip-path="url(#{cid})">{listras}<rect x="{x + w * .62}" y="{y}" width="{w * .16}" height="{h}" fill="#fff" opacity=".45"/></g>
<rect class="t" x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="none"/>
{sombra(f'<path class="t" d="M{x - 18} {y + 4} h{w + 36} v-26 a{(w + 36) / 2} 46 0 0 0 -{w + 36} 0 z" fill="{CROMO}"/>', 10, 10)}
<circle class="t" cx="{x + w / 2}" cy="{y - 74}" r="14" fill="{CROMO}"/>
{sombra(f'<rect class="t" x="{x - 18}" y="{y + h - 4}" width="{w + 36}" height="34" rx="10" fill="{CROMO}"/>', 10, 10)}
<path class="br" d="M{x - 2} {y - 30} q{w * .3} -26 {w * .62} -30"/>
'''


def cadeira(cx, chao, escala=1.0):
    s = escala
    def X(v): return cx + v * s
    def Y(v): return chao + v * s
    base = f'<ellipse class="t" cx="{X(0)}" cy="{Y(-30)}" rx="{200 * s}" ry="{44 * s}" fill="{CROMO}"/>'
    coluna = f'<rect class="t" x="{X(-34)}" y="{Y(-240)}" width="{68 * s}" height="{200 * s}" rx="10" fill="{CROMO}"/>'
    anel = f'<rect class="t" x="{X(-60)}" y="{Y(-200)}" width="{120 * s}" height="{40 * s}" rx="10" fill="{CROMO2}"/>'
    pedal = f'<path class="t" d="M{X(60)} {Y(-110)} l{110 * s} {40 * s} l{-8 * s} {22 * s} l{-112 * s} {-36 * s} z" fill="{CROMO2}"/>'
    assento = f'<rect class="t" x="{X(-200)}" y="{Y(-420)}" width="{400 * s}" height="{150 * s}" rx="{40 * s}" fill="{VERM}"/>'
    frente = f'<rect class="t" x="{X(-210)}" y="{Y(-320)}" width="{420 * s}" height="{70 * s}" rx="{22 * s}" fill="{VERM2}"/>'
    vivo = f'<path class="f" stroke="{BRANCO}" d="M{X(-170)} {Y(-392)} H{X(170)}"/>'
    encosto = f'<path class="t" d="M{X(-170)} {Y(-420)} L{X(-150)} {Y(-830)} Q{X(0)} {Y(-880)} {X(150)} {Y(-830)} L{X(170)} {Y(-420)} Z" fill="{VERM}"/>'
    # capitonê: losangos e botões
    caps = ''
    for r in range(4):
        for c in range(-2, 3):
            px, py = X(c * 56 + (28 if r % 2 else 0)), Y(-770 + r * 86)
            if abs(c * 56 + (28 if r % 2 else 0)) < 130:
                caps += f'<circle cx="{px}" cy="{py}" r="{7 * s}" fill="{VERM2}"/>'
    linhas = ''.join(f'<path class="ff" stroke="{VERM2}" d="M{X(-140 + i * 56)} {Y(-450)} L{X(-120 + i * 56 + 40)} {Y(-800)}"/>' for i in range(0, 5))
    linhas2 = ''.join(f'<path class="ff" stroke="{VERM2}" d="M{X(140 - i * 56)} {Y(-450)} L{X(120 - i * 56 - 40)} {Y(-800)}"/>' for i in range(0, 5))
    clipe = f'<clipPath id="enc{cx}"><path d="M{X(-170)} {Y(-420)} L{X(-150)} {Y(-830)} Q{X(0)} {Y(-880)} {X(150)} {Y(-830)} L{X(170)} {Y(-420)} Z"/></clipPath>'
    haste = f'<rect class="t" x="{X(-16)}" y="{Y(-950)}" width="{32 * s}" height="{110 * s}" fill="{CROMO}"/>'
    cabeceira = f'<rect class="t" x="{X(-110)}" y="{Y(-1010)}" width="{220 * s}" height="{80 * s}" rx="{36 * s}" fill="{VERM}"/>'
    braco_e = f'<path class="t" d="M{X(-250)} {Y(-560)} H{X(-150)} V{Y(-520)} H{X(-250)} Q{X(-275)} {Y(-540)} {X(-250)} {Y(-560)} Z" fill="{MAD}"/>'
    braco_d = f'<path class="t" d="M{X(250)} {Y(-560)} H{X(150)} V{Y(-520)} H{X(250)} Q{X(275)} {Y(-540)} {X(250)} {Y(-560)} Z" fill="{MAD}"/>'
    sup_e = f'<path class="t" d="M{X(-225)} {Y(-520)} V{Y(-420)} H{X(-190)} V{Y(-520)} Z" fill="{CROMO}"/>'
    sup_d = f'<path class="t" d="M{X(225)} {Y(-520)} V{Y(-420)} H{X(190)} V{Y(-520)} Z" fill="{CROMO}"/>'
    descanso = f'<path class="t" d="M{X(-150)} {Y(-150)} H{X(150)} L{X(175)} {Y(-110)} H{X(-175)} Z" fill="{CROMO}"/>'
    grade = ''.join(f'<path class="ff" d="M{X(-130 + i * 37)} {Y(-145)} L{X(-150 + i * 43)} {Y(-115)}"/>' for i in range(8))
    hastepe = f'<path class="t" d="M{X(-20)} {Y(-250)} L{X(-20)} {Y(-150)} M{X(20)} {Y(-250)} L{X(20)} {Y(-150)}" fill="none"/>'
    brilho = f'<path class="br" d="M{X(-120)} {Y(-800)} Q{X(-130)} {Y(-640)} {X(-122)} {Y(-470)}"/>'
    corpo = (sombra(base + coluna + anel, 18, 6) + pedal + hastepe + sombra(descanso, 12, 10) + grade
             + sombra(haste + cabeceira, 14, 14) + clipe + sombra(encosto, 18, 14)
             + f'<g clip-path="url(#enc{cx})">{linhas}{linhas2}{caps}</g>' + brilho
             + f'<path class="t" fill="none" d="M{X(-170)} {Y(-420)} L{X(-150)} {Y(-830)} Q{X(0)} {Y(-880)} {X(150)} {Y(-830)} L{X(170)} {Y(-420)} Z"/>'
             + sombra(sup_e + sup_d, 10, 10) + sombra(assento + frente, 18, 14) + vivo
             + sombra(braco_e + braco_d, 12, 10))
    return corpo


def cena1():
    """1 · a cadeira: a imagem mais forte"""
    parede = f'<rect x="0" y="0" width="{W}" height="700" fill="{CREME}"/>'
    lambri = f'<rect x="0" y="700" width="{W}" height="300" fill="{MAR2}"/>' + ''.join(
        f'<rect class="f" x="{40 + i * 200}" y="740" width="160" height="210" rx="6" stroke="{MAR}"/>' for i in range(5))
    faixa = f'<rect x="0" y="690" width="{W}" height="26" fill="{VERM}"/><path class="f" d="M0 690 H{W} M0 716 H{W}"/>'
    piso = xadrez(0, 1000, W, H, 128, '#1C2236', CREME2)
    linha_piso = f'<path class="t" d="M0 1000 H{W}"/>'
    espelho = sombra(f'<rect class="t" x="700" y="120" width="380" height="470" rx="14" fill="{MAD}"/>', 14, 14) + \
        f'<rect class="t" x="732" y="152" width="320" height="406" rx="6" fill="#C9D6DF"/>' + \
        f'<path d="M760 540 L900 160 H960 L820 540 Z" fill="#fff" opacity=".5"/><path d="M850 540 L960 240 V300 L878 540 Z" fill="#fff" opacity=".35"/>'
    luz = f'<path d="M420 0 L300 520 H740 L620 0 Z" fill="#FFF3D6" opacity=".55"/>'
    lampada = f'<path class="t" d="M520 0 V70" fill="none"/>' + sombra(f'<path class="t" d="M440 140 Q520 50 600 140 Z" fill="{MAR2}"/>', 10, 8) + f'<ellipse class="t" cx="520" cy="146" rx="34" ry="12" fill="#FFE7A8"/>'
    sombra_chao = f'<ellipse cx="560" cy="1196" rx="300" ry="54" fill="{SOMBRA_C}" opacity=".35"/>'
    corpo = parede + luz + espelho + lampada + faixa + lambri + piso + linha_piso + poste(96, 250, 104, 380) + sombra_chao + cadeira(540, 1200, 0.98)
    return svg(CREME, corpo, TINTA, SOMBRA_C)


def navalha(x, y, ang, s=1.0):
    """navalha de barbear aberta: lâmina de lombo reto e ponta quadrada, espiga com estrias, cabo articulado"""
    lamina = (f'<path class="t" d="M0 -6 L330 -30 Q352 -31 356 -10 L360 50 Q360 64 344 64 L40 56 Q8 52 0 30 Z" fill="{CROMO}"/>'
              f'<path d="M14 40 L346 48 L346 60 L40 56 Q16 53 10 44 Z" fill="#EEF1F5"/>'
              f'<path class="ff" d="M18 12 L340 -6"/>'
              f'<path class="br" d="M60 14 L300 0"/>')
    espiga = (f'<path class="t" d="M0 -6 L-70 -2 Q-96 2 -100 18 L-104 30 Q-80 36 -60 30 L0 30 Z" fill="{CROMO2}"/>'
              + ''.join(f'<path class="ff" d="M{-30 - i * 10} 30 V40"/>' for i in range(4)))
    pino = f'<circle class="t" cx="-12" cy="14" r="11" fill="{CROMO}"/>'
    cabo = (f'<g transform="rotate(-24 -12 14)"><path class="t" d="M-12 0 Q-200 -26 -420 -4 Q-440 14 -420 32 Q-200 54 -12 28 Z" fill="{MAR}"/>'
            f'<circle cx="-400" cy="14" r="8" fill="{CROMO}"/><path class="br" stroke-width="5" d="M-60 4 Q-200 -10 -380 4" opacity=".35"/></g>')
    return f'<g transform="translate({x} {y}) rotate({ang}) scale({s})">{sombra(cabo + espiga + lamina + pino, 14, 14)}</g>'


def tesoura(x, y, ang, s=1.0, cor_cabo=None):
    cc = cor_cabo or MAR
    l1 = f'<path class="t" d="M0 -10 L300 -4 Q318 0 300 6 L0 14 Z" fill="{CROMO}"/>'
    l2 = f'<path class="t" d="M0 14 L296 34 Q312 42 294 44 L0 26 Z" fill="{CROMO}" transform="rotate(-6)"/>'
    a1 = f'<circle class="t" cx="-110" cy="-40" r="46" fill="{cc}"/><circle class="t" cx="-110" cy="-40" r="24" fill="{CREME}"/>'
    a2 = f'<circle class="t" cx="-120" cy="60" r="46" fill="{cc}"/><circle class="t" cx="-120" cy="60" r="24" fill="{CREME}"/>'
    hastes = f'<path class="t" d="M-70 -26 L0 0 M-80 46 L0 20" fill="none"/>'
    return f'<g transform="translate({x} {y}) rotate({ang}) scale({s})">{sombra(hastes + a1 + a2 + l2 + l1, 12, 12)}<circle class="t" cx="0" cy="8" r="9" fill="{CROMO2}"/></g>'


def pente(x, y, ang, s=1.0, cor=None):
    c = cor or TINTA
    dentes = ''.join(f'<rect x="{10 + i * 20}" y="40" width="9" height="{70 if i < 13 else 58}" rx="3" fill="{c}"/>' for i in range(22))
    return f'<g transform="translate({x} {y}) rotate({ang}) scale({s})">{sombra(f"<rect class=\'t\' x=\'0\' y=\'0\' width=\'460\' height=\'50\' rx=\'14\' fill=\'{c}\'/>" + dentes, 12, 12)}<path class="br" stroke-width="4" d="M20 14 H440" opacity=".35"/></g>'


def pincel(x, y, ang, s=1.0):
    cabo = f'<path class="t" d="M0 -46 Q-30 -40 -150 -34 Q-180 0 -150 34 Q-30 40 0 46 Z" fill="{MAD}"/><path class="ff" d="M-40 -42 V42 M-60 -40 V40"/>'
    anel = f'<rect class="t" x="-10" y="-52" width="34" height="104" rx="8" fill="{CROMO}"/>'
    pelo = f'<path class="t" d="M24 -50 Q120 -96 200 -40 Q232 0 200 40 Q120 96 24 50 Z" fill="#D9C3A0"/><path d="M24 -50 Q70 -70 110 -64 L110 64 Q70 70 24 50 Z" fill="#6B4A2E"/><path class="ff" d="M130 -50 Q170 -20 190 -8 M130 50 Q170 20 190 8 M120 -20 Q160 -8 200 0"/>'
    return f'<g transform="translate({x} {y}) rotate({ang}) scale({s})">{sombra(cabo + anel + pelo, 12, 12)}</g>'


def cena2():
    """2 · ferramentas: navalha no couro, tesoura, pente e pincel (vista de cima)"""
    toalha = ''.join(f'<path d="M0 {y} H{W}" stroke="{MAR}" stroke-width="3" opacity=".5"/>' for y in range(10, H, 22))
    couro = (f'<g transform="rotate(-14 512 640)">'
             + sombra(f'<rect class="t" x="-80" y="520" width="1220" height="230" rx="10" fill="{MAD}"/>', 18, 18)
             + f'<rect x="-80" y="520" width="1220" height="60" fill="{MAD3}" opacity=".55"/>'
             + f'<path d="M-80 545 H1140 M-80 725 H1140" stroke="{MAD2}" stroke-width="5" stroke-dasharray="20 14" fill="none"/>'
             + f'<rect class="t" x="-80" y="520" width="1220" height="230" rx="10" fill="none"/>'
             + f'<rect class="t" x="40" y="560" width="70" height="150" rx="16" fill="none" stroke="{CROMO}" stroke-width="22"/><rect class="f" x="40" y="560" width="70" height="150" rx="16"/>'
             + '</g>')
    toalha_creme = sombra(f'<path class="t" d="M560 980 L1100 900 L1100 1300 L620 1300 Z" fill="{CREME}"/>', 14, 14) + \
        f'<path d="M600 1040 L1100 966 M612 1080 L1100 1008" stroke="{VERM}" stroke-width="16"/>'
    corpo = (toalha + couro + toalha_creme
             + tesoura(520, 230, 176, 1.25)
             + navalha(400, 630, -14, 1.25)
             + pincel(330, 1060, -32, 1.05)
             + pente(600, 1090, -9, 0.82))
    return svg(MAR2, corpo, TINTA, SOMBRA_C, grao=0.07)


def cena3():
    """3 · interior: bancada com espelho, poste e luz pendente"""
    parede = f'<rect width="{W}" height="760" fill="{CREME}"/>'
    lambri = f'<rect y="760" width="{W}" height="260" fill="{MAR2}"/>' + ''.join(
        f'<path class="f" stroke="{MAR}" d="M{i * 128} 760 V1020"/>' for i in range(1, 8))
    piso = xadrez(0, 1020, W, H, 120, '#1C2236', CREME2)
    espelho = sombra(f'<rect class="t" x="120" y="150" width="560" height="430" rx="12" fill="{MAD}"/>', 16, 16) + \
        f'<rect class="t" x="150" y="180" width="500" height="370" rx="4" fill="#C3D1DC"/>' + \
        f'<path d="M190 550 L370 180 H450 L270 550 Z" fill="#fff" opacity=".45"/><path d="M330 550 L480 240 V320 L370 550 Z" fill="#fff" opacity=".3"/>' + \
        f'<ellipse cx="560" cy="250" rx="40" ry="14" fill="#FFE7A8" opacity=".9"/>'
    bancada = sombra(f'<rect class="t" x="60" y="640" width="700" height="60" rx="8" fill="{MAD3}"/>', 14, 14) + \
        sombra(f'<rect class="t" x="90" y="700" width="640" height="270" fill="{MAD}"/>', 14, 14) + \
        ''.join(f'<rect class="f" x="{110 + i * 210}" y="726" width="190" height="100" rx="6" stroke="{MAD2}"/><rect class="t" x="{185 + i * 210}" y="770" width="40" height="12" rx="6" fill="{CROMO}"/>' for i in range(3)) + \
        ''.join(f'<rect class="f" x="{110 + i * 210}" y="846" width="190" height="100" rx="6" stroke="{MAD2}"/><rect class="t" x="{185 + i * 210}" y="890" width="40" height="12" rx="6" fill="{CROMO}"/>' for i in range(3))
    # sobre a bancada: máquina, borrifador, potes
    maquina = sombra(f'<rect class="t" x="150" y="560" width="70" height="84" rx="20" fill="{TINTA}"/><rect class="t" x="140" y="548" width="90" height="20" rx="4" fill="{CROMO}"/>', 8, 8)
    borrifador = sombra(f'<rect class="t" x="290" y="540" width="64" height="104" rx="16" fill="{MAR3}"/><path class="t" d="M300 540 V510 H350 L370 520 V530 H340 V540 Z" fill="{TINTA}"/>', 8, 8)
    potes = sombra(f'<rect class="t" x="430" y="590" width="90" height="54" rx="10" fill="{VERM}"/><rect class="t" x="424" y="578" width="102" height="22" rx="6" fill="{TINTA}"/>', 8, 8) + \
        sombra(f'<rect class="t" x="560" y="520" width="56" height="124" rx="12" fill="#C98A3A"/><rect class="t" x="572" y="494" width="32" height="30" rx="4" fill="{MAD2}"/>', 8, 8)
    toalhas = sombra(f'<rect class="t" x="640" y="600" width="120" height="44" rx="8" fill="{BRANCO}"/><path d="M640 620 H760" stroke="{VERM}" stroke-width="10"/>', 8, 8)
    lamp = ''.join(f'<path d="M{x} 0 V60" class="t" fill="none"/><path d="M{x - 90} 120 L{x - 40} 760 H{x + 40} L{x + 90} 120 Z" fill="#FFF3D6" opacity=".35"/>' + sombra(f'<path class="t" d="M{x - 70} 120 Q{x} 40 {x + 70} 120 Z" fill="{VERM}"/>', 8, 8) + f'<ellipse class="t" cx="{x}" cy="124" rx="28" ry="10" fill="#FFE7A8"/>' for x in (260, 560))
    corpo = parede + lamp + espelho + lambri + piso + f'<path class="t" d="M0 1020 H{W}"/>' + bancada + maquina + borrifador + potes + toalhas + poste(840, 300, 96, 360)
    return svg(CREME, corpo, TINTA, SOMBRA_C)


def cena4():
    """4 · produtos: prateleira com pomadas, pote de pentes no líquido azul, loção e toalhas"""
    parede = f'<rect width="{W}" height="{H}" fill="{MAR2}"/>' + ''.join(
        f'<path d="M{i * 64} 0 V{H}" stroke="{MAR}" stroke-width="3" opacity=".6"/>' for i in range(1, 17))

    def prateleira(y):
        return sombra(f'<rect class="t" x="40" y="{y}" width="944" height="40" rx="6" fill="{MAD3}"/>', 14, 14) + \
            f'<path class="t" d="M120 {y + 40} V{y + 110} H170 L120 {y + 40}" fill="{CROMO2}"/><path class="t" d="M904 {y + 40} V{y + 110} H854 L904 {y + 40}" fill="{CROMO2}"/>'

    def lata(x, y, cor, faixa):
        return sombra(f'<rect class="t" x="{x}" y="{y - 70}" width="150" height="70" rx="12" fill="{cor}"/><rect class="t" x="{x - 6}" y="{y - 92}" width="162" height="30" rx="8" fill="{CROMO}"/><rect x="{x + 6}" y="{y - 46}" width="138" height="16" fill="{faixa}"/>', 10, 10)

    # pote de vidro com líquido azul e pentes dentro (sem rótulo)
    pote = (sombra(f'<rect class="t" x="560" y="250" width="200" height="300" rx="26" fill="#BFE0F2"/>', 12, 12)
            + f'<rect x="572" y="330" width="176" height="208" rx="18" fill="#2F7FC1"/>'
            + ''.join(f'<rect class="t" x="{596 + i * 44}" y="{180 + (i % 2) * 24}" width="26" height="300" rx="6" fill="{c}" transform="rotate({-8 + i * 5} {610 + i * 44} 400)"/>' for i, c in enumerate([TINTA, VERM, TINTA, MAR3]))
            + f'<rect x="572" y="330" width="176" height="208" rx="18" fill="#2F7FC1" opacity=".55"/>'
            + f'<rect class="t" x="560" y="250" width="200" height="300" rx="26" fill="none"/>'
            + f'<rect class="t" x="548" y="228" width="224" height="38" rx="10" fill="{CROMO}"/>'
            + f'<path class="br" d="M590 290 V510"/>')
    frasco = (sombra(f'<path class="t" d="M220 550 V380 Q220 340 260 330 V280 H320 V330 Q360 340 360 380 V550 Z" fill="#C98A3A"/><rect class="t" x="252" y="240" width="76" height="46" rx="8" fill="{MAD2}"/>', 12, 12)
              + f'<rect x="236" y="430" width="108" height="60" fill="{CREME}"/><path class="ff" d="M250 452 H330 M250 470 H310"/><path class="br" d="M240 390 V530"/>')
    borr = sombra(f'<rect class="t" x="830" y="370" width="100" height="180" rx="24" fill="{VERM}"/><path class="t" d="M846 370 V320 H912 L946 336 V354 H900 V370 Z" fill="{TINTA}"/><rect x="842" y="430" width="76" height="40" fill="{CREME}"/>', 12, 12)
    tesoura_mini = ''
    linha1 = prateleira(550) + frasco + pote + borr + lata(80, 550, VERM, CREME) + lata(400, 550, TINTA, VERM)
    # prateleira de baixo: toalhas dobradas e tigela de espuma
    toalhas = ''.join(sombra(f'<rect class="t" x="90" y="{1000 - i * 66}" width="380" height="66" rx="22" fill="{BRANCO}"/><path d="M90 {1022 - i * 66} H470" stroke="{VERM}" stroke-width="10"/>', 12, 8) for i in range(4))
    tigela = sombra(f'<path class="t" d="M560 900 H900 Q890 1060 730 1066 Q570 1060 560 900 Z" fill="{CROMO}"/>', 12, 12) + \
        f'<path class="t" d="M580 900 Q600 840 660 850 Q690 800 750 830 Q810 800 840 856 Q890 850 880 900 Z" fill="{BRANCO}"/><path class="br" d="M600 940 Q640 1030 720 1040" stroke="#fff"/>'
    pinc = pincel(840, 820, -70, 0.8)
    linha2 = prateleira(1066) + toalhas + tigela + pinc
    corpo = parede + linha1 + linha2 + tesoura_mini
    return svg(MAR2, corpo, TINTA, SOMBRA_C, grao=0.07)


CENAS = {'barbearia-1': cena1, 'barbearia-2': cena2, 'barbearia-3': cena3, 'barbearia-4': cena4}
