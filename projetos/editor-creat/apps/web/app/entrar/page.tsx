import { redirect } from 'next/navigation';
import { configuracaoPronta, temSessao } from '@/lib/sessao';
import FormEntrar from '@/componentes/FormEntrar';
import Iso from '@/componentes/Iso';
import { voltaSegura } from '@/lib/volta';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Entrar' };

export default async function Entrar({ searchParams }: { searchParams: Promise<{ volta?: string | string[] }> }) {
  // sessão vencida no meio da conversa: depois da senha, volta para a mesma página (o texto e o áudio estão guardados)
  const volta = voltaSegura((await searchParams)?.volta);
  if (await temSessao()) redirect(volta);
  const conf = configuracaoPronta();
  return (
    <main className="entrar">
      <div className="entrar__caixa">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img className="topo__logo logo-claro" src="/marca/logo_creatMTT_claro.png" alt="creat.MTT" width={128} height={22} />
          <img className="topo__logo logo-escuro" src="/marca/logo_creatMTT_escuro.png" alt="creat.MTT" width={128} height={22} />
          <span className="topo__editor" aria-hidden="true">Editor</span>
        </div>
        <div>
          <p className="entrar__tc" aria-hidden="true">00:00:00:00 / 30:00</p>
          <h1 className="entrar__titulo">Do bruto <em>ao filme.</em></h1>
          <p className="aviso" style={{ marginTop: 12 }}>Você sobe o material, escolhe o modo de edição e faz o pedido. O filme volta pronto e conferido em até 30 minutos.</p>
        </div>
        {conf.ok ? (
          <FormEntrar volta={volta} />
        ) : (
          <p className="erro" role="alert">O site ainda não foi configurado: falta {conf.falta.join(' e ')}. Veja apps/web/README.md.</p>
        )}
        <p className="entrar__assina"><Iso tamanho={22} gato />Pula o óbvio.</p>
      </div>
    </main>
  );
}
