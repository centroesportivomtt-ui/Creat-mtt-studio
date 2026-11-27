import Backup from '@/componentes/Backup';
import SomClaquete from '@/componentes/SomClaquete';
import ChaveConversa from '@/componentes/conversa/ChaveConversa';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sistema' };

// Onda 4: backup, saúde, a chave da conversa e o som da claquete numa tela só (o ponto de saúde do topo leva para cá).
export default function Sistema() {
  return (
    <main className="pagina caderno">
      <div className="cabeca-pagina">
        <div>
          <p className="sobretitulo">Por trás do editor</p>
          <h1 className="titulo">Sistema</h1>
        </div>
      </div>
      <ChaveConversa variante="cartao" />
      <section className="cartao" aria-labelledby="c-som" id="som">
        <h2 className="cartao__titulo" id="c-som">Som da claquete</h2>
        <SomClaquete />
      </section>
      <section className="cartao" aria-labelledby="c-backup" id="backup">
        <h2 className="cartao__titulo" id="c-backup">Backup</h2>
        <p className="aviso" style={{ maxWidth: '62ch' }}>Uma vez por dia, o que não se refaz (projetos, pedidos, direções, relatórios, regras e casos da casa) sai do servidor e fica guardado no Cloudflare e, se você salvar o link, numa pasta do seu Dropbox.</p>
        <Backup />
      </section>
    </main>
  );
}
