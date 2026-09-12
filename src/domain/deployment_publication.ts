const PUBLICATION_MARKER = /^<!-- copilot-deployment-publication operation-id="([A-Za-z0-9][A-Za-z0-9._-]{7,127})" production-sha="([a-f0-9]{40})" -->$/i;

export interface DeploymentPublicationMarker {
  readonly operationId: string;
  readonly productionSha: string;
}

export function renderDeploymentPublicationMarker(marker: DeploymentPublicationMarker): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(marker.operationId)) {
    throw new Error("Deployment publication operation ID is invalid.");
  }
  if (!/^[a-f0-9]{40}$/i.test(marker.productionSha)) {
    throw new Error("Deployment publication SHA is invalid.");
  }
  return `<!-- copilot-deployment-publication operation-id="${marker.operationId}" production-sha="${marker.productionSha}" -->`;
}

export function renderDeploymentReleaseBody(
  marker: DeploymentPublicationMarker,
  changelog: string,
): string {
  return `${renderDeploymentPublicationMarker(marker)}\n${changelog}`;
}

export function parseDeploymentPublicationMarker(body: string | null | undefined): DeploymentPublicationMarker | undefined {
  if (typeof body !== "string" || body.length > 51_000) return undefined;
  const firstLine = body.split("\n", 1)[0];
  const match = PUBLICATION_MARKER.exec(firstLine);
  return match ? { operationId: match[1], productionSha: match[2].toLowerCase() } : undefined;
}
