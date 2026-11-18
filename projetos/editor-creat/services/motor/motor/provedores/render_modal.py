"""Render dos planos em GPU na nuvem (Modal; L4 com NVDEC/NVENC). PAGO: só fica ativo com EDITOR_RENDER=modal,
MODAL_TOKEN_ID/MODAL_TOKEN_SECRET E autorização do dono (regra da casa). Sem isso, o roteador (render_roteador.py) cai na CPU.

Como funciona (o que viaja é só o necessário):
  1. aqui: para cada fonte, os intervalos que os planos usam viram TRECHOS cortados sem recodificar (`-c copy`, começando
     num quadro-chave, com 1 s de folga). O 4K nunca é decodificado nesta máquina.
  2. o pedido leva um EDL REDUZIDO (formato + planos pedidos + fontes reescritas para os trechos, com o offset corrigido)
     e os trechos: em bytes (padrão) ou como chaves no armazenamento compartilhado (R2), quando o motor usa R2.
  3. lá (`executar_remoto`, chamada pela função `render_gpu` de deploy/modal_app.py): roda o MESMO planos.renderizar da CPU
     e devolve os clipes 1080x1920; aqui eles entram no cache de planos com a mesma chave que a CPU usaria.
  Overlay (kit no Chromium) e composição continuam na CPU (RenderCPU).

A chamada remota usa `modal.Function.from_name("editor-motor", "render_gpu")` com import tardio: o pacote `modal`
(extra `modal` do pyproject) só é exigido quando a GPU é usada de fato.
"""
from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import time
import uuid

APP_MODAL = os.environ.get("EDITOR_MODAL_APP", "editor-motor").strip() or "editor-motor"
FUNCAO_GPU = "render_gpu"
FOLGA_S = 1.0           # folga antes/depois de cada trecho (estabilização mede alguns quadros a mais)
JUNTAR_S = 4.0          # intervalos da mesma fonte a menos de 4 s viram um trecho só


class ModalIndisponivel(RuntimeError):
    """A GPU não pode ser usada agora (sem pacote, sem token, função não publicada, pedido grande demais)."""


def _bytes_max() -> int:
    return int(float(os.environ.get("EDITOR_GPU_BYTES_MAX_MB", "1024")) * 1e6)


# ---------------------------------------------------------------- trechos
def intervalos_usados(edl: dict, planos: list[dict], fontes) -> dict[str, list[list[float]]]:
    """{fonte: [[a, b], ...]} em tempo do ARQUIVO (tempo_fonte - offset), já com folga e juntados."""
    from motor.etapas.montagem import planos as PL
    fmt = edl.get("formato", {})
    fps = float(fmt.get("fps", PL.FPS_PADRAO))
    brutos: dict[str, list[list[float]]] = {}
    for p in planos:
        nf = max(1, PL.quadro(p["t1"], fps) - PL.quadro(p["t0"], fps))
        ts = PL.tempos_fonte(p, nf, fps)
        off = fontes.offset(p["fonte"])
        a, b = float(min(ts)) - off, float(max(ts)) - off + 1.0 / fps
        brutos.setdefault(p["fonte"], []).append([max(0.0, a - FOLGA_S), b + FOLGA_S])
    out = {}
    for fid, ivs in brutos.items():
        ivs.sort()
        junt = [ivs[0][:]]
        for a, b in ivs[1:]:
            if a <= junt[-1][1] + JUNTAR_S:
                junt[-1][1] = max(junt[-1][1], b)
            else:
                junt.append([a, b])
        out[fid] = junt
    return out


def quadro_chave_antes(arq: pathlib.Path | str, t: float, start: float = 0.0) -> float:
    """Tempo (relativo ao início do arquivo) do último quadro-chave em ou antes de `t`. Sem achar, 0."""
    if t <= 0:
        return 0.0
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-read_intervals", f"{start + t:.4f}%+0.05",
                        "-show_entries", "packet=pts_time,flags", "-of", "csv=p=0", str(arq)], capture_output=True, text=True)
    melhor = 0.0
    for linha in r.stdout.splitlines():
        partes = linha.strip().split(",")
        if len(partes) < 2 or "K" not in partes[1]:
            continue
        try:
            pts = float(partes[0]) - start
        except ValueError:
            continue
        if pts <= t + 1e-6:
            melhor = max(melhor, pts)
    return max(0.0, melhor)


