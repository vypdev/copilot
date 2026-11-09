"""Read pinned Python syntax through one bounded Git source ledger."""

import ast
import json
import re
import subprocess
import sys
import threading
import time
from pathlib import PurePosixPath


class Stop(Exception):
    def __init__(self, status, reason, paths=()):
        self.result = {"status": status, "reason": reason}
        if paths:
            self.result["paths"] = sorted(set(paths))


def one(values, reason):
    if len(values) != 1:
        raise Stop("ambiguous" if values else "unresolved", reason)
    return values[0]


def dotted(node):
    if isinstance(node, ast.Name):
        return (node.id,)
    if isinstance(node, ast.Attribute):
        base = dotted(node.value)
        return (*base, node.attr) if base else ()
    return ()


def assignment(node):
    if isinstance(node, ast.AnnAssign):
        return node.target, node.value
    if isinstance(node, ast.Assign) and len(node.targets) == 1:
        return node.targets[0], node.value
    return None, None


FUNCTION = (ast.FunctionDef, ast.AsyncFunctionDef)
DECLARATION = (ast.ClassDef, *FUNCTION)


def local_walk(node):
    for child in ast.iter_child_nodes(node):
        if not isinstance(child, DECLARATION):
            yield child
            yield from local_walk(child)


def inside(name, scope):
    return not scope or name == scope or name.startswith(scope + "/")


def safe_path(path):
    return not re.search(r"[\x00-\x1f\x7f\\:]", path) and all(
        part and part.lower() not in (".", "..", ".git") for part in path.split("/")
    )


