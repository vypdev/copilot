/** Conservative structural evidence only; never evaluates expressions or expands matrices. */
export function doctorWorkflowMatrix(strategy: unknown): boolean | undefined {
    if (strategy === undefined) return true;
    if (!record(strategy)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(strategy, 'matrix')) return true;
    const matrix = strategy.matrix;
    if (!record(matrix)) return undefined;
    const axes = Object.entries(matrix);
    if (!axes.length || axes.some(([key]) => key === 'include' || key === 'exclude')) return undefined;
    if (axes.some(([, values]) => Array.isArray(values) && values.length === 0)) return false;
    if (!axes.every(([, values]) => Array.isArray(values) && values.every(value =>
        typeof value === 'string' ? !value.includes('${{')
            : typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)))) return undefined;
    let combinations = 1;
    for (const [, values] of axes) {
        const length = (values as readonly unknown[]).length;
        // Bound arithmetic before multiplying; do not expand the Cartesian product.
        if (combinations > 256 / length) return false;
        combinations *= length;
    }
    return true;
}
function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
