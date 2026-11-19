import { redirect } from 'next/navigation';
import { configuracaoPronta, temSessao } from '@/lib/sessao';
import FormEntrar from '@/componentes/FormEntrar';
import Iso from '@/componentes/Iso';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Entrar' };

export default async function Entrar() {
  if (await temSessao()) redirect('/projetos');
  const conf = configuracaoPronta();
  return (
    <main className="entrar">
      <div className="entrar__caixa">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img className="topo__logo logo-claro" src="/marca/logo_creatMTT_claro.png" alt="creat.MTT" width={128} height={22} />
          <img className="topo__logo logo-escuro" src="/marca/logo_creatMTT_escuro.png" alt="creat.MTT" width={128} height={22} />
          <span className="topo__pulo" aria-hidden="true">pulo</span>
        </div>
        <div>
          <p className="entrar__tc" aria-hidden="true">00:00:00:00 / 30:00</p>
          <div className="entrar__iso"><Iso tamanho={92} titulo="creat.PULO" /></div>
          <h1 className="entrar__titulo">Pula o <em>óbvio.</em></h1>
          <p className="aviso" style={{ marginTop: 12 }}>O editor da creat.MTT. Você sobe o material e fala o pedido. Ele devolve o filme com pulo do gato em até 30 minutos.</p>
        </div>
        {conf.ok ? (
          <FormEntrar />
        ) : (
          <p className="erro" role="alert">O site ainda não foi configurado: falta {conf.falta.join(' e ')}. Veja apps/web/README.md.</p>
        )}
      </div>
    </main>
  );
}
