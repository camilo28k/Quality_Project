'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from './api';

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'No se pudo cargar la información');

/** Carga datos de la API con estados de carga y error explícitos. */
export function useApiData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<T>(path)
      .then((d) => active && setData(d))
      .catch((e: unknown) => active && setError(messageOf(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [path]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<T>(path));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }, [path]);

  return { data, error, loading, reload };
}
