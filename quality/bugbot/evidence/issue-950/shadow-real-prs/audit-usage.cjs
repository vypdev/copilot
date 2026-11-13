'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { investigate, preflight, subjects } = require('./run.cjs');
const { hash } = require('./session.cjs');
const plan = require('./plan.json');

const parseLines = buffer => buffer.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
const tokenFields = ['input_tokens', 'cached_input_tokens', 'output_tokens'];

function inspectRollout(bytes, recorded) {
    const events = parseLines(bytes);
    const meta = events.find(event => event.type === 'session_meta').payload;
    const session = hash(meta.id);
    const prompts = [];
    const turns = [];
    let task = null;
    for (const event of events) {
        const payload = event.payload;
        if (event.type === 'turn_context') {
            assert.equal(payload.model, plan.model);
            assert.equal(payload.effort, plan.effort);
        }
        if (event.type === 'response_item' && payload.role === 'user') {
            prompts.push(...payload.content.filter(item => item.type === 'input_text').map(item => hash(item.text)));
        }
        if (event.type !== 'event_msg') continue;
        if (payload.type === 'task_started') {
            assert.equal(task, null);
            task = { id: payload.turn_id, startedAt: event.timestamp };
        } else if (payload.type === 'token_count' && task && payload.info) {
            task.usage = payload.info;
        } else if (payload.type === 'task_complete') {
            assert.equal(task.id, payload.turn_id);
            turns.push({ ...task, endedAt: event.timestamp, response: JSON.parse(payload.last_agent_message) });
            task = null;
        }
    }
    assert.equal(task, null);
    assert.equal(turns.length, recorded.length);
    let previous = Object.fromEntries(tokenFields.map(field => [field, 0]));
    for (const [index, turn] of turns.entries()) {
        const actual = recorded[index];
        assert.equal(actual.sessionSha256, session);
        assert.equal(prompts.filter(sha => sha === actual.promptSha256).length, 1);
        const cumulative = turn.usage.total_token_usage;
        const latest = turn.usage.last_token_usage;
        for (const field of tokenFields) {
            assert.equal(cumulative[field], actual.usage[field]);
            assert.equal(cumulative[field] - previous[field], latest[field]);
        }
        previous = cumulative;
    }
    return { turns, usage: { inputTokens: previous.input_tokens, cachedInputTokens: previous.cached_input_tokens,
        outputTokens: previous.output_tokens, known: true }, rolloutSha256: hash(bytes) };
}

async function main() {
    const [lab, ledger, sessionDirectory, started, finished] = process.argv.slice(2);
    assert(lab && ledger && sessionDirectory && started && finished);
    const inputs = preflight(lab);
    const ledgerBytes = fs.readFileSync(ledger);
    const raw = parseLines(ledgerBytes);
    assert.deepEqual(raw[0].initialPrompts, inputs.initialPrompts);
    assert.equal(raw[0].schemaSha256, inputs.schemaSha256);
    const byId = Object.fromEntries(raw.filter(row => row.event === 'finding-result').map(row => [row.finding, row]));
    assert.equal(Object.keys(byId).length, subjects.length);
    const uniqueSessions = new Set();
    const files = fs.readdirSync(sessionDirectory);
    const audited = [];
    for (const { subject, finding } of subjects) {
        const original = byId[finding.id];
        assert.deepEqual(original.writes, []);
        assert(original.wallMs <= plan.caseMs && original.turns.length <= plan.maxTurns);
        const session = original.turns[0].sessionSha256;
        assert(session && !uniqueSessions.has(session));
        uniqueSessions.add(session);
        const candidates = files.filter(file => {
            const match = /-([0-9a-f-]{36})\.jsonl$/u.exec(file);
            return match && hash(match[1]) === session;
        });
        assert.equal(candidates.length, 1);
        const bytes = fs.readFileSync(path.join(sessionDirectory, candidates[0]));
        const verified = inspectRollout(bytes, original.turns);
        assert(verified.usage.inputTokens <= plan.inputTokens && verified.usage.outputTokens <= plan.outputTokens);
        assert(verified.turns[0].startedAt >= started && verified.turns.at(-1).endedAt <= finished);
        const terminal = verified.turns.at(-1).response;
        const hasFinal = terminal.action === 'finish';
        const finishedOffline = original.failure === 'token-budget-or-unknown' && hasFinal;
        let cursor = 0;
        const replay = await investigate(lab, subject, finding, null, async request => {
            const index = cursor++;
            const actual = original.turns[index];
            const event = verified.turns[index];
            assert(actual && event);
            assert.equal(hash(request.prompt), actual.promptSha256);
            assert.equal(hash(JSON.stringify(request.schema)), actual.schemaSha256);
            const failure = index === verified.turns.length - 1 && !hasFinal ? 'recorded-session-ended-before-verdict' : actual.failure;
            return { response: event.response, threadId: session, fact: { ...actual, usage: event.usage.last_token_usage, failure } };
        }, () => {});
        assert.equal(cursor, original.turns.length);
        assert.deepEqual(JSON.parse(JSON.stringify(replay.actions)), original.actions);
        assert.deepEqual(replay.usage, verified.usage);
        assert.deepEqual(replay.writes, []);
        if (original.answer) assert.deepEqual(replay.answer, original.answer);
        if (replay.answer) assert.deepEqual(replay.answer.anchor, original.anchor);
        const recovery = original.answer ? 'live-verdict' : finishedOffline && replay.answer ? 'offline-validated-final' : 'unfinished';
        audited.push({ finding: finding.id, repository: subject.repository, head: subject.head, anchor: original.anchor,
            liveFailure: original.failure, recovery, failure: replay.failure, answer: replay.answer,
            calls: original.turns.length, wallMs: original.wallMs, usage: verified.usage,
            sessionSha256: session, rolloutSha256: verified.rolloutSha256, terminalSha256: hash(JSON.stringify(terminal)),
            ...(hasFinal ? {} : { pendingRequests: terminal.requests.map(({ op, target, why }) => ({ op, target, why })) }) });
    }
    console.log(JSON.stringify({ preregistration: raw[0].freeze, ledgerSha256: hash(ledgerBytes),
        started, finished, modelCallsAdded: 0, writeAttempts: 0, accounting: 'per-turn deltas verified against final cumulative usage',
        audited }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
