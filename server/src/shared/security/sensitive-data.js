const forbiddenKeys = new Set(['password', 'token', 'otp', 'pan', 'cvv']);

export function assertNoSensitiveKeys(value, sourceLabel) {
  const visited = new WeakSet();

  function inspect(current) {
    if (current === null || typeof current !== 'object' || visited.has(current)) return;
    visited.add(current);

    if (Array.isArray(current)) {
      for (const item of current) inspect(item);
      return;
    }

    for (const [key, nested] of Object.entries(current)) {
      if (forbiddenKeys.has(key.toLowerCase())) {
        const error = new Error(`Sensitive data is not allowed in ${sourceLabel}.`);
        error.code = 'AUDIT_SENSITIVE_DATA';
        throw error;
      }
      inspect(nested);
    }
  }

  inspect(value);
}
