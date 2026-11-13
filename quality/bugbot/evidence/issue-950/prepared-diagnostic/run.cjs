'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ask } = require('../v4/run-pilot.cjs');
const { byteLength, digest } = require('../v4/verification.cjs');
const { schema } = require('../tree-search/contract.cjs');
const { dryRunPorts, git, receipt, validate } = require('../on-demand/contract.cjs');
const { missingPremises } = require('./premises.cjs');
const protocol = require('./manifest.json');

const finalSchema = schema(false);
const schemaSha = digest(JSON.stringify(finalSchema));
const safeToolTypes = new Set(['mcp_tool_call', 'command_execution', 'web_search', 'file_change']);
const knownOutcomes = new Set(['provider-turn-timeout', 'provider-rate-limit', 'provider-turn-failed', 'provider-output-byte-budget',
    'provider-launch', 'closed-session-tool-event', 'provider-turn-incomplete', 'provider-failed', 'provider-response-unavailable',
    'provider-json-invalid', 'completed', 'transport-failed']);
const localReasons = new Set(['citation-integrity', 'duplicate-citation', 'invalid-response', 'invalid-verdict', 'second-request',
    'missing-witness', 'missing-next-step', 'closed-session-tool-event', 'verifier-token-budget', 'subject-wall-budget', 'dry-run-write-port']);

function plan() {
    const rows = protocol.models.flatMap(model => protocol.subjects.flatMap(subject =>
        protocol.arms.flatMap(arm => protocol.repetitions.map(repetition => ({
            trial: digest(`prepared-chain/${model}/${subject}/${arm}/${repetition}`).slice(0, 16),
            model, subject, arm, repetition,
        })))));
    assert.equal(rows.length, protocol.plannedTrials);
    return rows.sort((a, b) => a.trial.localeCompare(b.trial));
}

function preflight() {
    for (const line of fs.readFileSync(path.join(__dirname, 'frozen.sha256'), 'utf8').trim().split('\n')) {
        const [hash, file] = line.split('  ');
        assert.equal(digest(fs.readFileSync(path.join(__dirname, file))), hash, file);
    }
    assert.equal(protocol.publicationMode, 'dry-run');
    assert.deepEqual(require('./order.json'), plan());
    const sdk = process.env.BUGBOT_PILOT_SDK;
    assert(sdk);
    assert.equal(git(sdk, 'rev-parse', 'HEAD').trim(), protocol.sdk);
    assert.equal(git(sdk, 'status', '--porcelain', '--untracked-files=no'), '');
    assert.equal(execFileSync(process.env.BUGBOT_PILOT_CODEX || 'codex', ['--version'], { encoding: 'utf8' }).trim(), protocol.cli);
    const packets = require('./packets.json');
    assert.deepEqual(Object.keys(packets), protocol.subjects);
    for (const revision of Object.values(packets)) for (const arm of protocol.arms) {
        const packet = revision[arm];
        assert.equal(packet.promptSha256, digest(packet.prompt));
        assert.equal(packet.schemaSha256, schemaSha);
        assert.equal(packet.promptBytes, byteLength(packet.prompt));
        assert(packet.promptBytes <= protocol.ceiling.promptBytes && packet.packetBytes <= protocol.ceiling.packetBytes);
        assert.equal(new Set(packet.receipts.map(item => item.id)).size, packet.receipts.length);
        for (const proof of packet.receipts) assert.deepEqual(proof, receipt(revision.binding, proof));
    }
    return packets;
}

const numeric = n => Number.isSafeInteger(n) && n >= 0;
function safeFact(raw) {
    const outcome = knownOutcomes.has(raw?.outcome) ? raw.outcome : 'transport-failed';
    const usage = raw?.usage && numeric(raw.usage.input_tokens) && numeric(raw.usage.output_tokens) ? {
        input: raw.usage.input_tokens, output: raw.usage.output_tokens,
        cached: numeric(raw.usage.cached_input_tokens) ? raw.usage.cached_input_tokens : null,
    } : null;
    return { outcome, usage, inspections: numeric(raw?.inspections) ? raw.inspections : null,
        toolTypes: (raw?.toolTypes ?? []).map(kind => safeToolTypes.has(kind) ? kind : 'other-tool-event') };
}

