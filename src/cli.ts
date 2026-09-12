#!/usr/bin/env node

import { createCliProgram } from './cli/cli_program';
import { runAtApplicationErrorBoundary } from './application/errors/application_error_context';
import { toApplicationError } from './application/errors/application_error';
import { renderApplicationErrorText } from './application/policies/application_error_presentation_policy';

const program = createCliProgram();

if (typeof process.env.JEST_WORKER_ID === 'undefined') {
  void runAtApplicationErrorBoundary(
    () => program.parseAsync(process.argv).catch((cause: unknown) => {
      const semanticError = toApplicationError(cause, 'workflow.failed', 'CLI execution failed.');
      console.error(renderApplicationErrorText(semanticError));
      process.exitCode = semanticError.code === 'workflow.cancelled' ? 130 : 1;
    }),
  );
}

export { program };
