#!/usr/bin/env node

import { createCliProgram } from './cli/cli_program';

const program = createCliProgram();

if (typeof process.env.JEST_WORKER_ID === 'undefined') {
  void program.parseAsync(process.argv).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { program };