async function trial(row, revision, journal, send = ask) {
    const packet = revision[row.arm];
    const start = performance.now();
    const writeAttempts = [];
    const ports = dryRunPorts(name => writeAttempts.push(name));
    const common = { ...row, head: revision.binding.head, tree: revision.binding.tree, anchor: revision.anchor.selected,
        packetBytes: packet.packetBytes, promptBytes: packet.promptBytes, promptSha256: packet.promptSha256, schemaSha256: schemaSha };
    let fact = null;
    try {
        if (protocol.publicationMode !== 'dry-run') ports.publishReview();
        journal({ ...common, event: 'attempt-started', round: 2, attempt: 1, deadlineMs: protocol.ceiling.callMs });
        const result = await send({
            configuration: { provider: 'codex', modelProvider: protocol.modelProvider, model: row.model, effort: protocol.effort },
            agentId: 'tree-followup', prompt: packet.prompt, options: { schema: finalSchema },
        }, 'closed', null, protocol.ceiling.callMs);
        fact = safeFact(result.fact);
        if (fact.toolTypes.length || fact.inspections > 0) throw Error('closed-session-tool-event');
        assert.equal(result.fact?.promptSha256, packet.promptSha256);
        assert.equal(result.fact?.schemaSha256, schemaSha);
        const verdict = validate(result.response, revision.binding, packet.receipts, false);
        const wallMs = Math.round(performance.now() - start);
        if (wallMs > protocol.ceiling.caseMs) throw Error('subject-wall-budget');
        if (fact.usage && (fact.usage.input > protocol.ceiling.grossInputTokens || fact.usage.output > protocol.ceiling.outputTokens)) {
            throw Error('verifier-token-budget');
        }
        return { ...common, event: 'result', status: 'completed', wallMs, fact, writeAttempts, verdict: verdict.verdict,
            citations: verdict.citations, missing: missingPremises(revision.pair, verdict),
            reasonSha256: digest(verdict.reason), nextStepSha256: verdict.nextStep === null ? null : digest(verdict.nextStep) };
    } catch (error) {
        fact ??= safeFact(error.fact);
        const reason = localReasons.has(error.message) ? error.message
            : fact.outcome === 'completed' ? 'trial-contract-failed' : fact.outcome;
        return { ...common, event: 'result', status: reason === 'provider-turn-timeout' ? 'expired' : 'failed',
            reason, wallMs: Math.round(performance.now() - start), fact, writeAttempts };
    }
}

async function main() {
    const [journalPath, freeze] = process.argv.slice(2);
    if (journalPath === '--plan') return console.log(JSON.stringify(plan(), null, 2));
    const packets = preflight();
    if (!journalPath) return console.log('Frozen second prompts, schema, order, SDK and CLI validated without model calls.');
    assert.match(freeze, /^[a-f0-9]{40}$/u);
    assert.equal(git(__dirname, 'rev-parse', 'HEAD').trim(), freeze);
    assert.equal(git(__dirname, 'status', '--porcelain'), '');
    fs.writeFileSync(journalPath, '', { flag: 'wx', mode: 0o600 });
    const journal = row => fs.appendFileSync(journalPath, JSON.stringify(row) + '\n');
    const rows = plan();
    journal({ event: 'plan', freeze, rows });
    await Promise.all(protocol.models.flatMap(model => {
        const queue = rows.filter(row => row.model === model);
        return Array.from({ length: protocol.concurrencyPerModel }, async () => {
            let row;
            while ((row = queue.shift())) {
                const result = await trial(row, packets[row.subject], journal);
                journal(result);
                console.log(row.model, row.subject, row.arm, row.repetition, result.verdict ?? result.reason);
            }
        });
    }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { trial };
