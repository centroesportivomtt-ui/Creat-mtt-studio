#!/usr/bin/env python3
"""Ponte da Sede ao vivo para sessões que começaram ANTES dos ganchos.

Lê os registros locais do Claude Code (~/.claude/projects/**.jsonl) à medida que crescem e envia os
mesmos eventos que os ganchos enviariam. Não usa IA, não gasta cota. Sessões novas não precisam disto.

  nohup python3 -I sede/aovivo/ponte.py --titulo "Nome da sessão" >/dev/null 2>&1 &

Usa CREAT_AOVIVO_URL e CREAT_AOVIVO_PUB (e CREAT_AOVIVO_TOKEN fora da nuvem), como o hook.sh.
Para sozinha depois de --horas (padrão 12) ou se já houver ganchos instalados nesta máquina.
"""
import argparse, glob, json, os, subprocess, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import evento  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--titulo', default='')
ap.add_argument('--raiz', default=os.path.expanduser('~/.claude/projects'))
ap.add_argument('--horas', type=float, default=12)
ap.add_argument('--intervalo', type=float, default=1.0)
a = ap.parse_args()

URL, PUB, TOK = os.environ.get('CREAT_AOVIVO_URL', ''), os.environ.get('CREAT_AOVIVO_PUB', ''), os.environ.get('CREAT_AOVIVO_TOKEN', '')
if not URL or not PUB:
    sys.exit('faltam CREAT_AOVIVO_URL e CREAT_AOVIVO_PUB')
if os.path.exists(os.path.expanduser('~/.claude/sede-aovivo/hook.sh')):
    sys.exit('esta máquina já tem os ganchos; a ponte duplicaria os eventos')

pos, metas, fim_avisado, fila = {}, {}, set(), []


def enviar():
    global fila
    if not fila:
        return
    lote, fila = fila[:200], fila[200:]
    cfg = 'header = "apikey: %s"\n' % PUB + ('header = "x-sede-token: %s"\n' % TOK if TOK else '')
    try:
        subprocess.run(['curl', '-sS', '-m', '8', '-o', '/dev/null', '-X', 'POST', URL.rstrip('/') + '/rest/v1/eventos',
                        '-H', 'Content-Type: application/json', '-H', 'Prefer: return=minimal', '--config', '-',
                        '--data-binary', json.dumps(lote)], input=cfg.encode(), timeout=12, check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


def emitir(p):
    linha = evento.montar(p)
    if linha:
        fila.append(linha)


def meta_de(arq):
    m = arq[:-6] + '.meta.json'
    try:
        return json.load(open(m, encoding='utf-8'))
    except Exception:
        return {}


def arquivos():
    for f in glob.glob(os.path.join(a.raiz, '*', '*.jsonl')):
        yield f, None
    for f in glob.glob(os.path.join(a.raiz, '*', '*', 'subagents', '**', 'agent-*.jsonl'), recursive=True):
        yield f, os.path.basename(f)[6:-6]


def sessao_de(arq, agente):
    if not agente:
        return os.path.basename(arq)[:-6]
    return arq.split(os.sep + 'subagents' + os.sep)[0].split(os.sep)[-1]


def ler(arq, agente, novo):
    sid = sessao_de(arq, agente)
    base = {'session_id': sid, 'session_title': a.titulo, 'agent_id': agente}
    if agente:
        base['agent_type'] = metas.setdefault(arq, meta_de(arq)).get('agentType')
        if novo:
            emitir({**base, 'hook_event_name': 'SubagentStart'})
    try:
        with open(arq, 'rb') as fh:
            fh.seek(pos[arq])
            dados = fh.read()
    except OSError:
        dados = b''
    corte = dados.rfind(b'\n')
    pos[arq] += corte + 1
    for bruto in (dados[:corte].split(b'\n') if corte >= 0 else []):
        try:
            j = json.loads(bruto)
        except Exception:
            continue
        if not isinstance(j, dict):
            continue
        comum = {**base, 'cwd': j.get('cwd'), '_ts': j.get('timestamp')}
        msg = j.get('message') if isinstance(j.get('message'), dict) else {}
        cont = msg.get('content')
        if j.get('type') == 'user' and not agente and not j.get('isMeta'):
            texto = isinstance(cont, str) or (isinstance(cont, list) and any(isinstance(c, dict) and c.get('type') == 'text' for c in cont)
                                              and not any(isinstance(c, dict) and c.get('type') == 'tool_result' for c in cont))
            if texto:
                emitir({**comum, 'hook_event_name': 'UserPromptSubmit'})
        elif j.get('type') == 'assistant' and isinstance(cont, list):
            for c in cont:
                if isinstance(c, dict) and c.get('type') == 'tool_use':
                    emitir({**comum, 'hook_event_name': 'PreToolUse', 'tool_name': c.get('name'), 'tool_input': c.get('input')})
            if not agente and msg.get('stop_reason') == 'end_turn':
                emitir({**comum, 'hook_event_name': 'Stop'})
    if agente and arq not in fim_avisado and meta_de(arq).get('finished'):
        fim_avisado.add(arq)
        emitir({**base, 'hook_event_name': 'SubagentStop'})


inicio = time.time()
for arq, ag in arquivos():           # começa do fim: só o que acontecer daqui para frente
    pos[arq] = os.path.getsize(arq)
    if ag and meta_de(arq).get('finished'):
        fim_avisado.add(arq)
for arq, ag in arquivos():
    if not ag and time.time() - os.path.getmtime(arq) < 3600:
        emitir({'hook_event_name': 'SessionStart', 'session_id': sessao_de(arq, ag), 'session_title': a.titulo})
enviar()
while time.time() - inicio < a.horas * 3600:
    for arq, ag in arquivos():
        novo = arq not in pos
        if novo:
            pos[arq] = 0
        try:
            if novo or os.path.getsize(arq) > pos[arq] or (ag and arq not in fim_avisado):
                ler(arq, ag, novo)
        except OSError:
            continue
    enviar()
    time.sleep(a.intervalo)
