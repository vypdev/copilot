'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const root = process.env.BUGBOT_PILOT_SDK || path.resolve(__dirname, '../../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
    fs.readFileSync(filename, 'utf8'), { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } },
).outputText, filename);
const load = file => require(path.join(root, 'src', file));
const { runDetectPotentialProblemsWorkflow } = load('application/usecases/steps/commit/detect_potential_problems_workflow');
const { DEFAULT_BUGBOT_REVIEW_CONFIGURATION } = load('domain/bugbot/review_configuration');
const { buildCodexExecutionPolicy } = load('application/policies/agent_execution/codex_execution_plan_policy');
const { normalizeBugbotResponse } = load('application/usecases/steps/commit/bugbot/prepare_bugbot_findings_policy');
const { UNTRUSTED_CONTENT_POLICY, renderUntrustedContentVerbatim } = load('domain/security/untrusted_content');

const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const manifest = read('manifest-v2.json');
const bindings = read('subjects.lock.json');
const candidates = read('candidates.json');
const packets = read('evidence-v2.json');
const sha = data => createHash('sha256').update(data).digest('hex');
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const now = () => Math.round(performance.now());
const locale = 'en-US';
const legacyVerifier = 'bugbot-literal-candidate-verification';
const noEffect = label => { throw new Error('forbidden-write:' + label); };
const writePorts = () => new Proxy({}, { get: (_target, label) => () => noEffect(label) });

function fixture(subjects, id) {
    const binding = bindings[id];
    const cwd = path.resolve(subjects, id);
    assert.equal(git(cwd, 'rev-parse', 'HEAD').trim(), binding.head);
    assert.equal(git(cwd, 'rev-parse', 'HEAD^{tree}').trim(), binding.tree);
    assert.equal(git(cwd, 'status', '--porcelain'), '');
    assert.equal(git(cwd, 'remote'), '');
    const diffArgs = ['-c', 'core.quotePath=true', 'diff', '--no-ext-diff', '--no-textconv', '--no-renames'];
    assert.equal(sha(git(cwd, ...diffArgs, '--unified=3', binding.base, binding.head, '--', ...binding.paths)), binding.diffSha256);
    const changes = binding.paths.flatMap(filename => {
        const patch = git(cwd, ...diffArgs, '--unified=3', binding.base, binding.head, '--', filename);
        if (!patch) return [];
        const hunks = patch.slice(patch.indexOf('@@ '));
        const lines = hunks.split('\n');
        return [{ filename, status: patch.includes('\nnew file mode') ? 'added' : 'modified',
            additions: lines.filter(line => line.startsWith('+')).length,
            deletions: lines.filter(line => line.startsWith('-')).length, patch: hunks }];
    });
    const [owner, name] = (id.startsWith('U') ? 'vypdev/ha-ui' : 'vypdev/domus').split('/');
    const identity = { number: 1, state: 'open', draft: false, baseRepository: { owner, name, id: 42 },
        baseSha: binding.base, baseRefSha: binding.base, baseRef: 'base', headRepositoryOwner: owner,
        headRepositoryName: name, headRef: 'subject', headSha: binding.head, changedFileCount: changes.length };
    const complete = (source, value, count = 0) => ({ value, coverage: { source, status: 'complete',
        pagesFetched: 1, itemsFetched: count, itemsRetained: count, omittedItems: 0, truncatedItems: 0, limitReached: false } });
    const write = writePorts();
    const scm = {
        context: {
            getPullRequest: async () => identity, getSourceBoundPullRequest: async () => identity,
            findOpenPullRequestsByExactHead: async () => [],
            listIssueComments: async () => complete('issue-comments', []),
            listPullRequestReviewComments: async () => complete('pull-request-comments', []),
            listPullRequestReviewThreadStates: async () => complete('review-threads', {}),
            getReviewDiffSnapshot: async () => complete('diff', { changes, filesWithFirstDiffLine: [], filesWithDiffLocations: [] }, changes.length),
            getPullRequestHeadSha: async () => binding.head, getPullRequestReviewCommentBody: async () => null,
            loadRules: async () => [],
        },
        publication: { issueComments: write, pullRequestComments: write },
        resolution: { issueComments: write, pullRequestComments: write },
        reconciliation: { presentation: { comments: write, updatePullRequestReview: write.updatePullRequestReview } },
    };
    const frozen = candidates[id].map(candidate => {
        const anchor = git(cwd, 'show', (candidate.side === 'old' ? binding.base : binding.head) + ':' + candidate.path)
            .split('\n')[candidate.line - 1];
        return { id: candidate.id, title: candidate.impact, description: candidate.trigger + ' ' + candidate.pathToEffect,
            file: candidate.path, line: candidate.line, endLine: null, severity: candidate.severity,
            confidence: 0.95, category: candidate.category, evidence: candidate.pathToEffect, suggestion: null,
            symbol: null, codeSnippet: anchor, suggestedCode: null };
    });
    return { cwd, scm, identity, frozen, binding };
}

