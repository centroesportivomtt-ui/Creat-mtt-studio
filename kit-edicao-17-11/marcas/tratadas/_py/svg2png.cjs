// uso: node svg2png.cjs entrada.svg saida.png largura
const fs=require('fs');
let pw;for(const p of ['playwright','/opt/node22/lib/node_modules/playwright','/usr/local/lib/node_modules/playwright','/usr/lib/node_modules/playwright']){try{pw=require(p);break}catch{}}
(async()=>{
 const [inp,out,wS]=process.argv.slice(2);const svg=fs.readFileSync(inp,'utf8');
 const vb=svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
 const W=+wS,H=Math.round(W*vb[3]/vb[2]);
 const b=await pw.chromium.launch();const pg=await b.newPage({viewport:{width:W,height:H}});
 const s=svg.replace(/width="[^"]*" height="[^"]*"/,`width="${W}" height="${H}"`);
 await pg.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);
 await pg.screenshot({path:out,omitBackground:true,clip:{x:0,y:0,width:W,height:H}});
 await b.close();console.log(out,W,H);
})();
