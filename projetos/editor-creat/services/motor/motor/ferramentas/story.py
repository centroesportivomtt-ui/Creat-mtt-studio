"""Story curto (5 a 12 s) a partir de uma especificação pequena, sem passar pelo diretor: monta o EDL e enfileira a montagem.

Para peças de aquecimento ("vem aí"), bastidor e enquete: um ou dois trechos do material já lido no projeto, legenda das
palavras ditas, um ou dois textos de tela e, se quiser, cartão final. Usa o mesmo acabamento do editor (cor, estabilização,
legenda, mix, QA). A parte de baixo do quadro fica livre para o adesivo do Instagram (enquete, caixinha).

uso:
  python -m motor.ferramentas.story <projeto> <especificacao.json>

especificação (uma por versão):
  {"versao": "s1", "pecas": [
      {"arquivo": "a004", "s0": 1.3, "s1": 4.7, "fala": true, "vel": 1.1},        # trecho com fala (entra voz + legenda)
      {"arquivo": "a017", "s0": 0.2, "dur": 2.5, "vel": 0.8},                     # b-roll (só imagem, na música)
      {"arquivo": "VFX1", "chave": "entrada/<projeto>/efeito.mp4", "audio_de": "a035", "s0": 0, "dur": 2.4, "estab": "nao"}],  # clipe pronto
   "motion": [{"modelo": "rotulo", "de": 0.2, "ate": 3.0, "props": {...}}],       # camadas do kit (tempos do story)
   "trilha": {"chave": "biblioteca/trilhas/x.wav", "inicio": 8.0, "ganho_db": -15},
   "tom_sala": {"arquivo": "a012", "s0": 49.0, "s1": 55.0},                       # trecho sem voz de OUTRO arquivo
   "legenda_y": 0.62, "cor": "quente-medio",
   "assinatura": true}                                                            # selo "@creat.mtt" (padrão: entra se nenhuma camada tiver o arroba)
"""
from __future__ import annotations

import json
import pathlib
import sys

from motor import banco, config
from motor.provedores import armazenamento_de


