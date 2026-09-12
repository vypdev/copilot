import { ACTIONS } from "../../data/model/action_types";
import { ApplicationError } from "../errors/application_error";

const GITHUB_WORKFLOW_ONLY_ACTIONS: readonly string[] = [
  ACTIONS.CREATE_TAG,
  ACTIONS.CREATE_RELEASE,
  ACTIONS.PUBLISH_GITHUB_ACTION,
  ACTIONS.PREPARE_DEPLOYMENT,
  ACTIONS.CONTINUE_DEPLOYMENT,
  ACTIONS.PUBLISHED_DEPLOYMENT,
  ACTIONS.FAILED_DEPLOYMENT,
];

export function assertLocalSingleActionAllowed(requestedAction: unknown): void {
  if (typeof requestedAction === "string" && GITHUB_WORKFLOW_ONLY_ACTIONS.includes(requestedAction)) {
    throw new ApplicationError(
      "workflow.invalid-event",
      "Deployment mutation is available only from the serialized GitHub workflows.",
    );
  }
}