def cortar_trecho(arq: pathlib.Path | str, a: float, b: float, destino: pathlib.Path) -> float:
    """Corta [a, b] (tempo do arquivo) sem recodificar, começando no quadro-chave <= a. Devolve onde o trecho começa
    (K): tempo_no_trecho = tempo_no_arquivo - K. Sem -avoid_negative_ts, o trecho sai com start_time 0 (medido)."""
    from motor.etapas.montagem.comum import meta
    m = meta(arq)
    k = quadro_chave_antes(arq, a, m.start)
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_name(f".{destino.name}.{uuid.uuid4().hex[:6]}.tmp.mp4")
    r = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{k:.6f}", "-i", str(arq), "-t", f"{max(0.1, b - k):.4f}",
                        "-map", "0:v:0", "-c", "copy", "-movflags", "+faststart", str(tmp)], capture_output=True, text=True)
    if r.returncode != 0 or not tmp.exists() or tmp.stat().st_size == 0:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"não consegui cortar o trecho {a:.2f}-{b:.2f} s de {arq}: {r.stderr[-300:]}")
    os.replace(tmp, destino)
    return k


def preparar_pedido(edl: dict, fontes, planos: list[dict], rascunho: pathlib.Path, *, via: str = "bytes", arm=None) -> tuple[dict, list[str]]:
    """Monta o pedido da GPU. Devolve (pedido, chaves temporárias no armazenamento para apagar depois)."""
    pid_pedido = uuid.uuid4().hex[:12]
    ivs = intervalos_usados(edl, planos, fontes)
    novas_fontes, trechos, temporarias, total = {}, {}, [], 0
    mapa: dict[str, list[tuple[float, float, str]]] = {}
    for fid, lista in ivs.items():
        orig = fontes.video(fid)
        base = dict(edl.get("fontes", {}).get(fid, {}))
        for n, (a, b) in enumerate(lista):
            nome = f"{fid}__t{n}"
            arq = rascunho / f"{nome}.mp4"
            k = cortar_trecho(orig, a, b, arq)
            novas_fontes[nome] = {"chave": nome, "offset": float(base.get("offset", 0) or 0) + k}
            for campo in ("rotacao", "fps"):
                if base.get(campo) is not None:
                    novas_fontes[nome][campo] = base[campo]
            mapa.setdefault(fid, []).append((a, b, nome))
            total += arq.stat().st_size
            if via == "armazenamento":
                chave = f"tmp/gpu/{pid_pedido}/{nome}.mp4"
                arm.gravar(chave, arq)
                temporarias.append(chave)
                trechos[nome] = {"chave": chave}
            else:
                trechos[nome] = {"arquivo": str(arq)}
    if via == "bytes" and total > _bytes_max():
        raise ModalIndisponivel(f"trechos somam {total / 1e6:.0f} MB, acima de EDITOR_GPU_BYTES_MAX_MB; sem R2 o envio fica pesado demais")
    from motor.etapas.montagem import planos as PL
    fps = float(edl.get("formato", {}).get("fps", PL.FPS_PADRAO))
    reescritos = []
    for p in planos:
        nf = max(1, PL.quadro(p["t1"], fps) - PL.quadro(p["t0"], fps))
        a = max(0.0, float(min(PL.tempos_fonte(p, nf, fps))) - fontes.offset(p["fonte"]))
        nome = next(n for (x0, x1, n) in mapa[p["fonte"]] if x0 - 1e-6 <= a <= x1)   # o intervalo juntado que contém o plano
        reescritos.append(dict(p, fonte=nome))
    if via == "bytes":
        for nome, t in trechos.items():
            trechos[nome] = {"bytes": pathlib.Path(t["arquivo"]).read_bytes()}
    pedido = {"versao": 1, "id": pid_pedido, "via": via, "ids": [p["id"] for p in planos],
              "edl": {"formato": edl.get("formato", {}), "fontes": novas_fontes, "planos": reescritos},
              "trechos": trechos, "bytes_enviados": total}
    return pedido, temporarias


