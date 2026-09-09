import test from "node:test";
import assert from "node:assert/strict";
import { isPlanPromptOwner, nextPlanPromptHistory } from "../src/js/services/plan_prompt_schedule.js";
const day = 86400000;
const owner = {uid:"owner",cuentaPrincipalUid:"owner",loading:false,activo:true,accesoPermitido:true,premiumState:"free",negocio:{cuentaPrincipalUid:"owner"}};
test("solo el titular gratuito, independientemente del rol",()=>{
  assert(isPlanPromptOwner({...owner,rol:"cocinero"}));
  assert(!isPlanPromptOwner({...owner,uid:"employee",rol:"administrador"}));
  assert(!isPlanPromptOwner({...owner,premiumState:"premium"}));
  assert(!isPlanPromptOwner({...owner,premiumState:"loading"}));
  assert(!isPlanPromptOwner({...owner,accesoPermitido:false}));
});
test("maximo tres avisos cada siete dias, separados por 48 horas",()=>{
  const start = Date.UTC(2026,8,7);
  let history = nextPlanPromptHistory([],start);
  assert.equal(nextPlanPromptHistory(history,start+day),null);
  history=nextPlanPromptHistory(history,start+2*day);
  history=nextPlanPromptHistory(history,start+4*day);
  assert.equal(history.length,3);
  assert.equal(nextPlanPromptHistory(history,start+6*day),null);
  assert.equal(nextPlanPromptHistory(history,start+7*day).length,3);
});
