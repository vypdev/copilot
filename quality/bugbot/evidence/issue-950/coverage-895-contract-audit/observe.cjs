'use strict';

// Evaluator-only observer for the exact audited package members. The loader
// instruments in memory and refuses mismatched source or ambiguous patches.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { appendFileSync, readFileSync } = require('node:fs');
const { registerHooks } = require('node:module');
const { fileURLToPath } = require('node:url');

const audit = JSON.parse(readFileSync(process.env.BUGBOT_895_TRACE_BINDING, 'utf8'));
const record = (event, data) => appendFileSync(audit.output, JSON.stringify({ event, ...data }) + '\n');
const target = value => typeof value === 'string' && (value === audit.story || value.split(/[?#]/u, 1)[0].endsWith('/' + audit.story));
const includes = values => values.some(target);
const storyPatterns = values => (values ?? []).filter(value => typeof value === 'string' && value.startsWith('stories/'));
const sha = source => createHash('sha256').update(source).digest('hex');
const name = Symbol.for('bugbot-895-execution-audit');
globalThis[name] = { record, target, includes, storyPatterns };
const obs = 'globalThis[Symbol.for("bugbot-895-execution-audit")]';
const trace = (event, fields) => `${obs}.record(${JSON.stringify(event)}, ${fields});`;
const match = expression => `${obs}.target(${expression})`;
const contains = expression => `${obs}.includes(${expression})`;

const cliPatches = [
    ['\t\tawait Promise.all(this.projects.flatMap((project) => {\n\t\t\treturn project.vite.config.getSortedPluginHooks("configureVitest")',
        `\t\t${trace('before-hooks', `{exclude: ${obs}.storyPatterns(this.config.coverage.exclude)}`)}\n`
        + '\t\tawait Promise.all(this.projects.flatMap((project) => {\n\t\t\treturn project.vite.config.getSortedPluginHooks("configureVitest")'],
    ['\t\t\t}));\n\t\t}));\n\t\tif (resolved.cliOptions.browser?.enabled)',
        '\t\t\t}));\n\t\t}));\n'
        + `\t\t${trace('after-hooks', `{exclude: ${obs}.storyPatterns(this.config.coverage.exclude)}`)}\n`
        + '\t\tif (resolved.cliOptions.browser?.enabled)'],
    ['\t\tconst config = ctx._coverageOptions;\n\t\tthis.globMatchers = void 0;',
        '\t\tconst config = ctx._coverageOptions;\n'
        + `\t\t${trace('provider-options', `{provider: this.name, exclude: ${obs}.storyPatterns(config.exclude), include: ${obs}.storyPatterns(config.include), excludeAfterRemap: config.excludeAfterRemap}`)}\n`
        + '\t\tthis.globMatchers = void 0;'],
    ['\t\t\t\tconst specifications = await this.specifications.getRelevantTestSpecifications(filters);\n'
        + '\t\t\t\tstartSpan.setAttribute("vitest.start.specifications",',
        '\t\t\t\tconst specifications = await this.specifications.getRelevantTestSpecifications(filters);\n'
        + `\t\t\t\t${trace('collection', `{projects: specifications.filter(s => ${match('s.moduleId')}).map(s => s.project.name)}`)}\n`
        + '\t\t\t\tstartSpan.setAttribute("vitest.start.specifications",'],
];

const providerPatches = [
    ['\t\t\tif (this.isIncluded(filePath)) {\n\t\t\t\tscriptCoverages.push({',
        '\t\t\tconst included = this.isIncluded(filePath);\n'
        + `\t\t\tif (${match('filePath')}) ${trace('tested-filter', '{included, project: project.name, environment}')}\n`
        + '\t\t\tif (included) {\n\t\t\t\tscriptCoverages.push({'],
    ['\t\t\t\tcoverageMap.merge(await this.remapCoverage(url, startOffset, sources, functions));',
        '\t\t\t\tconst remapped = await this.remapCoverage(url, startOffset, sources, functions);\n'
        + `\t\t\t\tif (${match('url')} || ${contains('Object.keys(remapped)')}) ${trace('tested-remap', `{inputIsStory: ${match('url')}, outputHasStory: ${contains('Object.keys(remapped)')}}`)}\n`
        + '\t\t\t\tcoverageMap.merge(remapped);'],
    ['\t\t\t\tcoverageMap.merge(converted);\n\t\t\t\tmergedScripts.clear();',
        '\t\t\t\tcoverageMap.merge(converted);\n'
        + `\t\t\t\tif (${contains('converted.files()')}) ${trace('tested-merge', `{project: project.name, environment, outputHasStory: ${contains('coverageMap.files()')}}`)}\n`
        + '\t\t\t\tmergedScripts.clear();'],
    ['\t\tconst uncoveredFiles = await this.getUntestedFiles(testedFiles);',
        '\t\tconst uncoveredFiles = await this.getUntestedFiles(testedFiles);\n'
        + `\t\t${trace('untested-candidates', `{alreadyTested: ${contains('testedFiles')}, listedAsUntested: ${contains('uncoveredFiles')}}`)}`],
    ['\t\t\tcoverageMap.merge(untestedCoverage);',
        `\t\t\t${trace('untested-merge', `{inputHasStory: ${contains('untestedCoverage.files()')}}`)}\n`
        + '\t\t\tcoverageMap.merge(untestedCoverage);'],
    ['\t\t\treturn exists;\n\t\t});\n\t\tif (debug.enabled)',
        '\t\t\treturn exists;\n\t\t});\n'
        + `\t\t${trace('final-map', `{hasStory: ${contains('coverageMap.files()')}, excludeAfterRemap: this.options.excludeAfterRemap}`)}\n`
        + '\t\tif (debug.enabled)'],
];
const writerPatches = [['\t\tthis.writeSummary(e.getFileCoverage().path, e.getCoverageSummary());',
    `\t\tif (${match('e.getFileCoverage().path')}) ${trace('summary-key', '{present: true}')}\n`
    + '\t\tthis.writeSummary(e.getFileCoverage().path, e.getCoverageSummary());']];

const byPath = new Map(audit.members.map(member => [member.path, member]));
const patches = { cli: cliPatches, provider: providerPatches, writer: writerPatches };

registerHooks({
    load(url, context, nextLoad) {
        const loaded = nextLoad(url, context);
        if (!url.startsWith('file:')) return loaded;
        const member = byPath.get(fileURLToPath(url));
        if (!member) return loaded;
        const raw = loaded.source === null ? readFileSync(member.path) : loaded.source;
        assert(raw !== undefined);
        let source = Buffer.isBuffer(raw) ? raw.toString('utf8') : typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
        assert.equal(sha(source), member.sha256);
        for (const [index, [before, after]] of patches[member.role].entries()) {
            const offset = source.indexOf(before);
            assert(offset >= 0 && source.indexOf(before, offset + before.length) === -1, `ambiguous instrumentation ${member.role}/${index}`);
            source = source.slice(0, offset) + after + source.slice(offset + before.length);
        }
        record('member-loaded', { role: member.role, sha256: member.sha256, observedSha256: sha(source) });
        return { ...loaded, source };
    },
});
