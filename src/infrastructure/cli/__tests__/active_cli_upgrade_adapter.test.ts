import { accessSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { ActiveCliUpgradeAdapter, resolveCliExecutable, type CliUpgradeProcess } from '../active_cli_upgrade_adapter';
import { COPILOT_PACKAGE_NAME } from '../copilot_package';

const roots: string[] = [];
const windows = process.platform === 'win32';
const commandName = (name: string) => windows ? `${name}.cmd` : name;

afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function writeExecutable(path: string, source: string): void {
    mkdirSync(dirname(path), { recursive: true });
    if (windows) {
        const script = `${path}.js`;
        writeFileSync(script, source);
        writeFileSync(path, `@"${process.execPath}" "${script}" %*\r\n`);
    } else {
        writeFileSync(path, `#!${process.execPath}\n${source}`, { mode: 0o700 });
    }
}

function fixture(first: 'npm' | 'pnpm' = 'npm') {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'copilot-upgrade-')));
    roots.push(root);
    const npmPrefix = join(root, 'npm prefix');
    const npmBin = windows ? npmPrefix : join(npmPrefix, 'bin');
    const npmModules = join(npmPrefix, ...(windows ? [] : ['lib']), 'node_modules');
    const pnpmBin = join(root, 'pnpm home');
    const pnpmModules = join(pnpmBin, 'global', '5', 'node_modules');
    const npmPackage = join(npmModules, '@vypdev', 'copilot');
    const pnpmPackage = join(pnpmModules, '@vypdev', 'copilot');
    const pnpmStore = join(pnpmModules, '.pnpm', '@vypdev+copilot@3.7.0', 'node_modules', '@vypdev', 'copilot');
    const log = join(root, 'manager-calls.jsonl');

    for (const [packageRoot, version] of [[npmPackage, '3.3.1'], [pnpmStore, '3.7.0']]) {
        mkdirSync(join(packageRoot, 'build', 'cli'), { recursive: true });
        writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
            name: COPILOT_PACKAGE_NAME, version, bin: { copilot: 'build/cli/index.js' },
        }));
        writeFileSync(join(packageRoot, 'build', 'cli', 'index.js'),
            `console.log(JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '../../package.json'), 'utf8')).version);`);
    }
    mkdirSync(dirname(pnpmPackage), { recursive: true });
    symlinkSync(pnpmStore, pnpmPackage, windows ? 'junction' : 'dir');
    for (const [bin, packagePath] of [[npmBin, npmPackage], [pnpmBin, pnpmPackage]]) {
        const command = join(bin, commandName('copilot'));
        mkdirSync(bin, { recursive: true });
        if (bin === npmBin && !windows) {
            const entry = join(packagePath, 'build', 'cli', 'index.js');
            writeFileSync(entry, `#!${process.execPath}\n${readFileSync(entry, 'utf8')}`, { mode: 0o700 });
            chmodSync(entry, 0o700);
            symlinkSync(entry, command);
        } else {
            writeExecutable(command, `require(${JSON.stringify(join(packagePath, 'build', 'cli', 'index.js'))});`);
        }
    }
    for (const [manager, bin, modules, packagePath] of [
        ['npm', npmBin, npmModules, npmPackage], ['pnpm', pnpmBin, pnpmModules, pnpmPackage],
    ]) {
        writeExecutable(join(bin, commandName(manager)), `
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({manager:${JSON.stringify(manager)},args}) + '\\n');
if (args[0] === 'root') console.log(${JSON.stringify(modules)});
else if (args[0] === 'bin') console.log(${JSON.stringify(bin)});
else if (args[0] === 'view') console.log(JSON.stringify('3.8.0'));
else if (args[0] === 'install' || args[0] === 'add') {
  if (${JSON.stringify(manager)} === 'pnpm') {
    const next = ${JSON.stringify(pnpmStore.replace('@3.7.0', '@3.8.0'))};
    fs.cpSync(${JSON.stringify(pnpmStore)}, next, {recursive:true});
    fs.rmSync(${JSON.stringify(pnpmPackage)}, {force:true});
    fs.symlinkSync(next, ${JSON.stringify(pnpmPackage)}, ${JSON.stringify(windows ? 'junction' : 'dir')});
  }
  const file = ${JSON.stringify(join(packagePath, 'package.json'))};
  const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
  metadata.version = args.at(-1).slice(args.at(-1).lastIndexOf('@') + 1);
  fs.writeFileSync(file, JSON.stringify(metadata));
} else process.exitCode = 1;
`);
    }
    // Only fixture managers can execute: a detection regression cannot reach a real installer.
    const environment = { ...process.env, PATH: [first === 'npm' ? npmBin : pnpmBin, first === 'npm' ? pnpmBin : npmBin].join(delimiter) };
    const entrypoint = join(first === 'npm' ? npmPackage : pnpmPackage, 'build', 'cli', 'index.js');
    const readVersion = (packagePath: string) => JSON.parse(readFileSync(join(packagePath, 'package.json'), 'utf8')).version;
    const calls = () => readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as {manager:string;args:string[]});
    return { root, environment, entrypoint, npmPackage, pnpmPackage, npmPrefix, npmBin, pnpmBin, pnpmModules, readVersion, calls };
}

