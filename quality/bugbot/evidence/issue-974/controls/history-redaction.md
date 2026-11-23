# Historical host-path privacy redaction

The maintainer requested removal of the account identifier carried in historical
Docker host paths. The public branch now replaces that exact prefix in21 JSON
blobs. Every other entry remains byte-identical in each historical snapshot;
44 of53 commit IDs change through content or ancestry. No invalidated signatures
were present. The sanitized tip was byte-identical to89db before this locator
and provenance follow-up. The [public retention summary](history-redaction.json) records the controlled
exception and sanitized mirror IDs. The exact original commit/blob/path mapping
is retained privately with its byte count and SHA-256; current public descriptors
do not repeat the original locator associations. Earlier Git versions still
contain them, so this minimization does not establish hosted erasure.

An isolated scan of1,068 introduced reachable blobs, including365 decoded gzip
objects, found zero remaining target prefixes. All21 modified JSON documents
parse; connectivity and strict diff checks pass. The normal pre-push hook was
preserved: the first bare-repository attempt stopped locally, and publication
succeeded from an owned worktree with the same exact-head lease. Default and
develop, tags, protections and runner privileges were unchanged.

Original scientific measured source093fd141 and preregistration07f21a4 remain
actual historical execution identities, not identities of a new experiment.
The mirror of that source is82235ac53e8c9477bdc8041112e8ccb9e56d3ccc. The frozen
174-case negative result,200 scientific SDK invocations and one technical
control remain unchanged. There is no new qualification, Sol call or42-case
execution. The original graph and21 original blobs are retained privately in a
verified4,517,856-byte Git bundle and61,904-byte ZIP, named/hashed in the public retention summary.

Retrieval-only archive revisions now point at reachable sanitized mirrors.
The114-entry index and129-entry source093 index retain every original Git blob,
gzip/decoded length and digest. Original archive revision fields remain explicit
historical identities. These are unchanged log bytes, not anonymized log data.
Historical rewritten plans are derived redacted evidence and must never be
substituted for original private live execution authority.

Hosted removal is incomplete. After the branch update, unauthenticated GitHub
raw access still returned an original6,075-byte document containing the account
prefix; its sanitized mirror returned6,065 bytes without it. Twenty-one historical
review-comment diff hunks also retained the prefix. GitHub Support must address
internal refs/cached views; the open finding is not declared fully resolved.
See [GitHub’s removal procedure](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

Production remains disabled, pilot write attempts0, installation NOT_EXECUTED
and qualified profile NONE. Protected main checkout and its17 stashes remain
unchanged. This privacy operation changes no publication or installation gate.
