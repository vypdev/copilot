'use strict';

const { Buffer } = require('node:buffer');
const { load, JSON_SCHEMA } = require('js-yaml');
const { blob, hash } = require('./git.cjs');

const PLAYWRIGHT_COMMIT = 'cfe490d941f992655948eee8fd4fd94e1c4234bf';
const sqliteSourceIds = new Map([
    ['3.53.3', '2026-06-26 20:14:12 d4c0e51e4aeb96955b99185ab9cde75c339e2c29c3f3f12428d364a10d782c62'],
]);
const entries = [
    ['playwright', '1.64.1', 'microsoft/playwright', PLAYWRIGHT_COMMIT, 'docs/src/api/class-locatorassertions.md', 'versioned-docs',
        'affa4f27a70b9f3e9a3575224acf077acbe474cac45936d2a677b8a14e72589e'],
    ['playwright', '1.64.1', 'microsoft/playwright', PLAYWRIGHT_COMMIT, 'packages/playwright/src/matchers/matchers.ts', 'release-source',
        '509f8280aae39e6a0ac1f19fe0ed2a9f89677604d841d2d6ff70c2d3c129065e'],
    ['lit-html', '3.3.3', 'lit/lit', '20afabd3c5bfd49fdcdf1b8518e05c7f99a46db6', 'packages/lit-html/src/lit-html.ts', 'release-source',
        'ec498c043cf596ba4b4c8e5bc11b8b5755c302d6f908bc167dd794ed1908153e'],
    ['lit-element', '4.2.2', 'lit/lit', '0fc671bc390cac3b9900fc3616347eeeecd91d5a', 'packages/lit-element/src/lit-element.ts', 'release-source',
        'da78ead1212562e3bec7c2fbfeee92224b9aaea9f7698902e4425aa3edf412b3'],
    ['sqlite', '3.53.3', 'sqlite/sqlite', '92a6c5c3636faa021ecc3be5403a00f50f65eda7', 'src/fkey.c', 'release-source',
        'e63a0616dad4b8a387e90dd3a896acd77d590d8aadafade4c581ff3a6d74bce3'],
];
const registryIntegrity = new Map([
    ['playwright@1.64.1', 'sha512-HCrVhHr5QQuwYoswEUGTb7gGp522yflbv/ST8nF4sFWGuLjQCt17Q/EubpGGSNKYn1tsTCPZxqHhHCfVURu7UA=='],
    ['@playwright/test@1.64.1', 'sha512-IaYGml/nSOiZWROfPtuIL7neuu9qDOZ3TNvNljUIrhDMxiGTgPjzj/g9p9RxpS2tSepPDRY+UwAaEeiKtUvIAg=='],
    ['lit@3.3.3', 'sha512-fycuvZg/hkpozL00lm1pEJH5nN/lr9ZXd6mJI2HSN4+Bzc+LDNdEApJ6HFbPkdFNHLvOplIIuJvxkS4XUxqirw=='],
    ['lit-html@3.3.3', 'sha512-el8M6jK2o3RXBnrSHX3ZKrsN8zEV63pSExTO1wYJz7QndGYZ8353e2a5PPX+qHe2aGayfnchQmkAojaWAREOIA=='],
    ['lit-element@4.2.2', 'sha512-aFKhNToWxoyhkNDmWZwEva2SlQia+jfG0fjIWV//YeTaWrVnOxD89dPKfigCUspXFmjzOEUQpOkejH5Ly6sG0w=='],
]);
const exactRelease = /^\d+\.\d+\.\d+(?:-[\da-z.-]+)?$/iu;
const fields = ['dependencies', 'devDependencies', 'optionalDependencies'];
// Publisher-defined re-exports. An arbitrary transitive copy is not evidence of use.
const reexports = new Map([['lit-html', 'lit'], ['lit-element', 'lit']]);
const packages = [...new Set(entries.map(([name]) => name))];

function optionalBlob(repo, sha, path) {
    try { return blob(repo, sha, path); } catch (error) {
        if (error.message !== 'no-file') throw error;
        return undefined;
    }
}

function directories(file) {
    const segments = file.split('/').slice(0, -1);
    const result = [];
    while (segments.length) {
        result.push(segments.join('/'));
        segments.pop();
    }
    return [...result, '.'];
}

function parseYaml(lines) {
    try { return load(lines.join('\n'), { schema: JSON_SCHEMA }); } catch { return undefined; }
}

function fromImporter(importer, manifest, name) {
    return fields.flatMap(field => {
        const dependencies = importer?.[field];
        const declared = manifest?.[field];
        if (!Object.hasOwn(dependencies ?? {}, name)) return [];
        const pinned = dependencies[name];
        return [Object.hasOwn(declared ?? {}, name) && declared[name] === pinned?.specifier ? pinned?.version : null];
    });
}

