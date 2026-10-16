import { githubDeploymentMergeError } from "../github_deployment_merge_error";

const graphql = (type: unknown, message = "secret") => ({ status: 200, errors: [{ type, message }] });
describe("sanitized deployment merge errors", () => {
  it.each([
    ["merge", {status:405}, true, "provider.conflict"],
    ["enable-auto-merge", graphql("UNPROCESSABLE","Pull request is in clean status"), true, "provider.conflict"],
    ["enable-auto-merge", {status:405}, false, "provider.conflict"],
    ["merge", graphql("UNPROCESSABLE","Pull request is in clean status"), false, "provider.conflict"],
    ["enable-auto-merge", {status:404,errors:[{type:"UNPROCESSABLE",message:"Pull request is in clean status"}]}, false, "provider.not-found"],
    ["merge", {status:409}, false, "provider.conflict"],
    ["merge", {status:422}, false, "provider.conflict"],
    ["merge", {status:401}, false, "authorization.denied"],
    ["merge", {status:403}, false, "authorization.denied"],
    ["enable-auto-merge", graphql("FORBIDDEN"), false, "authorization.denied"],
    ["enable-auto-merge", graphql("UNAUTHORIZED"), false, "authorization.denied"],
    ["merge", {status:429}, false, "provider.rate-limited"],
    ["enable-auto-merge", graphql("RATE_LIMITED"), false, "provider.rate-limited"],
    ["merge", {status:503}, false, "provider.unavailable"],
    ["enable-auto-merge", graphql("INTERNAL"), false, "provider.unavailable"],
    ["enable-auto-merge", graphql("SERVICE_UNAVAILABLE"), false, "provider.unavailable"],
    ["merge", {status:404}, false, "provider.not-found"],
    ["enable-auto-merge", graphql("NOT_FOUND"), false, "provider.not-found"],
    ["enable-auto-merge", graphql("UNPROCESSABLE"), false, "provider.conflict"],
    ["merge", new Error("secret"), false, "workflow.failed"],
    ["merge", null, false, "workflow.failed"],
    ["merge", [], false, "workflow.failed"],
    ["merge", {status:"secret"}, false, "workflow.failed"],
    ["merge", {status:1.5}, false, "workflow.failed"],
    ["merge", {status:99}, false, "workflow.failed"],
    ["merge", {status:600}, false, "workflow.failed"],
    ["merge", {errors:[null, "secret", []]}, false, "workflow.failed"],
    ["merge", {errors:[{type:"secret",message:"secret"}]}, false, "provider.conflict"],
    ["enable-auto-merge", {status:403,errors:[{type:"UNPROCESSABLE",message:"Pull request is in clean status"}]}, false, "authorization.denied"],
    ["enable-auto-merge", {status:429,errors:[{type:"UNPROCESSABLE",message:"Pull request is in clean status"}]}, false, "provider.rate-limited"],
    ["enable-auto-merge", {status:503,errors:[{type:"UNPROCESSABLE",message:"Pull request is in clean status"}]}, false, "provider.unavailable"],
    ["enable-auto-merge", {errors:[{type:"UNPROCESSABLE",message:"Pull request is in clean status"},{type:"FORBIDDEN"}]}, false, "authorization.denied"],
  ] as const)("classifies %s safely: %j", (action,cause,refresh,code) => {
    const error = githubDeploymentMergeError(action,cause);
    expect(error).toEqual(expect.objectContaining({action,readinessChanged:refresh,code,retryable: !["authorization.denied","provider.not-found"].includes(code)}));
    expect(error.message).toContain(action); expect(error.message).not.toContain("secret");
  });
});
