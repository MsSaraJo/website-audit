'use client';
import { useEffect, useState } from 'react';

const KEY = 'mssarajo-admin-token';

export function useAdminToken() {
  const [token, setTokenState] = useState('');
  useEffect(() => { setTokenState(window.localStorage.getItem(KEY) ?? ''); }, []);
  function setToken(value: string) {
    setTokenState(value);
    if (value) window.localStorage.setItem(KEY, value);
    else window.localStorage.removeItem(KEY);
  }
  return { token, setToken };
}
