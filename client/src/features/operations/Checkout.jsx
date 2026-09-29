import OperationPending from './OperationPending';

export default function Checkout() {
  return (
    <OperationPending title="Pagos aún no disponibles">
      <p>Los pagos y las garantías todavía no están habilitados en Ranti.</p>
      <p>No se ha realizado ningún cobro ni se ha retenido una garantía. Esta pantalla no confirma tu reserva.</p>
      <p>Cuando el servicio esté disponible podrás consultar el importe de tu operación y continuar con el pago.</p>
    </OperationPending>
  );
}