class Source:
    def __init__(self, config):
        self.config = config
        self.caps = config["caps"]
        self.started = time.monotonic()
        self.deadline = self.started + self.caps["sourceWallMs"] / 1000
        self.usage = dict(gitCalls=0, treeEntries=0, diffEntries=0, discoveryBytes=0, openedFiles=0,
                          sourceBytes=0, matches=0)
        self.files = {}
        self.modules = {}

    def remaining(self):
        left = self.deadline - time.monotonic()
        if left <= 0:
            raise Stop("expired", "source-deadline")
        return left

    def git(self, args, limit, discovery=False):
        timeout = min(self.remaining(), self.caps["gitCallMs"] / 1000)
        self.usage["gitCalls"] += 1
        with subprocess.Popen(["git", "-C", self.config["cwd"], "--no-replace-objects", "--literal-pathspecs", *args],
                              stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as child:
            timer = threading.Timer(timeout, child.kill)
            timer.start()
            try:
                data = child.stdout.read(limit + 1)
                if len(data) > limit:
                    child.kill()
                    raise Stop("budget", "git-output-budget")
                result = child.wait()
            finally:
                timer.cancel()
            if result != 0:
                raise Stop("expired" if result < 0 else "unavailable", "git-command-failed")
        self.remaining()
        if discovery:
            self.usage["discoveryBytes"] += len(data)
            if self.usage["discoveryBytes"] > self.caps["treeBytes"]:
                raise Stop("budget", "discovery-byte-budget")
        return data

    def inventory(self):
        binding = self.config["binding"]
        head = binding["head"]
        base = self.config["context"]["base"]
        cap = self.caps["treeBytes"]
        if self.git(["rev-parse", head + "^{tree}"], 64).decode().strip() != binding["tree"]:
            raise Stop("denied", "revision-tree-mismatch")
        scopes = binding["scopes"]
        # Restrict all discovered paths to the original search targets and the
        # application authority. The locator receives no candidate file shortlist.
        targets = [target["scope"] for target in self.config["request"]["targets"]]
        within = lambda path: any(inside(path, scope) for scope in scopes) and any(inside(path, scope) for scope in targets)
        entries = self.git(["ls-tree", "-r", "-z", "--full-tree", binding["tree"], "--",
                            *([] if "" in targets else sorted(set(targets)))], cap, discovery=True).split(b"\0")
        self.usage["treeEntries"] = len(entries) - 1
        changed = self.git(["diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--name-only",
                            "--diff-filter=AMT", "-z", base, head, "--",
                            *([] if "" in targets else sorted(set(targets)))], cap, discovery=True)
        self.changed = set(changed.decode().split("\0")) - {""}
        self.usage["diffEntries"] = len(self.changed)
        if self.usage["treeEntries"] + self.usage["diffEntries"] > self.caps["treeEntries"]:
            raise Stop("budget", "tree-entry-budget")
        for entry in entries:
            match = re.fullmatch(rb"100(?:644|755) blob ([a-f0-9]{40})\t(.+)", entry)
            if match:
                try:
                    path = match[2].decode()
                except UnicodeError:
                    continue
                if safe_path(path) and path.endswith(".py") and within(path):
                    self.files[path] = match[1].decode()
        if self.config["context"]["anchor"]["path"] not in self.changed:
            raise Stop("unresolved", "anchor-outside-comparison")

    def module(self, path):
        if path in self.modules:
            return self.modules[path]
        if self.usage["openedFiles"] >= self.caps["openedFiles"]:
            raise Stop("budget", "opened-file-budget")
        oid = self.files[path]
        size = int(self.git(["cat-file", "-s", oid], 64))
        if size > self.caps["blobBytes"] or (
            size + self.usage["sourceBytes"] + self.usage["discoveryBytes"] > self.caps["scanBytes"]
        ):
            raise Stop("budget", "scan-byte-budget")
        self.usage["openedFiles"] += 1
        self.usage["sourceBytes"] += size
        data = self.git(["cat-file", "blob", oid], size)
        try:
            module = Module(path, data.decode())
        except (SyntaxError, UnicodeError):
            raise Stop("unresolved", "source-syntax-unavailable") from None
        self.modules[path] = module
        return module

    def hits(self, amount):
        self.usage["matches"] += amount
        if self.usage["matches"] > self.caps["matches"]:
            raise Stop("budget", "match-budget")

    def callers(self, module, function, owner):
        for call in module.caller_candidates(function.name, owner):
            name = dotted(call.func)
            for enclosing in (node for node in module.parents_of(call) if isinstance(node, FUNCTION)):
                if parameter(enclosing, name[0]) or any(
                    dotted(assignment(node)[0]) == (name[0],) for node in local_walk(enclosing)
                ):
                    raise Stop("unresolved", "imported-call-shadowed", [module.path])
            if self.resolve(module, name) == (owner, function):
                yield call

    def resolve(self, module, name):
        identity = module.identity(name)
        if not identity:
            return None
        path, symbol = identity
        if isinstance(path, tuple):
            tail = "/".join(path)
            paths = [candidate for candidate in self.files
                     if candidate == tail + ".py" or candidate.endswith("/" + tail + ".py")
                     or candidate == tail + "/__init__.py" or candidate.endswith("/" + tail + "/__init__.py")]
            if len(paths) > 1:
                raise Stop("ambiguous", "import-module-ambiguous", paths)
            if not paths:
                return None
            path = paths[0]
        other = self.module(path)
        definitions = [node for node in other.tree.body if isinstance(node, DECLARATION) and node.name == symbol]
        if len(definitions) > 1:
            raise Stop("ambiguous", "symbol-definition-ambiguous", [path])
        return (other, definitions[0]) if definitions else None


class Module:
    def __init__(self, path, text):
        self.path = path
        self.lines = text.replace("\r\n", "\n").split("\n")
        self.tree = ast.parse(text, filename=path)
        self.parents = {child: node for node in ast.walk(self.tree) for child in ast.iter_child_nodes(node)}
        self.imports = {}
        for item in self.tree.body:
            if isinstance(item, ast.ImportFrom) and item.level == 0 and item.module:
                for name in item.names:
                    self.imports[name.asname or name.name] = (tuple(item.module.split(".")), name.name, item)
            elif isinstance(item, ast.Import):
                for name in item.names:
                    if name.asname or "." not in name.name:
                        self.imports[name.asname or name.name] = (tuple(name.name.split(".")), "", item)

    def identity(self, names):
        if not names:
            return None
        first, *rest = names
        if first in self.imports:
            parts, symbol, _ = self.imports[first]
            members = ([symbol] if symbol else []) + rest
            return (parts + tuple(members[:-1]), members[-1]) if members else None
        if not rest and any(isinstance(node, DECLARATION) and node.name == first for node in self.tree.body):
            return (self.path, first)
        return None

    def parents_of(self, node):
        while node in self.parents:
            node = self.parents[node]
            yield node

    def caller_candidates(self, name, source_module):
        for node in ast.walk(self.tree):
            if not isinstance(node, ast.Call):
                continue
            identity = self.identity(dotted(node.func))
            if not identity or identity[1] != name:
                continue
            path = identity[0]
            if isinstance(path, tuple):
                suffix = "/".join(path) + ".py"
                if source_module.path == suffix or source_module.path.endswith("/" + suffix):
                    yield node
            elif path == source_module.path:
                yield node


def method(cls, name):
    return one([node for node in cls.body if isinstance(node, FUNCTION) and node.name == name], "method-link-missing")


def parameter(func, name):
    for index, arg in enumerate([*func.args.posonlyargs, *func.args.args]):
        if arg.arg == name:
            return index, arg
    for arg in func.args.kwonlyargs:
        if arg.arg == name:
            return None, arg
    return None


def argument(call, index, name):
    for keyword in call.keywords:
        if keyword.arg == name:
            return keyword.value
    if index is not None and index < len(call.args) and not any(isinstance(arg, ast.Starred) for arg in call.args[:index + 1]):
        return call.args[index]
    raise Stop("unresolved", "constructor-argument-missing")


def declaration_only(node):
    return all(isinstance(stmt, ast.Pass) or isinstance(stmt, ast.Expr)
               and isinstance(stmt.value, ast.Constant) and (stmt.value.value is Ellipsis or isinstance(stmt.value.value, str))
               for stmt in node.body)


def abstract_class(cls):
    return any(dotted(base)[-1:] in (("Protocol",), ("ABC",)) for base in cls.bases)


def annotation_type(expr, module, at, variable):
    if isinstance(expr, ast.BinOp) and isinstance(expr.op, ast.BitOr):
        values = [node for node in (expr.left, expr.right)
                  if not (isinstance(node, ast.Constant) and node.value is None)]
        guarded = any(isinstance(node, ast.If) and isinstance(node.test, ast.Compare)
                      and dotted(node.test.left) == (variable,) and len(node.test.ops) == 1
                      and isinstance(node.test.ops[0], ast.IsNot) and isinstance(node.test.comparators[0], ast.Constant)
                      and node.test.comparators[0].value is None
                      and any(at in ast.walk(child) for child in node.body) for node in module.parents_of(at))
        return dotted(values[0]) if len(values) == 1 and guarded else ()
    return dotted(expr)


def binds(node, name):
    if isinstance(node, ast.Name):
        return node.id == name and isinstance(node.ctx, (ast.Store, ast.Del))
    if isinstance(node, (ast.Import, ast.ImportFrom)):
        return any((item.asname or item.name.split(".")[0]) == name for item in node.names)
    if isinstance(node, (*DECLARATION, ast.ExceptHandler, ast.MatchAs, ast.MatchStar)):
        return node.name == name
    return isinstance(node, ast.MatchMapping) and node.rest == name


def writes_name(node, name):
    if binds(node, name):
        return True
    return not isinstance(node, DECLARATION) and any(writes_name(child, name) for child in ast.iter_child_nodes(node))


def reaching_writes(module, function, use, name):
    """Track the last write on each supported path to the argument's evaluation."""
    ancestors = set(module.parents_of(use))
    if any(isinstance(node, (ast.Global, ast.Nonlocal)) and name in node.names for node in local_walk(function)):
        raise Stop("unresolved", "nonlocal-wiring-unproven")

    def branch_contains(statements):
        return any(stmt in ancestors for stmt in statements)

    def alternatives(stmt):
        if isinstance(stmt.test, ast.Constant) and type(stmt.test.value) is bool:
            return (stmt.body if stmt.test.value else stmt.orelse,)
        return stmt.body, stmt.orelse

    def walk(statements, reached):
        for stmt in statements:
            if stmt in ancestors:
                if isinstance(stmt, ast.If):
                    if writes_name(stmt.test, name):
                        raise Stop("unresolved", "wiring-condition-writes")
                    for branch in (stmt.body, stmt.orelse):
                        if branch_contains(branch):
                            return walk(branch, reached) if branch in alternatives(stmt) else ()
                    return reached
                if isinstance(stmt, (ast.Assign, ast.AnnAssign, ast.Expr, ast.Return)):
                    if any(isinstance(node, ast.NamedExpr) and writes_name(node, name) for node in local_walk(stmt)):
                        raise Stop("unresolved", "wiring-expression-writes")
                    # The RHS, including the constructor argument, is evaluated
                    # before the assignment target is written.
                    return reached
                raise Stop("unresolved", "wiring-control-flow-unproven")
            if not reached:
                break
            if isinstance(stmt, (ast.Return, ast.Raise)):
                return ()
            if isinstance(stmt, ast.If):
                if writes_name(stmt.test, name):
                    raise Stop("unresolved", "wiring-condition-writes")
                reached = tuple(dict.fromkeys(write for branch in alternatives(stmt) for write in walk(branch, reached)))
                continue
            lhs, value = assignment(stmt)
            if dotted(lhs) == (name,):
                if value is not None:
                    reached = (stmt,)
                continue
            if writes_name(stmt, name):
                raise Stop("unresolved", "wiring-write-unproven")
        return reached

    return walk(function.body, (None,))


def local_origin(module, node):
    name = node.id
    for depth, function in enumerate(item for item in module.parents_of(node) if isinstance(item, FUNCTION)):
        if any(isinstance(item, ast.Global) and name in item.names for item in local_walk(function)):
            raise Stop("unresolved", "global-wiring-unproven")
        param = parameter(function, name)
        writes = any(writes_name(stmt, name) for stmt in function.body)
        if not (param or writes):
            continue
        if depth and writes:
            # A closure's invocation can occur after later outer writes.
            raise Stop("unresolved", "closure-binding-unproven")
        reached = (None,) if depth else reaching_writes(module, function, node, name)
        write = one(reached, "wiring-assignment-ambiguous")
        if write is not None:
            return write, assignment(write)[1], None
        if param is not None:
            return function, None, param
        break
    raise Stop("unresolved", "effective-constructor-unproven")


def concrete_class(source, module, call):
    if not isinstance(call, ast.Call):
        return None
    name = dotted(call.func)
    if name and any(
        parameter(func, name[0]) or any(writes_name(stmt, name[0]) for stmt in func.body)
        for func in module.parents_of(call) if isinstance(func, FUNCTION)
    ):
        raise Stop("unresolved", "constructor-shadowed")
    resolved = source.resolve(module, name)
    return resolved if resolved and isinstance(resolved[1], ast.ClassDef) and not abstract_class(resolved[1]) else None


def entry_constructors(source, modules, function, owner, index, name, optional):
    """Collect concrete origins proved at the call site of the annotated wiring."""
    constructors = []
    for module in modules:
        for call in source.callers(module, function, owner):
            actual = argument(call, index, name)
            enclosing = next((node for node in module.parents_of(call) if isinstance(node, FUNCTION)), None)
            values = [(actual, actual)]
            if enclosing and isinstance(actual, ast.Name):
                reached = reaching_writes(module, enclosing, actual, actual.id)
                values = [(stmt, assignment(stmt)[1]) for stmt in reached if stmt is not None]
                if values and None in reached:
                    raise Stop("ambiguous", "wiring-entry-assignment-ambiguous")
            if optional:
                values = [(site, value) for site, value in values
                          if not isinstance(value, ast.Constant) or value.value is not None]
            if len(values) > 1:
                raise Stop("ambiguous", "wiring-entry-assignment-ambiguous")
            for site, value in values:
                concrete = concrete_class(source, module, value)
                if concrete:
                    constructors.append((concrete, ((module, site), (module, call))))
    source.hits(len(constructors))
    return constructors


def wiring_origin(source, modules, module, node, trace=(), depth=0):
    if depth > 5:
        raise Stop("unresolved", "wiring-depth")
    if isinstance(node, ast.Call):
        resolved = concrete_class(source, module, node)
        if resolved:
            return [(resolved, trace + ((module, node),))]
    if not isinstance(node, ast.Name):
        raise Stop("unresolved", "effective-constructor-unproven")
    site, value, param = local_origin(module, node)
    if value is not None:
        return wiring_origin(source, modules, module, value, trace + ((module, site),), depth + 1)
    index, arg = param
    annotation = annotation_type(arg.annotation, module, node, node.id)
    resolved = source.resolve(module, annotation)
    if resolved and isinstance(resolved[1], ast.ClassDef) and not abstract_class(resolved[1]):
        constructors = entry_constructors(source, modules, site, module, index, node.id, isinstance(arg.annotation, ast.BinOp))
        if not constructors:
            raise Stop("unresolved", "concrete-entry-constructor-unproven")
        expected = (resolved[0].path, resolved[1].name)
        if any((origin.path, cls.name) != expected for (origin, cls), _ in constructors):
            raise Stop("ambiguous", "constructor-disagrees-with-wiring-type",
                       [origin.path for (origin, _), _ in constructors])
        imports = [module.imports[annotation[0]][2]] if annotation[0] in module.imports else []
        return [(resolved, trace + ((module, arg),) + tuple((module, item) for item in imports) + proof)
                for _, proof in constructors]
    callers = [(other, call) for other in modules for call in source.callers(other, site, module)]
    source.hits(len(callers))
    if not callers:
        raise Stop("unresolved", "effective-constructor-unproven")
    return [origin for other, call in callers for origin in wiring_origin(
        source, modules, other, argument(call, index, node.id), trace + ((module, arg), (other, call)), depth + 1)]


def collect(source):
    source.inventory()
    anchor = source.config["context"]["anchor"]
    if anchor["path"] not in source.files:
        raise Stop("unresolved", "anchor-source-missing")
    owner = source.module(anchor["path"])
    owner_func = one([func for func in owner.tree.body if isinstance(func, FUNCTION)
                      and func.lineno <= anchor["line"] <= func.end_lineno], "anchor-function-missing")
    targets = source.config["request"]["targets"]
    names = {match[1] for target in targets if inside(owner.path, target["scope"]) and target["match"] == "literal"
             if (match := re.fullmatch(r"(?:def )?([A-Za-z_]\w*)\(?", target["query"]))}
    calls = []
    for stmt in owner_func.body:
        lhs, call = assignment(stmt)
        chain = dotted(call.func) if isinstance(call, ast.Call) else ()
        if not isinstance(lhs, ast.Name) or len(chain) != 3 or chain[-1] not in names:
            continue
        guards = [guard for guard in owner_func.body if isinstance(guard, ast.If)
                  and stmt.lineno < guard.lineno and guard.end_lineno < anchor["line"]
                  and any(isinstance(item, ast.Name) and item.id == lhs.id for item in ast.walk(guard.test))
                  and any(isinstance(item, ast.Return) for item in guard.body)]
        if guards:
            calls.append((stmt, chain, guards[0]))
    statement, (receiver, field, requested), early_exit = one(calls, "causal-call-unproven")
    variable = assignment(statement)[0].id
    if parameter(owner_func, receiver) is None:
        raise Stop("unresolved", "receiver-is-not-a-parameter")
    if any(statement.lineno < getattr(node, "lineno", 0) < anchor["line"] and
           dotted(assignment(node)[0]) in ((variable,), (receiver,), (receiver, field)) for node in local_walk(owner_func)):
        raise Stop("unresolved", "caller-flow-reassigned")
    consuming = [stmt for stmt in owner_func.body if early_exit.end_lineno < stmt.lineno < anchor["line"]
                 and isinstance(assignment(stmt)[1], ast.Call)
                 and any(isinstance(node, ast.Name) and node.id == variable for node in ast.walk(assignment(stmt)[1]))]
    branch = one([node for node in owner_func.body if isinstance(node, ast.If)
                  and node.lineno <= anchor["line"] <= node.end_lineno
                  and any(dotted(assignment(stmt)[0]) and any(dotted(name) == dotted(assignment(stmt)[0])
                          for name in ast.walk(node.test)) for stmt in consuming)], "result-branch-unproven")
    consumer = one([stmt for stmt in consuming if any(dotted(name) == dotted(assignment(stmt)[0])
                    for name in ast.walk(branch.test))], "result-consumer-unproven")
    source.hits(1)
    stem = PurePosixPath(owner.path).stem
    directory = str(PurePosixPath(owner.path).parent)
    siblings = [path for path in source.files if str(PurePosixPath(path).parent) == directory
                and stem.startswith(PurePosixPath(path).stem + "_")]
    callers = []
    for path in sorted(siblings, key=lambda name: (name not in source.changed, name)):
        module = source.module(path)
        for call in source.callers(module, owner_func, owner):
            service = next((node for node in module.parents_of(call) if isinstance(node, ast.ClassDef)), None)
            for node in module.parents_of(call):
                if not service or not isinstance(node, ast.With):
                    continue
                for item in node.items:
                    chain = dotted(item.context_expr.func) if isinstance(item.context_expr, ast.Call) else ()
                    index, _ = parameter(owner_func, receiver)
                    if len(chain) == 3 and chain[0] == "self" and isinstance(item.optional_vars, ast.Name) and (
                        dotted(argument(call, index, receiver)) == (item.optional_vars.id,)
                    ):
                        callers.append((module, service, chain[1], chain[2], node, call))
    caller, service, injection, read_method, with_unit, call = one(callers, "transaction-caller-unproven")
    source.hits(1)
    declared = {stmt.target.id: stmt for stmt in service.body
                if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name)}
    fields = list(declared)
    if injection not in fields:
        raise Stop("unresolved", "injection-field-unproven")
    # Reverse discovery is bounded to conventional assembly/entry modules and
    # actual imported identities. The basename family only locates callers.
    assembly = {"composition", "wiring", "bootstrap", "entrypoints", "container"}
    modules = [source.module(path) for path in sorted(source.files)
               if assembly.intersection(PurePosixPath(path).parts[:-1])
               or PurePosixPath(path).stem in {"main", "app", *assembly}]
    constructors = [(module, node) for module in modules for node in source.callers(module, service, caller)]
    source.hits(len(constructors))
    if not constructors:
        raise Stop("unresolved", "service-construction-unproven")
    origins = [item for module, construct in constructors for item in wiring_origin(
        source, modules, module, argument(construct, fields.index(injection), injection), ((module, construct),))]
    classes = {(module.path, cls.name) for (module, cls), _ in origins}
    if len(classes) != 1:
        raise Stop("ambiguous", "effective-constructor-ambiguous", [path for path, _ in classes])
    (store, store_cls), wiring = origins[0]
    read = method(store_cls, read_method)
    outputs = [node.value for node in local_walk(read) if isinstance(node, (ast.Return, ast.Yield))]
    output = one(outputs, "transaction-return-unproven")
    transaction = read
    if isinstance(output, ast.Call) and dotted(output.func)[:1] == ("self",):
        transaction = method(store_cls, dotted(output.func)[-1])
        output = one([node.value for node in local_walk(transaction) if isinstance(node, ast.Yield)], "transaction-yield-unproven")
    unit = source.resolve(store, dotted(output.func)) if isinstance(output, ast.Call) else None
    if not unit or not isinstance(unit[1], ast.ClassDef):
        raise Stop("unresolved", "transaction-unit-unproven")
    unit_module, unit_cls = unit
    initializer = method(unit_cls, "__init__")
    bindings = [(node, assignment(node)[1]) for node in local_walk(initializer)
                if dotted(assignment(node)[0]) == ("self", field)]
    field_binding, value = one(bindings, "adapter-assignment-unproven")
    implementation = source.resolve(unit_module, dotted(value.func)) if isinstance(value, ast.Call) else None
    if not implementation or not isinstance(implementation[1], ast.ClassDef) or abstract_class(implementation[1]):
        raise Stop("unresolved", "concrete-adapter-unproven")
    adapter, adapter_cls = implementation
    if not any(inside(adapter.path, target["scope"]) and target["match"] == "literal"
               and re.fullmatch(r"(?:def )?" + re.escape(requested) + r"\(?", target["query"]) for target in targets):
        raise Stop("unresolved", "adapter-outside-method-scope")
    body = method(adapter_cls, requested)
    if declaration_only(body):
        raise Stop("unresolved", "method-declaration-only")
    consumer_call = assignment(consumer)[1]
    downstream = dotted(consumer_call.func)
    if downstream[:2] != (receiver, field) or len(downstream) != 3:
        raise Stop("unresolved", "result-consumer-adapter-unproven")
    consuming_body = method(adapter_cls, downstream[-1])
    if declaration_only(consuming_body):
        raise Stop("unresolved", "consumer-declaration-only")
    source.hits(2)

    def witness(module, start, end=None):
        return {"path": module.path, "start": start, "end": end or start}

    def import_witness(module, first):
        item = module.imports.get(first)
        return [witness(module, item[2].lineno, item[2].end_lineno)] if item else []

    with_line = with_unit.lineno
    init_import = import_witness(unit_module, dotted(value.func)[0])
    wiring_witnesses = []
    for module, node in wiring:
        if isinstance(node, ast.arg):
            func = next(item for item in module.parents_of(node) if isinstance(item, FUNCTION))
            wiring_witnesses.append(witness(module, func.lineno, node.end_lineno))
        else:
            wiring_witnesses.append(witness(module, node.lineno, node.end_lineno))
        for expression in ast.walk(node):
            if isinstance(expression, ast.Call) and (name := dotted(expression.func)):
                wiring_witnesses.extend(import_witness(module, name[0]))
    graph = [
        {"role": "caller", "symbol": service.name, "witnesses": [
            *import_witness(caller, dotted(call.func)[0]), witness(caller, service.lineno, declared[injection].end_lineno),
            witness(caller, with_line, call.end_lineno)]},
        {"role": "wiring", "symbol": store_cls.name, "witnesses": wiring_witnesses},
        {"role": "unit", "symbol": unit_cls.name, "witnesses": [
            witness(store, read.lineno, read.end_lineno), witness(store, transaction.lineno),
            witness(store, output.lineno), witness(unit_module, unit_cls.lineno, field_binding.end_lineno), *init_import]},
        {"role": "implementation", "symbol": adapter_cls.name + "." + body.name, "witnesses": [
            witness(adapter, adapter_cls.lineno), witness(adapter, body.lineno, body.end_lineno),
            witness(adapter, consuming_body.lineno, consuming_body.end_lineno)]},
    ]
    return owner, statement, early_exit, consumer, branch, graph


