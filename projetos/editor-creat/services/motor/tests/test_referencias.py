"""Estudos de caso por link: o vídeo é medido (cortes, ritmo, gancho) e vira lição para o diretor. Sem rede: vídeo sintético."""
import json
import subprocess

import pytest

from motor import referencias as R


def _video(p):
    # 3 planos de cores diferentes (2 cortes), 6 s
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=red:s=360x640:d=2", "-f", "lavfi", "-i", "color=blue:s=360x640:d=2",
                    "-f", "lavfi", "-i", "color=green:s=360x640:d=2", "-filter_complex", "[0][1][2]concat=n=3:v=1:a=0", str(p)], check=True)


def test_mede_cortes_e_grava_licao(tmp_path, monkeypatch):
    monkeypatch.setenv("EDITOR_MEMORIA", str(tmp_path / "mem"))
    monkeypatch.setenv("EDITOR_DADOS", str(tmp_path / "dados"))
    v = tmp_path / "src.mp4"
    _video(v)

    def falso_baixar(url, destino):
        destino.mkdir(parents=True, exist_ok=True)
        alvo = destino / "video.mp4"
        alvo.write_bytes(v.read_bytes())
        return {"arquivo": alvo, "titulo": "teste", "autor": "creat", "duracao": 6}

    monkeypatch.setattr(R, "baixar", falso_baixar)
    monkeypatch.setattr(R, "transcrever", lambda *a, **k: "")
    r = R.analisar("https://www.instagram.com/reel/ABC123/", nota="ritmo rápido")
    assert r["planos"] == 3 and abs(r["plano_medio_s"] - 2.0) < 0.2 and abs(r["primeiro_corte_s"] - 2.0) < 0.2
    salvo = json.loads((tmp_path / "mem" / "referencias" / f"{r['id']}.json").read_text())
    assert salvo["licao"].startswith("6 s, 3 planos") and "ritmo rápido" in salvo["licao"]
    assert "referência" in R.para_prompt()


def test_recusa_link_de_site_qualquer():
    with pytest.raises(ValueError):
        R.analisar("https://exemplo.com/video.mp4")
