import OperationPending from './OperationPending';

export default function EntregaOTP() {
  return (
    <OperationPending title="Confirmación de entrega no disponible">
      <p>La confirmación de entrega desde esta pantalla todavía no está habilitada.</p>
      <p>No se ha registrado ninguna entrega ni se ha activado un contrato. La operación deberá estar lista para entrega y contar con la confirmación de ambas partes.</p>
    </OperationPending>
  );
}
