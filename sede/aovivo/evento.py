#!/usr/bin/env python3
"""Converte o JSON que um gancho do Claude Code recebe no stdin em uma linha da tabela `eventos`.

Uso (pelo hook.sh): python3 -I evento.py < payload  →  imprime o JSON da linha, ou nada se não for para enviar.
Não envia nada sozinho e nunca falha alto: qualquer erro vira saída vazia.
Higiene: lista branca. Do Bash vai só a descrição que o agente deu (ou programa + subcomando, nunca o
comando bruto); de arquivos, só o nome. Todo texto passa por máscara de segredos (tokens, chaves, senhas,
URLs com credencial) e de dados pessoais (e-mail, CPF, CNPJ, telefone).
"""
import json, os, re, sys
from urllib.parse import urlsplit
from datetime import datetime, timezone

MAX = 140
SEGREDO = re.compile(
    r'(?i)(sb_(?:secret|publishable)_\w+|gh[pousr]_\w+|github_pat_\w+|sk-[\w-]{10,}|\b(?:sk|pk|rk)_(?:live|test)_\w+|'
    r'xox[abprs]-[\w-]+|AKIA\w{12,}|npm_\w{20,}|glpat-[\w-]+|AIza[\w-]{20,}|'
    r'eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]+|'
    r'\w+://[^\s/@:]+:[^\s/@]+@|'                                   # usuario:senha@host em URLs
    r'(?:-u|--user)\s+\S+:\S+|'
    r'(?:authorization|cookie|set-cookie)\s*[:=]\s*(?:bearer\s+|basic\s+|token\s+)?\S+|bearer\s+\S+|'
    r'\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|URL|DSN)=\S+|'
    r'(?:token|apikey|api[_-]?key|password|passwd|senha|secret)\s*[:=]?\s*\S+|'
    r'\b(?=[A-Za-z0-9_\-]*\d)(?=[A-Za-z0-9_\-]*[A-Za-z])[A-Za-z0-9_\-]{32,}\b)'  # tokens longos de alta entropia
)
PESSOAL = [
    (re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+'), '[e-mail]'),
    (re.compile(r'\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b'), '[cpf]'),
    (re.compile(r'\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b'), '[cnpj]'),
    (re.compile(r'(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b'), '[telefone]'),
]


def limpa(t, n=MAX):
    t = SEGREDO.sub('•••', str(t or ''))
    for rx, troca in PESSOAL:
        t = rx.sub(troca, t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t[: n - 1] + '…' if len(t) > n else t


def nome_arquivo(p):
    return os.path.basename(str(p or '').rstrip('/')) or ''


def resumo(ferramenta, ent):
    if not isinstance(ent, dict):
        return ''
    if ferramenta == 'Bash':
        if ent.get('description'):
            return limpa(ent['description'])
        cmd = re.sub(r'^\s*cd\s+\S+\s*(&&|;)\s*', '', str(ent.get('command', '')))
        pal = cmd.split()
        if not pal:
            return 'comando'
        prog = os.path.basename(pal[0])
        sub = pal[1] if len(pal) > 1 and re.fullmatch(r'[a-z][a-z0-9-]{1,20}', pal[1]) else ''
        return limpa((prog + ' ' + sub).strip(), 60) if re.fullmatch(r'[\w.+-]{1,40}', prog) else 'comando'
    if ferramenta in ('Read', 'Edit', 'Write', 'NotebookEdit'):
        return limpa(nome_arquivo(ent.get('file_path') or ent.get('notebook_path')), 80)
    if ferramenta in ('Grep', 'Glob'):
        return limpa(ent.get('pattern'), 80)
    if ferramenta == 'WebSearch':
        return limpa(ent.get('query'), 100)
    if ferramenta == 'WebFetch':
        try:
            host = urlsplit(str(ent.get('url', ''))).hostname or ''   # hostname descarta usuario:senha@
        except ValueError:
            host = ''
        return limpa(host, 80)
    if ferramenta in ('Agent', 'Task'):
        return limpa(ent.get('description') or ent.get('subagent_type'), 100)
    if ferramenta == 'Skill':
        return limpa(ent.get('skill'), 60)
    if ferramenta == 'Workflow':
        return limpa(ent.get('name') or 'workflow', 60)
    return ''


def montar(p):
    """Recebe o payload de um gancho (dict) e devolve a linha da tabela `eventos`, ou None."""
    if not isinstance(p, dict):
        return None
    ev = p.get('hook_event_name') or ''
    if ev not in ('SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'SubagentStart', 'SubagentStop', 'Stop'):
        return None
    ferr = p.get('tool_name') or ''
    linha = {
        'ts': p.get('_ts') or datetime.now(timezone.utc).isoformat(timespec='milliseconds'),   # hora do evento, não da chegada
        'sessao': str(p.get('session_id') or '')[:80],
        'sessao_nome': limpa(p.get('session_title'), 90) or None,
        'pasta': limpa(nome_arquivo(p.get('cwd')), 60) or None,
        'agente': str(p.get('agent_id') or '')[:80] or None,
        'tipo': limpa(p.get('agent_type'), 60) or None,
        'evento': ev,
        'ferramenta': ferr[:80] or None,
        'resumo': resumo(ferr, p.get('tool_input')) if ev == 'PreToolUse' else None,
    }
    if ev == 'UserPromptSubmit':
        linha['resumo'] = 'nova mensagem do dono'   # o texto do pedido nunca sai da sessão
    return linha if linha['sessao'] else None


def main():
    try:
        p = json.load(sys.stdin)
    except Exception:
        return
    linha = montar(p)
    if linha:
        sys.stdout.write(json.dumps(linha))


if __name__ == '__main__':
    main()
