// Linha "Foto de bairro": 9 peças (3 por nicho) em 2 formatos.
// foto-bairro.html?p=barbearia-1&f=9x16 (ou f=4x5). As fotos são servidas em /fotos/ pelo renderizador
// (vêm de fora do repositório). Título: linhas em faixas; *texto* = faixa --sol (a virada da frase).
// Regras: sem pergunta, sem promessa, sem preço, sem prazo, sem cidade, sem "agenda".
// pos9 / pos45 = object-position da foto em cada formato; tema = cor das faixas que não são --sol.
window.PECAS_FOTO = {
  'barbearia-1': { nicho: 'Barbearia', n: 1, ideia: 'porta subindo de manha', foto: 'Foto Barbearia - porta abrindo de manha - vertical 9x16.png',
    titulo: ['Veja o site da sua', '*barbearia*', 'pronto.'], tema: 'papel', pos9: '50% 50%', pos45: '50% 62%' },
  // barbearia-2 (conferência de 11/11): o celular da cena tem de aparecer aceso, com o pedido. A foto sobe 220 px no
  // vertical e 120 px no feed (cena9/cena45 = topo da foto em px, na escala de capa), o pé do vertical é completado com o
  // reflexo da própria mesa, a tela ganha luz (tela = contorno da tela em px da foto original) e o balão da vitrine sai
  // dela. Com a máquina subindo para y 330..590, o título vai para a coluna livre da parede, à esquerda (x < 460).
  'barbearia-2': { nicho: 'Barbearia', n: 2, ideia: 'mao na maquina', foto: 'Foto Barbearia - maquina na nuca e celular ao lado - vertical 9x16.png',
    titulo: ['Mão na', 'máquina.', '*Pedido no*', '*WhatsApp.*'], tema: 'papel', pos9: '50% 50%', pos45: '50% 0%',
    lay9: 'cena', lay45: 'cena', t9: '56px', t45: '72px', cena9: -214, cena45: -120,
    tela: 'M549,1215 L915,1203 Q951,1203 955,1235 Q954,1243 944,1243 L553,1251 Q541,1251 541,1240 L542,1226 Q543,1215 549,1215 Z',
    balao: ['Pedido pelo site', 'Corte, amanhã 14h'],
    chipT: '32px', // o chip fica à esquerda do celular; em 34 px a sombra encostaria no aro
    colocar: {
      '9x16': { titulo: [72, 278], rodape: [65, 1086], chip: [65, 1236], balao: [1009, 1070], ponta: [834, 1138] },
      '4x5': { titulo: [60, 142], rodape: [56, 52], chip: [60, 1288], balao: [1018, 1160], ponta: [834, 1232] }
    } },
  'barbearia-3': { nicho: 'Barbearia', n: 3, ideia: 'fim do dia aberto', foto: 'Foto Barbearia - vassoura no fim do dia - vertical 9x16.png',
    titulo: ['Fim do dia.', '*O site segue*', '*aberto.*'], tema: 'tinta', pos9: '50% 50%', pos45: '50% 70%' },
  'salao-1': { nicho: 'Salao', n: 1, ideia: 'porta abrindo de manha', foto: 'Foto Salao - dona abrindo a porta de manha - vertical 9x16.png',
    titulo: ['Veja o site do seu', '*salão*', 'pronto.'], tema: 'papel', pos9: '50% 50%', pos45: '50% 70%' },
  'salao-2': { nicho: 'Salao', n: 2, ideia: 'luva na tinta', foto: 'Foto Salao - tinta na cumbuca e luvas - vertical 9x16.png',
    titulo: ['Luva na tinta.', '*A cliente pede*', '*pelo site.*'], tema: 'papel', pos9: '50% 50%', pos45: '50% 60%' },
  'salao-3': { nicho: 'Salao', n: 3, ideia: 'sem amarra', foto: 'Foto Salao - dona descansando depois do ultimo - vertical 9x16.png',
    titulo: ['Seu site pronto.', '*Sem amarra.*'], tema: 'papel', pos9: '50% 50%', pos45: '50% 0%', lay9: 'pe' },
  'academia-1': { nicho: 'Academia', n: 1, ideia: 'portao abrindo de manha', foto: 'Foto Academia - dono abrindo o portao de manha - vertical 9x16.png',
    titulo: ['Veja o site da sua', '*academia*', 'pronto.'], tema: 'papel', pos9: '50% 50%', pos45: '50% 55%' },
  // academia-2 era o supino; saiu porque qualquer título cobria o rosto do dono ou a mão na barra.
  // conferência de 11/11: "Ferro de verdade. Site de verdade." servia para qualquer anunciante. Agora diz o gesto (treino)
  // e o que se vende (a aula pedida pelo site), na forma da Salão 2. "Aula pedida pelo site." (22) passa da faixa: vira 2 tiras sol.
  'academia-2': { nicho: 'Academia', n: 2, ideia: 'ferro de verdade', foto: 'Foto Academia - anilhas gastas na luz da janela - vertical 9x16.png',
    titulo: ['Treino puxado.', '*Aula pedida*', '*pelo site.*'], tema: 'papel', pos9: '50% 50%', pos45: '50% 30%', junto9: true },
  'academia-3': { nicho: 'Academia', n: 3, ideia: 'portao fechado site aberto', foto: 'Foto Academia - dono passando o rodo a noite - vertical 9x16.png',
    titulo: ['Portão fechado.', '*Site aberto.*'], tema: 'tinta', pos9: '50% 50%', pos45: '50% 60%', junto9: true }
};