function checkEvidence(id, fixture) {
    const evidence = packets[id];
    assert(evidence.length <= manifest.labLimits.candidateReadRequests);
    assert(Buffer.byteLength(JSON.stringify(evidence)) <= manifest.labLimits.candidateRetainedBytes);
    assert.equal(new Set(evidence.map(item => item.id)).size, evidence.length);
    for (const item of evidence) {
        assert(['git', 'dependency', 'native-ci'].includes(item.kind));
        if (item.kind === 'git') {
            assert.equal(item.head, fixture.binding.head);
            const locator = item.head + ':' + item.path;
            assert.equal(git(fixture.cwd, 'rev-parse', locator).trim(), item.blob);
            assert.equal(git(fixture.cwd, 'show', locator).split(/\r?\n/).slice(item.start - 1, item.end).join('\n'), item.text);
        } else if (item.kind === 'dependency') {
            assert.equal(git(fixture.cwd, 'rev-parse', 'HEAD:uv.lock').trim(), item.lockBlob);
            assert.equal(sha(item.text), item.sourceSha256);
        } else {
            assert.equal(item.head, fixture.binding.head);
            assert.equal(item.sourceDiffPaths, 0);
            assert.equal(id, 'F1');
        }
    }
}

function policyArgs(request, toolMode, directory) {
    assert(['inspection', 'closed'].includes(toolMode));
    const plan = buildCodexExecutionPolicy({ configuration: request.configuration, capability: 'findings',
        runtimeDirectory: directory, outputSchema: request.options.schema });
    assert.equal(plan.workspaceMode, 'read-only');
    assert(plan.argv.includes('mcp_servers={}'));
    assert(plan.argv.includes('web_search="disabled"'));
    assert(plan.argv.includes('approval_policy="never"'));
    const flags = ['--disable', 'plugins', '--disable', 'hooks'];
    if (toolMode === 'closed') flags.push('--disable', 'shell_tool');
    for (const file of plan.artifacts) fs.writeFileSync(file.path, file.contents, { mode: 0o600 });
    return [...flags, ...plan.argv.slice(0, -1), '--json', '-'];
}

