import type { BugbotBenchmarkCase } from '../../bugbot_benchmark';

// Owned inert Kotlin examples; public Ktor 3.0.2 source/bytecode corroborate the API contract.
const cases: readonly BugbotBenchmarkCase[] = [
  {
    "id": "ktor-routing-installed-root",
    "language": "kotlin",
    "category": "negative",
    "description": "Owned inert Kotlin example using the public Ktor 3.0.2 routing contract. The pinned public RoutingRoot.kt blob 7519c959a6caba4c1b3fb3c7e429ded46e2f21e8 implements Application.routing as pluginOrNull(RoutingRoot)?.apply(configuration) ?: install(RoutingRoot, configuration); independent public 3.0.2 jar disassembly corroborates the same-object return on reuse. This is source/bytecode evidence, not execution of this example or private dependency resolution. The caller supplies two distinct Applications; the first begins without routing, then the shown setup installs exactly one child. The selected node must preserve the complete installed root identity, checked by this active caller. Review the added selection; no other files or hidden framework overrides are in scope.",
    "file": "backend/OwnedRoutingSelection.kt",
    "startLine": 1,
    "diff": " import io.ktor.server.application.Application\n import io.ktor.server.routing.*\n fun existingRoot(app: Application): RoutingRoot = app.routing {}\n fun selectForExport(app: Application, otherApp: Application): RoutingNode {\n     val installed = app.routing { route(\"/owned\") {} }\n+    val selected = app.routing {}\n     check(selected === installed) { \"Export must retain the entire installed root\" }\n     return selected\n }",
    "expected": []
  },
  {
    "id": "ktor-routing-delegated-root",
    "language": "kotlin",
    "category": "negative",
    "description": "Owned inert Kotlin example using the public Ktor 3.0.2 routing contract. The pinned public RoutingRoot.kt blob 7519c959a6caba4c1b3fb3c7e429ded46e2f21e8 implements Application.routing as pluginOrNull(RoutingRoot)?.apply(configuration) ?: install(RoutingRoot, configuration); independent public 3.0.2 jar disassembly corroborates the same-object return on reuse. This is source/bytecode evidence, not execution of this example or private dependency resolution. The caller supplies two distinct Applications; the first begins without routing, then the shown setup installs exactly one child. The selected node must preserve the complete installed root identity, checked by this active caller. Review the added selection; no other files or hidden framework overrides are in scope.",
    "file": "backend/OwnedRoutingSelection.kt",
    "startLine": 1,
    "diff": " import io.ktor.server.application.Application\n import io.ktor.server.routing.*\n fun existingRoot(app: Application): RoutingRoot = app.routing {}\n fun selectForExport(app: Application, otherApp: Application): RoutingNode {\n     val installed = app.routing { route(\"/owned\") {} }\n+    val selected = existingRoot(app)\n     check(selected === installed) { \"Export must retain the entire installed root\" }\n     return selected\n }",
    "expected": []
  },
  {
    "id": "ktor-routing-configured-root",
    "language": "kotlin",
    "category": "negative",
    "description": "Owned inert Kotlin example using the public Ktor 3.0.2 routing contract. The pinned public RoutingRoot.kt blob 7519c959a6caba4c1b3fb3c7e429ded46e2f21e8 implements Application.routing as pluginOrNull(RoutingRoot)?.apply(configuration) ?: install(RoutingRoot, configuration); independent public 3.0.2 jar disassembly corroborates the same-object return on reuse. This is source/bytecode evidence, not execution of this example or private dependency resolution. The caller supplies two distinct Applications; the first begins without routing, then the shown setup installs exactly one child. The selected node must preserve the complete installed root identity, checked by this active caller. Review the added selection; no other files or hidden framework overrides are in scope.",
    "file": "backend/OwnedRoutingSelection.kt",
    "startLine": 1,
    "diff": " import io.ktor.server.application.Application\n import io.ktor.server.routing.*\n fun existingRoot(app: Application): RoutingRoot = app.routing {}\n fun selectForExport(app: Application, otherApp: Application): RoutingNode {\n     val installed = app.routing { route(\"/owned\") {} }\n+    val selected = app.routing { route(\"/extra\") {} }\n     check(selected === installed) { \"Export must retain the entire installed root\" }\n     return selected\n }",
    "expected": []
  },
  {
    "id": "ktor-routing-child-subtree",
    "language": "kotlin",
    "category": "correctness",
    "description": "Owned inert Kotlin example using the public Ktor 3.0.2 routing contract. The pinned public RoutingRoot.kt blob 7519c959a6caba4c1b3fb3c7e429ded46e2f21e8 implements Application.routing as pluginOrNull(RoutingRoot)?.apply(configuration) ?: install(RoutingRoot, configuration); independent public 3.0.2 jar disassembly corroborates the same-object return on reuse. This is source/bytecode evidence, not execution of this example or private dependency resolution. The caller supplies two distinct Applications; the first begins without routing, then the shown setup installs exactly one child. The selected node must preserve the complete installed root identity, checked by this active caller. Review the added selection; no other files or hidden framework overrides are in scope.",
    "file": "backend/OwnedRoutingSelection.kt",
    "startLine": 1,
    "diff": " import io.ktor.server.application.Application\n import io.ktor.server.routing.*\n fun existingRoot(app: Application): RoutingRoot = app.routing {}\n fun selectForExport(app: Application, otherApp: Application): RoutingNode {\n     val installed = app.routing { route(\"/owned\") {} }\n+    val selected = installed.children.single()\n     check(selected === installed) { \"Export must retain the entire installed root\" }\n     return selected\n }",
    "expected": [
      {
        "id": "ktor-routing-child-subtree",
        "title": "The changed selection loses the installed application routing root",
        "file": "backend/OwnedRoutingSelection.kt",
        "line": 6,
        "severity": "medium",
        "category": "correctness",
        "codeSnippet": "    val selected = installed.children.single()"
      }
    ]
  },
  {
    "id": "ktor-routing-different-application",
    "language": "kotlin",
    "category": "correctness",
    "description": "Owned inert Kotlin example using the public Ktor 3.0.2 routing contract. The pinned public RoutingRoot.kt blob 7519c959a6caba4c1b3fb3c7e429ded46e2f21e8 implements Application.routing as pluginOrNull(RoutingRoot)?.apply(configuration) ?: install(RoutingRoot, configuration); independent public 3.0.2 jar disassembly corroborates the same-object return on reuse. This is source/bytecode evidence, not execution of this example or private dependency resolution. The caller supplies two distinct Applications; the first begins without routing, then the shown setup installs exactly one child. The selected node must preserve the complete installed root identity, checked by this active caller. Review the added selection; no other files or hidden framework overrides are in scope.",
    "file": "backend/OwnedRoutingSelection.kt",
    "startLine": 1,
    "diff": " import io.ktor.server.application.Application\n import io.ktor.server.routing.*\n fun existingRoot(app: Application): RoutingRoot = app.routing {}\n fun selectForExport(app: Application, otherApp: Application): RoutingNode {\n     val installed = app.routing { route(\"/owned\") {} }\n+    val selected = otherApp.routing {}\n     check(selected === installed) { \"Export must retain the entire installed root\" }\n     return selected\n }",
    "expected": [
      {
        "id": "ktor-routing-different-application",
        "title": "The changed selection loses the installed application routing root",
        "file": "backend/OwnedRoutingSelection.kt",
        "line": 6,
        "severity": "medium",
        "category": "correctness",
        "codeSnippet": "    val selected = otherApp.routing {}"
      }
    ]
  },
  {
    "id": "ktor-routing-unavailable-implementation",
    "language": "kotlin",
    "category": "negative",
    "file": "backend/OwnedRoutingSelection.kt",
    "startLine": 1,
    "description": "Only this delegated root-selection call is available. The selectConfiguredRoot declaration, dependency version and implementation are unavailable. No concrete identity mismatch or unconditional export failure is established by the supplied evidence.",
    "diff": " fun selectForExport(app: Application): RoutingNode {\n+    return selectConfiguredRoot(app)\n }",
    "expected": []
  }
];
export const KTOR_ROUTING_CASES: readonly BugbotBenchmarkCase[] = Object.freeze(cases.map(item => Object.freeze({
  ...item, expected: Object.freeze(item.expected.map(finding => Object.freeze({ ...finding }))),
})));

