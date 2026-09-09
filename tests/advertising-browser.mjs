import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || pathToFileURL(`${process.env.TEMP}/cajalibre-browser-tests/node_modules/playwright/index.mjs`).href);
const browser = await chromium.launch({headless:true});
const mock = `
export const auth={},db={}; export const ANALYTICS_ALLOWED_EMAIL='system@example.com';
window.listenerCounts={auth:0,negocio:0};
export const onAuthStateChanged=(auth,cb)=>{window.listenerCounts.auth++;queueMicrotask(()=>cb({uid:'shop',email:'owner@example.com'}));return ()=>{};};
export const doc=(db,...parts)=>parts.join('/');
export const onSnapshot=(path,cb)=>{if(path.startsWith('autorizados'))window.refreshAuthorization=()=>cb({exists:()=>true,data:()=>({rol:'admin',activo:true,negocioId:'shop',cuentaPrincipalUid:'shop',suscripcionControlada:true,nombre:'Actualizado'})});queueMicrotask(()=>cb({exists:()=>true,data:()=>path.startsWith('autorizados')?{rol:'admin',activo:true,negocioId:'shop',cuentaPrincipalUid:'shop',suscripcionControlada:true}:{estado:'activo'}}));return ()=>{};};
export const escucharNegocio=(id,cb)=>{window.listenerCounts.negocio++;window.confirmBusiness=(premium,fromCache=false,withExpiry=true)=>cb({premium,premiumUntil:premium && withExpiry ? new Date(Date.now()+86400000) : null,negocioId:id},{fromCache,hasPendingWrites:false});return ()=>{};};
export const migrateLegacyTenantDataOnce=async()=>{};
export const normalizeAutorizadoData=data=>data;
export const normalizarPermisos=()=>({});export const tienePermiso=()=>true;
export const resolverAccesoSuscripcion=({suscripcion})=>({permitido:true,suscripcion});
export const clearTenantContext=()=>{};export const saveTenantContext=()=>{};
`;
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();
 
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let requests=0, mode='ok';
 
 await context.route('https://www.highrevenueformat.com/**',async r=>{requests++; if(mode==='error')return r.abort();return r.fulfill({contentType:'application/javascript',body:mode==='empty'?'':`const f=document.createElement('iframe');f.srcdoc='<p>Publicidad de prueba</p>';document.body.appendChild(f);`});});
 await context.route('**/__mock.js',r=>r.fulfill({contentType:'application/javascript',body:mock}));
 await context.route('**/src/hooks/useAutorizacionActual.js*',async r=>{const response=await r.fetch();let body=await response.text();body=body.replace(/import\s+\{[^}]+\}\s+from\s+"[^"]+";/g,line=>line.includes('react')?line:line.replace(/from\s+"[^"]+"/,'from "/__mock.js"'));await r.fulfill({response,body});});
 await context.route('**/ads-test',r=>r.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;--app-surface:white;--app-border:#e2e8f0;--app-text:#17253a}</style></head><body><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/advertising.jsx"></script></body></html>'}));
 await page.goto('http://127.0.0.1:5173/ads-test');
 await page.waitForFunction(()=>typeof window.confirmBusiness==='function');
 assert.equal(requests,0);assert.equal(await page.locator('.ad-panel').count(),0);
 await page.evaluate(()=>window.confirmBusiness(false,true));await page.waitForTimeout(150);assert.equal(requests,0);
 await page.evaluate(()=>window.confirmBusiness(true));await page.waitForSelector('.premium-layout');assert.equal(requests,0);assert.equal(await page.locator('iframe').count(),0);
 assert.equal(await page.locator('.home-page').evaluate(el=>getComputedStyle(el).paddingLeft),'20px');
 assert.deepEqual(await page.evaluate(()=>window.listenerCounts),{auth:1,negocio:1});
 await page.evaluate(()=>window.refreshAuthorization());assert.deepEqual(await page.evaluate(()=>window.listenerCounts),{auth:1,negocio:1});assert.equal(await page.locator('.ad-panel').count(),0);
 await page.evaluate(()=>window.confirmBusiness(true,false,false));assert.equal(await page.locator('.ad-panel').count(),0);assert.equal(requests,0);
 console.log('PASS premium cold start, cached free blocked, zero ad requests, shared listeners');
 await page.evaluate(()=>window.confirmBusiness(false));await page.waitForSelector('.ad-panel');await page.waitForSelector('.ad-panel--ready');assert.equal(await page.locator('.home-page').evaluate(el=>getComputedStyle(el).paddingLeft),'212px');
 console.log('PASS backend cancellation restores free desktop');
 await page.evaluate(()=>window.confirmBusiness(true));await page.waitForSelector('.premium-layout');assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.locator('.ad-panel').count(),0);const prior=requests;await page.waitForTimeout(250);assert.equal(requests,prior);
 console.log('PASS live confirmation unmounts ad and expands layout');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('iframe').count(),0);
 await page.screenshot({path:`${process.env.TEMP}/cajalibre-premium-mobile.png`});
 await page.evaluate(()=>window.confirmBusiness(false));await page.waitForSelector('.ad-panel--ready');assert.equal(await page.locator('.ad-panel').evaluate(el=>getComputedStyle(el).position),'static');assert(await page.locator('.ad-panel').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
 await page.screenshot({path:`${process.env.TEMP}/cajalibre-free-mobile.png`});console.log('PASS premium and free mobile');
 await page.evaluate(()=>window.confirmBusiness(true));await page.waitForSelector('.premium-layout');mode='error';await page.evaluate(()=>window.confirmBusiness(false));await page.waitForTimeout(1000);assert.equal(await page.locator('.ad-panel').count(),1);assert.equal(await page.locator('.ad-panel iframe').count(),1);assert.equal(await page.locator('h2').innerText(),'Bienvenido, IVAN');console.log('PASS provider error keeps empty ad rectangle');
 await page.evaluate(()=>window.confirmBusiness(true));await page.waitForSelector('.premium-layout');mode='empty';await page.evaluate(()=>window.confirmBusiness(false));await page.waitForSelector('.ad-panel--loading',{state:'attached'});assert.equal(await page.locator('.ad-panel').isVisible(),true);await page.waitForTimeout(6500);assert.equal(await page.locator('.ad-panel').count(),1);assert.equal(await page.locator('.ad-panel-label').count(),1);console.log('PASS empty provider keeps labeled rectangle');
 assert.deepEqual(errors,[]);console.log('PASS no browser errors');
} finally {await browser.close();}
