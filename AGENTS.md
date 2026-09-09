## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Product specifications

When creating, revising, or reviewing a product/engineering specification, SDD,
or implementation RFC:

1. Read `.agents/skills/product-specification/SKILL.md` in full before drafting.
2. Apply the canonical quality standard in `specs/README.md`.
3. Start new specifications from `specs/_template.md`, adapting sections to the
   risk and scope instead of deleting a concern silently.
4. Treat GitHub issues, pull requests, comments, checks, and Job Summaries as
   product UI whenever users or maintainers interact with them.
5. Include concrete flows, diagrams, representative UI/content examples, a
   numeric test budget, documentation work, configuration boundaries, and
   executable acceptance criteria whenever applicable.
