#!/usr/bin/env python3
"""Converte o JSON que um gancho do Claude Code recebe no stdin em uma linha da tabela `eventos`.

Uso (pelo hook.sh): python3 -I evento.py < payload  →  imprime o JSON da linha, ou nada se não for para enviar.
Não envia nada sozinho e nunca falha alto: qualquer erro vira saída vazia.
Higiene: só guarda nomes de ferramenta, o nome do arquivo e um resumo curto do comando, com
tokens, senhas e chaves apagados.
"""
import json, os, re, sys

MAX = 140
SEGREDO = re.compile(
    r'(?i)(sb_secret_\w+|sb_publishable_\w+|gh[pousr]_\w+|sk-[\w-]{10,}|xox[abprs]-[\w-]+|AKIA\w{12,}|'
    r'eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]+|'
    r'authorization\s*[:=]\s*(?:bearer\s+|basic\s+|token\s+)?\S+|bearer\s+\S+|'
    r'(?:token|apikey|api[_-]?key|password|passwd|senha|secret)\s*[:=]?\s*\S+)'
)


def limpa(t, n=MAX):
    t = SEGREDO.sub('•••', str(t or ''))
    t = re.sub(r'\s+', ' ', t).strip()
    return t[: n - 1] + '…' if len(t) > n else t


def nome_arquivo(p):
    return os.path.basename(str(p or '').rstrip('/')) or ''


def resumo(ferramenta, ent):
    if not isinstance(ent, dict):
        return ''
    if ferramenta == 'Bash':
        cmd = re.sub(r'^\s*cd\s+\S+\s*(&&|;)\s*', '', str(ent.get('command', '')))
        return limpa(ent.get('description') or cmd)
    if ferramenta in ('Read', 'Edit', 'Write', 'NotebookEdit'):
        return nome_arquivo(ent.get('file_path') or ent.get('notebook_path'))
    if ferramenta in ('Grep', 'Glob'):
        return limpa(ent.get('pattern'), 80)
    if ferramenta == 'WebSearch':
        return limpa(ent.get('query'), 100)
    if ferramenta == 'WebFetch':
        return re.sub(r'^https?://', '', str(ent.get('url', ''))).split('/')[0]
    if ferramenta in ('Agent', 'Task'):
        return limpa(ent.get('description') or ent.get('subagent_type'), 100)
    if ferramenta == 'Skill':
        return limpa(ent.get('skill'), 60)
    if ferramenta == 'Workflow':
        return limpa(ent.get('name') or 'workflow', 60)
    return ''


def main():
    try:
        p = json.load(sys.stdin)
    except Exception:
        return
    ev = p.get('hook_event_name') or ''
    if ev not in ('SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'SubagentStart', 'SubagentStop', 'Stop'):
        return
    ferr = p.get('tool_name') or ''
    linha = {
        'sessao': str(p.get('session_id') or '')[:80],
        'sessao_nome': limpa(p.get('session_title'), 90) or None,
        'pasta': nome_arquivo(p.get('cwd'))[:60] or None,
        'agente': str(p.get('agent_id') or '')[:80] or None,
        'tipo': limpa(p.get('agent_type'), 60) or None,
        'evento': ev,
        'ferramenta': ferr[:80] or None,
        'resumo': resumo(ferr, p.get('tool_input')) if ev == 'PreToolUse' else None,
    }
    if ev == 'UserPromptSubmit':
        linha['resumo'] = 'nova mensagem do dono'   # o texto do pedido nunca sai da sessão
    if not linha['sessao']:
        return
    sys.stdout.write(json.dumps(linha, ensure_ascii=False))


if __name__ == '__main__':
    main()
