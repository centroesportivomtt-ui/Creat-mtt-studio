import { NextResponse } from 'next/server';
import {
  COOKIE, configuracaoPronta, conferirSenha, cookieSeguro, criarToken,
  limparTentativas, mesmaOrigem, podeTentar, registrarTentativa,
} from '@/lib/sessao';
import { emailPermitido, entrarComSenha, normalizarEmail } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// IP para o limite de tentativas. O PRIMEIRO valor do X-Forwarded-For é do cliente (ele escolhe o que quiser):
// girando o cabeçalho, o limite virava infinito. Vale o que o proxy de produção põe: x-real-ip, ou o ÚLTIMO salto
// do X-Forwarded-For (quem acrescentou foi o nosso proxy). Além disso há um limite global (todas as origens) e,
// no modo supabase, um por e-mail (quem gira IP para tentar a senha de uma conta também para).
function ipDe(req: Request) {
  const real = (req.headers.get('x-real-ip') ?? '').trim();
  if (real) return real;
  const saltos = (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return saltos.at(-1) || 'local';
}
const GLOBAL = '*todas*';
// Mesma resposta para senha errada, conta inexistente e conta fora da lista: não diz se o e-mail existe nem se está liberado.
const RECUSA_SUPABASE = 'E-mail ou senha incorretos.';

function erro(mensagem: string, status: number) {
  return NextResponse.json({ erro: mensagem }, { status });
}
const frear = () => new Promise((r) => setTimeout(r, 400)); // freia força bruta sem travar o servidor

export async function POST(req: Request) {
  if (!mesmaOrigem(req)) return erro('origem não permitida', 403);
  const conf = configuracaoPronta();
  if (!conf.ok) return erro(`O site ainda não foi configurado: falta ${conf.falta.join(' e ')}.`, 503);
  const ip = ipDe(req);
  if (!podeTentar(ip) || !podeTentar(GLOBAL, 40)) return erro('Muitas tentativas. Espere 10 minutos e tente de novo.', 429);
  const corpo = (await req.json().catch(() => null)) as { senha?: unknown; email?: unknown } | null;
  const senha = typeof corpo?.senha === 'string' ? corpo.senha : '';

  let email: string | undefined;
  if (conf.modo === 'supabase') {
    const e = normalizarEmail(corpo?.email);
    if (!e) return erro('Digite um e-mail válido.', 400);
    if (!senha || senha.length > 256) return erro('Digite a senha.', 400);
    const chave = `email:${e}`;
    if (!podeTentar(chave)) return erro('Muitas tentativas. Espere 10 minutos e tente de novo.', 429);
    const falhou = async () => {
      registrarTentativa(ip); registrarTentativa(GLOBAL); registrarTentativa(chave);
      await frear();
      return erro(RECUSA_SUPABASE, 401);
    };
    // Fora da lista: recusa sem nem perguntar ao Supabase (conta válida não basta).
    if (!emailPermitido(e)) return falhou();
    const r = await entrarComSenha(e, senha);
    if (!r.ok) {
      if (r.motivo === 'credenciais') return falhou();
      if (r.motivo === 'limite') return erro('O serviço de login pediu uma pausa. Espere alguns minutos e tente de novo.', 429);
      if (r.motivo === 'token') { registrarTentativa(ip); registrarTentativa(GLOBAL); return erro('Não deu para confirmar o login agora. Tente de novo em instantes.', 502); }
      return erro('O serviço de login não respondeu. Tente de novo em instantes.', 502);
    }
    // O token tem de ser da MESMA conta pedida e ela tem de estar na lista (de novo, agora pelo que o Supabase assinou).
    if (r.email !== e || !emailPermitido(r.email)) return falhou();
    limparTentativas(chave);
    email = r.email;
  } else if (!(await conferirSenha(senha))) {
    registrarTentativa(ip);
    registrarTentativa(GLOBAL);
    await frear();
    return erro('Senha incorreta.', 401);
  }
  limparTentativas(ip);
  const t = criarToken(Date.now(), email);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, t.valor, {
    httpOnly: true, sameSite: 'lax', secure: await cookieSeguro(), path: '/', maxAge: t.maxAge,
  });
  return res;
}
