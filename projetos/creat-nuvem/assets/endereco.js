/* =====================================================================
   Porta Aberta · endereco.js (Pixel)
   Fonte única da regra de endereço: a vitrine (/abrir/) valida com ela
   antes do pagamento e a produção (scripts/producao/lib/pedido.cjs) usa
   a mesma função para separar rua, número, bairro, UF e CEP.
   Assim, endereço aceito no formulário nunca é recusado depois de pago.
   Formato: "Rua, número, bairro, cidade-UF, CEP".
   ===================================================================== */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.CreatEndereco = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  var FORMATO = 'use "Rua, número, bairro, cidade-UF, CEP" (ex.: Rua das Flores, 120, Centro, Campinas-SP, 13010-000)';
  function semAcento(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function falha(motivo) { return { ok: false, motivo: motivo, erro: motivo + '; ' + FORMATO }; }

  /* Devolve { ok:true, valor:{rua,numero,bairro,cidade,uf,cep} } ou { ok:false, motivo, erro }. */
  function analisar(endereco, cidade) {
    var s = ' ' + String(endereco || '').replace(/\s+/g, ' ').trim() + ' ';
    // "CEP 04000-000", "CEP: 04000000", "cep.04000-000": o rótulo sai junto com o número
    var mCep = s.match(/(?:\bCEP\s*[:.\-]?\s*)?\b(\d{5})-?(\d{3})\b/i);
    if (!mCep) return falha('não achei o CEP');
    var cep = mCep[1] + '-' + mCep[2];
    s = s.replace(mCep[0], ' ');
    // UF em minúsculas só vale grudada em "cidade/uf" ou "cidade-uf" (evita confundir "pa", "es" etc.)
    s = s.replace(/([^\s\/-])\s*([\/-])\s*([a-z]{2})(?=[\s,.\/-]*$)/i, function (t, a, sep, uf) {
      return UFS.indexOf(uf.toUpperCase()) !== -1 ? a + sep + uf.toUpperCase() : t;
    });
    var fim = s.replace(/[\s,.\/-]+$/, '');
    var mUf = fim.match(new RegExp('(?:^|[\\s,/-])(' + UFS.join('|') + ')$'));
    if (!mUf) mUf = s.match(new RegExp('(?:^|[\\s,/-])(' + UFS.join('|') + ')(?=[\\s,/.-]*$|[\\s,/.-]+\\s*$)'));
    if (!mUf) return falha('não achei a UF (sigla do estado, como SP ou BA)');
    var uf = mUf[1];
    var resto = fim;
    var iUf = resto.lastIndexOf(uf);
    resto = resto.slice(0, iUf) + resto.slice(iUf + 2);
    // tira a cidade do pedido (sem acento, sem caixa) do fim
    var cid = semAcento(cidade || '').toLowerCase().trim();
    var iCid = cid ? semAcento(resto).toLowerCase().lastIndexOf(cid) : -1;
    if (iCid !== -1) resto = resto.slice(0, iCid) + resto.slice(iCid + cid.length);
    var partes = resto.split(/\s*[,;]\s*|\s+[-–]\s+/).map(function (p) { return p.replace(/^[\s.\/-]+|[\s.\/-]+$/g, '').trim(); }).filter(Boolean);
    var ehNumero = function (p) { return /^(n[ºo°.]?\s*)?\d{1,6}[A-Za-z]?$|^s\/?n$/i.test(p); };
    var i = -1, k;
    for (k = 0; k < partes.length; k++) if (ehNumero(partes[k])) { i = k; break; }
    if (i === -1) {
      // "Rua das Flores 120, Centro"
      for (k = 0; k < partes.length; k++) {
        var m = partes[k].match(/^(\D.*\D)\s(\d{1,6}[A-Za-z]?)$/);
        if (m) { partes.splice(k, 1, m[1].trim(), m[2]); i = k + 1; break; }
      }
    }
    if (i < 1) return falha('não consegui separar a rua do número');
    var rua = partes.slice(0, i).join(', ');
    var numBruto = partes[i].replace(/^n[ºo°.]?\s*/i, '');
    var numero = /^s\/?n$/i.test(partes[i]) ? 's/n' : numBruto;
    var bairro = partes.slice(i + 1).join(', ');
    if (!bairro) return falha('não achei o bairro');
    var lim = { rua: 80, numero: 12, bairro: 60 }, val = { rua: rua, numero: numero, bairro: bairro };
    for (k in lim) if (val[k].length > lim[k]) return { ok: false, motivo: 'acima do limite', campo: k, erro: k + ' acima do limite de ' + lim[k] + ' caracteres' };
    return { ok: true, valor: { rua: rua, numero: numero, bairro: bairro, cidade: String(cidade), uf: uf, cep: cep } };
  }

  /* Mensagem curta para a pessoa no formulário ('' quando está tudo certo). */
  function mensagem(endereco, cidade) {
    var r = analisar(endereco, cidade);
    if (r.ok) return '';
    var dica = ' Escreva assim: Rua, número, bairro, cidade-UF, CEP.';
    switch (r.motivo) {
      case 'não achei o CEP': return 'Falta o CEP, com 8 números.' + dica;
      case 'não achei a UF (sigla do estado, como SP ou BA)': return 'Falta a sigla do estado, como SP ou BA, junto da cidade.' + dica;
      case 'não consegui separar a rua do número': return 'Falta o número da casa ou da loja (ou s/n).' + dica;
      case 'não achei o bairro': return 'Falta o bairro.' + dica;
      default: return 'O endereço ficou longo demais em ' + r.campo + '. Abrevie, por exemplo "Av." em vez de "Avenida".';
    }
  }
  return { UFS: UFS, FORMATO: FORMATO, analisar: analisar, mensagem: mensagem, semAcento: semAcento };
});
