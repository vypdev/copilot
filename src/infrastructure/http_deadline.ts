/** Bounds headers and body consumption even when a transport ignores AbortSignal. */
export async function withHttpDeadline<T>(
    timeoutMs: number,
    operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
    const controller = new AbortController();
    let timeout!: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
            controller.abort();
            reject(new Error('HTTP request timed out.'));
        }, timeoutMs);
    });
    try {
        return await Promise.race([operation(controller.signal), deadline]);
    } finally {
        clearTimeout(timeout);
    }
}

/** Buffer once inside the deadline; metadata can then be inspected without re-consuming fetch's body. */
export async function bufferHttpResponse(response: Response): Promise<Response> {
    if (response.status === 204 || response.status === 205) return response;
    const payload: unknown = typeof response.text === 'function' ? await response.text() : await response.json();
    return {
        status: response.status,
        ok: response.ok,
        headers: response.headers,
        json: async () => typeof payload === 'string' ? JSON.parse(payload) as unknown : payload,
    } as Response;
}
