'use strict';

const { readFileSync } = require('node:fs');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { corpus } = require('./configuration.cjs');

function requirePassingCorpus(campaign) {
    if (!campaign) throw new Error('usage: node launch-full-review.cjs <campaign directory>');
    const directory = path.resolve(campaign);
    let result;
    try { result = JSON.parse(readFileSync(path.join(directory, 'corpus-v3', 'corpus-score.json'), 'utf8')); }
    catch { throw new Error('The independent corpus score is missing, unreadable, or invalid. Full review was not started.'); }
    if (result?.complete !== true || result.completed !== corpus.cases || result.passed !== true
        || result.githubWriteAttempts !== 0 || result.workspaceUnchanged !== true
        || !Array.isArray(result.score?.violations) || result.score.violations.length !== 0
        || !Array.isArray(result.score?.missingCases) || result.score.missingCases.length !== 0) {
        throw new Error('The independent corpus gate did not pass. Full review was not started.');
    }
    return directory;
}

function launchFullReview(campaign, launch = spawn) {
    const directory = requirePassingCorpus(campaign);
    return launch(process.execPath, [path.join(__dirname, 'full-review.cjs'), directory], { stdio: 'inherit' });
}

if (require.main === module) {
    try {
        const child = launchFullReview(process.argv[2]);
        const interrupt = () => child.kill('SIGINT');
        const terminate = () => child.kill('SIGTERM');
        process.once('SIGINT', interrupt);
        process.once('SIGTERM', terminate);
        child.once('error', () => { process.exitCode = 1; });
        child.once('close', (code, signal) => {
            process.removeListener('SIGINT', interrupt);
            process.removeListener('SIGTERM', terminate);
            process.exitCode = code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1);
        });
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { launchFullReview, requirePassingCorpus };