def retrieve(config):
    source = Source(config)
    try:
        owner, statement, early_exit, consumer, branch, graph = collect(source)
        grouped = {}
        for role in graph:
            role["witnesses"] = list({(item["path"], item["start"], item["end"]): item for item in role["witnesses"]}.values())
            for item in role["witnesses"]:
                grouped.setdefault(item["path"], []).append((item["start"], item["end"]))
        if len(grouped) > source.caps["receiptCount"]:
            raise Stop("budget", "receipt-count-budget")
        receipts = []
        for path, ranges in grouped.items():
            merged = []
            for start, end in sorted(set(ranges)):
                if merged and start <= merged[-1]["end"] + 1:
                    merged[-1]["end"] = max(end, merged[-1]["end"])
                else:
                    merged.append({"start": start, "end": end})
            if sum(item["end"] - item["start"] + 1 for item in merged) > source.caps["lines"]:
                raise Stop("budget", "line-budget")
            text = "\n\n".join("\n".join(source.modules[path].lines[item["start"] - 1:item["end"]]) for item in merged)
            if len(text.encode()) > source.caps["fragmentBytes"]:
                raise Stop("budget", "fragment-byte-budget")
            receipts.append({"kind": "git", "path": path, "blob": source.files[path], "ranges": merged, "text": text})
        source.remaining()
        result = {"status": "provided", "anchor": config["context"]["anchor"],
                  "callerFlow": {"path": owner.path, "callLine": statement.lineno,
                                 "exitStart": early_exit.lineno, "exitEnd": early_exit.end_lineno,
                                 "consumerLine": consumer.lineno, "branchLine": branch.lineno},
                  "links": graph, "fragments": receipts}
    except Stop as failure:
        result = failure.result
    result["budget"] = {**source.usage, "elapsedMs": round((time.monotonic() - source.started) * 1000)}
    return result


if __name__ == "__main__":
    print(json.dumps(retrieve(json.load(sys.stdin)), separators=(",", ":")))
