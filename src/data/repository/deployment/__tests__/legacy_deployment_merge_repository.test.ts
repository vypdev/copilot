import { LegacyDeploymentMergeRepository } from "../legacy_deployment_merge_repository";

function harness() {
  const merge = jest.fn().mockResolvedValue({ data: { merged: true } });
  const client = { rest: { pulls: { merge } } } as never;
  const waiter = { wait: jest.fn() };
  return { repository: new LegacyDeploymentMergeRepository({ getClient: () => client }, waiter), waiter, merge, client };
}

describe("LegacyDeploymentMergeRepository", () => {
  it("waits for checks on the existing managed PR before merging it", async () => {
    const value = harness();
    await value.repository.waitAndMerge("owner", "repo", "release/3.4.0", 40, "master", 600, "pat");
    expect(value.waiter.wait).toHaveBeenCalledWith(value.client, "owner", "repo", "release/3.4.0", 40, 600);
    expect(value.merge).toHaveBeenCalledWith(expect.objectContaining({ pull_number: 40, merge_method: "merge" }));
  });

  it("does not attempt a merge when the bounded waiter fails", async () => {
    const value = harness();
    value.waiter.wait.mockRejectedValue(new Error("Timed out waiting for checks to complete"));
    await expect(value.repository.waitAndMerge("owner", "repo", "release/3.4.0", 40, "master", 60, "pat"))
      .rejects.toThrow("Timed out");
    expect(value.merge).not.toHaveBeenCalled();
  });
});
