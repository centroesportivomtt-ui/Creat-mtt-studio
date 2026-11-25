// Ponte entre a página e o renderizador: window.__mk.montar(comp, {alfa}) e window.__mk.seek(t).
import { criarPalco } from "./nucleo.js";
import fundo from "./modelos/fundo.js";
import gancho from "./modelos/gancho.js";
import legenda from "./modelos/legenda.js";
import chip from "./modelos/chip.js";
import transicao from "./modelos/transicao.js";
import hud from "./modelos/hud.js";
import fecho from "./modelos/fecho.js";
import heroi from "./modelos/heroi.js";
import abas from "./modelos/abas.js";
import gancho2 from "./modelos/gancho2.js";
import selo from "./modelos/selo.js";
import checklist from "./modelos/checklist.js";
import rotulo from "./modelos/rotulo.js";
import camadas from "./modelos/camadas.js";
import stats from "./modelos/stats.js";
import pilha from "./modelos/pilha.js";
import fecho2 from "./modelos/fecho2.js";
// linguagem "Em Revelação" (laboratório fotográfico)
import revelacao from "./modelos/revelacao.js";
import legenda_revelada from "./modelos/legenda_revelada.js";
import laboratorio from "./modelos/laboratorio.js";
import papel from "./modelos/papel.js";
// agenda da semana (reunião de alinhamento, 24/11)
import semana from "./modelos/semana.js";
// Maryna Biscoitos (25/11): legenda adesivo, carimbo do júri, ficha de receita e vitrine de produto
import legenda_adesivo from "./modelos/legenda_adesivo.js";
import carimbo from "./modelos/carimbo.js";
import receita from "./modelos/receita.js";
import vitrine from "./modelos/vitrine.js";

const modelos = { fundo, gancho, legenda, chip, transicao, hud, fecho, heroi, abas, gancho2, selo, checklist, rotulo, camadas, stats, pilha, fecho2, revelacao, legenda_revelada, laboratorio, papel, semana, legenda_adesivo, carimbo, receita, vitrine };

async function fontes() {
  await Promise.all([
    document.fonts.load('100px "Anton"'),
    document.fonts.load('500 40px "Inter"'),
    document.fonts.load('900 40px "Inter"'),
    document.fonts.load('700 40px "JetBrains Mono"'),
    document.fonts.load('900 40px "Montserrat"'),
    document.fonts.load('400 68px "Instrument Serif"', "çãé"),
    document.fonts.load('italic 400 68px "Instrument Serif"', "çãé"),
    document.fonts.load('400 38px "Special Elite"', "çãé"),
    document.fonts.load('400 60px "Caveat Brush"', "çãé"),
    document.fonts.load('400 60px "Lilita One"', "çãéÚ"),
    document.fonts.load('400 60px "Kaushan Script"', "çãé"),
  ]);
  await document.fonts.ready;
}

let palco = null;
window.__mk = {
  async montar(comp, opcoes = {}) {
    await fontes();
    palco = await criarPalco(comp, modelos, opcoes);
    palco.seek(0);
    return { duracao: palco.duracao, fps: palco.fps, w: palco.W, h: palco.H, cues: palco.cues, qa: palco.qa, zona: palco.zona };
  },
  seek(t) { palco.seek(t); },
};
window.__mkPronto = true;
