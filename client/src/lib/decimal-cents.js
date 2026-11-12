export function decimalCents(value) {
  if (!/^\d{1,8}(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const [integer, fraction = ''] = value.trim().replace(',', '.').split('.');
  return String(BigInt(integer) * 100n + BigInt(fraction.padEnd(2, '0')));
}
