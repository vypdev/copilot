import type { SetupTokenPermissionCheck, SetupTokenPermissionRequirement } from '../domain/setup_token_permissions';

export type ProbeMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** One bounded GitHub request; provider bodies and authorization never escape. */
export class SetupPermissionProbeHttp {
    constructor(
        private readonly fetcher: typeof fetch,
        private readonly token: string,
        private readonly timeoutMs: number,
    ) {}

    async request(url: string, method: ProbeMethod = 'GET', body?: unknown): Promise<Response> {
        if (!url.startsWith('https://api.github.com/')) throw new ProbeFailure('Invalid GitHub probe target.');
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
                controller.abort();
                reject(new Error('Probe request timeout.'));
            }, this.timeoutMs);
        });
        try {
            return await Promise.race([this.fetchAndRead(url, method, body, controller.signal), deadline]);
        } catch {
            throw new ProbeFailure(`GitHub ${method} did not complete or timed out.`);
        } finally {
            if (timeout) clearTimeout(timeout);
        }
    }

    private async fetchAndRead(url: string, method: ProbeMethod, body: unknown, signal: AbortSignal): Promise<Response> {
        const response = await this.fetcher(url, {
            method,
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2026-03-10',
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal,
            redirect: 'error',
        });
        if (response.status >= 300 || response.status === 204 || response.status === 205) return response;
        // Consume the complete body while the request deadline and abort signal
        // are still active. A fixture response may expose json() but no text().
        const payload = typeof response.text === 'function' ? await response.text() : await response.json();
        return {
            status: response.status,
            ok: response.ok,
            headers: response.headers,
            json: async () => typeof payload === 'string' ? JSON.parse(payload) as unknown : payload,
        } as Response;
    }

    async expect(url: string, method: ProbeMethod, statuses: readonly number[], body?: unknown): Promise<Response> {
        const response = await this.request(url, method, body);
        if (!statuses.includes(response.status)) {
            throw new ProbeFailure(`GitHub ${method} returned HTTP ${response.status}.`, response.status);
        }
        return response;
    }
}

export class ProbeFailure extends Error {
    constructor(message: string, readonly httpStatus?: number, readonly cleanupPending = false) { super(message); }
}

export class ProbeCollision extends ProbeFailure {}

export async function probeJsonRecord(response: Response): Promise<Record<string, unknown>> {
    try {
        const value: unknown = await response.json();
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch { /* Map malformed provider data to a bounded error. */ }
    throw new ProbeFailure('GitHub returned an invalid response shape.');
}

export function writeProbeFailure(requirement: SetupTokenPermissionRequirement, error: unknown): SetupTokenPermissionCheck {
    const failure = error instanceof ProbeFailure ? error : new ProbeFailure('The temporary permission check could not complete.');
    return {
        ...requirement,
        status: failure.httpStatus === 401 ? 'missing' : 'unverifiable',
        message: failure.message,
        ...(failure.cleanupPending ? { cleanupPending: true } : {}),
        ...(failure instanceof ProbeCollision ? { incident: 'secret-collision' as const } : {}),
    };
}