def montar_edl(arm, projeto: str, esp: dict) -> dict:
    fontes, voz, planos, palavras = {}, [], [], []
    t = 0.0

    def fonte(aid: str, chave: str | None = None, audio_de: str | None = None) -> str:
        if chave and aid not in fontes:      # clipe pronto (efeito feito fora do motor): entra pela chave, sem análise
            fontes[aid] = {"chave": chave, "audio": f"derivados/{projeto}/{audio_de}/audio.wav", "offset": 0.0, "rotacao": 0, "fps": 30,
                           "_an": {"transcricao": {"segmentos": []}}}
        if aid not in fontes:
            an = arm.ler_json(f"derivados/{projeto}/{aid}/analise.json")
            fontes[aid] = {"chave": an["arquivo"]["chave"], "audio": f"derivados/{projeto}/{aid}/audio.wav", "offset": 0.0,
                           "rotacao": 0, "fps": an["midia"].get("fps", 30), "_an": an}
        return aid

    for i, pc in enumerate(esp["pecas"]):
        aid = fonte(pc["arquivo"], pc.get("chave"), pc.get("audio_de"))
        vel = float(pc.get("vel", 1.0))
        s0 = float(pc["s0"])
        s1 = float(pc["s1"]) if "s1" in pc else s0 + float(pc["dur"]) * vel
        dur = (s1 - s0) / vel
        z0, z1 = pc.get("zoom", [1.0, 1.04])
        planos.append({"id": f"P{i:02d}", "bloco": "B1", "t0": round(t, 4), "t1": round(t + dur, 4), "fonte": aid, "s0": round(s0, 4), "vel": vel,
                       "enquadre": [[0, z0, pc.get("cx", 0.5), pc.get("cy", 0.45)], [1, z1, pc.get("cx", 0.5), pc.get("cy", 0.45)]],
                       "estab": pc.get("estab", "sim"), "cor": esp.get("cor", "quente-medio"), "som_direto_db": pc.get("som_direto_db"),
                       "desfocar": pc.get("desfocar", []), "janela": None, "mblur": False})
        if pc.get("fala"):
            ditas = [w for s in fontes[aid]["_an"]["transcricao"]["segmentos"] for w in s["palavras"] if s0 - 0.02 <= w[0] < s1]
            troca = pc.get("corrigir", {})
            voz.append({"id": f"B1.{i}.0", "bloco": "B1", "fala": f"F00.{i}", "fonte": aid, "s0": round(s0, 4), "s1": round(s1, 4),
                        "t0": round(t, 4), "t1": round(t + dur, 4), "vel": vel, "ganho_db": 0, "limpeza": {"atenuacao_db": 15, "mistura": 0.8, "auto": True},
                        "texto": " ".join(troca.get(w[2], w[2]).strip(".,?!") for w in ditas)})
            for w in ditas:
                txt = troca.get(w[2], w[2]).strip(".,?!…")
                if txt and not pc.get("sem_legenda"):
                    palavras.append([round(t + (max(w[0], s0) - s0) / vel, 3), round(t + (min(w[1], s1) - s0) / vel, 3), txt, 0])
        t += dur
    dur_total = round(t, 4)
    for f in fontes.values():
        f.pop("_an", None)
    tr = esp.get("trilha") or {}
    ts = esp.get("tom_sala")
    if ts:
        fonte(ts["arquivo"]); fontes[ts["arquivo"]].pop("_an", None)
    motion = [dict(id=m.get("id", f"m{k}"), **{x: m[x] for x in ("modelo", "de", "ate", "props")}) for k, m in enumerate(esp.get("motion", []))]
    if esp.get("assinatura", True) and not any("@creat.mtt" in json.dumps(m["props"], ensure_ascii=False) for m in motion):
        # regra da casa (c_arroba_fecho): toda peça leva o arroba. Story não tem cartão final, então vai um selo pequeno no canto
        # de cima à direita da zona segura, longe do adesivo do Instagram.
        motion.append({"id": "assinatura", "modelo": "rotulo", "de": 0.6, "ate": round(dur_total - 0.25, 3),
                       "props": {"titulo": "@creat.mtt", "x": 960, "y": 292, "direita": True, "ponto": False, "tam": 22}})
    logos = [{"t": round(m["de"] + 1.5, 3), "chave": m["props"][k]} for m in motion for k in ("logo_cliente", "logo_parceiro") if m["props"].get(k)]
    return {
        "versao": "1", "projeto": projeto,
        "origem": {"direcao": "story", "catalogo": projeto, "modelo": "story", "versao": esp["versao"], "cerebro": "sessao", "conceito": esp.get("conceito", "")},
        "formato": {"w": 1080, "h": 1920, "fps": 30}, "duracao": dur_total, "vel_fala": max([v["vel"] for v in voz] or [1.0]),
        "blocos": [{"id": "B1", "funcao": "gancho", "intensidade": 4, "t0": 0.0, "t1": dur_total}],
        "fontes": fontes, "voz": voz, "planos": planos, "motion": motion,
        "legendas": {"modelo": "legenda", "y": esp.get("legenda_y", 0.62), "palavras": palavras},
        "fx": esp.get("fx", []), "sfx": esp.get("sfx", []),
        "trilha": {"chave": tr.get("chave"), "bpm": tr.get("bpm"), "fase": 0, "ganho_db": tr.get("ganho_db", -15),
                   "emendas": ([[0, tr.get("inicio", 0.0), tr.get("inicio", 0.0) + dur_total + 0.5, 0.02]] if tr.get("chave") else []),
                   "ducking": {"db": 11, "desce": 0.35, "sobe": 0.6}, "acorde_final": None},
        "tom_sala": ({"fonte": ts["arquivo"], "s0": ts["s0"], "s1": ts["s1"], "db": ts.get("db", -46), "difuso": True} if ts else None),
        "master": {"lufs": -14, "tp": -1.0, "crf": 17},
        "qa": {"logos": logos, "falas_confirmadas": [], "riscos": esp.get("riscos", [])},
    }


def main(argv=None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if len(argv) < 2:
        print(__doc__)
        return 2
    projeto, arq = argv[0], pathlib.Path(argv[1])
    cfg = config.carregar()
    arm = armazenamento_de(cfg)
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[4] / "packages" / "schemas" / "py"))
    import validar
    esps = json.loads(arq.read_text(encoding="utf-8"))
    con = banco.conectar(cfg.banco)
    for esp in (esps if isinstance(esps, list) else [esps]):
        edl = montar_edl(arm, projeto, esp)
        erros = validar.erros("edl", edl)
        if erros:
            print(esp["versao"], "EDL inválido:", erros[:4])
            return 1
        arm.gravar_json(f"saidas/{projeto}/{esp['versao']}/edl.json", edl)
        with con:
            banco.enfileirar(con, "montagem", projeto, esp["versao"], prioridade=3)
        print(esp["versao"], f"{edl['duracao']:.1f} s ·", " ".join(w[2] for w in edl["legendas"]["palavras"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
