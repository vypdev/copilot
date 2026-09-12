import {
  parseDeploymentPublicationMarker,
  renderDeploymentPublicationMarker,
  renderDeploymentReleaseBody,
} from "../deployment_publication";

describe("deployment publication marker", () => {
  const marker = { operationId: "operation-12345678", productionSha: "a".repeat(40) };

  it("round-trips the exact bounded provider marker", () => {
    expect(parseDeploymentPublicationMarker(renderDeploymentReleaseBody(marker, "Changes"))).toEqual(marker);
  });

  it.each([
    "no marker",
    '<!-- copilot-deployment-publication operation-id="short" production-sha="aaaa" -->',
    '<!-- copilot-deployment-publication operation-id="operation-12345678" production-sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" extra="x" -->',
  ])("rejects malformed or ambiguous content: %s", (body) => {
    expect(parseDeploymentPublicationMarker(body)).toBeUndefined();
  });

  it("rejects invalid marker values before rendering", () => {
    expect(() => renderDeploymentPublicationMarker({ ...marker, operationId: "bad id" })).toThrow("operation ID");
    expect(() => renderDeploymentPublicationMarker({ ...marker, productionSha: "bad" })).toThrow("SHA");
  });
});
