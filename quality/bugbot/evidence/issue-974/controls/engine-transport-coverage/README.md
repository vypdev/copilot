# Engine HTTP component coverage

C27 uses the unchanged production engine transport against an owned Unix HTTP server. The modeled admission is explicit: this is component coverage, separate from actual Docker/SDK acceptance. Unknown/lost create replies do not replay or remove uncorrelated state; ownership/configuration mutations refuse; actual attach, wait, stop/escalation, durable-record failures, credentials staging and cleanup paths are exercised. All fake credentials are fixed component strings.

The repository component passes one selected C27 group without failures, omissions or cancellations: statements98.82%, lines100%, branches93.08%, functions93.61% at source6ca0073384a9eca948de6505310c66c8119f919cb362eeaf88bd4e0cf8c3d668. The full240 command retains the same logical control inventory because these faults are part of C27. This does not satisfy the global changed-module gate. Earlier EPERM, observer and below-threshold prototype outcomes remain recorded in prototype-history.json and their raw text; no partial native runs or unlike coverage frameworks are pooled.

Rerun with a fresh private output directory:

```sh
EV974_COMPONENT_COVERAGE_OUTPUT=/private/tmp/fresh-engine-component-coverage node --test --test-name-pattern=ev974-C27 quality/bugbot/evidence/issue-974/controls/engine-transport-coverage/coverage.cjs
```

The driver verifies exact source bytes on every observed module/VM compile and instruments only the component test process. It is never loaded by the qualification bootstrap or native model execution.

The first public-driver run reached the same metrics but failed its temporary Git repository cleanup with ENOTEMPTY; it is retained as a failed command. C27 disables Git automatic maintenance/gc only in its owned fixture commands; no cleanup error or assertion is suppressed. The public driver then passes1/1 with unchanged engine bytes and metrics. See fixture-cleanup-correction.json for the causal limits and retained leftover inventory.
