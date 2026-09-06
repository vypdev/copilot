import type {
    SetupCredentialCheck,
    SetupCredentialRequirement,
} from '../domain/setup';
import type { SetupCredentialValidationPort } from '../application/ports/setup_wizard_ports';

export interface SetupCredentialValidationOptions {
    fetcher?: typeof fetch;
    timeoutMs?: number;
}

/**
 * Performs bounded, metadata-only credential checks. Provider responses are
 * intentionally never returned or logged because they can contain account data.
 */
export class SetupCredentialValidationAdapter implements SetupCredentialValidationPort {
    private readonly fetcher: typeof fetch;
    private readonly timeoutMs: number;

    constructor(options: SetupCredentialValidationOptions = {}) {
        this.fetcher = options.fetcher ?? fetch;
        this.timeoutMs = options.timeoutMs ?? 10_000;
    }

    async validateSetupPat(owner: string, repository: string, token: string): Promise<SetupCredentialCheck> {
        try {
            const user = await this.requestJson('https://api.github.com/user', {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
            });
            const account = typeof user.login === 'string' ? user.login : undefined;
            await this.requestJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`, {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
            });
            return { name: 'SETUP_PAT', status: 'valid', message: 'GitHub identity and repository access verified.', account };
        } catch (error) {
            return { name: 'SETUP_PAT', status: classifyError(error), message: safeMessage(error) };
        }
    }

    async validateCredential(requirement: SetupCredentialRequirement, value: string): Promise<SetupCredentialCheck> {
        const endpoint = endpointFor(requirement);
        if (!endpoint) {
            return { name: requirement.name, status: 'unverifiable', message: 'This provider does not expose a safe metadata-only validation endpoint.' };
        }
        try {
            const headers: Record<string, string> = { Accept: 'application/json' };
            const init: RequestInit = { method: 'GET', headers };
            if (endpoint.auth === 'bearer') headers.Authorization = `Bearer ${value}`;
            if (endpoint.auth === 'x-api-key') headers['x-api-key'] = value;
            if (endpoint.auth === 'query') endpoint.url.searchParams.set('key', value);
            if (endpoint.auth === 'basic') headers.Authorization = `Basic ${Buffer.from(`${value}:`).toString('base64')}`;
            if (requirement.provider === 'anthropic') headers['anthropic-version'] = '2023-06-01';
            const response = await this.requestJson(endpoint.url.toString(), headers, init);
            if (requirement.model && !modelIsAvailable(response, requirement.model, requirement.provider)) {
                return { name: requirement.name, status: 'invalid', message: `Credential is valid, but model ${requirement.model} is not available to it.` };
            }
            return { name: requirement.name, status: 'valid', message: 'Provider metadata request succeeded.' };
        } catch (error) {
            return { name: requirement.name, status: classifyError(error), message: safeMessage(error) };
        } finally {
            if (endpoint.auth === 'query') endpoint.url.searchParams.delete('key');
        }
    }

    private async requestJson(url: string, headers: Record<string, string>, init: RequestInit = {}): Promise<Record<string, unknown>> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetcher(url, { ...init, headers, signal: controller.signal });
            if (!response.ok) throw new CredentialHttpError(response.status);
            const body: unknown = await response.json();
            return body && typeof body === 'object' ? body as Record<string, unknown> : {};
        } finally {
            clearTimeout(timeout);
        }
    }
}

interface CredentialEndpoint {
    url: URL;
    auth: 'bearer' | 'x-api-key' | 'query' | 'basic';
}

function endpointFor(requirement: SetupCredentialRequirement): CredentialEndpoint | undefined {
    switch (requirement.name) {
        case 'OPENAI_API_KEY':
        case 'CODEX_ACCESS_TOKEN':
            return { url: new URL('https://api.openai.com/v1/models'), auth: 'bearer' };
        case 'ANTHROPIC_API_KEY':
            return { url: new URL('https://api.anthropic.com/v1/models'), auth: 'x-api-key' };
        case 'GOOGLE_API_KEY':
            return { url: new URL('https://generativelanguage.googleapis.com/v1beta/models'), auth: 'query' };
        case 'OPENROUTER_API_KEY':
            return { url: new URL('https://openrouter.ai/api/v1/models'), auth: 'bearer' };
        case 'CURSOR_API_KEY':
            return { url: new URL('https://api.cursor.com/analytics/ai-code/changes?startDate=30d&page=1&pageSize=1'), auth: 'basic' };
        case 'OPENCODE_API_KEY':
            return { url: new URL('https://opencode.ai/zen/v1/models'), auth: 'bearer' };
        default:
            return undefined;
    }
}

function modelIsAvailable(payload: Record<string, unknown>, model: string, provider?: string): boolean {
    const data = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
    if (data.length === 0) return true;
    const normalized = model.replace(/^models\//, '').toLowerCase();
    return data.some(item => {
        if (!item || typeof item !== 'object') return false;
        const candidate = item as Record<string, unknown>;
        const id = String(candidate.id ?? candidate.name ?? '').replace(/^models\//, '').toLowerCase();
        return id === normalized || (provider === 'google' && id.endsWith(`/${normalized}`));
    });
}

class CredentialHttpError extends Error {
    constructor(readonly status: number) {
        super(`Provider rejected the credential (HTTP ${status}).`);
    }
}

function classifyError(error: unknown): SetupCredentialCheck['status'] {
    if (error instanceof CredentialHttpError && (error.status === 401 || error.status === 403)) return 'invalid';
    if (error instanceof CredentialHttpError && error.status >= 400 && error.status < 500) return 'invalid';
    return 'unverifiable';
}

function safeMessage(error: unknown): string {
    if (error instanceof CredentialHttpError) return error.message;
    if (error instanceof DOMException && error.name === 'AbortError') return 'Validation timed out.';
    return 'Provider validation could not be completed. Check network access and try again.';
}
