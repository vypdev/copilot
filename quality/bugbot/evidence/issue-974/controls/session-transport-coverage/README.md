# Session transport regression and exact-source AST coverage

The repository now includes one provider child/timer fault group, in addition to the unchanged62 semantic tests. All63 groups pass, with no failures/skips/cancellations. Exact unchanged session source SHA256 3234f7356290c1993d6fa6d6754c3ab897f6e40228e2834906d94bf0a344d0f4 has134/134 statements,109/109 branches,22/22 functions and103/103 lines covered. The earlier two below-threshold baselines remain retained separately.

Run the coverage-only driver from the checkout with an absent output directory:

```sh
node quality/bugbot/evidence/issue-974/controls/session-transport-coverage/coverage-runner.cjs "$PWD" /private/tmp/session-coverage-new-output
```

This harness instruments only the byte-matching original session module, including its unchanged source compiled with controlled provider child/timer dependencies by the unit group. It never enters the qualification bootstrap or calls a model. This is component coverage, separate from the native SDK evidence and all other changed-module/global gates. The normal full Node command now registers240 controls; preceding239 outcomes remain historical facts for their pinned commits.
