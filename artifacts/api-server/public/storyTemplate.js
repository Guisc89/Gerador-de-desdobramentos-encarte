"use strict";var StoryTemplate=(()=>{var v=Object.defineProperty;var $=Object.getOwnPropertyDescriptor;var z=Object.getOwnPropertyNames;var C=Object.prototype.hasOwnProperty;var q=(t,e)=>{for(var i in e)v(t,i,{get:e[i],enumerable:!0})},S=(t,e,i,l)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of z(e))!C.call(t,r)&&r!==i&&v(t,r,{get:()=>e[r],enumerable:!(l=$(e,r))||l.enumerable});return t};var A=t=>S(v({},"__esModule",{value:!0}),t);var P={};q(P,{renderStoryHtml:()=>T});var h="Os pre\xE7os e produtos anunciados s\xE3o v\xE1lidos exclusivamente para esta loja.";function j(t,e){return e<=1?e:t<=28?1:t<=170?Math.min(3,e):t<=260?Math.min(4,e):Math.min(5,e)}function I(t,e){let i=Math.max(1,Math.min(e,t.length));if(i===1)return[t.join(" ")];let l=t.map(a=>a.length),r=[0];l.forEach(a=>r.push(r[r.length-1]+a));let f=(r[r.length-1]+t.length-i)/i,c=Array.from({length:i+1},()=>Array(t.length+1).fill(Number.POSITIVE_INFINITY)),n=Array.from({length:i+1},()=>Array(t.length+1).fill(-1));c[0][0]=0;for(let a=1;a<=i;a+=1)for(let o=a;o<=t.length;o+=1)for(let d=a-1;d<o;d+=1){let k=r[o]-r[d]+(o-d-1),y=c[a-1][d]+(k-f)**2;y<c[a][o]&&(c[a][o]=y,n[a][o]=d)}let s=[],g=t.length;for(let a=i;a>0;a-=1){let o=n[a][g];s.unshift(t.slice(o,g).join(" ")),g=o}return s}function w(t){let e=String(t??"").replace(/\r\n?/g,`
`);if(!e.trim())return[];let i=e.split(`
`).map(n=>n.trim().replace(/\s+/g," ")).filter(Boolean).map(n=>n.split(" ")),l=i.reduce((n,s)=>n+s.length,0),r=i.reduce((n,s)=>n+s.join(" ").length,0),u=Math.max(i.length,j(r,l)),f=i.map(()=>1),c=u-i.length;for(;c>0;){let n=-1,s=-1;if(i.forEach((g,a)=>{if(f[a]>=g.length)return;let o=g.join(" ").length/f[a];o>s&&(n=a,s=o)}),n<0)break;f[n]+=1,c-=1}return i.flatMap((n,s)=>I(n,f[s]))}function b(t){let e=String(t??"").trim();return/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(e)?e:""}function p(t){return String(t??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e])}function x(t){let e=(t.precoCentavos||"00").padStart(2,"0").slice(0,2),i=t.foto?`<img src="${p(t.foto)}" alt="" />`:'<span class="card-photo-empty">Sem foto</span>',l=t.descricao?`<div class="card-desc">${p(t.descricao)}</div>`:"";return`
    <div class="card">
      <div class="card-photo">${i}</div>
      <div class="card-info">
        <div class="card-nome">${p(t.nome)}</div>
        ${l}
        <div class="card-price">
          <span class="rs">R$</span><span class="int">${p(t.precoInteiro||"0")}</span><span class="cent-group"><span class="cent">,${p(e)}</span><span class="cada">cada</span></span>
        </div>
      </div>
    </div>`}function m(t){return String(t??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e])}function T(t){let e=Array.isArray(t.produtos)?t.produtos:[],i=e.length,l=!!t.isCapa,r=t.background?`style="background-image:url('${m(t.background)}')"`:"",u=t.background?"story-bg":"story-bg story-bg-default",f=t.disclaimer===void 0?h:t.disclaimer,c=w(f).map(m).join("<br />"),n=b(t.infoCor),s=n?`.si-mesval, .si-disclaimer, .sf-disclaimer { color: ${n}; }`:"",g=o=>`<div class="story-slot">${x(o)}</div>`,a;if(l){let o=[t.mes?m(t.mes):"",t.validadeInicio||t.validadeFim?`Validade: ${m(t.validadeInicio)} a ${m(t.validadeFim)}`:""].filter(Boolean).join(" | "),d=i>0?e.map(g).join(`
`):'<div class="story-empty">Adicione produtos para montar o story.</div>';a=`
      <div class="story-topinfo">
        ${o?`<div class="si-mesval">${o}</div>`:""}
        ${c?`<div class="si-disclaimer">${c}</div>`:""}
      </div>
      <div class="story-stack" data-count="${i}">
        ${d}
      </div>`}else{let o=i>=3?"layout-3":"layout-2",d=i>0?e.map(g).join(`
`):'<div class="story-empty story-empty-center">Adicione produtos para montar o story.</div>';a=`
      <div class="story-body ${o}" data-count="${i}">
        ${d}
      </div>
      <div class="story-footer">
        <div class="sf-rule"></div>
        ${c?`<div class="sf-disclaimer">${c}</div>`:""}
      </div>`}return`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    background: #fff;
  }
  /* 1080 x 1920 => portrait 9:16 (height = width * 16/9 = 177.7778vw) */
  .story-canvas {
    position: relative;
    width: 100vw;
    height: 177.7778vw;
    overflow: hidden;
  }
  .story-bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    z-index: 0;
  }
  .story-bg-default {
    background-image:
      radial-gradient(circle at 78% 12%, rgba(255,255,255,0.5) 0%, transparent 40%),
      linear-gradient(165deg, #eef3dc 0%, #dfeac6 58%, #d2e2b6 100%);
  }
  .story-overlay { position: absolute; inset: 0; z-index: 1; }

  /* ---- Capa (page 1) ---- */
  /* Dynamic month/validade + legal copy, below the logo area of the
     background art (logo + lettering live in the background). */
  .story-topinfo {
    position: absolute;
    top: 15%;
    left: 5.5%;
    right: 5.5%;
    color: #0f5f56;
    line-height: 1.28;
  }
  .si-mesval { font-size: 3.1vw; font-weight: 900; }
  .si-disclaimer {
    margin-top: 0.6vw;
    font-size: 1.95vw;
    font-weight: 400;
    color: #3d4a3a;
    line-height: 1.3;
  }
  /* Product cards stacked in the upper-middle (capa disposition of the
     reference art \u2014 lettering fills the lower half of the background). */
  .story-stack {
    position: absolute;
    top: 22.5%;
    left: 7%;
    right: 7%;
    display: flex;
    flex-direction: column;
    gap: 3.6vw;
  }

  /* ---- Non-capa (page 2+) ---- */
  .story-body {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 4vw;
    padding: 13% 6% 12% 6%;
  }
  /* 2 & 3 products: full, centered stack (reference dispositions) */
  .story-body.layout-2 .story-slot { width: 86%; }
  .story-body.layout-3 .story-slot { width: 84%; }

  /* Bottom legal footer */
  .story-footer {
    position: absolute;
    left: 6%;
    right: 6%;
    bottom: 3.6%;
    text-align: center;
    color: #0f5f56;
  }
  .sf-rule {
    width: 62%;
    height: 0.3vw;
    background: #0f9e90;
    margin: 0 auto 1.5vw;
    border-radius: 1vw;
  }
  .sf-disclaimer {
    max-width: 78%;
    margin: 0 auto;
    font-size: 2vw;
    line-height: 1.3;
    font-weight: 400;
    color: #3d4a3a;
  }

  /* ---- Shared product card ---- */
  /* Each slot establishes its own inline-size container so the card (sized in
     cqw, single markup shared with telaTemplate via renderProductCard) scales to
     its slot width regardless of how many products the layout holds. */
  .story-slot { container-type: inline-size; }
  .story-stack .story-slot { width: 100%; }

  .card {
    background: #ffffff;
    border-radius: 4cqw;
    display: flex;
    overflow: hidden;
    box-shadow: 0 2.5cqw 6cqw rgba(15, 95, 86, 0.20);
  }
  .card-photo {
    width: 40%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2.5cqw;
    background: #fff;
    /* Mesma regra das telas: a foto n\xE3o participa do layout \u2014 o card tem
       sempre o mesmo tamanho e a imagem se ajusta ao espa\xE7o branco (amplia a
       pequena, reduz a grande), mantendo a propor\xE7\xE3o. */
    position: relative;
    min-height: 29cqw;
  }
  .card-photo img {
    position: absolute;
    top: 1cqw;
    left: 1cqw;
    width: calc(100% - 2cqw);
    height: calc(100% - 2cqw);
    object-fit: contain;
  }
  .card-photo-empty {
    font-size: 2.4cqw;
    color: #b4bcae;
    text-align: center;
    border: 0.4cqw dashed #cfd6c6;
    border-radius: 2cqw;
    padding: 3cqw;
    width: 100%;
  }
  .card-info {
    width: 60%;
    background: linear-gradient(150deg, #06b6a6 0%, #029e93 100%);
    color: #ffffff;
    padding: 3.5cqw 3.75cqw;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .card-nome { font-size: 3.9cqw; font-weight: 900; line-height: 1.05; }
  .card-desc {
    margin-top: 0.75cqw;
    font-size: 2.55cqw;
    font-weight: 500;
    color: rgba(255,255,255,0.92);
  }
  .card-price {
    margin-top: 2.5cqw;
    display: flex;
    align-items: baseline;
    gap: 0.75cqw;
    line-height: 1;
  }
  .card-price .rs { font-size: 3.75cqw; font-weight: 800; }
  .card-price .int { font-size: 10cqw; font-weight: 900; letter-spacing: -0.12cqw; }
  .card-price .cent-group {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    align-self: flex-start;
    margin-top: 1cqw;
    line-height: 1;
  }
  .card-price .cent { font-size: 5cqw; font-weight: 900; }
  .card-price .cada { font-size: 2.5cqw; font-weight: 700; margin-top: 0.6cqw; }

  .story-empty {
    text-align: center;
    color: #6c7a64;
    font-size: 2.2vw;
    padding: 3vw;
    border: 0.3vw dashed #c2cbb6;
    border-radius: 1.6vw;
    background: rgba(255,255,255,0.55);
  }
  .story-empty-center {
    position: static;
    width: 82%;
    margin: auto;
  }
  ${s}
</style>
</head>
<body>
  <div class="story-canvas">
    <div class="${u}" ${r}></div>
    <div class="story-overlay">
      ${a}
    </div>
  </div>
</body>
</html>`}return A(P);})();