export type KtorRoutingObservation = { readonly kind: 'unavailable' } | {
  readonly kind: 'selection'; readonly receiver: 'app' | 'otherApp';
  readonly selected: 'installed-root' | 'installed-child' | 'other-root'; readonly preservesRoot: boolean;
};

/** Fixed authored object-identity controls; not a Kotlin evaluator or consumer runtime execution. */
export function observeKtorRouting(input: Pick<BugbotBenchmarkCase, 'id' | 'diff'>): KtorRoutingObservation {
  const trusted = KTOR_ROUTING_CASES.find(item => item.id === input.id);
  if (!trusted || input.diff !== trusted.diff) throw new Error('Unknown or modified Ktor routing fixture.');
  if (trusted.id === 'ktor-routing-unavailable-implementation') return { kind: 'unavailable' };
  const root = Object.freeze({ owner: 'app', kind: 'root' });
  const child = Object.freeze({ owner: 'app', kind: 'child' });
  const other = Object.freeze({ owner: 'otherApp', kind: 'root' });
  const selected = trusted.id === 'ktor-routing-child-subtree' ? child
    : trusted.id === 'ktor-routing-different-application' ? other : root;
  return Object.freeze({ kind: 'selection', receiver: selected === other ? 'otherApp' : 'app',
    selected: selected === other ? 'other-root' : selected === child ? 'installed-child' : 'installed-root',
    preservesRoot: selected === root });
}
