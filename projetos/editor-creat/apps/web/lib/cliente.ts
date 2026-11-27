// Link de aprovação do cliente: token de 256 bits em base64url (43 caracteres). O motor guarda só o sha256 dele.
export const RE_TOKEN_CLIENTE = /^[A-Za-z0-9_-]{43}$/;

export type LinkCliente = {
  id: string; projeto: string; versao: string; titulo: string; criado: string; expira: string; revogado: string | null;
  vistas: number; visto_em: string | null; resposta: 'aprovar' | 'ajuste' | null; texto: string | null; nome: string | null;
  respondido: string | null; tratado: string | null; ativo: boolean; projeto_nome?: string | null;
};

export const dataCurta = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bahia' }) : '';
