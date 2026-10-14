export type SetupCommandPath = '/api/answer' | '/api/retry-discovery' | '/api/back' | '/api/cancel'
  | '/api/takeover' | '/api/close' | '/api/doctor';
export interface SetupBootstrap { readonly controller: boolean; readonly capability?: string }

/** Same-origin command transport. Credentials are supplied per request and never retained here. */
export async function postSetupCommand(path: SetupCommandPath, body: Readonly<Record<string, unknown>>,
  credentials: Readonly<{ sessionKey?: string; capability?: string }>): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Setup-Session-Key': credentials.sessionKey,
      ...(credentials.capability ? { 'X-Setup-Capability': credentials.capability } : {}) },
    body: JSON.stringify(body),
  } as RequestInit);
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data.error ?? 'The request was rejected.'));
  return data;
}
