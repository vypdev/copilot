import type { LatestTagQueryPort } from '../../ports/branch_tag_ports';
import { getResultPayload, type Result } from '../../../data/model/result';
import type { ParamUseCase } from '../base/param_usecase';
import { applyHotfixResolution, applyReleaseResolution } from '../../../data/model/version_resolution_application_policy';
import { shouldAbortReleaseResolution } from '../../../data/model/version_resolution_outcome_policy';
import { hotfixResolutionFromPayload, releaseResolutionFromPayload } from '../../../data/model/version_resolution_result_policy';
import { nextHotfixVersion, nextReleaseVersion } from '../../../data/model/version_resolution_policy';
import type {
    SetupConfigurationPatch,
    SetupHotfixState,
    SetupReleaseState,
    VersionDescriptionContext,
} from './setup_execution_contracts';

export interface ExecutionBranchVersionResolution {
    resolve(context: BranchVersionResolutionContext): Promise<BranchVersionResolutionResult>;
}

export interface BranchVersionResolutionContext {
    readonly issueNumber: number;
    readonly release: SetupReleaseState;
    readonly hotfix: SetupHotfixState;
    readonly branches: {
        readonly releaseTree: string;
        readonly hotfixTree: string;
    };
    readonly configuration: SetupConfigurationPatch;
}

export interface BranchVersionResolutionResult {
    readonly completed: boolean;
    readonly release: SetupReleaseState;
    readonly hotfix: SetupHotfixState;
    readonly configuration: SetupConfigurationPatch;
}

export class ExecutionBranchVersionResolver implements ExecutionBranchVersionResolution {
    constructor(
        private readonly latestTagQueryPort: LatestTagQueryPort,
        private readonly getReleaseVersion: ParamUseCase<VersionDescriptionContext, Result[]>,
        private readonly getReleaseType: ParamUseCase<VersionDescriptionContext, Result[]>,
        private readonly getHotfixVersion: ParamUseCase<VersionDescriptionContext, Result[]>,
    ) {}

    async resolve(context: BranchVersionResolutionContext): Promise<BranchVersionResolutionResult> {
        if (context.release.active && context.release.version === undefined) {
            return this.resolveRelease(context);
        }
        if (context.hotfix.active && context.hotfix.version === undefined) {
            return this.resolveHotfix(context);
        }
        return unchanged(context);
    }

    private async resolveRelease(context: BranchVersionResolutionContext): Promise<BranchVersionResolutionResult> {
        const query = { issueNumber: context.issueNumber };
        const versionInfo = (await this.getReleaseVersion.invoke(query)).at(-1);
        let type = context.release.type;
        let version = context.release.version;
        if (versionInfo?.executed && versionInfo.success) {
            version = releaseResolutionFromPayload(getResultPayload(versionInfo.payload) ?? {}).version;
        } else {
            const typeInfo = (await this.getReleaseType.invoke(query)).at(-1);
            if (typeInfo?.executed && typeInfo.success) {
                type = releaseResolutionFromPayload(getResultPayload(typeInfo.payload) ?? {}).type;
                if (shouldAbortReleaseResolution(type)) {
                    return {
                        completed: false,
                        release: { ...context.release, type },
                        hotfix: { ...context.hotfix },
                        configuration: { ...context.configuration },
                    };
                }
                version = nextReleaseVersion(
                    await this.latestTagQueryPort.getLatestTag(),
                    type!,
                );
            }
        }
        return {
            completed: true,
            release: {
                ...context.release,
                type,
                version,
                branch: applyReleaseResolution(context.branches.releaseTree, version).branch,
            },
            hotfix: { ...context.hotfix },
            configuration: { ...context.configuration },
        };
    }

    private async resolveHotfix(context: BranchVersionResolutionContext): Promise<BranchVersionResolutionResult> {
        const versionInfo = (await this.getHotfixVersion.invoke({ issueNumber: context.issueNumber })).at(-1);
        let baseVersion: string | undefined;
        let version: string | undefined;
        if (versionInfo?.executed && versionInfo.success) {
            const resolution = hotfixResolutionFromPayload(getResultPayload(versionInfo.payload) ?? {});
            baseVersion = resolution.baseVersion;
            version = resolution.version;
        } else {
            const nextVersion = nextHotfixVersion(await this.latestTagQueryPort.getLatestTag());
            baseVersion = nextVersion.baseVersion;
            version = nextVersion.version;
        }
        const state = applyHotfixResolution(
            context.branches.hotfixTree,
            baseVersion,
            version,
        );
        return {
            completed: true,
            release: { ...context.release },
            hotfix: {
                ...context.hotfix,
                baseVersion,
                version,
                branch: state.branch,
                baseBranch: state.baseBranch,
            },
            configuration: {
                ...context.configuration,
                hotfixBranch: state.branch,
                hotfixOriginBranch: state.baseBranch,
            },
        };
    }
}

function unchanged(context: BranchVersionResolutionContext): BranchVersionResolutionResult {
    return {
        completed: true,
        release: { ...context.release },
        hotfix: { ...context.hotfix },
        configuration: { ...context.configuration },
    };
}
