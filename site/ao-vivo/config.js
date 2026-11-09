// Configuração pública da Sede ao vivo.
// A chave "publishable" do Supabase é feita para ficar no navegador: sem login de um e-mail
// cadastrado em `donos`, ela não lê nada (regras de segurança no banco, ver sede/aovivo/schema.sql).
window.SEDE_CONFIG = {
  supabaseUrl: '',          // ex.: https://abcdefghijkl.supabase.co
  supabaseKey: '',          // ex.: sb_publishable_...
};
