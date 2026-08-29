let loggerDebug = false;
let loggerRemote = false;
let structuredLogging = false;

export interface LogEntry {
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
}

const accumulatedLogEntries: LogEntry[] = [];
const MAX_LOG_MESSAGE_LENGTH = 8000;
const SENSITIVE_KEY_PATTERN = /(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization|private[_-]?key|(?:^|[_-])(token|credential|pat)(?:$|[_-]))/i;
const SENSITIVE_ENVIRONMENT_KEY_PATTERN = /(api[_-]?key|api[_-]?token|access[_-]?token|refresh[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?key|password|(?:^|[_-])(?:token|pat)(?:$|[_-]))$/i;
const SENSITIVE_ENVIRONMENT_KEYS = [
    'PAT',
    'PERSONAL_ACCESS_TOKEN',
    'GITHUB_TOKEN',
    'CODEX_ACCESS_TOKEN',
    'OPENAI_API_KEY',
    'OPENCODE_API_KEY',
    'CURSOR_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
    'OPENROUTER_API_KEY',
];

/** Removes markdown code fences from message so log output does not break when visualized (e.g. GitHub Actions). */
function sanitizeLogMessage(message: string): string {
    let sanitized = message.replace(/```/g, '');
    const environmentKeys = new Set([
        ...SENSITIVE_ENVIRONMENT_KEYS,
        ...Object.keys(process.env).filter((key) => SENSITIVE_ENVIRONMENT_KEY_PATTERN.test(key)),
    ]);
    for (const key of environmentKeys) {
        const value = process.env[key]?.trim();
        if (value && value.length >= 6) {
            sanitized = sanitized.split(value).join('[REDACTED]');
        }
    }
    sanitized = sanitized.replace(
        /(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization)(\s*[:=]\s*)(["']?)[^\s,"'}\]]+\3/gi,
        '$1$2[REDACTED]',
    );
    return sanitized.length > MAX_LOG_MESSAGE_LENGTH
        ? `${sanitized.slice(0, MAX_LOG_MESSAGE_LENGTH)}… [truncated]`
        : sanitized;
}

function sanitizeMetadataValue(value: unknown, key?: string): unknown {
    if (key && SENSITIVE_KEY_PATTERN.test(key)) return '[REDACTED]';
    if (typeof value === 'string') return sanitizeLogMessage(value);
    if (Array.isArray(value)) return value.map((item) => sanitizeMetadataValue(item));
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([entryKey, entryValue]) => [
                entryKey,
                sanitizeMetadataValue(entryValue, entryKey),
            ]),
        );
    }
    return value;
}

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
    return metadata === undefined
        ? undefined
        : sanitizeMetadataValue(metadata) as Record<string, unknown>;
}

function pushLogEntry(entry: LogEntry): void {
    accumulatedLogEntries.push(entry);
}

export function getAccumulatedLogEntries(): LogEntry[] {
    return [...accumulatedLogEntries];
}

export function getAccumulatedLogsAsText(): string {
    return accumulatedLogEntries
        .map((e) => {
            const prefix = `[${e.level.toUpperCase()}]`;
            const meta = e.metadata?.stack ? `\n${String(e.metadata.stack)}` : '';
            return `${prefix} ${e.message}${meta}`;
        })
        .join('\n');
}

export function clearAccumulatedLogs(): void {
    accumulatedLogEntries.length = 0;
}

export function setGlobalLoggerDebug(debug: boolean, isRemote: boolean = false) {
    loggerDebug = debug;
    loggerRemote = isRemote;
}

export function setStructuredLogging(enabled: boolean) {
    structuredLogging = enabled;
}

function formatStructuredLog(entry: LogEntry): string {
    return JSON.stringify(entry);
}

function emitLog(
    entry: LogEntry,
    writer: (message: string) => void,
    previousWasSingleLine = false,
    skipAccumulation = false,
): void {
    if (!skipAccumulation) pushLogEntry(entry);
    if (previousWasSingleLine && !loggerRemote && !structuredLogging) console.log();
    writer(structuredLogging ? formatStructuredLog(entry) : entry.message);
}

export function logInfo(message: string, previousWasSingleLine: boolean = false, metadata?: Record<string, unknown>, skipAccumulation?: boolean) {
    const sanitized = sanitizeLogMessage(message);
    const sanitizedMetadata = sanitizeMetadata(metadata);
    emitLog(
        { level: 'info', message: sanitized, timestamp: Date.now(), metadata: sanitizedMetadata },
        console.log,
        previousWasSingleLine,
        skipAccumulation,
    );
}

export function logWarn(message: string, metadata?: Record<string, unknown>) {
    const sanitized = sanitizeLogMessage(message);
    const sanitizedMetadata = sanitizeMetadata(metadata);
    emitLog(
        { level: 'warn', message: sanitized, timestamp: Date.now(), metadata: sanitizedMetadata },
        console.warn,
    );
}

export function logWarning(message: string) {
    logWarn(message);
}

export function logError(message: unknown, metadata?: Record<string, unknown>) {
    const errorMessage = message instanceof Error ? message.message : String(message);
    const sanitized = sanitizeLogMessage(errorMessage);
    const metaWithStack = sanitizeMetadata({
        ...metadata,
        stack: message instanceof Error ? message.stack : undefined
    });
    emitLog(
        { level: 'error', message: sanitized, timestamp: Date.now(), metadata: metaWithStack },
        console.error,
    );
}

export function logDebugInfo(message: string, previousWasSingleLine: boolean = false, metadata?: Record<string, unknown>) {
    if (loggerDebug) {
        const sanitized = sanitizeLogMessage(message);
        const sanitizedMetadata = sanitizeMetadata(metadata);
        emitLog(
            { level: 'debug', message: sanitized, timestamp: Date.now(), metadata: sanitizedMetadata },
            console.log,
            previousWasSingleLine,
        );
    }
}

export function logDebugWarning(message: string) {
    if (loggerDebug) {
        logWarning(message);
    }
}

export function logDebugError(message: unknown) {
    if (loggerDebug) {
        logError(message);
    }
}
