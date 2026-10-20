# Web setup screenshots

`setup-web-pairing.png` and `setup-web-plan.png` show the committed browser UI
with the read-only `plan` and `question` fixtures served by
`node scripts/serve-web-setup-review.cjs <state>`.
They contain public fixture identities and no real PAT, provider credential or
installation result. The pairing screenshot is taken before entering the public
fixture code; the plan screenshot shows its example decision summary.

To refresh them, follow `docs/development/setup-assistant-review.mdx`, inspect the
screens in the browser, and capture the corresponding states. Keep the fixture
captions in the tutorial: these images illustrate the UI and do not prove a
successful setup, provider authentication or end-to-end acceptance pass.
