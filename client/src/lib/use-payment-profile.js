import { useEffect, useState } from 'react';
import { apiRequest } from './api';

export function usePaymentProfile(token) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    apiRequest('/users/me/payment-profile', { token, signal: controller.signal })
      .then(profile => { if (!controller.signal.aborted) setResult({ token, profile }); })
      .catch(failure => { if (!controller.signal.aborted) setResult({ token, error: failure.message }); });
    return () => controller.abort();
  }, [token]);
  return {
    profile: result?.token === token ? result?.profile : null,
    error: result?.token === token ? result?.error : null,
    setProfile: profile => setResult({ token, profile }),
  };
}
