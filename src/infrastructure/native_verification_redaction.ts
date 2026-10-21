import { StringDecoder } from 'node:string_decoder';

const SECRET_KEY = /(?:TOKEN|SECRET|API_KEY|PASSWORD|AUTH_JSON)/iu;

export function nativeWorkerSecrets(environment: NodeJS.ProcessEnv): string[] {
    const values = Object.entries(environment).filter(([key, value]) => SECRET_KEY.test(key) && value).map(([,value]) => value!);
    if (environment.INPUT_VARS_JSON) {
        try {
            const inputs = JSON.parse(environment.INPUT_VARS_JSON) as Record<string, unknown>;
            for (const [key, value] of Object.entries(inputs)) if (SECRET_KEY.test(key) && typeof value === 'string') values.push(value);
        } catch { /* The existing input parser reports invalid configuration without raw values. */ }
    }
    return [...new Set(values.flatMap(value => [value, ...value.split(/[\r\n]/u)]).filter(value => value.length >= 3))].sort((a,b) => b.length - a.length);
}

/** Secrets are removed before bytes reach a private log file, not merely masked in the runner UI. */
export function redactNativeWorkerLogs(environment: NodeJS.ProcessEnv = process.env): () => void {
    const secrets = nativeWorkerSecrets(environment);
    const restores: (() => void)[] = [];
    for (const stream of [process.stdout, process.stderr]) {
        const original = stream.write;
        const decoder = new StringDecoder('utf8');
        let pending = '';
        const emit = (line: string): void => {
            const command = /^::add-mask::(.*?)(?:\r?\n)?$/u.exec(line);
            if (command) {
                const value = command[1].replace(/%0D/gu, '\r').replace(/%0A/gu, '\n').replace(/%25/gu, '%');
                secrets.push(...value.split(/[\r\n]/u).filter(part => part.length >= 3));
                return;
            }
            for (const secret of secrets) line = line.split(secret).join('[REDACTED]');
            original.call(stream, line);
        };
        stream.write = ((chunk: string | Uint8Array, encoding?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void): boolean => {
            pending += typeof chunk === 'string' ? chunk : decoder.write(Buffer.from(chunk));
            let end: number;
            while ((end = pending.indexOf('\n')) >= 0) { const line = pending.slice(0, end + 1); pending = pending.slice(end + 1); emit(line); }
            if (pending.length > 1_048_576) throw new Error('Copilot worker log line exceeded its fixed limit.');
            if (typeof encoding === 'function') encoding(); else callback?.();
            return true;
        }) as typeof stream.write;
        restores.push(() => { pending += decoder.end(); if (pending) emit(pending); stream.write = original; });
    }
    return () => { for (const restore of restores) restore(); };
}
