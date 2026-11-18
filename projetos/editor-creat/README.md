# Editor creat.MTT

Editor de vídeo próprio da creat.MTT: sobe o material pelo site ou pelo celular, o motor lê tudo sozinho, o Claude só decide (direção em JSON), a montagem e a conferência são código da casa, e o vídeo sai com link e versões. Meta: ≤ 30 min por vídeo e uma fração dos tokens de hoje.

- Arquitetura, contratos, metas e o plano da Fase 1: [`ARQUITETURA.md`](ARQUITETURA.md)
- Estado da construção (atualizado a cada passo; a máquina reinicia sem aviso): [`PROGRESSO.md`](PROGRESSO.md)
- Motor: [`services/motor`](services/motor/README.md) · Site: [`apps/web`](apps/web/README.md) · Contratos: [`packages/schemas`](packages/schemas/README.md) · Motion kit: [`packages/kit`](packages/kit/README.md) · Memória: [`memoria`](memoria/README.md)

Testes do que já existe:
```bash
python3 packages/schemas/py/validar.py
cd services/motor && nice -n 5 python3 -m pytest -q -m "not pago"
```
