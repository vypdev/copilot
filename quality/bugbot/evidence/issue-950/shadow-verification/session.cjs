'use strict';

const runtime = require('../../../../../src/infrastructure/bugbot/shadow/session.cjs');

function ask(request) {
    const { configuration } = request;
    const executable = configuration.executable || process.env.BUGBOT_PILOT_CODEX;
    return runtime.ask({ ...request, configuration: { ...configuration, executable } });
}

module.exports = { ...runtime, ask };