(async function () {
  const q = new URLSearchParams(location.search);
  const p = window.PECAS_FOTO[q.get('p')] || window.PECAS_FOTO['barbearia-1'];
  const f = q.get('f') === '4x5' ? '4x5' : '9x16';
  document.documentElement.classList.add(f === '4x5' ? 'f45' : 'f9');
  const peca = document.getElementById('peca');
  peca.classList.add(p.tema === 'tinta' ? 'tinta' : 'papel');

  const img = peca.querySelector('.foto');
  img.style.objectPosition = f === '4x5' ? p.pos45 : p.pos9;
  img.src = '/fotos/' + encodeURIComponent(p.foto);

  const t = peca.querySelector('.titulo');
  t.innerHTML = '';
  p.titulo.forEach(l => {
    const s = document.createElement('span');
    const sol = /^\*.*\*$/.test(l);
    s.className = 'faixa' + (sol ? ' sol' : '');
    s.textContent = sol ? l.slice(1, -1) : l;
    t.appendChild(s);
  });
  document.title = 'Anuncio foto ' + p.nicho + ' ' + p.n + ' - ' + p.ideia;

  // posições: vertical dentro da área segura; feed com margem de 56 px
  const pos = (el, css) => Object.assign(el.style, css);
  const chip = peca.querySelector('.chip'), selo = peca.querySelector('.selo'), rod = peca.querySelector('.rodape');
  const lay = f === '9x16' ? p.lay9 : p.lay45, pe = lay === 'pe', cena = lay === 'cena';
  if (f === '9x16' && p.t9) peca.style.setProperty('--t', p.t9);
  if (f === '4x5' && p.t45) peca.style.setProperty('--t', p.t45);
  if (cena) {
    // posições fixas por formato, decididas sobre a grade da foto (ver o comentário da peça)
    const c = p.colocar[f];
    if (p.chipT) chip.style.fontSize = p.chipT;
    pos(t, { left: c.titulo[0] + 'px', top: c.titulo[1] + 'px' });
    pos(rod, { left: c.rodape[0] + 'px', top: c.rodape[1] + 'px' });
  } else if (pe && f === '4x5') {
    pos(rod, { left: '56px', top: '52px' });
    pos(selo, { left: '60px', top: '132px' });
  } else if (pe) {
    // cena com rosto ou ação no alto: título e chip descem para o pé da área segura; origem e selo sobem
    pos(rod, { left: '65px', top: '284px' });
    pos(selo, { left: '72px', top: '366px' });
  } else if (f === '9x16') {
    pos(t, { left: '72px', top: '300px' });
    pos(selo, { left: '72px', top: '1108px' });
    pos(rod, { left: '65px', top: '1176px' });
  } else {
    pos(t, { left: '60px', top: '58px' });
    pos(selo, { left: '60px', top: '1166px' });
    pos(rod, { left: '56px', top: '1236px' });
  }

  await new Promise((ok, erro) => { if (img.complete && img.naturalWidth) ok(); else { img.onload = ok; img.onerror = () => erro(new Error('foto não carregou: ' + p.foto)); } });
  await document.fonts.ready;
  const base = peca.getBoundingClientRect();
  if (cena) {
    // a foto na escala de capa (largura 1080), deslocada para cima; o que falta no pé vem do reflexo da própria mesa
    const W = img.naturalWidth, H = img.naturalHeight, alto = 1080 / W * H, NS = 'http://www.w3.org/2000/svg';
    const quadro = document.createElement('div');
    quadro.className = 'quadro';
    pos(quadro, { top: (f === '9x16' ? p.cena9 : p.cena45) + 'px', height: alto + 'px' });
    peca.insertBefore(quadro, img);
    quadro.appendChild(img);
    if ((f === '9x16' ? p.cena9 : p.cena45) + alto < peca.clientHeight) {
      const esp = img.cloneNode(); esp.className = 'foto espelho'; quadro.appendChild(esp);
    }
    if (p.tela) {
      // a tela do celular acesa: luz espalhada no aro e na mesa, a tela clara e o balão do pedido visto de lado
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'luz-tela'); svg.setAttribute('aria-hidden', 'true');
      // tudo levemente desfocado (a foto tem o celular fora do plano de foco), sem contorno de desenho
      svg.innerHTML = '<defs><filter id="brilho" x="-30%" y="-400%" width="160%" height="900%"><feGaussianBlur stdDeviation="14"/></filter>'
        + '<filter id="foco" x="-5%" y="-50%" width="110%" height="200%"><feGaussianBlur stdDeviation="1.3"/></filter>'
        + '<linearGradient id="vidro" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#D9E6EC"/><stop offset=".35" stop-color="#EEF3F2"/><stop offset=".8" stop-color="#F6F5EF"/><stop offset="1" stop-color="#E2E8E9"/></linearGradient>'
        + '<clipPath id="recorte"><path d="' + p.tela + '"/></clipPath></defs>'
        + '<path d="' + p.tela + '" fill="#F4F8F6" opacity=".45" filter="url(#brilho)"/>'
        + '<g filter="url(#foco)"><path d="' + p.tela + '" fill="url(#vidro)" opacity=".96"/>'
        + '<g clip-path="url(#recorte)"><path d="M541,1203 L960,1189 L960,1210 L541,1221 Z" fill="#C9D9DF" opacity=".75"/>'
        + '<path d="M716,1231 L902,1225 Q912,1225 912,1230 Q912,1235 902,1235 L718,1241 Q708,1241 708,1236 Q708,1231 716,1231 Z" fill="#FFFFFF" opacity=".9"/>'
        + '<path d="M541,1247 L960,1238 L960,1260 L541,1260 Z" fill="#1E1B2E" opacity=".08"/></g></g>';
      quadro.appendChild(svg);
    }
  }
  if (cena && p.balao) {
    // o balão da vitrine (mesma forma do .balao do index.html) sai da tela; o selo "cena de exemplo" fica preso nele
    const c = p.colocar[f], bal = peca.querySelector('.balao');
    bal.hidden = false;
    bal.querySelector('.b-rot').textContent = p.balao[0];
    bal.querySelector('.b-msg').textContent = p.balao[1];
    const bw = bal.offsetWidth, bh = bal.offsetHeight;
    pos(bal, { left: (c.balao[0] - bw) + 'px', top: (c.balao[1] - bh) + 'px' });
    // rabicho: da base do balão até a ponta, logo acima da tela acesa
    const bx = c.ponta[0] - 34, by = c.balao[1], tip = c.ponta, NS = 'http://www.w3.org/2000/svg';
    const rabo = document.createElementNS(NS, 'svg');
    rabo.setAttribute('class', 'rabo'); rabo.setAttribute('aria-hidden', 'true');
    pos(rabo, { left: '0px', top: '0px', width: base.width + 'px', height: base.height + 'px' });
    rabo.innerHTML = '<path d="M' + (bx - 2) + ',' + (by - 7) + ' L' + (bx + 46) + ',' + (by - 7) + ' L' + tip[0] + ',' + tip[1] + ' Z" fill="#F2ECDD"/>'
      + '<path d="M' + bx + ',' + (by - 4) + ' L' + tip[0] + ',' + tip[1] + ' L' + (bx + 44) + ',' + (by - 4) + '" fill="none" stroke="#1E1B2E" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>';
    peca.insertBefore(rabo, bal.nextSibling);
    const r = bal.getBoundingClientRect();
    // selo pendurado na borda de cima do balão, sem cobrir o rótulo
    pos(selo, { left: Math.round(r.left - base.left - 14) + 'px', top: Math.round(r.top - base.top - selo.offsetHeight + 8) + 'px', transform: 'rotate(-3deg)' });
    // chip no pé, à esquerda do celular
    const ch = chip.getBoundingClientRect().height;
    pos(chip, { left: c.chip[0] + 'px', top: (c.chip[1] - ch) + 'px' });
  } else if (pe) {
    // vertical: chip termina em y 1236 (sombra até 1242); feed: termina 56 px acima do pé. Título acima do chip.
    const ch = chip.getBoundingClientRect().height, th = t.getBoundingClientRect().height;
    const chipTop = (f === '9x16' ? 1236 : 1350 - 62) - ch, x = f === '9x16' ? 72 : 60;
    pos(chip, { left: x + 'px', top: chipTop + 'px' });
    pos(t, { left: x + 'px', top: Math.round(chipTop - (f === '9x16' ? 34 : 28) - th) + 'px' });
  } else {
    // chip logo abaixo da última faixa
    const r = t.getBoundingClientRect();
    pos(chip, { left: (f === '9x16' ? 72 : 60) + 'px', top: Math.round(r.bottom - base.top + (f === '9x16' ? 34 : 28)) + 'px' });
  }
  // junto9: origem e selo logo abaixo do chip, para deixar a pessoa da cena livre no meio da área segura
  if (f === '9x16' && p.junto9 && !pe) {
    const c = chip.getBoundingClientRect();
    pos(rod, { left: '65px', top: Math.round(c.bottom - base.top + 30) + 'px' });
    const rr = rod.getBoundingClientRect();
    pos(selo, { left: '72px', top: Math.round(rr.bottom - base.top + 20) + 'px' });
  }
  document.documentElement.dataset.pronto = '1';
})();
