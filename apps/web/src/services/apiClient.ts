// apiClient — the single HTTP client for talking to the HeroPad API.
// ---------------------------------------------------------------------------
// One configurable base URL (VITE_API_BASE_URL) so the move to native / a new
// domain is a one-line env change, never a code change. All NEW loyalty calls
// go through here. (The existing claim flow still uses lib/api.ts; we converge
// them post-validation rather than risk the working flow now.)
//
// Returns typed errors carrying a machine-readable `code` + HTTP `status` so
// callers can render targeted UI without string-matching messages.

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8787';

export interface ApiClientError extends Error {
  code: string;
  status: number;
  /** Extra fields the endpoint returned alongside the error. */
  details?: Record<string, unknown>;
}

function makeError(message: string, code: string, status: number): ApiClientError {
  const err = new Error(message) as ApiClientError;
  err.code = code;
  err.status = status;
  return err;
}

interface ApiErrorBody {
  error?: string;
  message?: string;
}

async function request<TRes>(path: string, init?: RequestInit, token?: string): Promise<TRes> {
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw makeError(
      `Cannot reach the HeroPad API at ${API_BASE_URL}.`,
      'network_error',
      0
    );
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok) {
    const body = (data as ApiErrorBody | null) ?? {};
    const err = makeError(
      body.message ?? `Request failed with ${res.status}`,
      body.error ?? 'unknown_error',
      res.status
    );
    err.details = (data as Record<string, unknown>) ?? undefined;
    throw err;
  }

  return data as TRes;
}

/** GET <base>/path, parsed as JSON. Pass a Privy access token for authed routes. */
export function getJson<TRes>(path: string, token?: string): Promise<TRes> {
  return request<TRes>(path, undefined, token);
}

/** POST <base>/path with a JSON body, parsed as JSON. Pass a token for authed routes. */
export function postJson<TReq, TRes>(path: string, body: TReq, token?: string): Promise<TRes> {
  return request<TRes>(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    token
  );
}

/** PUT <base>/path with a JSON body, parsed as JSON. Pass a token for authed routes. */
export function putJson<TReq, TRes>(path: string, body: TReq, token?: string): Promise<TRes> {
  return request<TRes>(
    path,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    token
  );
}

/** Exposed for display / debugging (e.g. error messages). */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
