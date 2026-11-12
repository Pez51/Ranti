import { it,expect } from 'vitest';
import { financeDocumentHtml } from './finance-documents';
it('renders a printable operational receipt without executing user HTML',()=>{
 const html=financeDocumentHtml({kind:'buyer',operation_id:'op-1',title:'<script>alert(1)</script>',currency:'PEN',test_notice:'PRUEBA NO TRIBUTARIA',payment:{status:'pending',mode:'simulated'},amounts:{price:'36.00',service_charge:'4.00',total:'40.00',guarantee_declared:'100.00',guarantee_charged:'0.00'},total_paid:'0.00'});
 expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).toContain('Cargo de servicio único');expect(html).toContain('Total pagado de prueba');expect(html).toContain('PRUEBA NO TRIBUTARIA');
});
