"""sons_reais (M6): o que entrou do banco de sons reais e o que ficou sem som, e a prova de que não entrou voz escondida.

- Sempre lista: o que entrou (id, desc, nome, biblioteca, pacote, t0-t1, cache ou baixado, verificação) e os pedidos que
  ficaram sem som, com o motivo. FALTA DE SOM NÃO REPROVA (ok, com o detalhe): o filme sai sem aquele som.
- Ouve o stem `reais` (só no disco de trabalho: nunca vai para o armazenamento) com o nível normalizado e confiança mínima
  de 0,6 (o stem subido a -20 LUFS é o terreno da alucinação do Whisper). Deu 3 palavras ou mais: re-ouve CADA som que
  entrou, direto do cache, e só o culpado reprova e vai para a lista negra `com_voz.json` (a correção automática da direção
  escolhe outro). Nenhum som sozinho com voz = alucinação do stem: aprova, com o detalhe. Som que não deu para re-ouvir
  (sumiu do cache) conta como culpado: na dúvida, reprova.
- Sem o stem (disco de trabalho limpo): re-ouve cada som do cache do mesmo jeito.
- Sem transcritor LOCAL: NÃO VERIFICADO (reprova e bloqueia). Som do banco nunca vai para transcrição paga (a gravação não
  sai para terceiros; a licença proíbe treinar IA).
"""
ID, BLOQUEIA = "sons_reais", True


def _linha(x: dict) -> str:
    return (f"{x['id']} {x.get('desc')} = #{x.get('id_banco')} «{str(x.get('nome') or '')[:50]}» ({x.get('biblioteca', '')[:40]}, "
            f"{x.get('pacote', '')}) {float(x.get('t0', 0)):.1f}-{float(x.get('t1', 0)):.1f} s, {x.get('origem', '?')}, {x.get('verificacao') or '?'}")


def _um_a_um(c, entrou: list[dict], tr) -> tuple[list[tuple[int, dict]], list[int]]:
    """Re-ouve cada som que entrou, do cache (o mesmo arquivo que foi mixado). -> ([(id, voz)] com voz, [ids sem como ouvir])."""
    from motor import sons_reais as SONS
    cache = SONS.pasta_cache(c.cfg)
    por_id = {it.get("id"): it for it in c.edl.get("sons_reais") or []}
    culpados, sem = [], []
    for x in entrou:
        it = por_id.get(x.get("id"))
        cand = next((k for k in SONS._candidatos(it) if k.get("id_banco") == x.get("id_banco")), None) if it else None
        try:
            hit = SONS.ler_cache(cache, cand) if cand else None
        except (KeyError, TypeError, ValueError, OSError):
            hit = None
        if hit is None:
            sem.append(int(x["id_banco"]))
            continue
        voz = SONS.ouvir_voz(hit[0], tr, c.evid)
        if not voz.get("verificado"):
            sem.append(int(x["id_banco"]))
        elif int(voz.get("palavras") or 0) >= SONS.PALAVRAS_VOZ:
            culpados.append((int(x["id_banco"]), voz))
    return culpados, sem


def _reprova(c, ids: list[int], valor: dict, partes: list[str], como: str) -> dict:
    from motor import sons_reais as SONS
    try:
        SONS.marcar_com_voz(SONS.pasta_cache(c.cfg), ids)
    except OSError:
        pass
    arq = c.stems.get("reais")
    return {"ok": False, "valor": {**valor, "com_voz": ids}, "evidencia": ["stems/reais.flac"] if arq else [],
            "detalhe": f"voz escondida nos sons reais: {como}; {', '.join('#' + str(i) for i in ids)} foram para a lista negra "
                       f"(a próxima direção escolhe outros) | " + " | ".join(partes)}


def checar(c):
    itens_edl = c.edl.get("sons_reais") or []
    sem_dir = ((c.edl.get("origem") or {}).get("sons_reais") or {}).get("sem_som") or []
    if not itens_edl and not sem_dir:
        return {"ok": True, "detalhe": "sem sons reais"}
    sr = (getattr(c, "montagem", None) or {}).get("sons_reais") or {}
    entrou = list(sr.get("itens") or [])
    faltaram = list(sr.get("faltaram") or []) + [{"id": "-", "desc": x.get("desc"), "motivo": x.get("motivo")} for x in sem_dir]
    valor = {"entraram": [{k: x.get(k) for k in ("id", "desc", "id_banco", "nome", "biblioteca", "pacote", "item", "t0", "t1", "origem", "verificacao")}
                          for x in entrou],
             "sem_som": [{"desc": f.get("desc"), "motivo": str(f.get("motivo") or "")[:200]} for f in faltaram]}
    partes = []
    if entrou:
        partes.append(f"{len(entrou)} som(ns) real(is): " + "; ".join(_linha(x) for x in entrou[:8]))
    if faltaram:
        partes.append(f"{len(faltaram)} pedido(s) sem som: " + "; ".join(f"{f.get('desc')} ({str(f.get('motivo') or '')[:80]})" for f in faltaram[:8]))
    if not entrou:
        return {"ok": True, "valor": valor, "detalhe": " | ".join(partes) or "nenhum som real entrou"}
    from motor import sons_reais as SONS
    tr = SONS.transcritor_local(c.cfg)
    arq = c.stems.get("reais")
    if tr is None:
        falta = c.nao_verificado(None, "stem reais")
        falta["valor"] = valor
        falta["detalhe"] += " | " + " | ".join(partes)
        return falta
    if not arq or not arq.exists():                        # disco de trabalho limpo: confere som a som, do cache
        culpados, sem = _um_a_um(c, entrou, tr)
        if culpados or sem:
            como = (f"{len(culpados)} som(ns) com voz" if culpados else "") + \
                   (f"{' e ' if culpados else ''}{len(sem)} sem como re-ouvir (fora do cache)" if sem else "")
            return _reprova(c, [i for i, _ in culpados] + sem, valor, partes, como)
        return {"ok": True, "valor": valor, "detalhe": "stem reais fora do disco: cada som conferido do cache, sem voz | " + " | ".join(partes)}
    voz = SONS.ouvir_voz(arq, tr, c.evid, conf_min=SONS.CONF_QA)
    if not voz.get("verificado"):
        falta = c.nao_verificado({"erro": voz.get("motivo") or "transcrição falhou"}, "stem reais")
        falta["valor"] = valor
        falta["detalhe"] += " | " + " | ".join(partes)
        return falta
    valor["palavras"] = voz["palavras"]
    if voz["palavras"] < SONS.PALAVRAS_VOZ:
        return {"ok": True, "valor": valor, "detalhe": f"stem reais transcrito: {voz['palavras']} palavra(s), sem voz | " + " | ".join(partes)}
    culpados, sem = _um_a_um(c, entrou, tr)                # quem tem a voz? só o culpado vai para a lista negra
    if culpados or sem:
        como = f"{voz['palavras']} palavra(s) no stem «{voz.get('texto', '')[:100]}»" + \
               (f"; com voz sozinho(s): {', '.join('#' + str(i) for i, _ in culpados)}" if culpados else "") + \
               (f"; sem como re-ouvir: {', '.join('#' + str(i) for i in sem)}" if sem else "")
        return _reprova(c, [i for i, _ in culpados] + sem, valor, partes, como)
    return {"ok": True, "valor": valor,
            "detalhe": f"stem reais deu {voz['palavras']} palavra(s) «{voz.get('texto', '')[:60]}», mas nenhum som sozinho tem voz "
                       f"(alucinação da transcrição no stem normalizado) | " + " | ".join(partes)}
