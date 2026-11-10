# Base das ilustrações da casa (Paleta, onda 3, pacote 3F).
# Estilo: chapado em 2 ou 3 tons, contorno de nanquim, sombra dura deslocada (DIRECAO.md §3: nunca sombra borrada).
W, H = 1024, 1280
TRACO = 8


def svg(fundo, corpo, tinta, sombra, grao=0.055, extra_defs=''):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs>
<style>
.t{{stroke:{tinta};stroke-width:{TRACO};stroke-linejoin:round;stroke-linecap:round}}
.f{{stroke:{tinta};stroke-width:5;stroke-linejoin:round;stroke-linecap:round;fill:none}}
.ff{{stroke:{tinta};stroke-width:3.5;stroke-linecap:round;fill:none}}
.br{{fill:none;stroke:#FFFFFF;stroke-width:7;stroke-linecap:round;opacity:.75}}
.sb *{{fill:{sombra}!important;stroke:{sombra}!important}}
.sb .br,.sb .f,.sb .ff{{display:none}}
</style>
<filter id="grao" x="0" y="0" width="100%" height="100%">
<feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7" result="n"/>
<feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.15"/>
</filter>
{extra_defs}
</defs>
<rect width="{W}" height="{H}" fill="{fundo}"/>
{corpo}
<rect width="{W}" height="{H}" filter="url(#grao)" opacity="{grao}"/>
</svg>'''


def sombra(el, dx=16, dy=16):
    """desenha o elemento com sombra dura (cópia chapada deslocada) por baixo"""
    return f'<g class="sb" transform="translate({dx} {dy})">{el}</g>{el}'


def xadrez(x0, y0, x1, y1, lado, c1, c2, skew=-18, sy=0.55):
    """piso xadrez em perspectiva simples (achatado e inclinado)"""
    out = []
    cols = int((x1 - x0) / lado) + 6
    rows = int((y1 - y0) / (lado * sy)) + 2
    for r in range(rows):
        for c in range(-3, cols):
            cor = c1 if (r + c) % 2 == 0 else c2
            out.append(f'<rect x="{x0 + c * lado}" y="{r * lado}" width="{lado}" height="{lado}" fill="{cor}"/>')
    return (f'<svg x="0" y="{y0}" width="{W}" height="{y1 - y0}" overflow="hidden">'
            f'<g transform="scale(1 {sy}) skewX({skew})">{"".join(out)}</g></svg>')
