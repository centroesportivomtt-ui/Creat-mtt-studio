// Linha "Foto de bairro": 9 peças (3 por nicho) em 2 formatos.
// foto-bairro.html?p=barbearia-1&f=9x16 (ou f=4x5). As fotos são servidas em /fotos/ pelo renderizador
// (vêm de fora do repositório). Título: linhas em faixas; *texto* = faixa --sol (a virada da frase).
// Regras: sem pergunta, sem promessa, sem preço, sem prazo, sem cidade, sem "agenda".
// pos9 / pos45 = object-position da foto em cada formato; tema = cor das faixas que não são --sol.
window.PECAS_FOTO = {
  'barbearia-1': { nicho: 'Barbearia', n: 1, ideia: 'porta subindo de manha', foto: 'Foto Barbearia - porta abrindo de manha - vertical 9x16.png',
    titulo: ['Veja o site da sua', '*barbearia*', 'pronto.'], tema: 'papel', pos9: '50% 50%', pos45: '50% 62%' },
  'barbearia-2': { nicho: 'Barbearia', n: 2, ideia: 'mao na maquina', foto: 'Foto Barbearia - maquina na nuca e celular ao lado - vertical 9x16.png',
    titulo: ['Mão na máquina.', '*Pedido no WhatsApp.*'], tema: 'papel', pos9: '50% 50%', pos45: '50% 0%', lay9: 'pe', lay45: 'pe', t9: '90px' },
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
  'academia-2': { nicho: 'Academia', n: 2, ideia: 'ferro de verdade', foto: 'Foto Academia - anilhas gastas na luz da janela - vertical 9x16.png',
    titulo: ['Ferro de verdade.', '*Site de verdade.*'], tema: 'papel', pos9: '50% 50%', pos45: '50% 30%', junto9: true },
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
  const pe = f === '9x16' ? p.lay9 === 'pe' : p.lay45 === 'pe';
  if (f === '9x16' && p.t9) peca.style.setProperty('--t', p.t9);
  if (pe && f === '4x5') {
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
  if (pe) {
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
