'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { investigate } = require('./run.cjs');
const { ask } = require('./session.cjs');
const { git, blob } = require('../shadow-real-prs/broker.cjs');

function createShadowVerifier(lab, log, transport = ask) {
    return {
        async verify({ candidate, configuration }) {
            const { owner, name } = candidate.repository;
            if (configuration.provider !== 'codex') {
                return { status: 'technical-failure', reason: 'shadow-provider-unavailable' };
            }
            const repo = path.join(lab, name + '.git');
            const head = candidate.headSha;
            const base = candidate.baseSha ?? head;
            if (git(repo, ['remote']) !== '') return { status: 'technical-failure', reason: 'shadow-repository-remote' };
            const subject = { repository: `${owner}/${name}`, head, base,
                tree: git(repo, ['rev-parse', head + '^{tree}']).trim(),
                baseTree: git(repo, ['rev-parse', base + '^{tree}']).trim() };
            const { path: file, line, end, side } = candidate.anchor;
            const anchor = blob(repo, side === 'LEFT' ? base : head, file);
            if (line > anchor.lines.length || end > anchor.lines.length) {
                return { status: 'technical-failure', reason: 'shadow-anchor-unavailable' };
            }
            const finding = { id: candidate.id, hypothesis: candidate.hypothesis, detectorLocation: candidate.anchor,
                allowBase: candidate.allowBase };
            const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'bugbot-integrated-shadow-'));
            try {
                const result = await investigate(lab, subject, finding, cwd,
                    request => transport({ ...request, configuration }), log);
                log({ ...result, resolvedModel: configuration.model });
                const models = new Set(result.turns.flatMap(turn => turn.reportedModel ? [turn.reportedModel] : []));
                const reportedModel = [...models].find(model => model !== configuration.model) ?? [...models][0];
                if (!result.answer) return { status: 'technical-failure', reason: result.failure, reportedModel };
                const { label, reason, missing, citations, premises } = result.answer;
                return { status: 'verdict', verdict: label, reason, missing, citations, premises, reportedModel };
            } finally {
                fs.rmSync(cwd, { recursive: true, force: true });
            }
        },
    };
}

module.exports = { createShadowVerifier };
