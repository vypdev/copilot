import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { SetupConfiguration } from '../domain/setup';
import {
  REPOSITORY_AGENT_MANIFEST_PATH,
  REPOSITORY_AGENT_POINTER_END,
  REPOSITORY_AGENT_POINTER_PATH,
  REPOSITORY_AGENT_POINTER_START,
  REPOSITORY_AGENT_PROFILE_PATH,
  renderRepositoryAgentArtifacts,
  renderRepositoryAgentPointerBlock,
  type RepositoryAgentArtifact,
  type ManagedRole,
  type RepositoryAgentGuidanceManifest as GuidanceManifest,
  parseRepositoryAgentGuidanceManifest,
  validRepositoryAgentProfile,
} from '../application/policies/repository_agent_guidance_policy';
import { logInfo } from './logger';

type ManagedArtifactRecord = GuidanceManifest['artifacts'][string];

export interface RepositoryAgentGuidanceCheck {
  readonly id: string;
  readonly status: 'pass' | 'warn' | 'fail' | 'skipped';
  readonly summary: string;
  readonly path?: string;
}

export function reconcileRepositoryAgentGuidance(
  cwd: string,
  configuration: Readonly<SetupConfiguration>,
): { copied: number; skipped: number } {
  const prior = readGuidanceManifest(cwd);
  const manifestDestination = path.join(cwd, REPOSITORY_AGENT_MANIFEST_PATH);
  if (fs.existsSync(manifestDestination) && !prior) {
    logInfo('⚠️  Existing agent guidance manifest is invalid or unsupported; preserving all guidance files unchanged.');
    return { copied: 0, skipped: 1 };
  }
  if (!configuration.repositoryAgentGuidance.enabled) return retireRepositoryAgentGuidance(cwd, prior);

  const desired = renderRepositoryAgentArtifacts(configuration);
  const records: Record<string, ManagedArtifactRecord> = {};
  let copied = 0;
  let skipped = 0;
  for (const artifact of desired) {
    const result = reconcileManagedArtifact(cwd, artifact, prior?.artifacts[artifact.path]);
    if (result.applied) {
      copied += result.changed ? 1 : 0;
      records[artifact.path] = { role: artifact.role, sha256: sha256(artifact.content) };
    } else {
      skipped++;
      logInfo(`⚠️  Agent guidance conflict at ${artifact.path}; preserving the existing unowned or drifted file.`);
    }
  }

  const pointer = reconcilePointer(cwd, configuration.repositoryAgentGuidance.agentsPointer, prior?.artifacts[REPOSITORY_AGENT_POINTER_PATH]);
  copied += pointer.changed ? 1 : 0;
  skipped += pointer.skipped ? 1 : 0;
  if (pointer.hash) records[REPOSITORY_AGENT_POINTER_PATH] = { role: 'pointer', sha256: pointer.hash };

  if (pointer.skipped) {
    logInfo('⚠️  Agent guidance manifest was not advanced because the managed discovery pointer could not be reconciled.');
    return { copied, skipped: skipped + 1 };
  }

  const profileRecord = records[REPOSITORY_AGENT_PROFILE_PATH];
  if (!profileRecord || Object.keys(records).filter(item => item !== REPOSITORY_AGENT_POINTER_PATH).length !== desired.length) {
    logInfo('⚠️  Agent guidance manifest was not advanced because the desired artifact set was incomplete.');
    return { copied, skipped: skipped + 1 };
  }
  const manifest: GuidanceManifest = {
    schemaVersion: 2,
    generator: { name: '@vypdev/copilot', contractVersion: 1 },
    profileDigest: profileRecord.sha256,
    artifacts: Object.fromEntries(Object.entries(records).sort(([left], [right]) => left.localeCompare(right))),
    ...(prior?.installation ? { installation: prior.installation } : {}),
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  if (!fs.existsSync(manifestDestination)
    || canonicalGuidanceText(fs.readFileSync(manifestDestination, 'utf8')) !== manifestContent) {
    atomicWrite(manifestDestination, manifestContent);
    copied++;
  }
  return { copied, skipped };
}

export function inspectRepositoryAgentGuidance(
  cwd: string,
  configuration?: Readonly<SetupConfiguration>,
): readonly RepositoryAgentGuidanceCheck[] {
  if (configuration?.repositoryAgentGuidance.enabled === false) {
    return [{ id: 'agent-guidance-manifest', status: 'skipped', summary: 'Repository agent guidance is disabled.' }];
  }
  const manifest = readGuidanceManifest(cwd);
  if (!manifest) {
    return [{
      id: 'agent-guidance-manifest',
      status: 'warn',
      summary: 'No valid setup-owned agent guidance manifest was found.',
      path: REPOSITORY_AGENT_MANIFEST_PATH,
    }];
  }
  const checks: RepositoryAgentGuidanceCheck[] = [{
    id: 'agent-guidance-manifest', status: 'pass', summary: 'Agent guidance manifest schema is valid.', path: REPOSITORY_AGENT_MANIFEST_PATH,
  }];
  const desired = configuration?.repositoryAgentGuidance.enabled
    ? new Map(renderRepositoryAgentArtifacts(configuration).map(artifact => [artifact.path, artifact.content]))
    : undefined;
  for (const [relativePath, record] of Object.entries(manifest.artifacts)) {
    const file = path.join(cwd, relativePath);
    if (!fs.existsSync(file)) {
      checks.push({ id: checkId(record.role), status: 'fail', summary: `Managed artifact is missing: ${relativePath}.`, path: relativePath });
      continue;
    }
    const content = fs.readFileSync(file, 'utf8');
    const actual = record.role === 'pointer' ? pointerBlock(content) : content;
    const matchesManifest = actual !== undefined && sha256(actual) === record.sha256;
    const matchesDesired = record.role === 'pointer' || !desired
      || desired.get(relativePath) === canonicalGuidanceText(content);
    const semantic = record.role !== 'profile' || validRepositoryAgentProfile(content);
    checks.push(matchesManifest && matchesDesired && semantic
      ? { id: checkId(record.role), status: 'pass', summary: `${relativePath} matches the setup manifest.`, path: relativePath }
      : { id: checkId(record.role), status: 'fail', summary: `${relativePath} has drifted, is stale, or violates its generated contract.`, path: relativePath });
  }
  const sensitiveArtifact = Object.entries(manifest.artifacts)
    .filter(([, record]) => record.role !== 'pointer')
    .map(([relativePath]) => ({ relativePath, file: path.join(cwd, relativePath) }))
    .find(({ file }) => fs.existsSync(file) && containsSensitiveGuidance(fs.readFileSync(file, 'utf8')));
  checks.push(sensitiveArtifact
    ? {
        id: 'agent-guidance-secret-scan',
        status: 'fail',
        summary: `Generated guidance contains secret-like or machine-local content: ${sensitiveArtifact.relativePath}.`,
        path: sensitiveArtifact.relativePath,
      }
    : {
        id: 'agent-guidance-secret-scan',
        status: 'pass',
        summary: 'Generated guidance contains no secret-like or machine-local content.',
      });
  const profile = path.join(cwd, REPOSITORY_AGENT_PROFILE_PATH);
  const profileContent = fs.existsSync(profile) ? fs.readFileSync(profile, 'utf8') : undefined;
  if (!profileContent || sha256(profileContent) !== manifest.profileDigest
    || (desired && desired.get(REPOSITORY_AGENT_PROFILE_PATH) !== canonicalGuidanceText(profileContent))) {
    checks.push({ id: 'agent-profile-runtime-parity', status: 'fail', summary: 'Repository profile digest does not match the setup manifest.', path: REPOSITORY_AGENT_PROFILE_PATH });
  } else {
    checks.push({ id: 'agent-profile-runtime-parity', status: 'pass', summary: 'Repository profile digest matches the setup manifest.', path: REPOSITORY_AGENT_PROFILE_PATH });
  }
  if (!manifest.artifacts[REPOSITORY_AGENT_POINTER_PATH]) {
    checks.push({ id: 'agent-guidance-discovery', status: 'warn', summary: 'Guidance is installed with reduced generic-agent discovery because no managed AGENTS.md pointer exists.' });
  }
  if (configuration) checks.push(...inspectIssueWorkflowProjection(cwd, configuration));
  return checks;
}

function reconcileManagedArtifact(
  cwd: string,
  artifact: RepositoryAgentArtifact,
  prior: ManagedArtifactRecord | undefined,
): { applied: boolean; changed: boolean } {
  const destination = path.join(cwd, artifact.path);
  if (!fs.existsSync(destination)) {
    atomicWrite(destination, artifact.content);
    return { applied: true, changed: true };
  }
  const current = fs.readFileSync(destination, 'utf8');
  if (canonicalGuidanceText(current) === artifact.content) return { applied: true, changed: false };
  if (!prior || prior.role !== artifact.role || sha256(current) !== prior.sha256) return { applied: false, changed: false };
  backupFile(cwd, artifact.path);
  atomicWrite(destination, artifact.content);
  return { applied: true, changed: true };
}

function reconcilePointer(
  cwd: string,
  policy: SetupConfiguration['repositoryAgentGuidance']['agentsPointer'],
  prior: ManagedArtifactRecord | undefined,
): { changed: boolean; skipped: boolean; hash?: string } {
  if (policy === 'disabled') return { changed: false, skipped: false };
  const destination = path.join(cwd, REPOSITORY_AGENT_POINTER_PATH);
  const block = renderRepositoryAgentPointerBlock();
  if (!fs.existsSync(destination)) {
    atomicWrite(destination, `${block}\n`);
    return { changed: true, skipped: false, hash: sha256(block) };
  }
  const current = fs.readFileSync(destination, 'utf8');
  const existingBlock = pointerBlock(current);
  if (existingBlock !== undefined && canonicalGuidanceText(existingBlock) === block) {
    return { changed: false, skipped: false, hash: sha256(block) };
  }
  if (existingBlock !== undefined) {
    if (prior?.role === 'pointer' && sha256(existingBlock) !== prior.sha256) {
      logInfo('⚠️  The managed AGENTS.md pointer has drifted; preserving it for explicit reconciliation.');
      return { changed: false, skipped: true };
    }
    backupFile(cwd, REPOSITORY_AGENT_POINTER_PATH);
    atomicWrite(destination, replacePointerBlock(current, block));
    return { changed: true, skipped: false, hash: sha256(block) };
  }
  if (hasAnyPointerMarker(current)) {
    logInfo('⚠️  AGENTS.md contains malformed agent-guidance markers; preserving it unchanged.');
    return { changed: false, skipped: true };
  }
  if (policy === 'create-if-missing') {
    logInfo('ℹ️  AGENTS.md already exists; leaving discovery unchanged under create-if-missing policy.');
    return { changed: false, skipped: false };
  }
  backupFile(cwd, REPOSITORY_AGENT_POINTER_PATH);
  const separator = current.endsWith('\n') ? '\n' : '\n\n';
  atomicWrite(destination, `${current}${separator}${block}\n`);
  return { changed: true, skipped: false, hash: sha256(block) };
}

function retireRepositoryAgentGuidance(
  cwd: string,
  manifest: GuidanceManifest | undefined,
): { copied: number; skipped: number } {
  if (!manifest) return { copied: 0, skipped: 0 };
  let retired = 0;
  let skipped = 0;
  for (const [relativePath, record] of Object.entries(manifest.artifacts)) {
    const destination = path.join(cwd, relativePath);
    if (!fs.existsSync(destination)) continue;
    const content = fs.readFileSync(destination, 'utf8');
    if (record.role === 'pointer') {
      const block = pointerBlock(content);
      if (block === undefined || sha256(block) !== record.sha256) {
        skipped++;
        continue;
      }
      backupFile(cwd, relativePath);
      const remaining = replacePointerBlock(content, '');
      if (remaining.trim()) atomicWrite(destination, remaining);
      else fs.renameSync(destination, backupDestination(cwd, relativePath, 'retired'));
      retired++;
      continue;
    }
    if (sha256(content) !== record.sha256) {
      skipped++;
      continue;
    }
    fs.renameSync(destination, backupDestination(cwd, relativePath, 'retired'));
    retired++;
  }
  const manifestPath = path.join(cwd, REPOSITORY_AGENT_MANIFEST_PATH);
  fs.renameSync(manifestPath, backupDestination(cwd, REPOSITORY_AGENT_MANIFEST_PATH, 'retired'));
  retired++;
  return { copied: retired, skipped };
}

function readGuidanceManifest(cwd: string): GuidanceManifest | undefined {
  const manifestPath = path.join(cwd, REPOSITORY_AGENT_MANIFEST_PATH);
  if (!fs.existsSync(manifestPath)) return undefined;
  try { return parseRepositoryAgentGuidanceManifest(fs.readFileSync(manifestPath, 'utf8')); }
  catch { return undefined; }
}

function pointerBlock(content: string): string | undefined {
  const start = content.indexOf(REPOSITORY_AGENT_POINTER_START);
  const end = content.indexOf(REPOSITORY_AGENT_POINTER_END);
  if (start < 0 || end < start) return undefined;
  const after = end + REPOSITORY_AGENT_POINTER_END.length;
  if (content.indexOf(REPOSITORY_AGENT_POINTER_START, start + 1) >= 0 || content.indexOf(REPOSITORY_AGENT_POINTER_END, after) >= 0) return undefined;
  return content.slice(start, after);
}

function replacePointerBlock(content: string, replacement: string): string {
  const block = pointerBlock(content)!;
  return `${content.slice(0, content.indexOf(block))}${replacement}${content.slice(content.indexOf(block) + block.length)}`;
}

function hasAnyPointerMarker(content: string): boolean {
  return content.includes(REPOSITORY_AGENT_POINTER_START) || content.includes(REPOSITORY_AGENT_POINTER_END);
}

function atomicWrite(destination: string, content: string): void {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.copilot-${process.pid}.tmp`;
  fs.writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o644 });
  fs.renameSync(temporary, destination);
}

function backupFile(cwd: string, relativePath: string): void {
  const source = path.join(cwd, relativePath);
  const destination = backupDestination(cwd, relativePath, 'replaced');
  fs.copyFileSync(source, destination);
}

function backupDestination(cwd: string, relativePath: string, operation: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const destination = path.join(cwd, '.copilot', 'setup-backups', `${stamp}-${operation}`, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  return destination;
}

function sha256(content: string): string {
  return createHash('sha256').update(canonicalGuidanceText(content), 'utf8').digest('hex');
}

function canonicalGuidanceText(content: string): string {
  return content.replace(/\r\n/gu, '\n');
}

function containsSensitiveGuidance(content: string): boolean {
  return /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\/(?:Users|home)\/[^/\s]+\/)/u.test(content);
}

function checkId(role: ManagedRole): string {
  return ({
    profile: 'agent-profile-schema',
    guide: 'agent-guide-digest',
    skill: 'agent-skill-contract',
    pointer: 'agent-guidance-discovery',
  })[role];
}


function inspectIssueWorkflowProjection(
  cwd: string,
  configuration: Readonly<SetupConfiguration>,
): RepositoryAgentGuidanceCheck[] {
  const profile = renderRepositoryAgentArtifacts(configuration)
    .find(artifact => artifact.path === REPOSITORY_AGENT_PROFILE_PATH)!;
  const parsed = JSON.parse(profile.content) as {
    issueWorkflows: {
      enabled: string[];
      formsEnabled: boolean;
      forms: Record<string, { template: string | null; formLabels: string[]; workflow: string | null }>;
    };
  };
  const missingOrDifferentForms = parsed.issueWorkflows.enabled.flatMap(kind => {
    const fact = parsed.issueWorkflows.forms[kind];
    if (!parsed.issueWorkflows.formsEnabled || !fact.template) return [];
    const destination = path.join(cwd, '.github', 'ISSUE_TEMPLATE', fact.template);
    if (!fs.existsSync(destination)) return [fact.template];
    const labelsLine = /^labels:\s*(.*)$/mu.exec(fs.readFileSync(destination, 'utf8'))?.[1];
    try {
      return labelsLine && JSON.stringify(JSON.parse(labelsLine)) === JSON.stringify(fact.formLabels) ? [] : [fact.template];
    } catch {
      return [fact.template];
    }
  });
  const formCheck: RepositoryAgentGuidanceCheck = missingOrDifferentForms.length === 0
    ? { id: 'agent-forms-profile-parity', status: 'pass', summary: 'Enabled Issue Forms match the repository profile.' }
    : { id: 'agent-forms-profile-parity', status: 'fail', summary: `Issue Form/profile mismatch: ${missingOrDifferentForms.join(', ')}.` };

  const workflowFacts = parsed.issueWorkflows.enabled.flatMap(kind => {
    const workflow = parsed.issueWorkflows.forms[kind].workflow;
    return workflow ? [workflow] : [];
  });
  const missingWorkflows = workflowFacts.filter(file => !fs.existsSync(path.join(cwd, '.github', 'workflows', file)));
  const workflowCheck: RepositoryAgentGuidanceCheck = missingWorkflows.length === 0
    ? { id: 'agent-workflow-profile-parity', status: 'pass', summary: 'Release/hotfix workflow files match the repository profile.' }
    : { id: 'agent-workflow-profile-parity', status: 'fail', summary: `Profile workflow file is missing: ${missingWorkflows.join(', ')}.` };
  return [formCheck, workflowCheck];
}