describe('active CLI upgrade', () => {
    it('updates and verifies npm when both npm and pnpm are installed and npm is first on PATH', async () => {
        const f = fixture();
        const result = await new ActiveCliUpgradeAdapter(f).upgrade();
        expect(result).toEqual({ version: '3.8.0', packageManager: 'npm', executablePath: join(f.npmBin, commandName('copilot')) });
        expect(f.readVersion(f.npmPackage)).toBe('3.8.0');
        expect(f.readVersion(f.pnpmPackage)).toBe('3.7.0');
        expect(f.calls()).toContainEqual({ manager: 'npm', args: ['install', '--global', '--prefix', f.npmPrefix, '@vypdev/copilot@3.8.0'] });
        expect(f.calls().some((call) => call.manager === 'pnpm')).toBe(false);
    });

    it('updates pnpm through its logical package link when pnpm takes priority over npm', async () => {
        const f = fixture('pnpm');
        const originalPackage = realpathSync(f.pnpmPackage);
        const result = await new ActiveCliUpgradeAdapter(f).upgrade();
        expect(result.packageManager).toBe('pnpm');
        expect(result.version).toBe('3.8.0');
        expect(f.readVersion(f.npmPackage)).toBe('3.3.1');
        expect(f.readVersion(f.pnpmPackage)).toBe('3.8.0');
        expect(realpathSync(f.pnpmPackage)).not.toBe(originalPackage);
        expect(f.readVersion(originalPackage)).toBe('3.7.0');
        expect(f.calls()).toContainEqual({ manager: 'pnpm', args: ['add', '--global', '--global-dir', dirname(f.pnpmModules), '--global-bin-dir', f.pnpmBin, '@vypdev/copilot@3.8.0'] });
    });

    it('rejects an invoked installation shadowed by the other command before any mutation', async () => {
        const f = fixture();
        f.entrypoint = join(f.pnpmPackage, 'build', 'cli', 'index.js');
        await expect(new ActiveCliUpgradeAdapter(f).upgrade()).rejects.toThrow('differs from the command on PATH');
        expect(f.calls().some((call) => ['install', 'add', 'view'].includes(call.args[0]))).toBe(false);
        expect(f.readVersion(f.npmPackage)).toBe('3.3.1');
        expect(f.readVersion(f.pnpmPackage)).toBe('3.7.0');
    });

    function stubRun(f: ReturnType<typeof fixture>, behavior: 'no-change' | 'stale-command' | 'registry' | 'install' | 'probe' | 'already-current' | 'changed-path' | 'retarget-link'): CliUpgradeProcess {
        return async (_executable, args) => {
            if (args[0] === 'root') return dirname(dirname(f.npmPackage));
            if (args[0] === 'view') return behavior === 'registry' ? 'invalid version; command' : '"3.8.0"';
            if (args[0] === 'install') {
                if (behavior === 'install') throw new Error('raw provider error with secrets');
                if (behavior !== 'no-change') {
                    const file = join(f.npmPackage, 'package.json');
                    const metadata = JSON.parse(readFileSync(file, 'utf8'));
                    metadata.version = '3.8.0';
                    writeFileSync(file, JSON.stringify(metadata));
                }
                if (behavior === 'changed-path') rmSync(join(f.npmBin, commandName('copilot')));
                if (behavior === 'retarget-link') {
                    rmSync(join(f.npmBin, commandName('copilot')));
                    writeExecutable(join(f.npmBin, commandName('copilot')), 'console.log("3.8.0");');
                }
                return '';
            }
            if (behavior === 'probe') throw new Error('effective command failed');
            return behavior === 'stale-command' ? '3.3.1' : '3.8.0';
        };
    }

    it('does not treat an installer zero exit code as evidence that the package was updated', async () => {
        const f = fixture();
        await expect(new ActiveCliUpgradeAdapter({ ...f, run: stubRun(f, 'no-change') }).upgrade()).rejects.toThrow('effective Copilot version could not be verified');
    });

    it('fails when the updated package version differs from the effective command version', async () => {
        const f = fixture();
        await expect(new ActiveCliUpgradeAdapter({ ...f, run: stubRun(f, 'stale-command') }).upgrade()).rejects.toThrow('installation may already be updated');
        expect(f.readVersion(f.npmPackage)).toBe('3.8.0');
    });

    it('fails verification when the command probe cannot run', async () => {
        const f = fixture();
        await expect(new ActiveCliUpgradeAdapter({ ...f, run: stubRun(f, 'probe') }).upgrade()).rejects.toThrow('Check "copilot --version" and PATH');
    });

    it('fails if updating removes the active command and exposes the other installation', async () => {
        const f = fixture();
        await expect(new ActiveCliUpgradeAdapter({ ...f, run: stubRun(f, 'changed-path') }).upgrade()).rejects.toThrow('effective Copilot version could not be verified');
        expect(f.readVersion(f.pnpmPackage)).toBe('3.7.0');
    });

    it('does not install an unparseable registry version', async () => {
        const f = fixture();
        await expect(new ActiveCliUpgradeAdapter({ ...f, run: stubRun(f, 'registry') }).upgrade()).rejects.toThrow('No installation was changed');
        expect(f.readVersion(f.npmPackage)).toBe('3.3.1');
    });

    it('rejects a valid JSON registry response containing a command instead of a version', async () => {
        const f = fixture();
        const run: CliUpgradeProcess = async (_executable, args) => args[0] === 'root'
            ? dirname(dirname(f.npmPackage)) : '"3.8.0; execute-untrusted-command"';
        await expect(new ActiveCliUpgradeAdapter({ ...f, run }).upgrade()).rejects.toThrow('determine the latest Copilot version');
        expect(f.readVersion(f.npmPackage)).toBe('3.3.1');
    });

    it('rejects a relative pnpm global bin directory before mutation', async () => {
        const f = fixture('pnpm');
        const run = jest.fn(async (_executable: string, args: string[]) => args[0] === 'root' ? f.pnpmModules : 'relative-bin');
        await expect(new ActiveCliUpgradeAdapter({ ...f, run }).upgrade()).rejects.toThrow('could not be matched to npm or pnpm');
        expect(run.mock.calls.some(([, args]) => ['add', 'install', 'view'].includes(args[0]))).toBe(false);
    });

    (windows ? it.skip : it)('rejects an npm command retargeted outside the updated package even at the expected version', async () => {
        const f = fixture();
        await expect(new ActiveCliUpgradeAdapter({ ...f, run: stubRun(f, 'retarget-link') }).upgrade()).rejects.toThrow('effective Copilot version could not be verified');
    });

    it('reports package-manager failure without leaking raw exception details', async () => {
        const f = fixture();
        await expect(new ActiveCliUpgradeAdapter({ ...f, run: stubRun(f, 'install') }).upgrade()).rejects.toThrow('npm upgrade did not complete');
    });

    it('allows a verified latest version that was already installed', async () => {
        const f = fixture();
        const file = join(f.npmPackage, 'package.json');
        const metadata = JSON.parse(readFileSync(file, 'utf8'));
        metadata.version = '3.8.0';
        writeFileSync(file, JSON.stringify(metadata));
        await expect(new ActiveCliUpgradeAdapter({ ...f, run: stubRun(f, 'already-current') }).upgrade()).resolves.toMatchObject({ version: '3.8.0', packageManager: 'npm' });
    });

    it('rejects a local checkout rather than installing another global copy', async () => {
        const f = fixture();
        const local = join(f.root, 'checkout');
        mkdirSync(join(local, 'build'), { recursive: true });
        writeFileSync(join(local, 'package.json'), JSON.stringify({ name: COPILOT_PACKAGE_NAME, version: '3.8.0', bin: { copilot: 'build/cli.js' } }));
        writeFileSync(join(local, 'build', 'cli.js'), '');
        await expect(new ActiveCliUpgradeAdapter({ ...f, entrypoint: join(local, 'build', 'cli.js') }).upgrade()).rejects.toThrow('could not be matched to npm or pnpm');
        expect(f.calls().some((call) => ['install', 'add'].includes(call.args[0]))).toBe(false);
    });

    it('rejects an invalid package identity without running a manager', async () => {
        const f = fixture();
        writeFileSync(join(f.npmPackage, 'package.json'), JSON.stringify({ name: 'another-package', version: '3.3.1' }));
        const run = jest.fn();
        await expect(new ActiveCliUpgradeAdapter({ ...f, run }).upgrade()).rejects.toThrow('running Copilot package could not be identified');
        expect(run).not.toHaveBeenCalled();
    });

    it.each([
        ['non-string version', { version: 37 }],
        ['malformed version', { version: 'latest' }],
        ['non-string bin', { bin: { copilot: 37 } }],
        ['absolute bin', { bin: { copilot: join(tmpdir(), 'copilot.js') } }],
    ])('rejects package metadata with %s before invoking a manager', async (_name, invalid) => {
        const f = fixture();
        const file = join(f.npmPackage, 'package.json');
        writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), ...invalid }));
        const run = jest.fn();
        await expect(new ActiveCliUpgradeAdapter({ ...f, run }).upgrade()).rejects.toThrow('could not be identified');
        expect(run).not.toHaveBeenCalled();
    });

    it('rejects a pnpm global link to a source checkout before any installation', async () => {
        const f = fixture('pnpm');
        const checkout = join(f.root, 'linked-checkout');
        mkdirSync(join(checkout, 'build'), { recursive: true });
        writeFileSync(join(checkout, 'package.json'), JSON.stringify({ name: COPILOT_PACKAGE_NAME, version: '3.7.0', bin: { copilot: 'build/cli.js' } }));
        writeFileSync(join(checkout, 'build', 'cli.js'), '');
        rmSync(f.pnpmPackage, { force: true });
        symlinkSync(checkout, f.pnpmPackage, windows ? 'junction' : 'dir');
        await expect(new ActiveCliUpgradeAdapter({ ...f, entrypoint: join(checkout, 'build', 'cli.js') }).upgrade()).rejects.toThrow('could not be matched to npm or pnpm');
        expect(f.calls().some((call) => ['install', 'add'].includes(call.args[0]))).toBe(false);
    });

    it('rejects package executable metadata escaping its package root', async () => {
        const f = fixture();
        const file = join(f.npmPackage, 'package.json');
        const metadata = JSON.parse(readFileSync(file, 'utf8'));
        metadata.bin.copilot = '../../outside.js';
        writeFileSync(join(dirname(dirname(f.npmPackage)), 'outside.js'), 'throw new Error("must never run");');
        writeFileSync(file, JSON.stringify(metadata));
        const run = jest.fn();
        await expect(new ActiveCliUpgradeAdapter({ ...f, run }).upgrade()).rejects.toThrow('could not be identified');
        expect(run).not.toHaveBeenCalled();
    });

    it('reports an unavailable package manager without falling back to a different global install', async () => {
        const f = fixture();
        rmSync(join(f.npmBin, commandName('npm')));
        await expect(new ActiveCliUpgradeAdapter(f).upgrade()).rejects.toThrow('Restore its original package manager');
        expect(f.readVersion(f.pnpmPackage)).toBe('3.7.0');
    });

    it('does not resolve a directory as an executable or silently use a missing command', () => {
        const f = fixture();
        mkdirSync(join(f.npmBin, 'missing'));
        expect(() => resolveCliExecutable('missing', { PATH: f.npmBin })).toThrow('unavailable on PATH');
        accessSync(f.entrypoint);
    });

    it('resolves Windows command extensions and the Path spelling without treating scripts as shell input', () => {
        const f = fixture();
        const command = join(f.root, 'fixture.CMD');
        writeFileSync(command, '', { mode: 0o700 });
        expect(resolveCliExecutable('fixture', { Path: f.root, PATHEXT: '.EXE;.CMD' }, 'win32')).toBe(command);
    });
});
