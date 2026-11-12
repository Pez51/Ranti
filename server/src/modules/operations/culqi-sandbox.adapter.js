import { financeError } from './finance.policy.js';
function key(){const value=process.env.CULQI_TEST_SECRET_KEY;if(!value?.startsWith('sk_test_'))throw financeError('Configura una llave secreta de prueba de Culqi. Las llaves live no se admiten.');return value;}
async function call(path,body){
 const response=await fetch(`https://api.culqi.com/v2/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${key()}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
 const data=await response.json();
 if(!response.ok)throw financeError('Culqi no confirmó la solicitud. No reintentes un cargo pendiente sin conciliar.');
 return data;
}
export const culqiSandbox={
 async create(payment,quote,source,email){
  if(!/^tkn_test_[A-Za-z0-9]+$/.test(source||''))throw financeError('Solo se admiten tokens de tarjeta de prueba. No envíes números de tarjeta.');
  return call('charges',{amount:Number(quote.economics.total_cents),currency_code:'PEN',email,source_id:source,description:'Ranti sandbox — sin dinero real',metadata:{finance_payment_id:payment.id,finance_quote_id:quote.id}});
 },
 async charge(id){if(!/^chr_test_[A-Za-z0-9]+$/.test(id||''))throw financeError('Referencia de cargo de prueba inválida.');return call(`charges/${id}`);},
 async event(id){if(!/^evt_test_[A-Za-z0-9]+$/.test(id||''))throw financeError('Referencia de evento de prueba inválida.');return call(`events/${id}`);},
};
export function verifySandboxCharge(charge,payment,quote){
 if(!/^chr_test_[A-Za-z0-9]+$/.test(charge?.id||'')||charge.livemode===true||charge.metadata?.finance_payment_id!==payment.id||charge.metadata?.finance_quote_id!==quote.id||!Number.isSafeInteger(charge.amount)||String(charge.amount)!==quote.economics.total_cents||(charge.currency||charge.currency_code)!=='PEN')throw financeError('La respuesta del proveedor no coincide con el pago y la cotización.');
 return charge.response_code==='venta_exitosa'&&charge.state==='Exitosa'?'sandbox_succeeded':charge.state==='Fallida'?'failed':'pending';
}
