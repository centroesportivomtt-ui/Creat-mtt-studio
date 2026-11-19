// Isotipo do Editor creat.MTT: o "c." da creat. O c é um anel com corte reto (o corte da edição) e o ponto vermelho é o ponto da marca.
// `gato` liga as orelhas: só na camada secundária de comunicação (espera, avisos, "Pula o óbvio."), nunca na marca principal.
export default function Iso({ tamanho = 28, titulo, gato = false }: { tamanho?: number; titulo?: string; gato?: boolean }) {
  return (
    <svg className="iso" width={tamanho} height={tamanho} viewBox="-6 -4 132 128" role={titulo ? 'img' : undefined} aria-label={titulo} aria-hidden={titulo ? undefined : true}>
      <path d="M84.5 48 A30 30 0 1 0 84.5 92" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="butt" />
      {gato && <path fill="currentColor" d="M52.7 39 L33 58.7 L17.9 28.5Z M85.2 44.7 L61.1 37.1 L87.2 12.5Z" />}
      <circle className="iso__ponto" cx="103" cy="92" r="10" />
    </svg>
  );
}
