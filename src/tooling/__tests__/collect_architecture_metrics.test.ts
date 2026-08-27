const {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { execPath } = require("node:process");

const {
  buildRepoWiseCommands,
  commandTimeout,
  collectArchitectureMetrics,
  parseLcovInventory,
  runProcess,
} = require("../../../scripts/collect-architecture-metrics.cjs");

describe("collect architecture metrics", () => {
  it("applies bounded command-specific timeouts", () => {
    expect(commandTimeout(["pnpm", "exec", "jest", "--coverage"])).toBe(
      600_000,
    );
    expect(commandTimeout(["/opt/repowise", "init", "."])).toBe(900_000);
    expect(commandTimeout(["/opt/repowise", "health", "."])).toBe(300_000);
    expect(commandTimeout(["/opt/graphify", "update", "."])).toBe(600_000);
    expect(commandTimeout(["git", "status", "--porcelain"])).toBe(30_000);
  });

  it("terminates a child process that exceeds its timeout", () => {
    expect(() =>
      runProcess(
        [execPath, "-e", "setTimeout(() => {}, 5000)"],
        process.cwd(),
        20,
      ),
    ).toThrow("timed out after 20ms");
  });

  it("terminates the complete process group before returning from a timeout", () => {
    const directory = mkdtempSync(join(tmpdir(), "copilot-timeout-tree-"));
    const marker = join(directory, "late.txt");
    const parent = join(directory, "parent.cjs");
    writeFileSync(
      parent,
      [
        'const { spawn } = require("node:child_process");',
        'const { execPath } = require("node:process");',
        `spawn(execPath, ["-e", ${JSON.stringify(
          `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(
            marker,
          )}, "late"), 250)`,
        )}], { stdio: "ignore" });`,
        "setInterval(() => {}, 1000);",
      ].join("\n"),
    );

    expect(() => runProcess([execPath, parent], process.cwd(), 30)).toThrow(
      "timed out after 30ms",
    );
    runProcess(
      [execPath, "-e", "setTimeout(() => {}, 400)"],
      process.cwd(),
      1000,
    );
    expect(existsSync(marker)).toBe(false);
  });

  it("builds single-repository RepoWise commands with an explicit coverage path", () => {
    expect(buildRepoWiseCommands("/opt/repowise")).toEqual([
      [
        "/opt/repowise",
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
      [
        "/opt/repowise",
        "coverage",
        "status",
        "--path",
        ".",
        "--format",
        "json",
      ],
      ["/opt/repowise", "health", ".", "--no-workspace", "--format", "json"],
      [
        "/opt/repowise",
        "health",
        ".",
        "--no-workspace",
        "--refactoring-targets",
        "--format",
        "json",
      ],
      [
        "/opt/repowise",
        "dead-code",
        ".",
        "--no-workspace",
        "--safe-only",
        "--format",
        "json",
      ],
      ["/opt/repowise", "status", ".", "--no-workspace", "--format", "json"],
    ]);
  });

  it.each([
    ["SF:/repo/src/example.ts", "/repo"],
    ["SF:src/example.ts", "/repo"],
  ])(
    "derives exact totals from absolute and relative LCOV paths",
    (sourceFile, repositoryRoot) => {
      const lcov = [
        sourceFile,
        "FN:1,coveredFunction",
        "FN:2,uncoveredFunction",
        "FNDA:1,coveredFunction",
        "FNDA:0,uncoveredFunction",
        "DA:1,1",
        "DA:2,0",
        "BRDA:1,0,0,1",
        "BRDA:1,0,1,0",
        "end_of_record",
      ].join("\n");

      expect(parseLcovInventory(lcov, repositoryRoot)).toEqual([
        {
          path: "src/example.ts",
          lines: { found: 2, hit: 1, percentage: 50, uncovered: [2] },
          branches: { found: 2, hit: 1, percentage: 50 },
          functions: {
            found: 2,
            hit: 1,
            percentage: 50,
            uncovered: ["uncoveredFunction"],
          },
        },
      ]);
    },
  );

  it.each([
    ["", "empty"],
    ["SF:src/example.ts\nDA:1,1", "unterminated"],
    ["SF:../outside.ts\nDA:1,1\nend_of_record", "outside"],
    ["SF:\nDA:1,1\nend_of_record", "empty source"],
    ["SF:src/example.ts\nDA:not-a-line,1\nend_of_record", "invalid"],
    [
      "SF:src/example.ts\nDA:1,1,checksum,extra\nend_of_record",
      "extra line fields",
    ],
    ["SF:src/example.ts\nBRDA:1,,,1\nend_of_record", "empty branch fields"],
  ])("rejects %s LCOV input", (lcov) => {
    expect(() => parseLcovInventory(lcov, "/repo")).toThrow();
  });

  it("accepts the optional LCOV line checksum field", () => {
    const inventory = parseLcovInventory(
      "SF:src/example.ts\nDA:1,1,checksum\nend_of_record",
      "/repo",
    );
    expect(inventory[0].lines).toEqual(
      expect.objectContaining({ found: 1, hit: 1 }),
    );
  });

  it("rejects a report directory inside the repository", () => {
    const repositoryRoot = mkdtempSync(
      join(tmpdir(), "copilot-metrics-inside-repo-"),
    );

    expect(() =>
      collectArchitectureMetrics({
        repositoryRoot,
        outputDirectory: join(repositoryRoot, "reports"),
        repowiseBin: "/opt/repowise",
        graphifyBin: "/opt/graphify",
        runCommand: () => "",
      }),
    ).toThrow("outside the repository");
  });

  it("rejects a report symlink that resolves inside the repository", () => {
    const repositoryRoot = mkdtempSync(
      join(tmpdir(), "copilot-metrics-symlink-repo-"),
    );
    const reportsDirectory = join(repositoryRoot, "reports");
    const outputDirectory = join(
      mkdtempSync(join(tmpdir(), "copilot-metrics-symlink-output-")),
      "reports",
    );
    mkdirSync(reportsDirectory);
    symlinkSync(reportsDirectory, outputDirectory, "dir");

    expect(() =>
      collectArchitectureMetrics({
        repositoryRoot,
        outputDirectory,
        repowiseBin: "/opt/repowise",
        graphifyBin: "/opt/graphify",
        runCommand: () => "",
      }),
    ).toThrow("outside the repository");
  });

  it("rejects a non-empty report directory instead of mixing stale reports", () => {
    const repositoryRoot = mkdtempSync(
      join(tmpdir(), "copilot-metrics-output-guard-repo-"),
    );
    const outputDirectory = mkdtempSync(
      join(tmpdir(), "copilot-metrics-output-guard-output-"),
    );
    writeFileSync(join(outputDirectory, "stale.json"), "{}\n");

    expect(() =>
      collectArchitectureMetrics({
        repositoryRoot,
        outputDirectory,
        repowiseBin: "/opt/repowise",
        graphifyBin: "/opt/graphify",
        runCommand: () => "",
      }),
    ).toThrow("must be empty");
  });

  it.each(["existing", "dangling"])(
    "rejects a %s symlink in a mutable workspace path",
    (kind) => {
      const repositoryRoot = mkdtempSync(
        join(tmpdir(), "copilot-metrics-workspace-symlink-repo-"),
      );
      const outputDirectory = mkdtempSync(
        join(tmpdir(), "copilot-metrics-workspace-symlink-output-"),
      );
      const externalDirectory = mkdtempSync(
        join(tmpdir(), "copilot-metrics-workspace-symlink-target-"),
      );
      const target =
        kind === "existing"
          ? externalDirectory
          : join(externalDirectory, "missing-target");
      symlinkSync(target, join(repositoryRoot, "coverage"), "dir");
      const commands: string[][] = [];

      expect(() =>
        collectArchitectureMetrics({
          repositoryRoot,
          outputDirectory,
          repowiseBin: "/opt/repowise",
          graphifyBin: "/opt/graphify",
          runCommand: (command: string[]) => {
            commands.push(command);
            if (command.join(" ") === "git status --porcelain") return "";
            if (command.join(" ") === "git rev-parse HEAD") return "abc123\n";
            return "";
          },
        }),
      ).toThrow("symbolic link");
      expect(commands).toEqual([
        ["git", "status", "--porcelain"],
        ["git", "rev-parse", "HEAD"],
      ]);
    },
  );

  it("preserves the collection failure as the cause when restoration verification also fails", () => {
    const repositoryRoot = mkdtempSync(
      join(tmpdir(), "copilot-metrics-failure-repo-"),
    );
    const outputDirectory = mkdtempSync(
      join(tmpdir(), "copilot-metrics-failure-output-"),
    );
    const coverageDirectory = join(repositoryRoot, "coverage");
    mkdirSync(coverageDirectory);
    writeFileSync(join(coverageDirectory, "local.keep"), "original\n");
    const commands: string[][] = [];
    const providerCause = new Error("provider cause");
    const primaryError = new Error("primary collection failure") as Error & {
      cause?: unknown;
    };
    primaryError.cause = providerCause;
    let statusCalls = 0;

    const runCommand = (command: string[]): string => {
      commands.push(command);
      const signature = command.join(" ");
      if (signature === "git status --porcelain") {
        statusCalls += 1;
        return statusCalls === 1 ? "" : "dirty\n";
      }
      if (signature === "git rev-parse HEAD") return "abc123\n";
      if (signature === "pnpm exec jest --coverage --runInBand") {
        mkdirSync(coverageDirectory, { recursive: true });
        writeFileSync(
          join(coverageDirectory, "lcov.info"),
          `SF:${join(repositoryRoot, "src/file.ts")}\nDA:1,1\nend_of_record\n`,
        );
        return "";
      }
      if (signature.includes("health . --no-workspace --format json")) {
        throw primaryError;
      }
      if (signature.includes(" --format json")) return "{}\n";
      return `${signature}\n`;
    };

    let thrown: unknown;
    try {
      collectArchitectureMetrics({
        repositoryRoot,
        outputDirectory,
        repowiseBin: "/opt/repowise",
        graphifyBin: "/opt/graphify",
        runCommand,
      });
    } catch (error) {
      thrown = error;
    }
    const aggregate = thrown as Error & { cause?: unknown; errors: unknown[] };
    expect(aggregate.name).toBe("AggregateError");
    expect(aggregate.message).toBe("primary collection failure");
    expect(aggregate.cause).toBe(primaryError);
    expect(aggregate.errors[0]).toBe(primaryError);
    expect(primaryError.cause).toBe(providerCause);
    expect(readFileSync(join(coverageDirectory, "local.keep"), "utf8")).toBe(
      "original\n",
    );
    expect(existsSync(join(coverageDirectory, "lcov.info"))).toBe(false);
    expect(
      commands.filter(
        (command) => command.join(" ") === "git status --porcelain",
      ),
    ).toHaveLength(2);
    expect(
      commands.filter((command) => command.join(" ") === "git rev-parse HEAD"),
    ).toHaveLength(2);
  });

  it("rejects invalid JSON reports and does not publish a completion marker", () => {
    const repositoryRoot = mkdtempSync(
      join(tmpdir(), "copilot-metrics-invalid-report-repo-"),
    );
    const outputDirectory = mkdtempSync(
      join(tmpdir(), "copilot-metrics-invalid-report-output-"),
    );
    const runCommand = (command: string[]): string => {
      const signature = command.join(" ");
      if (signature === "git status --porcelain") return "";
      if (signature === "git rev-parse HEAD") return "abc123\n";
      if (signature === "pnpm exec jest --coverage --runInBand") {
        mkdirSync(join(repositoryRoot, "coverage"));
        writeFileSync(
          join(repositoryRoot, "coverage", "lcov.info"),
          `SF:${join(repositoryRoot, "src/file.ts")}\nDA:1,1\nend_of_record\n`,
        );
        return "";
      }
      if (signature.startsWith("/opt/repowise init ."))
        return "init complete\n";
      if (signature.includes("health . --no-workspace --format json")) {
        return "not-json\n";
      }
      if (signature.includes(" --format json")) return "{}\n";
      return `${signature}\n`;
    };

    expect(() =>
      collectArchitectureMetrics({
        repositoryRoot,
        outputDirectory,
        repowiseBin: "/opt/repowise",
        graphifyBin: "/opt/graphify",
        runCommand,
      }),
    ).toThrow();
    expect(existsSync(join(outputDirectory, "complete.json"))).toBe(false);
    expect(existsSync(join(repositoryRoot, "coverage"))).toBe(false);
  });

  it("collects a versioned record outside the repository and always applies the safe cleanup plan", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "copilot-metrics-repo-"));
    const outputDirectory = mkdtempSync(
      join(tmpdir(), "copilot-metrics-output-"),
    );
    const coverageDirectory = join(repositoryRoot, "coverage");
    for (const relativePath of [
      "build",
      "coverage",
      "graphify-out",
      ".repowise",
    ]) {
      mkdirSync(join(repositoryRoot, relativePath));
      writeFileSync(
        join(repositoryRoot, relativePath, "local.keep"),
        `${relativePath}-original\n`,
      );
    }
    writeFileSync(join(coverageDirectory, "lcov.info"), "previous-lcov\n");
    writeFileSync(join(repositoryRoot, ".mcp.json"), "original\n");
    const commands: string[][] = [];

    const runCommand = (command: string[]): string => {
      commands.push(command);
      const signature = command.join(" ");
      if (signature === "git status --porcelain") return "";
      if (signature === "git rev-parse HEAD") return "abc123\n";
      if (signature === "pnpm exec jest --coverage --runInBand") {
        mkdirSync(coverageDirectory, { recursive: true });
        writeFileSync(
          join(coverageDirectory, "lcov.info"),
          `SF:${join(repositoryRoot, "src/file.ts")}\nDA:1,1\nend_of_record\n`,
        );
      }
      if (signature.startsWith("/opt/repowise init .")) {
        writeFileSync(join(repositoryRoot, ".mcp.json"), "modified\n");
        writeFileSync(
          join(repositoryRoot, ".repowise", "generated"),
          "generated\n",
        );
        mkdirSync(join(repositoryRoot, ".vscode"));
        writeFileSync(
          join(repositoryRoot, ".vscode", "mcp.json"),
          "generated\n",
        );
        return "repowise init complete\n";
      }
      if (signature === "/opt/graphify update .") {
        writeFileSync(
          join(repositoryRoot, "graphify-out", "generated"),
          "generated\n",
        );
        return "Rebuilt: 1 nodes, 1 edges, 1 communities\n";
      }
      if (signature.includes(" --format json")) return "{}\n";
      return signature + "\n";
    };

    const result = collectArchitectureMetrics({
      repositoryRoot,
      outputDirectory,
      repowiseBin: "/opt/repowise",
      graphifyBin: "/opt/graphify",
      runCommand,
      now: () => "2026-08-20T09:30:00.000Z",
    });

    expect(result.sha).toBe("abc123");
    expect(
      JSON.parse(
        readFileSync(join(outputDirectory, "coverage-inventory.json"), "utf8"),
      ),
    ).toEqual([expect.objectContaining({ path: "src/file.ts" })]);
    expect(
      JSON.parse(readFileSync(join(outputDirectory, "metadata.json"), "utf8")),
    ).toEqual(
      expect.objectContaining({
        sha: "abc123",
        timestamp: "2026-08-20T09:30:00.000Z",
        scope: "single-repository",
        outputDirectory,
        executablePaths: {
          node: expect.any(String),
          pnpm: expect.any(String),
          repowise: "/opt/repowise",
          graphify: "/opt/graphify",
          timeoutRunner: expect.any(String),
        },
        commands: expect.objectContaining({
          coverage: ["pnpm", "exec", "jest", "--coverage", "--runInBand"],
          graphify: ["/opt/graphify", "update", "."],
          repowise: expect.any(Array),
        }),
      }),
    );
    expect(existsSync(join(outputDirectory, "repowise-01-init.log"))).toBe(
      true,
    );
    expect(existsSync(join(outputDirectory, "repowise-05-dead-code.txt"))).toBe(
      true,
    );
    expect(existsSync(join(outputDirectory, "repowise-01-init.json"))).toBe(
      false,
    );
    expect(readFileSync(join(repositoryRoot, ".mcp.json"), "utf8")).toBe(
      "original\n",
    );
    expect(existsSync(join(repositoryRoot, ".vscode"))).toBe(false);
    for (const relativePath of [
      "build",
      "coverage",
      "graphify-out",
      ".repowise",
    ]) {
      expect(
        readFileSync(join(repositoryRoot, relativePath, "local.keep"), "utf8"),
      ).toBe(`${relativePath}-original\n`);
      expect(existsSync(join(repositoryRoot, relativePath, "generated"))).toBe(
        false,
      );
    }
    expect(readFileSync(join(coverageDirectory, "lcov.info"), "utf8")).toBe(
      "previous-lcov\n",
    );
    expect(
      JSON.parse(readFileSync(join(outputDirectory, "complete.json"), "utf8")),
    ).toEqual(expect.objectContaining({ sha: "abc123", complete: true }));
    expect(commands.at(-2)).toEqual(["git", "status", "--porcelain"]);
    expect(commands.at(-1)).toEqual(["git", "rev-parse", "HEAD"]);
  });
});
