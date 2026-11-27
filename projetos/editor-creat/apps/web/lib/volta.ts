/** Destino de volta depois de entrar com a senha: só caminho interno (começa com "/" e não com "//" nem "/\").
 *  Qualquer outra coisa (endereço de fora, esquema, controle) vira /projetos. */
export function voltaSegura(v: unknown): string {
  if (typeof v !== 'string' || v.length > 200) return '/projetos';
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return '/projetos';
  if (!/^\/[A-Za-z0-9_\-./?=&#%]*$/.test(v)) return '/projetos';
  return v;
}