# ---------------------------------------------------------------- lado remoto (roda no contêiner GPU da Modal)
def executar_remoto(pedido: dict, *, arm=None, workers: int | None = None) -> dict:
    """Recebe o pedido, grava os trechos num rascunho, roda planos.renderizar e devolve os clipes. Sem estado: tudo
    fica em /tmp (EDITOR_RASCUNHO) e é apagado no fim."""
    from motor.etapas.montagem import planos as PL
    from motor.etapas.montagem.comum import Fontes
    t0 = time.time()
    if pedido.get("versao") != 1:
        raise ValueError(f"versão de pedido desconhecida: {pedido.get('versao')}")
    via = pedido.get("via", "bytes")
    if via == "armazenamento" and arm is None:
        from motor import config
        from motor.provedores import armazenamento_de
        arm = armazenamento_de(config.carregar())
        if arm is None:
            raise RuntimeError("pedido via armazenamento, mas o contêiner GPU não tem armazenamento configurado")
    raiz = pathlib.Path(tempfile.mkdtemp(prefix="gpu_", dir=os.environ.get("EDITOR_RASCUNHO") or None))
    try:
        edl = json.loads(json.dumps(pedido["edl"]))
        for nome, t in pedido["trechos"].items():
            if nome not in edl["fontes"] or "/" in nome or nome.startswith("."):
                raise ValueError(f"trecho inesperado: {nome!r}")
            destino = raiz / "trechos" / f"{nome}.mp4"
            destino.parent.mkdir(parents=True, exist_ok=True)
            if "bytes" in t:
                destino.write_bytes(t["bytes"])
            else:
                shutil.copyfile(arm.caminho_local(t["chave"]), destino)
            edl["fontes"][nome]["chave"] = str(destino)
        n = workers or max(1, int(os.environ.get("EDITOR_GPU_WORKERS", "0") or 0) or (os.cpu_count() or 2) // 2)
        res = PL.renderizar(edl, Fontes(edl, None, None), raiz / "saida", workers=n, nice=0, ids=set(pedido["ids"]))
        saida = {}
        for pid, r in res.items():
            arq = pathlib.Path(r["arquivo"])
            if via == "armazenamento":
                chave = f"tmp/gpu/{pedido['id']}/saida/{pid}.mp4"
                arm.gravar(chave, arq)
                saida[pid] = {"chave": chave, "info": r.get("info")}
            else:
                saida[pid] = {"bytes": arq.read_bytes(), "info": r.get("info")}
        return {"planos": saida, "s": round(time.time() - t0, 2), "workers": n, "nvenc": os.environ.get("EDITOR_NVENC") == "1"}
    finally:
        shutil.rmtree(raiz, ignore_errors=True)


# ---------------------------------------------------------------- provedor
class RenderModal:
    nome = "modal"
    implementado = True

    def __init__(self, cfg, *, via: str | None = None):
        self.cfg = cfg
        faltando = [n for n in ("MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET") if not os.environ.get(n, "").strip()]
        if faltando:
            raise ModalIndisponivel(f"Modal desligado: faltam {' e '.join(faltando)}")
        self.via = via or os.environ.get("EDITOR_GPU_VIA", "").strip() or None   # bytes | armazenamento (padrão: R2 -> armazenamento)
        self._funcao = None

    def _remota(self):
        if self._funcao is None:
            try:
                import modal
            except ModuleNotFoundError as e:
                raise ModalIndisponivel("Modal desligado: o pacote 'modal' não está instalado (pip install 'editor-motor[modal]')") from e
            try:
                self._funcao = modal.Function.from_name(APP_MODAL, FUNCAO_GPU)
            except Exception as e:  # noqa: BLE001 - app não publicado, token errado, rede
                raise ModalIndisponivel(f"função {APP_MODAL}/{FUNCAO_GPU} indisponível (rode `modal deploy`): {e}") from e
        return self._funcao

    def renderizar(self, edl: dict, fontes, cache: pathlib.Path, *, ids: set | None = None, janela=None, progresso=None,
                   **_ignorado) -> dict:
        """Mesmo contrato de planos.renderizar ({id: {'arquivo', 'cache', 'info'}}), com os planos que faltam no cache
        renderizados na GPU."""
        from motor.etapas.montagem import planos as PL
        cache = pathlib.Path(cache)
        cache.mkdir(parents=True, exist_ok=True)
        fmt = edl.get("formato", {"w": PL.W_PADRAO, "h": PL.H_PADRAO, "fps": PL.FPS_PADRAO})
        res, alvo = {}, []
        for p in edl["planos"]:
            if ids and p["id"] not in ids:
                continue
            if janela and (p["t1"] <= janela[0] or p["t0"] >= janela[1]):
                continue
            h = PL.chave_plano(p, fontes.assinatura(p["fonte"]), fmt)
            destino = cache / f"{h}.mp4"
            res[p["id"]] = {"arquivo": str(destino), "cache": destino.exists(), "info": None}
            if destino.exists():
                os.utime(destino)
                continue
            alvo.append((p, destino))
        if not alvo:
            return res
        funcao = self._remota()
        arm = getattr(fontes, "arm", None)
        via = self.via or ("armazenamento" if arm is not None and getattr(arm, "nome", "") == "r2" else "bytes")
        if via == "armazenamento" and arm is None:
            raise ModalIndisponivel("EDITOR_GPU_VIA=armazenamento sem armazenamento configurado")
        rascunho = pathlib.Path(tempfile.mkdtemp(prefix="gpu_pedido_", dir=cache.parent))
        temporarias: list[str] = []
        try:
            if progresso:
                progresso(0.02, f"Planos na GPU: cortando os trechos de {len(alvo)} plano(s)")
            pedido, temporarias = preparar_pedido(edl, fontes, [p for p, _ in alvo], rascunho, via=via, arm=arm)
            if progresso:
                progresso(0.1, f"Planos na GPU: enviando {pedido['bytes_enviados'] / 1e6:.0f} MB de trechos")
            resp = funcao.remote(pedido)
            for p, destino in alvo:
                item = (resp.get("planos") or {}).get(p["id"])
                if not item:
                    raise RuntimeError(f"a GPU não devolveu o plano {p['id']}")
                tmp = destino.with_name(f".{destino.name}.{uuid.uuid4().hex[:6]}.tmp")
                if "bytes" in item:
                    tmp.write_bytes(item["bytes"])
                else:
                    shutil.copyfile(arm.caminho_local(item["chave"]), tmp)
                    temporarias.append(item["chave"])
                os.replace(tmp, destino)
                info = dict(item.get("info") or {}, render="modal")
                res[p["id"]]["info"] = info
            if progresso:
                progresso(1.0, f"Planos na GPU: {len(alvo)} prontos em {resp.get('s', '?')} s")
            return res
        finally:
            shutil.rmtree(rascunho, ignore_errors=True)
            for chave in temporarias:
                try:
                    arm.apagar(chave)
                except Exception:  # noqa: BLE001 - lixo temporário: a regra de ciclo de vida do bucket limpa tmp/
                    pass

    # ---------- protocolo Render (provedores/base.py)
    def planos(self, edl: dict, saida_dir: pathlib.Path, *, ids: list[str] | None = None, fontes=None) -> list[pathlib.Path]:
        from motor.etapas.montagem.comum import Fontes
        res = self.renderizar(edl, fontes or Fontes(edl, None, self.cfg.dados), pathlib.Path(saida_dir), ids=set(ids) if ids else None)
        return [pathlib.Path(r["arquivo"]) for r in res.values()]

    def overlay(self, cena_ou_edl: dict, saida_dir: pathlib.Path):
        from motor.provedores.render_cpu import RenderCPU
        return RenderCPU(self.cfg).overlay(cena_ou_edl, saida_dir)

    def compor(self, edl: dict, planos_dir, overlay, audio, saida: pathlib.Path) -> pathlib.Path:
        from motor.provedores.render_cpu import RenderCPU
        return RenderCPU(self.cfg).compor(edl, planos_dir, overlay, audio, saida)
