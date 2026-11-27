// Página PÚBLICA do link de aprovação: o cliente vê só o vídeo daquela versão e responde. Sem login, sem menu do editor.
import { headers } from 'next/headers';
import { motorJson } from '@/lib/motor';
import { ipDe, podeTentar, registrarTentativa } from '@/lib/sessao';
import { RE_TOKEN_CLIENTE } from '@/lib/cliente';
import AprovacaoCliente, { type Publico } from '@/componentes/AprovacaoCliente';
import Iso from '@/componentes/Iso';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Aprovação do vídeo', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

function Fechado({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main className="cliente">
      <div className="cliente__caixa">
        <Marca />
        <h1 className="cliente__titulo">{titulo}</h1>
        <p className="aviso" data-teste="cliente-fechado">{texto}</p>
        <Assina />
      </div>
    </main>
  );
}
function Marca() {
  return (
    <div className="cliente__marca">
      <img className="topo__logo logo-claro" src="/marca/logo_creatMTT_claro.png" alt="creat.MTT" width={128} height={22} />
      <img className="topo__logo logo-escuro" src="/marca/logo_creatMTT_escuro.png" alt="creat.MTT" width={128} height={22} />
    </div>
  );
}
function Assina() {
  // onda 5: a assinatura de quem entrega, discreta no rodapé: a etiqueta Aba 71 e "feito pela creat.MTT"
  return <footer className="cliente__assina" data-teste="cliente-assina"><span className="etiqueta-aba" aria-hidden="true">Aba 71</span><Iso tamanho={20} gato />feito pela creat.MTT</footer>;
}

export default async function PaginaCliente({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const ip = `cliente:${ipDe({ headers: h })}`;
  if (!podeTentar(ip, 20)) return <Fechado titulo="Calma aí" texto="Muitas tentativas seguidas. Espere 10 minutos e abra o link de novo." />;
  if (!RE_TOKEN_CLIENTE.test(token)) {
    registrarTentativa(ip);
    return <Fechado titulo="Link não encontrado" texto="Confira se o link chegou inteiro ou peça um novo a quem te mandou." />;
  }
  const r = await motorJson<Publico>(`/v1/cliente/${token}`);
  if (!r.ok) {
    if (r.status === 404) registrarTentativa(ip);
    if (r.status === 410) return <Fechado titulo="Link fechado" texto={`${r.erro.charAt(0).toUpperCase()}${r.erro.slice(1)}.`} />;
    if (r.status === 404) return <Fechado titulo="Link não encontrado" texto="Confira se o link chegou inteiro ou peça um novo a quem te mandou." />;
    return <Fechado titulo="Fora do ar agora" texto="Tente de novo em alguns minutos." />;
  }
  return (
    <main className="cliente">
      <div className="cliente__caixa">
        <Marca />
        <AprovacaoCliente token={token} inicial={r.dados} />
        <Assina />
      </div>
    </main>
  );
}
