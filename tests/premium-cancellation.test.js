import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source = readFileSync(new URL('../functions/lib/premium.js', import.meta.url), 'utf8');
function setup() {
  const records = new Map();
  const db = { doc: path => ({path}), runTransaction: async fn => fn({
    get: async ref => ({exists:records.has(ref.path),data:()=>records.get(ref.path)}),
    set: (ref,data) => records.set(ref.path,{...records.get(ref.path),...data}),
  }) };
  const context = vm.createContext({Date, PREMIUM_AMOUNT:300, PREMIUM_CURRENCY:'MXN',
    firestore_1:{getFirestore:()=>db,FieldValue:{serverTimestamp:()=>new Date()}},
    https_1:{HttpsError:Error}});
  for (const [start,end] of [['function toDate(', '/**'], ['function addOneMonthClamped(', '/**'], ['async function activarPremium(', '/**']]) {
    const at=source.indexOf(start);vm.runInContext(source.slice(at,source.indexOf(end,at)),context);
  }
  return {records,activate:context.activarPremium};
}
test('pago cancelado conserva un mes desde el pago y no reactiva cobros',async()=>{
  const {records,activate}=setup(); const paid=new Date();paid.setDate(paid.getDate()-2);
  const payment={id:123,date_approved:paid.toISOString()};
  await activate('u',payment,'s',{status:'cancelled'});
  const first=records.get('negocios/u');
  assert.equal(first.premium,true);assert.equal(first.renovacionAutomatica,false);
  assert(first.premiumUntil > new Date());
  await activate('u',payment,'s',{status:'cancelled'});
  assert.equal(+records.get('negocios/u').premiumUntil,+first.premiumUntil);
  records.set('negocios/u',{premium:false});
  await activate('u',payment,'s',{status:'cancelled'});
  assert.equal(records.get('negocios/u').premium,true);
  assert.equal(+records.get('negocios/u').premiumUntil,+first.premiumUntil);
});
test('reconciliar un pago vencido no regala un mes desde hoy',async()=>{
  const {records,activate}=setup();
  await activate('u',{id:124,date_approved:'2020-01-31T12:00:00Z'},'s',{status:'cancelled'});
  assert.equal(records.get('negocios/u').premium,false);
  assert.equal(records.get('negocios/u').premiumUntil.toISOString(),'2020-02-29T12:00:00.000Z');
});
test('encuentra el cobro por factura aunque el pago no tenga external_reference',async()=>{
  const calls=[];
  const context=vm.createContext({mp:async path=>{
    calls.push(path);
    if(path.startsWith('/authorized_payments/search'))return {results:[{preapproval_id:'s',payment:{id:123,status:'approved'}}]};
    if(path==='/v1/payments/123')return {id:123,status:'approved',collector_id:456};
    throw Error(`Consulta inesperada: ${path}`);
  }});
  const at=source.indexOf('async function buscarPagoAprobado(');
  vm.runInContext(source.slice(at,source.indexOf('async function recuperarPagosArchivados(',at)),context);
  const pago=await context.buscarPagoAprobado('ref','s','456');
  assert.equal(pago.id,123);assert.equal(calls.length,2);
});
