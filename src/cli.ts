#!/usr/bin/env node

import { createCliProgram } from './cli/cli_program';

const program = createCliProgram();

if (typeof process.env.JEST_WORKER_ID === 'undefined') {
  program.parse(process.argv);
}

export { program };
