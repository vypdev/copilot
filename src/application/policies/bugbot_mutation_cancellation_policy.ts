import type { BugbotScmPorts } from '../ports/bugbot_scm_ports';

/** Stop new semantic operations; an already issued request may still finish. */
export function guardBugbotMutationPorts(ports: BugbotScmPorts, signal?: AbortSignal): BugbotScmPorts {
    if (!signal) return ports;
    const cancellation = signal;
    const guarded = new WeakMap<object, object>();
    function guard<T extends object>(port: T): T {
        const existing = guarded.get(port);
        if (existing) return existing as T;
        // Inherit the port rather than proxying it directly: frozen adapters
        // must still permit wrapped method reads without proxy-invariant errors.
        const proxy = new Proxy(Object.create(port) as T, { get(_target, key) {
            const value: unknown = Reflect.get(port, key, port);
            if (typeof value === 'function') return (...args: unknown[]) => {
                cancellation.throwIfAborted();
                return Reflect.apply(value, port, args);
            };
            return value && typeof value === 'object' ? guard(value) : value;
        }, ownKeys: () => Reflect.ownKeys(port), getOwnPropertyDescriptor(_target, key) {
            const descriptor = Reflect.getOwnPropertyDescriptor(port, key);
            return descriptor ? { ...descriptor, configurable: true } : undefined;
        } });
        guarded.set(port, proxy);
        return proxy;
    }
    return { ...ports, publication: guard(ports.publication), resolution: guard(ports.resolution),
        reconciliation: { ...ports.reconciliation, presentation: guard(ports.reconciliation.presentation) } };
}
