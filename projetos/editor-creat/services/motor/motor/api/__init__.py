"""API HTTP do motor (FastAPI). Rotas em módulos separados para as frentes não colidirem:
projetos.py (A: projetos, arquivos, importação, eventos SSE, servir arquivos locais),
direcao.py (B: pedido, reprovação do dono), versoes.py (C: versões, link, publicação).
Contrato completo: ARQUITETURA.md §4.6."""
