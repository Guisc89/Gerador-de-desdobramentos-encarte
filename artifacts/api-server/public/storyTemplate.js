"use strict";var StoryTemplate=(()=>{var l=Object.defineProperty;var m=Object.getOwnPropertyDescriptor;var h=Object.getOwnPropertyNames;var w=Object.prototype.hasOwnProperty;var y=(e,t)=>{for(var a in t)l(e,a,{get:t[a],enumerable:!0})},b=(e,t,a,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of h(t))!w.call(e,o)&&o!==a&&l(e,o,{get:()=>t[o],enumerable:!(i=m(t,o))||i.enumerable});return e};var x=e=>b(l({},"__esModule",{value:!0}),e);var z={};y(z,{renderStoryHtml:()=>k});function n(e){return String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}function f(e){let t=(e.precoCentavos||"00").padStart(2,"0").slice(0,2),a=e.foto?`<img src="${n(e.foto)}" alt="" />`:'<span class="card-photo-empty">Sem foto</span>',i=e.descricao?`<div class="card-desc">${n(e.descricao)}</div>`:"";return`
    <div class="card">
      <div class="card-photo">${a}</div>
      <div class="card-info">
        <div class="card-nome">${n(e.nome)}</div>
        ${i}
        <div class="card-price">
          <span class="rs">R$</span><span class="int">${n(e.precoInteiro||"0")}</span><span class="cent-group"><span class="cent">,${n(t)}</span><span class="cada">cada</span></span>
        </div>
      </div>
    </div>`}function s(e){return String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}var u="Os pre\xE7os e produtos anunciados s\xE3o v\xE1lidos exclusivamente para esta loja.";function k(e){let t=Array.isArray(e.produtos)?e.produtos:[],a=t.length,i=!!e.isCapa,o=e.background?`style="background-image:url('${s(e.background)}')"`:"",v=e.background?"story-bg":"story-bg story-bg-default",g=e.endereco?s(e.endereco):"Insira aqui seu endere\xE7o",p=r=>`<div class="story-slot">${f(r)}</div>`,d;if(i){let r=[e.mes?s(e.mes):"",e.validadeInicio||e.validadeFim?`Validade: ${s(e.validadeInicio)} a ${s(e.validadeFim)}`:""].filter(Boolean).join(" | "),c=a>0?t.map(p).join(`
`):'<div class="story-empty">Adicione produtos para montar o story.</div>';d=`
      <div class="story-topinfo">
        ${r?`<div class="si-mesval">${r}</div>`:""}
        <div class="si-disclaimer">${u}</div>
        <div class="si-endereco">${g}</div>
      </div>
      <div class="story-stack" data-count="${a}">
        ${c}
      </div>`}else{let r=a>=3?"layout-3":"layout-2",c=a>0?t.map(p).join(`
`):'<div class="story-empty story-empty-center">Adicione produtos para montar o story.</div>';d=`
      <div class="story-body ${r}" data-count="${a}">
        ${c}
      </div>
      <div class="story-footer">
        <div class="sf-rule"></div>
        <div class="sf-disclaimer">${u}</div>
        <div class="sf-endereco">${g}</div>
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
  /* Dynamic month/validade + address block, below the logo area of the
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
    font-size: 1.65vw;
    font-weight: 400;
    color: #3d4a3a;
  }
  .si-endereco {
    margin-top: 0.7vw;
    font-size: 2.2vw;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.02em;
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

  /* Bottom footer (disclaimer + address), matching the non-capa reference art */
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
  .sf-disclaimer { font-size: 1.7vw; font-weight: 400; color: #3d4a3a; }
  .sf-endereco {
    margin-top: 1vw;
    font-size: 2.2vw;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.02em;
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
  }
  .card-photo img { max-width: 100%; max-height: 100%; object-fit: contain; }
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
</style>
</head>
<body>
  <div class="story-canvas">
    <div class="${v}" ${o}></div>
    <div class="story-overlay">
      ${d}
    </div>
  </div>
</body>
</html>`}return x(z);})();
