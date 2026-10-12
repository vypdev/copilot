import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { logInfo } from '../application/ports/logging_ports';

export const COMMUNICATION_BUDGET_PATH = 'src/architecture/github_communication_test_budget.json';
const MAX_BYTES = 512 * 1024;
const SPEC_PATHS = ['specs/semantic-github-publication-and-notification.md', 'specs/repository-locale-and-localization.md'];
// Execute only the Action's bundled validator; merged branch scripts are never loaded.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const validator = require('../../scripts/validate-github-communication-test-budget.cjs') as {
    validateCommunicationTestBudget(root: string, ledger: unknown): string[];
};
interface Budget { readonly files: readonly { readonly path: string; readonly qualifyingCases: number }[]; readonly allocatedCases: number; }
interface Ledger { readonly budgets: readonly Budget[]; }

/** Derives totals only within an already-authorized ledger conflict; never changes evidence or minimums. */
export function refreshBranchSyncCommunicationBudget(repositoryRoot: string): boolean {
    let phase: BudgetRejectionPhase = 'workspace-boundary';
    try {
        const root = realpathSync(repositoryRoot);
        for (const directory of ['src', 'src/architecture']) {
            const stat = lstatSync(join(root, directory));
            if (!stat.isDirectory() || stat.isSymbolicLink()) return reject(phase);
        }
        phase = 'ledger-file-boundary';
        const path = join(root, COMMUNICATION_BUDGET_PATH);
        if (!boundedFile(root, path)) return reject(phase);
        phase = 'metadata-json';
        const source = readFileSync(path, 'utf8');
        if (/^(?:<{7}|={7}|>{7})(?: |$)/m.test(source)) phase = 'metadata-conflict-markers';
        const value: unknown = JSON.parse(source);
        phase = 'metadata-shape';
        if (!isLedger(value)) return reject(phase);
        phase = 'evidence-path-boundary';
        for (const file of [...SPEC_PATHS, ...value.budgets.flatMap(budget => budget.files.map(entry => entry.path))]) {
            if (!boundedFile(root, join(root, file))) return reject(phase);
        }
        const normalized = { ...value, budgets: value.budgets.map(budget => ({ ...budget,
            allocatedCases: budget.files.reduce((sum, entry) => sum + entry.qualifyingCases, 0),
        })) };
        phase = 'ledger-contract';
        if (validator.validateCommunicationTestBudget(root, normalized).length > 0) return reject(phase);
        phase = 'ledger-output';
        const output = JSON.stringify(normalized, null, 2) + '\n';
        if (Buffer.byteLength(output, 'utf8') > MAX_BYTES) return reject(phase);
        if (value.budgets.some((budget, index) => budget.allocatedCases !== normalized.budgets[index].allocatedCases)) {
            writeFileSync(path, output, 'utf8');
        }
        return true;
    } catch { return reject(phase); }
}

function isLedger(value: unknown): value is Ledger {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const budgets = (value as Partial<Ledger>).budgets;
    return Array.isArray(budgets) && budgets.length === 2 && budgets.every(budget =>
        budget && Number.isSafeInteger(budget.allocatedCases) && budget.allocatedCases >= 0
        && Array.isArray(budget.files) && budget.files.length > 0 && budget.files.length <= 256
        && budget.files.every((entry: Budget['files'][number]) => entry && typeof entry.path === 'string'
            && /^src\/.+\.test\.ts$/u.test(entry.path) && !entry.path.split('/').includes('..')
            && Number.isSafeInteger(entry.qualifyingCases) && entry.qualifyingCases > 0 && entry.qualifyingCases <= 10_000));
}
function boundedFile(root: string, file: string): boolean {
    const stat = lstatSync(file);
    const target = relative(root, realpathSync(file));
    return stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_BYTES
        && target !== '..' && !target.startsWith(`..${sep}`) && !isAbsolute(target);
}
type BudgetRejectionPhase = 'workspace-boundary' | 'ledger-file-boundary' | 'metadata-json' | 'metadata-conflict-markers'
    | 'metadata-shape' | 'evidence-path-boundary' | 'ledger-contract' | 'ledger-output';
function reject(phase: BudgetRejectionPhase): false {
    logInfo(`Branch synchronization communication budget rejected (${phase}).`);
    return false;
}
