import { afterEach,it,expect,vi } from 'vitest';
import { culqiSandbox,verifySandboxCharge } from '../src/modules/operations/culqi-sandbox.adapter.js';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('refuses live keys before making a network request',async()=>{
 vi.stubEnv('CULQI_TEST_SECRET_KEY','sk_live_NOT_A_REAL_KEY');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 await expect(culqiSandbox.charge('chr_test_fixture')).rejects.toThrow(/llaves live/);expect(fetch).not.toHaveBeenCalled();
});
it('uses server cents and metadata with a test key without exposing provider response bodies',async()=>{
 vi.stubEnv('CULQI_TEST_SECRET_KEY','sk_test_NOT_A_REAL_KEY');const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:'chr_test_fixture'})});vi.stubGlobal('fetch',fetch);
 await culqiSandbox.create({id:'payment'},{id:'quote',economics:{total_cents:'4316'}},'tkn_test_fixture','test@example.test');
 const body=JSON.parse(fetch.mock.calls[0][1].body);expect(body.amount).toBe(4316);expect(body.metadata).toEqual({finance_payment_id:'payment',finance_quote_id:'quote'});
 expect(fetch.mock.calls[0][0]).toBe('https://api.culqi.com/v2/charges');
});
it('rejects mismatched amounts, references and real payment objects',()=>{
 const p={id:'payment'},q={id:'quote',economics:{total_cents:'4316'}},charge={id:'chr_test_fixture',amount:4316,currency:'PEN',metadata:{finance_payment_id:'payment',finance_quote_id:'quote'},response_code:'venta_exitosa',state:'Exitosa'};
 expect(verifySandboxCharge(charge,p,q)).toBe('sandbox_succeeded');expect(verifySandboxCharge({...charge,state:'Pendiente'},p,q)).toBe('pending');
 for(const bad of [{...charge,amount:1},{...charge,livemode:true},{...charge,id:'chr_live_fixture'},{...charge,metadata:{}}])expect(()=>verifySandboxCharge(bad,p,q)).toThrow();
});