function releaseFromLock(lock, name, version) {
    const key = name + '@' + version;
    const declared = lock?.packages?.[key]?.resolution;
    const expected = registryIntegrity.get(key);
    return typeof declared?.integrity === 'string' && !declared.tarball
        && (!expected || declared.integrity === expected)
        && !Object.hasOwn(lock.patchedDependencies ?? {}, key)
        && !Object.hasOwn(lock.patchedDependencies ?? {}, name);
}

function resolveInstalledVersion({ repo, sha, anchor, request, packageName, proof }) {
    if (packageName === 'sqlite') {
        const expected = sqliteSourceIds.get(proof?.version);
        if (proof?.kind !== 'runtime' || proof.package !== packageName || !proof.sourceId
            || (expected && expected !== proof.sourceId) || (request.version !== null && request.version !== proof.version)) return undefined;
        return { package: packageName, version: proof.version, versionScope: proof.versionScope, basis: request.basis,
            runtimeSourceId: proof.sourceId };
    }
    if (request.basis !== null && proof?.kind !== 'git') return undefined;
    const ancestry = directories(anchor.path);
    // Nearest tracked package manifest defines the consumer. A root tool is not
    // evidence of which release a nested workspace uses.
    const consumer = ancestry.find(dir => optionalBlob(repo, sha, dir === '.' ? 'package.json' : dir + '/package.json'));
    if (!consumer) return undefined;
    const manifest = parseYaml(optionalBlob(repo, sha, consumer === '.' ? 'package.json' : consumer + '/package.json').lines);
    const parent = packageName === 'playwright' ? '@playwright/test' : reexports.get(packageName);
    for (const directory of directories(consumer === '.' ? 'package.json' : consumer + '/package.json')) {
        const lockPath = directory === '.' ? 'pnpm-lock.yaml' : directory + '/pnpm-lock.yaml';
        const lock = optionalBlob(repo, sha, lockPath);
        if (!lock) continue;
        if (proof && (proof.path !== lockPath || proof.blob !== lock.blob)) return undefined;
        const parsed = parseYaml(lock.lines);
        const importers = parsed?.importers;
        const importerPath = consumer === directory ? '.' : directory === '.' ? consumer : consumer.slice(directory.length + 1);
        const importer = Object.hasOwn(importers ?? {}, importerPath) ? importers[importerPath] : undefined;
        const direct = fromImporter(importer, manifest, packageName);
        const parentVersions = parent ? fromImporter(importer, manifest, parent) : [];
        const transitive = parentVersions.map(pinned => {
            if (typeof pinned !== 'string') return null;
            if (!releaseFromLock(parsed, parent, pinned.split('(')[0])) return null;
            const snapshot = parsed?.snapshots?.[parent + '@' + pinned];
            return snapshot?.dependencies?.[packageName];
        });
        const versions = [...direct, ...transitive].map(pinned => typeof pinned === 'string' ? pinned.split('(')[0] : '');
        const version = versions[0];
        if (!version || !exactRelease.test(version) || versions.some(value => value !== version)
            || (request.version !== null && request.version !== version)) return undefined;
        if (!releaseFromLock(parsed, packageName, version)) return undefined;
        return { package: packageName, version, versionScope: 'pinned pnpm importer ' + importerPath + (parentVersions.length ? ' via ' + parent : ''),
            lockfile: lockPath, lockBlob: lock.blob, ...(proof ? { basis: request.basis } : {}) };
    }
    return undefined;
}

async function retrieve(url, signal, fetchSource) {
    const deadline = globalThis.AbortSignal.timeout(20_000);
    const response = await fetchSource(url, { redirect: 'error', credentials: 'omit',
        signal: signal ? globalThis.AbortSignal.any([signal, deadline]) : deadline });
    if (!response.ok || !response.body) return undefined;
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > 1024 * 1024) throw new Error('official-source-read-limit');
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

/** Only audited release bindings authorize a public request. Query text never leaves the broker. */
function createInstalledOfficialReader(fetchSource = globalThis.fetch) {
    const cache = new Map();
    return {
        packages,
        resolveVersion: resolveInstalledVersion,
        async sources(packageName, version, signal) {
            const key = packageName + '@' + version;
            if (cache.has(key)) return cache.get(key);
            const result = [];
            let expected = 0;
            for (const [name, release, origin, commit, path, sourceKind, sha256] of entries) {
                if (name !== packageName || release !== version) continue;
                expected++;
                const raw = 'https://raw.githubusercontent.com/' + [origin, commit, path].join('/');
                let contents;
                try { contents = await retrieve(raw, signal, fetchSource); } catch { continue; }
                if (!contents) continue;
                if (hash(contents) !== sha256) throw new Error('official-source-hash');
                const url = 'https://github.com/' + [origin, 'blob', commit, path].join('/');
                result.push({ sourceKind, url, commit, sha256, lines: contents.toString('utf8').replace(/\n$/u, '').split(/\r?\n/u) });
            }
            if (expected && result.length === expected) cache.set(key, result);
            return result;
        },
    };
}

module.exports = { createInstalledOfficialReader };