function ask(request, toolMode, checkout, deadlineMs) {
    const directory = fs.mkdtempSync(path.join(tmpdir(), 'bugbot950-session-'));
    const args = policyArgs(request, toolMode, directory);
    if (toolMode === 'closed') args.splice(-2, 0, '--skip-git-repo-check');
    const cwd = toolMode === 'closed' ? directory : checkout;
    const env = Object.fromEntries(['HOME', 'PATH', 'TMPDIR', 'LANG', 'LC_ALL'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
    const started = now();
    return new Promise((resolve, reject) => {
        const child = spawn(process.env.BUGBOT_PILOT_CODEX || 'codex', args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
        let raw = '', errorText = '', aborted = false;
        const stop = () => { aborted = true; child.kill('SIGKILL'); };
        const timer = setTimeout(stop, deadlineMs);
        child.stdout.on('data', chunk => { raw += chunk; if (raw.length > 4_000_000) stop(); });
        child.stderr.on('data', chunk => { if (errorText.length < 25_000) errorText += chunk; });
        child.stdin.on('error', () => {});
        child.stdin.end(request.prompt);
        child.on('error', () => { clearTimeout(timer); fs.rmSync(directory, { recursive: true, force: true }); reject(new Error('provider-launch')); });
        child.on('close', code => {
            clearTimeout(timer);
            fs.rmSync(directory, { recursive: true, force: true });
            let usage = null, response = null, inspections = 0;
            for (const line of raw.split('\n')) {
                let event;
                try { event = JSON.parse(line); } catch { continue; }
                if (event.type === 'turn.completed') usage = event.usage;
                if (event.type === 'item.completed' && event.item?.type === 'command_execution') inspections++;
                if (event.type === 'item.completed' && event.item?.type === 'agent_message') response = event.item.text;
            }
            const fact = { role: request.agentId, toolMode, wallMs: now() - started, usage, inspections,
                promptSha256: sha(request.prompt), schemaSha256: sha(JSON.stringify(request.options.schema)) };
            if (aborted || code !== 0 || !response || (toolMode === 'closed' && inspections)) {
                const reason = aborted ? 'provider-time-or-output-budget' : /rate.limit|overloaded/i.test(raw + errorText)
                    ? 'provider-rate-limit' : code ? 'provider-failed' : 'provider-response-unavailable';
                reject(Object.assign(new Error(reason), { fact }));
                return;
            }
            try { resolve({ response: JSON.parse(response), fact }); }
            catch { reject(Object.assign(new Error('provider-json-invalid'), { fact })); }
        });
    });
}

const string = { type: 'string' };
const dispositionSchema = ids => ({
    type: 'object', additionalProperties: false, required: ['decisions'],
    properties: { decisions: { type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['id', 'verdict', 'evidence', 'reason'],
        properties: { id: { type: 'string', enum: ids },
            verdict: { type: 'string', enum: ['confirmed', 'refuted', 'inconclusive'] },
            evidence: { type: 'array', items: string }, reason: string },
    } } },
});
const untrusted = (value, origin) => renderUntrustedContentVerbatim({
    text: value, origin, originalLength: value.length, truncated: false, removedControlCharacters: false,
});

function verifierRequest(configuration, input, finding, evidence) {
    return { configuration, agentId: 'pilot-v2-verifier', options: { schema: dispositionSchema([finding.id]) },
        prompt: `${UNTRUSTED_CONTENT_POLICY}
Verify only the supplied candidate in a new review session. Try to falsify its material premise.
Confirm only a reachable defect introduced or exposed by the reviewed change. Refute only when a material premise is contradicted.
Use inconclusive when decisive evidence is absent, conflicting or cannot be retrieved. Do not invent evidence or executions.
Cite only supplied opaque identifiers. In an original-context-only trial you may cite original-context for a fact actually in it.
When the host supplied evidence, cite at least one host receipt for confirmation or refutation.
Return one decision for the unchanged candidate ID. Use a short causal reason or a named evidence gap.
Candidate: ${untrusted(JSON.stringify(finding), 'candidate')}
Original context (reference original-context): ${untrusted(input, 'original-context')}
Host receipts: ${untrusted(JSON.stringify(evidence), 'host-receipts')}
` };
}

function decide(response, finding, receipts) {
    assert.deepEqual(Object.keys(response), ['decisions']);
    assert.equal(response.decisions.length, 1);
    const decision = response.decisions[0];
    assert.equal(decision.id, finding.id);
    assert(['confirmed', 'refuted', 'inconclusive'].includes(decision.verdict));
    assert(typeof decision.reason === 'string' && decision.reason.trim() && decision.reason.length <= 2000);
    const allowed = new Set(['original-context', ...receipts.map(item => item.id)]);
    assert(Array.isArray(decision.evidence) && decision.evidence.every(id => allowed.has(id)));
    if (decision.verdict !== 'inconclusive') {
        assert(decision.evidence.some(id => receipts.length ? id !== 'original-context' : id === 'original-context'));
    }
    return { id: decision.id, verdict: decision.verdict, evidence: decision.evidence };
}

function mockAttestation(schema, frozen) {
    const properties = schema.properties;
    return { outputLocale: locale, findings: frozen, resolved_findings: [],
        ...Object.fromEntries(Object.entries(properties).filter(([key, value]) =>
            key !== 'outputLocale' && value.enum?.length === 1).map(([key, value]) => [key, value.enum[0]])) };
}

async function trial(row, fixture, fake) {
    const started = now();
    const calls = [];
    let detector = null, detectorPrompt, detected = [], final = [], decisions = [], detectorRequests = 0, verificationMs = null;
    const configuration = { provider: 'codex', modelProvider: 'openai', model: row.model, effort: 'medium' };
    const operation = { repository: fixture.identity.baseRepository,
        target: { issueNumber: 1, isPullRequest: true, pullRequestNumber: 1, headBranch: 'subject', commitBranch: 'subject',
            baseBranch: 'base', pullRequestAction: 'opened', draft: false },
        trigger: { kind: 'pull_request', headOwner: fixture.identity.headRepositoryOwner, expectedHeadSha: fixture.binding.head },
        ignorePatterns: [], organizationRules: [], locale: { issue: locale, pullRequest: locale },
        analysis: { agentConfiguration: configuration, minimumSeverity: 'low', commentLimit: 20,
            reviewConfiguration: { ...DEFAULT_BUGBOT_REVIEW_CONFIGURATION, publicationMode: 'dry-run' } } };
    const agent = async (request, tools, budget) => {
        try {
            const result = await ask(request, tools, fixture.cwd, budget);
            calls.push(result.fact);
            return result.response;
        } catch (error) {
            if (error.fact) calls.push(error.fact);
            throw error;
        }
    };
    const aiRepository = { query: async request => {
        if (request.agentId === legacyVerifier) {
            if (row.variant === 'current' && !fake) return agent(request, 'inspection', 60_000);
            // Replace the legacy verifier in the experimental arms without spending a model call.
            const shape = request.options.schema.properties;
            return { outputLocale: locale, verification_id: shape.verification_id.enum[0], rejected_ids: [],
                findings: detector.findings.filter(item => shape.findings.items.properties.id.enum.includes(item.id))
                    .map(item => ({ ...item, evidence: item.evidence || 'Detector evidence is pending verification.' })) };
        }
        detectorRequests++;
        detectorPrompt = request.prompt;
        detector = row.phase === 'frozen-replay' || fake ? mockAttestation(request.options.schema, fixture.frozen)
            : await agent(request, 'inspection', 75_000);
        return detector;
    } };
    try {
        const [result] = await runDetectPotentialProblemsWorkflow(operation, { aiRepository, scm: fixture.scm });
        assert(result?.success && result.payload?.dryRun, 'production-dry-run-failed');
        assert.equal(detectorRequests, 1, 'expected exactly one production detector partition');
        detected = normalizeBugbotResponse(detector)?.findings ?? [];
        const admitted = result.payload.findings;
        assert(Array.isArray(admitted));
        if (row.variant === 'current') final = admitted;
        else {
            const evidence = row.variant === 'application-evidence' ? packets[row.subject] : [];
            const verificationStart = now();
            for (const finding of admitted) {
                const request = verifierRequest(configuration, detectorPrompt, finding, evidence);
                const remaining = 180_000 - (now() - verificationStart);
                assert(remaining > 0, 'subject-verification-budget');
                const response = fake ? { decisions: [{ id: finding.id, verdict: 'inconclusive', evidence: [], reason: 'controlled fake' }] }
                    : await agent(request, 'closed', Math.min(60_000, remaining));
                const decision = decide(response, finding, evidence);
                decisions.push(decision);
                if (decision.verdict === 'confirmed') final.push(finding);
            }
            verificationMs = now() - verificationStart;
        }
        return { ...row, status: 'completed', wallMs: now() - started, calls, detectorRequests, verificationMs,
            detected: detected.map(projectFinding), active: final.map(projectFinding), decisions };
    } catch (error) {
        return { ...row, status: calls.some(call => call.usage) ? 'failed' : 'aborted', wallMs: now() - started,
            reason: /^[a-z][a-z0-9-]{2,70}$/.test(error.message) ? error.message : 'runner-contract-failed',
            calls, detectorRequests, verificationMs, detected: detected.map(projectFinding), active: [], decisions };
    }
}

const projectFinding = finding => ({ id: finding.id, file: finding.file, line: finding.line,
    severity: finding.severity, category: finding.category, confidence: finding.confidence,
    title: String(finding.title).slice(0, 250), description: String(finding.description).slice(0, 700) });

async function main() {
    const [subjects, mode, output] = process.argv.slice(2);
    assert(subjects && ['preflight', ...manifest.phases].includes(mode));
    const fixtures = Object.fromEntries(Object.keys(bindings).map(id => [id, fixture(subjects, id)]));
    for (const [id, item] of Object.entries(fixtures)) checkEvidence(id, item);
    const ledger = fs.readFileSync(path.join(__dirname, 'trial-ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(ledger.length, 216);
    const trials = ledger.map(({ trial, phase, repetition, model, variant, subject }) => ({ trial, phase, repetition, model, variant, subject }));
    assert.equal(sha(fs.readFileSync(path.join(__dirname, 'evidence-v2.json'))), manifest.evidencePacketSha256);
    if (mode === 'preflight') {
        const row = trials[0];
        const configuration = { provider: 'codex', modelProvider: 'openai', model: row.model, effort: 'medium' };
        const directory = fs.mkdtempSync(path.join(tmpdir(), 'bugbot950-preflight-'));
        try {
            const req = verifierRequest(configuration, 'original', { id: 'test' }, []);
            const readArgs = policyArgs(req, 'inspection', directory);
            const closed = policyArgs(req, 'closed', directory);
            assert.deepEqual(closed.filter((_, i) => ![4, 5].includes(i)), readArgs);
            assert.equal(closed[5], 'shell_tool');
            assert.throws(() => writePorts().createReview(), /forbidden-write/);
            const checked = await Promise.all(Object.keys(fixtures).flatMap(subject => manifest.variants.map(variant =>
                trial({ ...row, subject, variant, phase: 'frozen-replay' }, fixtures[subject], true))));
            for (const result of checked) assert.equal(result.status, 'completed', JSON.stringify(result));
            console.log('18 controlled production dry-runs passed, pinned evidence and tool matrix verified.');
        } finally { fs.rmSync(directory, { recursive: true, force: true }); }
        return;
    }
    assert(output);
    const rows = trials.filter(row => row.phase === mode);
    const previous = fs.existsSync(output) ? fs.readFileSync(output, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
    const done = new Set(previous.map(row => row.trial));
    if (mode === 'full-review') assert.equal(previous.filter(row => row.phase === 'frozen-replay').length, 108);
    const pending = rows.filter(row => !done.has(row.trial));
    const worker = async () => {
        let row;
        while ((row = pending.shift())) {
            const outcome = await trial(row, fixtures[row.subject], false);
            fs.appendFileSync(output, JSON.stringify(outcome) + '\n', { mode: 0o600 });
            console.log([outcome.phase, outcome.trial, outcome.variant, outcome.model, outcome.status].join(' '));
        }
    };
    await Promise.all(Array.from({ length: manifest.labLimits.parallelSubjects }, worker));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
