#!/usr/bin/env python3
"""Monta o documento sede/estado do painel ao vivo a partir das leituras do Claude Code Remote.

  python3 -I sede/relay/montar.py --sessoes sessoes.txt --eventos <arquivo> [<arquivo> ...] --saida estado.json

sessoes.txt: resultado de list_sessions. Cada arquivo de eventos: resultado de list_events de uma sessão
(a sessão é reconhecida pelo session_id interno de cada evento e casada pelo título quando possível).
Guarda só o necessário: retrato mais recente de cada fluxo, cota e lista de sessões.
"""
import json, sys, time, argparse

def ler(caminho):
    t = open(caminho, encoding='utf-8').read()
    j = json.loads(t[t.index('{'):t.rindex('}') + 1])
    return j.get('ccr', j)

ap = argparse.ArgumentParser()
ap.add_argument('--sessoes', required=True)
ap.add_argument('--eventos', nargs='*', default=[])
ap.add_argument('--titulo', nargs='*', default=[], help='titulo da sessão de cada arquivo de eventos, na mesma ordem')
ap.add_argument('--saida', required=True)
ap.add_argument('--anterior', help='estado.json anterior: mantém os fluxos que não vieram nesta leitura')
a = ap.parse_args()

CAMPOS_S = ('id', 'title', 'session_status', 'status_bucket', 'updated_at', 'post_turn_summary', 'task_summary')
sess = [{k: s[k] for k in CAMPOS_S if k in s} for s in ler(a.sessoes).get('data', [])][:20]

CAMPOS_A = ('type', 'index', 'title', 'agentId', 'agentType', 'label', 'state', 'phaseIndex', 'phaseTitle',
            'startedAt', 'lastProgressAt', 'lastToolName', 'lastToolSummary', 'model', 'tokens', 'toolCalls', 'resultPreview')
fluxos, quota, quota_at = {}, None, ''
anterior = {}
if a.anterior:
    try:
        anterior = json.load(open(a.anterior, encoding='utf-8'))
    except Exception:
        anterior = {}
for i, arq in enumerate(a.eventos):
    titulo = a.titulo[i] if i < len(a.titulo) else ''
    for e in ler(arq).get('data', []):
        box = e.get('system') or e.get('rate_limit_event') or {}
        c = box.get('internal_anthropic_catchall', box) if isinstance(box, dict) else {}
        if not isinstance(c, dict):
            continue
        t = e.get('created_at', '')
        if c.get('rate_limit_info') and t >= quota_at:
            quota, quota_at = c['rate_limit_info'], t
        wp = c.get('workflow_progress')
        if not isinstance(wp, list):
            continue
        tid = c.get('task_id') or c.get('run_id')
        if tid in fluxos and fluxos[tid]['_t'] > t:
            continue
        ag = []
        for x in wp:
            y = {k: x[k] for k in CAMPOS_A if k in x and x[k] is not None}
            if 'resultPreview' in y:
                y['resultPreview'] = str(y['resultPreview'])[:220]
            if 'lastToolSummary' in y:
                y['lastToolSummary'] = str(y['lastToolSummary'])[:160]
            ag.append(y)
        fluxos[tid] = {'_t': t, 'task_id': tid, 'sessao': titulo, 'description': c.get('description', ''),
                       'usage': c.get('usage'), 'wp': ag}

def ms(iso):
    try:
        return int(time.mktime(time.strptime(iso[:19], '%Y-%m-%dT%H:%M:%S')) * 1000 - time.timezone * 1000)
    except Exception:
        return None

novos = [{**{k: v for k, v in f.items() if k != '_t'}, 't': ms(f['_t'])} for f in fluxos.values()]
vistos = {f['task_id'] for f in novos}
agora_ms = int(time.time() * 1000)
velhos = [f for f in anterior.get('fluxos', []) if f.get('task_id') not in vistos and agora_ms - (f.get('t') or 0) < 6 * 3600 * 1000]
doc = {'atualizado': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'sessions': sess,
       'fluxos': novos + velhos}
if quota:
    doc['quota'], doc['quotaAt'] = quota, ms(quota_at)
elif anterior.get('quota'):
    doc['quota'], doc['quotaAt'] = anterior['quota'], anterior.get('quotaAt')
json.dump(doc, open(a.saida, 'w', encoding='utf-8'), ensure_ascii=False)
print(f"{len(sess)} sessões, {len(doc['fluxos'])} fluxo(s), {sum(len(f['wp']) for f in doc['fluxos'])} agentes, {len(json.dumps(doc))//1024} KB")
