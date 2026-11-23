import { redirect } from 'next/navigation';
import { configuracaoPronta, temSessao } from '@/lib/sessao';
import FormEntrar from '@/componentes/FormEntrar';

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
          <span className="topo__aba" aria-hidden="true">c.</span>
        </div>
        <div>
          <p className="entrar__tc" aria-hidden="true">00:00:00:00 / 30:00</p>
          <h1 className="entrar__titulo">Ilha de <em>edição</em></h1>
          <p className="aviso" style={{ marginTop: 12 }}>Sobe o material, manda o pedido, recebe o vídeo pronto em até 30 minutos.</p>
        </div>
        {conf.ok ? (
          <FormEntrar modo={conf.modo === 'supabase' ? 'supabase' : 'senha'} />
        ) : (
          <p className="erro" role="alert">O site ainda não foi configurado: falta {conf.falta.join(' e ')}. Veja apps/web/README.md e apps/web/docs/AUTH.md.</p>
        )}
      </div>
    </main>
  );
}
