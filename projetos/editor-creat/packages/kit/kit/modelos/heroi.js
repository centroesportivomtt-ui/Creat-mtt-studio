// HERÓI 3D: milhares de partículas em redemoinho que convergem e formam a Aba 71 (ou um texto),
// com a câmera vindo de lado e terminando de frente. No último quadro cada partícula está no pixel exato
// do alvo, então a etiqueta real (DOM) pode entrar por cima sem pulo: é o gancho para a transição "aba71".
// Tudo é função de t no shader (uniformes), então o quadro 200 sai igual no preview e no render.
// props:
//   alvo: "aba71" (padrão) | "texto"     texto: "CREAT" (quando alvo = "texto")
//   tamanho: lado da Aba em px (560)     cy: centro vertical em fração (0.5)
//   passo: espaçamento da amostragem em px (4; menor = mais partículas e mais lento)
//   poeira: partículas de atmosfera (2600)   contador: true (rótulo "N PARTÍCULAS" contando)
//   forma: segundos antes do fim da camada em que a forma fica completa (0.45)
//   some: tempo absoluto em que as partículas apagam (para a etiqueta real assumir); padrão = sem apagar
import * as THREE from "three";

export default function heroi(ctx, c) {
  const { W, H, el, prog, ease, semente } = ctx;
  const p = c.props;
  const S = p.tamanho ?? 560, cy = H * (p.cy ?? 0.5), passo = p.passo ?? 4;

  // 1) desenha o alvo num canvas e amostra a grade
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  let caixaAlvo; // [esq, topo, dir, base] do desenho final: vira a caixa declarada que o QA de zona mede (data-mk-zona)
  if ((p.alvo ?? "aba71") === "aba71") {
    const x0 = W / 2 - S / 2, y0 = cy - S / 2, r = S * 0.09;
    caixaAlvo = [x0, y0, x0 + S, y0 + S];
    g.fillStyle = "#DA291C"; g.beginPath(); g.roundRect(x0, y0, S, S, r); g.fill();
    // "c" em Montserrat Black, como o .mk-aba do DOM. A linha de base segue a conta do CSS (line-height 0.8):
    // topo da linha + (0.8 em - (ascendente + descendente)) / 2 + ascendente, para a partícula cair no pixel do DOM.
    const fc = S * 0.58; // Montserrat Black é mais larga que a Inter: 58% do lado e 20% de recuo para o "c" não encostar no ponto
    g.fillStyle = "#F1EBE2"; g.font = `900 ${fc}px Montserrat`; g.textBaseline = "alphabetic";
    if ("letterSpacing" in g) g.letterSpacing = `${-0.02 * fc}px`;
    const mt = g.measureText("c");
    const asc = mt.fontBoundingBoxAscent ?? 0.968 * fc, desc = mt.fontBoundingBoxDescent ?? 0.251 * fc;
    g.fillText("c", x0 + 0.20 * S, y0 + 0.27 * S + (0.8 * fc - (asc + desc)) / 2 + asc);
    const dx = x0 + S * 0.681, dy = y0 + S * 0.591, dr = S * 0.075;
    g.fillStyle = "#F1EBE2"; g.beginPath(); g.arc(dx, dy, dr + S * 0.014, 0, 7); g.fill();
    g.fillStyle = "#000000"; g.beginPath(); g.arc(dx, dy, dr, 0, 7); g.fill();
  } else {
    const tx = (p.texto ?? "CREAT").toUpperCase();
    const fs = ctx.ajustar(tx, "Anton", W * 0.8, 400);
    g.fillStyle = "#FFFFFF"; g.font = `${fs}px Anton`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(tx, W / 2, cy);
    const mt = g.measureText(tx);
    caixaAlvo = [W / 2 - mt.actualBoundingBoxLeft, cy - mt.actualBoundingBoxAscent, W / 2 + mt.actualBoundingBoxRight, cy + mt.actualBoundingBoxDescent];
  }
  const px = g.getImageData(0, 0, W, H).data;
  const alvo = [], cor = [];
  for (let y = 0; y < H; y += passo) for (let x = 0; x < W; x += passo) {
    const i = (y * W + x) * 4;
    if (px[i + 3] < 128) continue;
    if (px[i] + px[i + 1] + px[i + 2] < 30) continue; // preto vira buraco (o ponto da Aba)
    alvo.push(x - W / 2, H / 2 - y, 0);
    cor.push(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
  }
  const N = alvo.length / 3, NP = p.poeira ?? 2600, T = N + NP;
  const r = semente(2026);
  const aIni = new Float32Array(T * 3), aAlv = new Float32Array(T * 3), aCor = new Float32Array(T * 3), aExt = new Float32Array(T * 4);
  for (let i = 0; i < T; i++) {
    const poeira = i >= N;
    // início: casca esférica larga em volta da cena
    // início: galáxia de 3 braços em espiral, inclinada; a forma do redemoinho se lê desde o 1º quadro
    const rad = 180 + Math.pow(r(), 0.85) * 1500;
    const braco = Math.floor(r() * 3);
    const th = braco * (Math.PI * 2 / 3) + rad * 0.0032 + (r() - 0.5) * (0.5 + 300 / rad);
    const esp = (r() - 0.5) * 120 * (1 + rad / 700);
    aIni[i * 3] = rad * Math.cos(th);
    aIni[i * 3 + 1] = esp + rad * Math.sin(th) * 0.35;
    aIni[i * 3 + 2] = rad * Math.sin(th) * 0.85 - 500;
    if (poeira) {
      aAlv.set([aIni[i * 3] * 0.6, aIni[i * 3 + 1] * 0.6, aIni[i * 3 + 2] * 0.5 - 300], i * 3);
      const amb = r() < 0.35;
      aCor.set(amb ? [0.96, 0.72, 0.3] : [0.95, 0.92, 0.88], i * 3);
    } else {
      aAlv.set(alvo.slice(i * 3, i * 3 + 3), i * 3);
      aCor.set(cor.slice(i * 3, i * 3 + 3), i * 3);
    }
    const dist = poeira ? 1 : Math.hypot(alvo[i * 3], alvo[i * 3 + 1] - (H / 2 - cy)) / (S * 0.75);
    aExt[i * 4] = poeira ? 0 : Math.min(0.35, dist * 0.22 + r() * 0.13); // atraso: de dentro para fora
    aExt[i * 4 + 1] = 1.5 + r() * 2.8;                                   // giro em radianos
    aExt[i * 4 + 2] = poeira ? 2 + r() * 5 : passo * 1.75;               // tamanho final
    aExt[i * 4 + 3] = poeira ? 1 : 0;                                    // é poeira?
  }

  // 2) cena Three.js com câmera que mapeia 1 unidade = 1 px no plano z = 0
  const canvas = el("canvas", "", c.el, { position: "absolute", left: "0", top: "0", width: W + "px", height: H + "px" });
  const dpr = window.devicePixelRatio || 1;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: true });
  renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); renderer.setClearColor(0x000000, 0);
  const fov = 30, d0 = (H / 2) / Math.tan((fov * Math.PI) / 360);
  const camera = new THREE.PerspectiveCamera(fov, W / H, 10, 20000);
  const scene = new THREE.Scene();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(aAlv, 3));
  geo.setAttribute("aIni", new THREE.BufferAttribute(aIni, 3));
  geo.setAttribute("aCor", new THREE.BufferAttribute(aCor, 3));
  geo.setAttribute("aExt", new THREE.BufferAttribute(aExt, 4));
  const uni = { uP: { value: 0 }, uT: { value: 0 }, uPR: { value: dpr }, uD0: { value: d0 }, uSome: { value: 1 }, uPoeira: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    vertexShader: `
      attribute vec3 aIni; attribute vec3 aCor; attribute vec4 aExt;
      uniform float uP, uT, uPR, uD0, uSome, uPoeira;
      varying vec3 vCor; varying float vA;
      vec3 rotY(vec3 v, float a){ float c=cos(a), s=sin(a); return vec3(c*v.x+s*v.z, v.y, -s*v.x+c*v.z); }
      vec3 rotZ(vec3 v, float a){ float c=cos(a), s=sin(a); return vec3(c*v.x-s*v.y, s*v.x+c*v.y, v.z); }
      float io(float x){ return x<0.5 ? 4.0*x*x*x : 1.0-pow(-2.0*x+2.0,3.0)/2.0; }
      void main(){
        float poeira = aExt.w;
        float e = io(clamp((uP - aExt.x) / (1.0 - 0.35), 0.0, 1.0));
        vec3 pos;
        if (poeira > 0.5) {
          pos = mix(aIni, position, 0.5) + vec3(sin(uT*0.4 + aExt.y*7.0)*40.0, cos(uT*0.3 + aExt.y*5.0)*30.0, 0.0);
        } else {
          pos = mix(aIni, position, e);
          float s = 1.0 - e;
          pos = rotY(pos, s*s*aExt.y);
          pos = rotZ(pos, s*0.7);
        }
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        float dist = -mv.z;
        float foco = poeira > 0.5 ? 1.0 : (1.0 - e);
        float bokeh = 1.0 + foco * 1.5 * fract(aExt.y * 13.7);
        gl_PointSize = aExt.z * bokeh * uPR * (uD0 / dist);
        vA = (poeira > 0.5 ? 0.3 * uPoeira : (0.8 - 0.45 * foco) / (bokeh*bokeh*0.7 + 0.3)) * uSome;
        vCor = aCor * (1.0 + foco * 0.25);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vCor; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.18, d);
        gl_FragColor = vec4(vCor * a * vA, a * vA); // pré-multiplicado: luz soma sobre o fundo
      }`,
  });
  scene.add(new THREE.Points(geo, mat));

  // caixa declarada: o canvas não tem caixa de texto no DOM, então o modelo diz onde a forma pousa
  const declarada = el("div", "", c.el, { position: "absolute", left: caixaAlvo[0] + "px", top: caixaAlvo[1] + "px", width: caixaAlvo[2] - caixaAlvo[0] + "px", height: caixaAlvo[3] - caixaAlvo[1] + "px", pointerEvents: "none" });
  declarada.dataset.mkZona = "forma do heroi";

  // 3) contador de partículas (rótulo em mono, conta enquanto formam)
  let rot = null;
  if (p.contador !== false) {
    rot = el("div", "mk-dado", c.el, { position: "absolute", left: "0", right: "0", top: cy - S / 2 - 120 + "px", textAlign: "center", fontSize: "30px", color: "var(--mk-destaque)" });
  }

  const ini = c.de + 0.1, fim = c.ate - (p.forma ?? 0.45);
  const fCam = ease("power2.inOut");
  const fmt = (n) => n.toLocaleString("pt-BR");
  ctx.aCada((t) => {
    if (t < c.de || t >= c.ate) return;
    const k = prog(t, ini, fim - ini);
    uni.uP.value = k; uni.uT.value = t;
    declarada.dataset.mkZonaAtiva = k >= 0.5 && !(p.some && t >= p.some + 0.16) ? "1" : "0";
    const kc = fCam(prog(t, c.de, fim - c.de));
    // câmera: começa alta e longe (a galáxia inteira se lê como espiral), desce e termina de frente a d0
    const ang = (1 - kc) * 0.5, dist = d0 * (1.55 - 0.55 * kc), alt = (1 - kc) * 2600;
    camera.position.set(Math.sin(ang) * dist, alt, Math.cos(ang) * dist);
    camera.up.set(Math.sin((1 - kc) * -0.12), Math.cos((1 - kc) * -0.12), 0);
    camera.lookAt(0, 0, (1 - kc) * -400);
    uni.uSome.value = p.some ? 1 - prog(t, p.some, 0.16) : 1;
    uni.uPoeira.value = 1 - 0.6 * kc;
    renderer.render(scene, camera);
    if (rot) {
      const n = Math.round(N * ease("power2.out")(k));
      rot.textContent = `${fmt(n)} PARTÍCULAS`;
      // entra já legível (0,6) e firma em 1 em 0,3 s; só apaga quando as partículas somem
      rot.style.opacity = String((0.6 + 0.4 * prog(t, c.de + 0.2, 0.3)) * (p.some ? 1 - prog(t, p.some, 0.12) : 1));
    }
  });
  ctx.cue(c.de, "redemoinho", -6);
  ctx.cue(fim, "forma", -2);
}
