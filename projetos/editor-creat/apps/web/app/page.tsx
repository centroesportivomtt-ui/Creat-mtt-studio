import { redirect } from 'next/navigation';
import { temSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export default async function Inicio() {
  redirect((await temSessao()) ? '/projetos' : '/entrar');
}
