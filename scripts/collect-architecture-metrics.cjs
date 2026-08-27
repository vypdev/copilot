#!/usr/bin/env node

const {
  accessSync,
  constants,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function buildRepoWiseCommands(repowiseBin) {
  return [
    [
      repowiseBin,
      "init",
      ".",
      "--no-workspace",
      "--force",
      "--yes",
      "--no-prose",
      "--no-onboarding",
      "--no-claude-md",
      "--no-agents",
      "--no-codex",
      "--no-editor-setup",
      "--coverage-report",
      "coverage/lcov.info",
      "--progress",
      "json",
    ],
    [repowiseBin, "coverage", "status", "--path", ".", "--format", "json"],
    [repowiseBin, "health", ".", "--no-workspace", "--format", "json"],
    [
      repowiseBin,
      "health",
      ".",
      "--no-workspace",
      "--refactoring-targets",
      "--format",
      "json",
    ],
    [
      repowiseBin,
      "dead-code",
      ".",
      "--no-workspace",
      "--safe-only",
      "--format",
      "json",
    ],
    [repowiseBin, "status", ".", "--no-workspace", "--format", "json"],
  ];
}

function canonicalizePotentialPath(targetPath) {
  const missingSegments = [];
  let existingAncestor = path.resolve(targetPath);
  while (!existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) break;
    missingSegments.unshift(path.basename(existingAncestor));
    existingAncestor = parent;
  }
  return path.join(realpathSync(existingAncestor), ...missingSegments);
}

