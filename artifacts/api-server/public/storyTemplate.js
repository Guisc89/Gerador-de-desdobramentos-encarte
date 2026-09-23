"use strict";var StoryTemplate=(()=>{var c=Object.defineProperty;var b=Object.getOwnPropertyDescriptor;var x=Object.getOwnPropertyNames;var k=Object.prototype.hasOwnProperty;var $=(e,t)=>{for(var i in t)c(e,i,{get:t[i],enumerable:!0})},z=(e,t,i,o)=>{if(t&&typeof t=="object"||typeof t=="function")for(let a of x(t))!k.call(e,a)&&a!==i&&c(e,a,{get:()=>t[a],enumerable:!(o=b(t,a))||o.enumerable});return e};var C=e=>z(c({},"__esModule",{value:!0}),e);var S={};$(S,{renderStoryHtml:()=>q});function g(e){let t=String(e??"").replace(/\r\n?/g,`
`);return t.trim()?t.split(`
`).map(i=>i.trim().replace(/\s+/g," ")).filter(Boolean):[]}var f=`
<script>
(() => {
  const fit = (element) => {
    const box = element.parentElement;
    if (!box) return;
    const maximum = Number(element.dataset.maxFont ||
      parseFloat(getComputedStyle(element).fontSize) || 16);
    const minimum = Number(element.dataset.minFont || 1);
    let low = minimum;
    let high = maximum;
    const fits = (size) => {
      element.style.fontSize = size + "px";
      return element.scrollHeight <= box.clientHeight + 0.5 &&
        element.scrollWidth <= box.clientWidth + 0.5;
    };
    if (fits(maximum)) return;
    for (let index = 0; index < 14; index += 1) {
      const middle = (low + high) / 2;
      if (fits(middle)) low = middle;
      else high = middle;
    }
    element.style.fontSize = low + "px";
  };
  const run = () => document.querySelectorAll("[data-fit-legal]").forEach(fit);
  // The export renderer calls this once more after every embedded image has
  // settled. Exposing the same fitter avoids a timing gap between the first
  // requestAnimationFrame used by the iframe preview and Puppeteer's screenshot.
  window.__fitLegalText = run;
  window.__legalFitReady = (document.fonts ? document.fonts.ready : Promise.resolve())
    .then(() => new Promise((resolve) => requestAnimationFrame(() => {
      run();
      requestAnimationFrame(resolve);
    })));
  window.addEventListener("resize", run);
})();
<\/script>`;function p(e){let t=String(e??"").trim();return/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t)?t:""}function r(e){return String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}function v(e){let t=(e.precoCentavos||"00").padStart(2,"0").slice(0,2),i=e.foto?`<img src="${r(e.foto)}" alt="" />`:'<span class="card-photo-empty">Sem foto</span>',o=e.descricao?`<div class="card-desc">${r(e.descricao)}</div>`:"";return`
    <div class="card">
      <div class="card-photo">${i}</div>
      <div class="card-info">
        <div class="card-nome">${r(e.nome)}</div>
        ${o}
        <div class="card-price">
          <span class="rs">R$</span><span class="int">${r(e.precoInteiro||"0")}</span><span class="cent-group"><span class="cent">,${r(t)}</span><span class="cada">cada</span></span>
        </div>
      </div>
    </div>`}function s(e){return String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}function q(e){let t=Array.isArray(e.produtos)?e.produtos:[],i=t.length,o=!!e.isCapa,a=e.background?`style="background-image:url('${s(e.background)}')"`:"",w=e.background?"story-bg":"story-bg story-bg-default",m=g(e.disclaimer).map(s).join("<br />"),u=p(e.infoCor),y=u?`.si-mesval, .sf-disclaimer { color: ${u}; }`:"",h=n=>`<div class="story-slot">${v(n)}</div>`,d;if(o){let n=[e.mes?s(e.mes):"",e.validadeInicio||e.validadeFim?`Validade: ${s(e.validadeInicio)} a ${s(e.validadeFim)}`:""].filter(Boolean).join(" | "),l=i>0?t.map(h).join(`
`):'<div class="story-empty">Adicione produtos para montar o story.</div>';d=`
      <div class="story-topinfo">
        ${n?`<div class="si-mesval">${n}</div>`:""}
      </div>
      <div class="story-stack" data-count="${i}">
        ${l}
      </div>`}else{let n=i>=3?"layout-3":"layout-2",l=i>0?t.map(h).join(`
`):'<div class="story-empty story-empty-center">Adicione produtos para montar o story.</div>';d=`
      <div class="story-body ${n}" data-count="${i}">
        ${l}
      </div>
      <div class="story-footer">
        <div class="sf-rule"></div>
        <div class="sf-legal-box">
          ${m?`<div class="sf-disclaimer" data-fit-legal data-min-font="1">${m}</div>`:""}
        </div>
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
  /* Dynamic month/validade only, below the logo area of the
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
    top: 0;
    left: 0;
    right: 0;
    bottom: 14%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 4vw;
    padding: 13% 6% 4% 6%;
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
    height: 8.5%;
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
  .sf-legal-box {
    width: 100%;
    height: calc(100% - 1.8vw);
    overflow: hidden;
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }
  .sf-disclaimer {
    width: 100%;
    margin: 0 auto;
    font-size: 2vw;
    line-height: 1.3;
    font-weight: 400;
    color: #3d4a3a;
    overflow-wrap: anywhere;
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
    background: ${p(e.produtoCor)||"linear-gradient(150deg, #06b6a6 0%, #029e93 100%)"};
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
  ${y}
</style>
</head>
<body>
  <div class="story-canvas">
    <div class="${w}" ${a}></div>
    <div class="story-overlay">
      ${d}
    </div>
  </div>
</body>
${o?"":f}
</html>`}return C(S);})();
