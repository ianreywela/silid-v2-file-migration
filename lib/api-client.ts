"use client";

import { useCallback, useMemo } from "react";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || `Request failed (${response.status})`);
  }

  return data;
}

export function useApiClient() {
  const fetch = useCallback(
    (path: string, options: RequestInit = {}) => apiFetch(path, options),
    [],
  );

  return useMemo(() => ({ fetch }), [fetch]);
}