function assertSnapshotPathHasNoSymlinks(targetPath, relativePath) {
  let stats;
  try {
    stats = lstatSync(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  if (stats.isSymbolicLink()) {
    throw new Error(
      `Mutable workspace path contains a symbolic link: ${relativePath}`,
    );
  }
  if (stats.isDirectory()) {
    for (const name of readdirSync(targetPath)) {
      assertSnapshotPathHasNoSymlinks(
        path.join(targetPath, name),
        path.join(relativePath, name),
      );
    }
  }
  return true;
}

function createWorkspaceSnapshot(repositoryRoot) {
  const paths = [
    "build",
    "coverage",
    "graphify-out",
    ".repowise",
    ".mcp.json",
    ".vscode",
    ".claude",
    ".codex",
    "CLAUDE.md",
    "AGENTS.md",
  ];
  const backupRoot = mkdtempSync(
    path.join(tmpdir(), "copilot-metrics-workspace-"),
  );
  const entries = paths.map((relativePath, index) => {
    const source = path.join(repositoryRoot, relativePath);
    const backup = path.join(backupRoot, String(index));
    const existed = assertSnapshotPathHasNoSymlinks(source, relativePath);
    if (existed) cpSync(source, backup, { recursive: true });
    return { backup, existed, relativePath };
  });

  return () => {
    const errors = [];
    for (const entry of entries) {
      try {
        const target = path.join(repositoryRoot, entry.relativePath);
        rmSync(target, { force: true, recursive: true });
        if (entry.existed) cpSync(entry.backup, target, { recursive: true });
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      rmSync(backupRoot, { force: true, recursive: true });
    } catch (error) {
      errors.push(error);
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Workspace restoration failed.");
    }
  };
}

function percentage(hit, found) {
  return found === 0 ? 100 : Number(((hit / found) * 100).toFixed(2));
}

function parseNonnegativeInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid LCOV ${field}: ${value}`);
  }
  return parsed;
}

function parseLcovInventory(content, repositoryRoot) {
  const records = new Map();
  let current;

  const finishRecord = () => {
    if (!current) throw new Error("LCOV record ended without a source file.");
    const existing = records.get(current.path) || {
      lineNumbers: new Map(),
      branches: new Map(),
      functions: new Map(),
    };
    for (const [key, hits] of current.lineNumbers) {
      existing.lineNumbers.set(
        key,
        Math.max(existing.lineNumbers.get(key) || 0, hits),
      );
    }
    for (const [key, hits] of current.branches) {
      existing.branches.set(
        key,
        Math.max(existing.branches.get(key) || 0, hits),
      );
    }
    for (const [key, hits] of current.functions) {
      existing.functions.set(
        key,
        Math.max(existing.functions.get(key) || 0, hits),
      );
    }
    records.set(current.path, existing);
    current = undefined;
  };

  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      if (current)
        throw new Error("LCOV source record is missing end_of_record.");
      const sourcePath = line.slice(3);
      if (!sourcePath) throw new Error("LCOV source path is empty.");
      const resolvedSource = path.resolve(repositoryRoot, sourcePath);
      const resolvedRoot = path.resolve(repositoryRoot);
      if (
        resolvedSource === resolvedRoot ||
        !resolvedSource.startsWith(`${resolvedRoot}${path.sep}`)
      ) {
        throw new Error(`LCOV source is outside the repository: ${sourcePath}`);
      }
      current = {
        path: path.relative(resolvedRoot, resolvedSource),
        lineNumbers: new Map(),
        branches: new Map(),
        functions: new Map(),
      };
      continue;
    }

    if (!current) {
      if (line === "" || line.startsWith("TN:")) continue;
      throw new Error(`LCOV data appeared outside a source record: ${line}`);
    }

    if (line.startsWith("DA:")) {
      const fields = line.slice(3).split(",");
      if (
        (fields.length !== 2 && fields.length !== 3) ||
        fields.some((field) => field === "")
      ) {
        throw new Error(`Invalid LCOV line record: ${line}`);
      }
      const [lineNumber, hits] = fields;
      current.lineNumbers.set(
        parseNonnegativeInteger(lineNumber, "line number"),
        parseNonnegativeInteger(hits, "line hits"),
      );
    } else if (line.startsWith("FNDA:")) {
      const [hits, ...nameParts] = line.slice(5).split(",");
      const name = nameParts.join(",");
      if (!name) throw new Error("LCOV function name is empty.");
      current.functions.set(
        name,
        Math.max(
          current.functions.get(name) || 0,
          parseNonnegativeInteger(hits, "function hits"),
        ),
      );
    } else if (line.startsWith("BRDA:")) {
      const fields = line.slice(5).split(",");
      if (fields.length !== 4 || fields.some((field) => field === "")) {
        throw new Error(`Invalid LCOV branch record: ${line}`);
      }
      const [lineNumber, block, branch, hits] = fields;
      parseNonnegativeInteger(lineNumber, "branch line number");
      parseNonnegativeInteger(block, "branch block number");
      parseNonnegativeInteger(branch, "branch number");
      const key = `${lineNumber},${block},${branch}`;
      const branchHits =
        hits === "-" ? 0 : parseNonnegativeInteger(hits, "branch hits");
      current.branches.set(
        key,
        Math.max(current.branches.get(key) || 0, branchHits),
      );
    } else if (line === "end_of_record") {
      finishRecord();
    }
  }

  if (current) throw new Error("LCOV source record is missing end_of_record.");
  if (records.size === 0) throw new Error("LCOV contains no source records.");

  return [...records.entries()]
    .map(([sourcePath, record]) => {
      const lineHits = [...record.lineNumbers.values()];
      const branchHits = [...record.branches.values()];
      const functionHits = [...record.functions.values()];
      return {
        path: sourcePath,
        lines: {
          found: lineHits.length,
          hit: lineHits.filter((hits) => hits > 0).length,
          percentage: percentage(
            lineHits.filter((hits) => hits > 0).length,
            lineHits.length,
          ),
          uncovered: [...record.lineNumbers.entries()]
            .filter(([, hits]) => hits === 0)
            .map(([lineNumber]) => lineNumber),
        },
        branches: {
          found: branchHits.length,
          hit: branchHits.filter((hits) => hits > 0).length,
          percentage: percentage(
            branchHits.filter((hits) => hits > 0).length,
            branchHits.length,
          ),
        },
        functions: {
          found: functionHits.length,
          hit: functionHits.filter((hits) => hits > 0).length,
          percentage: percentage(
            functionHits.filter((hits) => hits > 0).length,
            functionHits.length,
          ),
          uncovered: [...record.functions.entries()]
            .filter(([, hits]) => hits === 0)
            .map(([name]) => name),
        },
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function commandTimeout(command) {
  const executable = path.basename(command[0]);
  if (executable === "pnpm" && command.includes("jest")) return 600_000;
  if (executable.includes("repowise") && command[1] === "init") return 900_000;
  if (executable.includes("repowise")) return 300_000;
  if (executable.includes("graphify")) return 600_000;
  return 30_000;
}

function resolveExecutable(command) {
  const candidates = command.includes(path.sep)
    ? [path.resolve(command)]
    : (process.env.PATH || "")
        .split(path.delimiter)
        .filter(Boolean)
        .map((directory) => path.join(directory, command));
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return realpathSync(candidate);
    } catch {
      // Keep searching PATH; fixtures may intentionally use a non-existent path.
    }
  }
  return command.includes(path.sep) ? path.resolve(command) : command;
}

function runProcess(
  command,
  repositoryRoot,
  timeout = commandTimeout(command),
) {
  const runner = path.join(__dirname, "run-command-with-timeout.cjs");
  const result = spawnSync(
    process.execPath,
    [runner, String(timeout), ...command],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 50_000_000,
      env: { ...process.env, REPOWISE_SKIP_EDITOR_SETUP: "1" },
      stdio: ["ignore", "pipe", "pipe", "pipe"],
    },
  );
  if (result.error) throw result.error;

  const controlMessages = (result.output?.[3] || "")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const setupFailure = controlMessages.find((message) => message.setupError);
  if (setupFailure) throw new Error(setupFailure.setupError);
  const outcome = controlMessages.at(-1);
  if (!outcome || typeof outcome.timedOut !== "boolean") {
    throw new Error(
      `Timeout runner failed (${result.status})\n${result.stderr || result.stdout}`,
    );
  }
  if (outcome.timedOut) {
    throw new Error(`${command.join(" ")} timed out after ${timeout}ms.`);
  }
  if (outcome.forwardedSignal) {
    throw new Error(
      `${command.join(" ")} was interrupted by ${outcome.forwardedSignal}.`,
    );
  }
  if (outcome.code !== 0) {
    throw new Error(
      `${command.join(" ")} failed (${outcome.code ?? outcome.signal})\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}

function reportName(command, index) {
  const capability =
    command[1] === "coverage" ? `coverage-${command[2]}` : command[1];
  const extension =
    capability === "init" ? "log" : capability === "dead-code" ? "txt" : "json";
  return `repowise-${String(index + 1).padStart(2, "0")}-${capability}.${extension}`;
}

function validateReportContent(reportName, content) {
  if (!content.trim()) throw new Error(`${reportName} is empty.`);
  if (reportName.endsWith(".json")) JSON.parse(content);
  return content;
}

function collectArchitectureMetrics({
  repositoryRoot,
  outputDirectory,
  repowiseBin,
  graphifyBin,
  runCommand = (command) => runProcess(command, repositoryRoot),
  now = () => new Date().toISOString(),
}) {
  const resolvedRepositoryRoot = realpathSync(path.resolve(repositoryRoot));
  const resolvedOutputDirectory = path.resolve(outputDirectory);
  const canonicalOutputDirectory = canonicalizePotentialPath(
    resolvedOutputDirectory,
  );
  if (
    canonicalOutputDirectory === resolvedRepositoryRoot ||
    canonicalOutputDirectory.startsWith(`${resolvedRepositoryRoot}${path.sep}`)
  ) {
    throw new Error(
      "Architecture metric reports must be written outside the repository.",
    );
  }
  if (
    existsSync(resolvedOutputDirectory) &&
    readdirSync(resolvedOutputDirectory).length > 0
  ) {
    throw new Error("Architecture metric report directory must be empty.");
  }

  if (runCommand(["git", "status", "--porcelain"]).trim()) {
    throw new Error("Architecture metrics require a clean working tree.");
  }

  const sha = runCommand(["git", "rev-parse", "HEAD"]).trim();
  const restoreWorkspace = createWorkspaceSnapshot(resolvedRepositoryRoot);
  mkdirSync(resolvedOutputDirectory, { recursive: true });

  const repowiseCommands = buildRepoWiseCommands(repowiseBin);
  const coverageCommand = ["pnpm", "exec", "jest", "--coverage", "--runInBand"];
  const graphifyCommand = [graphifyBin, "update", "."];
  const metadata = {
    sha,
    timestamp: now(),
    repositoryRoot: resolvedRepositoryRoot,
    outputDirectory: canonicalOutputDirectory,
    scope: "single-repository",
    executablePaths: {
      node: resolveExecutable(process.execPath),
      pnpm: resolveExecutable("pnpm"),
      repowise: resolveExecutable(repowiseBin),
      graphify: resolveExecutable(graphifyBin),
      timeoutRunner: realpathSync(
        path.join(__dirname, "run-command-with-timeout.cjs"),
      ),
    },
    commands: {
      coverage: coverageCommand,
      repowise: repowiseCommands,
      graphify: graphifyCommand,
    },
    tools: {},
  };

  let collectionError;
  const cleanupErrors = [];

  try {
    metadata.tools.node = runCommand(["node", "--version"]).trim();
    metadata.tools.pnpm = runCommand(["pnpm", "--version"]).trim();
    metadata.tools.repowise = runCommand([repowiseBin, "--version"]).trim();
    metadata.tools.graphify = runCommand([graphifyBin, "--version"]).trim();

    runCommand(coverageCommand);
    const lcovPath = path.join(repositoryRoot, "coverage", "lcov.info");
    const inventory = parseLcovInventory(
      readFileSync(lcovPath, "utf8"),
      repositoryRoot,
    );
    writeFileSync(
      path.join(resolvedOutputDirectory, "coverage-inventory.json"),
      `${JSON.stringify(inventory, null, 2)}\n`,
    );

    repowiseCommands.forEach((command, index) => {
      const name = reportName(command, index);
      const content = validateReportContent(name, runCommand(command));
      writeFileSync(path.join(resolvedOutputDirectory, name), content);
    });

    const graphifyOutput = validateReportContent(
      "graphify.log",
      runCommand(graphifyCommand),
    );
    writeFileSync(
      path.join(resolvedOutputDirectory, "graphify.log"),
      graphifyOutput,
    );
    writeFileSync(
      path.join(resolvedOutputDirectory, "metadata.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
  } catch (error) {
    collectionError = error;
  } finally {
    try {
      restoreWorkspace();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (runCommand(["git", "status", "--porcelain"]).trim()) {
        throw new Error(
          "Architecture metric collection left the working tree dirty.",
        );
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (runCommand(["git", "rev-parse", "HEAD"]).trim() !== sha) {
        throw new Error("Architecture metric collection changed HEAD.");
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (collectionError) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [collectionError, ...cleanupErrors],
        collectionError.message,
        { cause: collectionError },
      );
    }
    throw collectionError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Architecture metric cleanup failed.",
    );
  }

  writeFileSync(
    path.join(resolvedOutputDirectory, "complete.json"),
    `${JSON.stringify({ complete: true, sha }, null, 2)}\n`,
  );

  return { sha, outputDirectory: resolvedOutputDirectory };
}

module.exports = {
  buildRepoWiseCommands,
  commandTimeout,
  collectArchitectureMetrics,
  parseLcovInventory,
  runProcess,
};

if (require.main === module) {
  for (const [signal, exitCode] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ]) {
    process.on(signal, () => {
      process.exitCode = exitCode;
    });
  }
  const repositoryRoot = process.cwd();
  const repowiseBin =
    process.env.REPOWISE_BIN ||
    path.join(process.env.HOME, ".local", "bin", "repowise");
  const graphifyBin =
    process.env.GRAPHIFY_BIN || "/tmp/copilot-graphify-venv/bin/graphify";
  const sha = runProcess(["git", "rev-parse", "HEAD"], repositoryRoot).trim();
  const outputDirectory =
    process.env.METRICS_OUTPUT_DIR ||
    mkdtempSync(path.join(tmpdir(), `copilot-architecture-metrics-${sha}-`));
  const result = collectArchitectureMetrics({
    repositoryRoot,
    outputDirectory,
    repowiseBin,
    graphifyBin,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
