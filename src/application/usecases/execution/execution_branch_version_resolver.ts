import type { LatestTagQueryPort } from '../../ports/branch_tag_ports';
import type { Execution } from '../../../data/model/execution';
import type { Result } from '../../../data/model/result';
import type { ParamUseCase } from '../base/param_usecase';
import { applyHotfixResolution, applyReleaseResolution } from '../../../data/model/version_resolution_application_policy';
import { shouldAbortReleaseResolution } from '../../../data/model/version_resolution_outcome_policy';
import { hotfixResolutionFromPayload, releaseResolutionFromPayload } from '../../../data/model/version_resolution_result_policy';
import { nextHotfixVersion, nextReleaseVersion } from '../../../data/model/version_resolution_policy';

export interface ExecutionBranchVersionResolution {
    resolve(execution: Execution): Promise<boolean>;
}

export class ExecutionBranchVersionResolver implements ExecutionBranchVersionResolution {
    constructor(
        private readonly latestTagQueryPort: LatestTagQueryPort,
        private readonly getReleaseVersion: ParamUseCase<Execution, Result[]>,
        private readonly getReleaseType: ParamUseCase<Execution, Result[]>,
        private readonly getHotfixVersion: ParamUseCase<Execution, Result[]>,
    ) {}

    async resolve(execution: Execution): Promise<boolean> {
        if (execution.release.active && execution.release.version === undefined) {
            return this.resolveRelease(execution);
        }
        if (execution.hotfix.active && execution.hotfix.version === undefined) {
            return this.resolveHotfix(execution);
        }
        return true;
    }

    private async resolveRelease(execution: Execution): Promise<boolean> {
        const versionInfo = (await this.getReleaseVersion.invoke(execution)).at(-1);
        if (versionInfo?.executed && versionInfo.success) {
            execution.release.version = releaseResolutionFromPayload(versionInfo.payload).version;
        } else {
            const typeInfo = (await this.getReleaseType.invoke(execution)).at(-1);
            if (typeInfo?.executed && typeInfo.success) {
                execution.release.type = releaseResolutionFromPayload(typeInfo.payload).type;
                if (shouldAbortReleaseResolution(execution.release.type)) return false;
                execution.release.version = nextReleaseVersion(
                    await this.latestTagQueryPort.getLatestTag(),
                    execution.release.type!,
                );
            }
        }
        execution.release.branch = applyReleaseResolution(
            execution.branches.releaseTree,
            execution.release.version,
        ).branch;
        return true;
    }

    private async resolveHotfix(execution: Execution): Promise<boolean> {
        const versionInfo = (await this.getHotfixVersion.invoke(execution)).at(-1);
        if (versionInfo?.executed && versionInfo.success) {
            const resolution = hotfixResolutionFromPayload(versionInfo.payload);
            execution.hotfix.baseVersion = resolution.baseVersion;
            execution.hotfix.version = resolution.version;
        } else {
            const nextVersion = nextHotfixVersion(await this.latestTagQueryPort.getLatestTag());
            execution.hotfix.baseVersion = nextVersion.baseVersion;
            execution.hotfix.version = nextVersion.version;
        }
        const state = applyHotfixResolution(
            execution.branches.hotfixTree,
            execution.hotfix.baseVersion,
            execution.hotfix.version,
        );
        execution.hotfix.branch = state.branch;
        execution.currentConfiguration.hotfixBranch = state.branch;
        execution.hotfix.baseBranch = state.baseBranch;
        execution.currentConfiguration.hotfixOriginBranch = state.baseBranch;
        return true;
    }
}
