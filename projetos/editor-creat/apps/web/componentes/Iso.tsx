// Isotipo do creat.PULO: o "c." da creat com orelhas. O c é o gato, o ponto vermelho é o ponto da marca (e o que ele pula).
export default function Iso({ tamanho = 28, titulo }: { tamanho?: number; titulo?: string }) {
  return (
    <svg className="iso" width={tamanho} height={tamanho} viewBox="-6 -4 132 128" role={titulo ? 'img' : undefined} aria-label={titulo} aria-hidden={titulo ? undefined : true}>
      <path d="M82 46 A30 30 0 1 0 82 94" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
      <path fill="currentColor" d="M52.7 39 L33 58.7 L17.9 28.5Z M85.2 44.7 L61.1 37.1 L87.2 12.5Z" />
      <circle className="iso__ponto" cx="101" cy="94" r="10" />
    </svg>
  );
}
