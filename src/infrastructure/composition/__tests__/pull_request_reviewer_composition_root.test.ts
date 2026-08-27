const reviewerClient = { kind: "reviewer-client" };
const reviewerPort = { kind: "reviewer-port" };

const mockCreatePullRequestReviewerClient = jest.fn(() => reviewerClient);
const mockPullRequestReviewerRepository = jest.fn(() => reviewerPort);

jest.mock("../github_pull_request_client_factory", () => ({
  createPullRequestReviewerClient: mockCreatePullRequestReviewerClient,
}));

jest.mock(
  "../../../data/repository/pull_request/pull_request_reviewer_repository",
  () => ({ PullRequestReviewerRepository: mockPullRequestReviewerRepository }),
);

import { createPullRequestReviewerCompositionRoot } from "../pull_request_reviewer_composition_root";

describe("createPullRequestReviewerCompositionRoot", () => {
  it("binds the reviewer capability to its dedicated provider client", () => {
    expect(createPullRequestReviewerCompositionRoot()).toBe(reviewerPort);
    expect(mockCreatePullRequestReviewerClient).toHaveBeenCalledTimes(1);
    expect(mockPullRequestReviewerRepository).toHaveBeenCalledWith(
      reviewerClient,
    );
  });
});
