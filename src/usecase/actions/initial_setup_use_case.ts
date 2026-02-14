import { Execution } from "../../data/model/execution";
import { IssueRepository } from "../../data/repository/issue_repository";
import { ProjectRepository } from "../../data/repository/project_repository";
import { Result } from "../../data/model/result";
import { ParamUseCase } from "../base/param_usecase";
import { logError, logInfo } from "../../utils/logger";
import { getTaskEmoji } from "../../utils/task_emoji";
import { copySetupFiles, ensureGitHubDirs, hasValidSetupToken } from "../../utils/setup_files";

export class InitialSetupUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'InitialSetupUseCase';

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const results: Result[] = [];
        const steps: string[] = [];
        const errors: string[] = [];

        try {
            // 0. Setup files (.github/workflows, .github/ISSUE_TEMPLATE, pull_request_template.md, .env)
            logInfo('📋 Ensuring .github and copying setup files...');
            ensureGitHubDirs(process.cwd());
            const filesResult = copySetupFiles(process.cwd());
            steps.push(`✅ Setup files: ${filesResult.copied} copied, ${filesResult.skipped} already existed`);

            if (!hasValidSetupToken(process.cwd())) {
                logInfo('  🛑 Setup requires PERSONAL_ACCESS_TOKEN (environment or .env) with a valid token.');
                errors.push('PERSONAL_ACCESS_TOKEN must be set (environment or .env) with a valid token to run setup.');
                results.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        steps: steps,
                        errors: errors,
                    })
                );
                return results;
            }

            // 1. Verificar acceso a GitHub con Personal Access Token
            logInfo('🔐 Checking GitHub access...');
            const githubAccessResult = await this.verifyGitHubAccess(param);
            if (!githubAccessResult.success) {
                errors.push(...githubAccessResult.errors);
                results.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        steps: steps,
                        errors: errors,
                    })
                );
                return results;
            }
            steps.push(`✅ GitHub access verified: ${githubAccessResult.user}`);

            // 2. Crear todos los labels necesarios
            logInfo('🏷️  Checking labels...');
            const labelsResult = await this.ensureLabels(param);
            if (!labelsResult.success) {
                errors.push(...labelsResult.errors);
                logError(`Error checking labels: ${labelsResult.errors}`);
            } else {
                steps.push(`✅ Labels checked: ${labelsResult.created} created, ${labelsResult.existing} already existed`);
            }

            // 2b. Crear labels de progreso (0%, 5%, ..., 100%) con colores rojo→amarillo→verde
            logInfo('📊 Checking progress labels...');
            const progressLabelsResult = await this.ensureProgressLabels(param);
            if (progressLabelsResult.errors.length > 0) {
                errors.push(...progressLabelsResult.errors);
                logError(`Error checking progress labels: ${progressLabelsResult.errors}`);
            } else {
                steps.push(`✅ Progress labels checked: ${progressLabelsResult.created} created, ${progressLabelsResult.existing} already existed`);
            }

            // 3. Crear todos los tipos de Issue si no existen
            logInfo('📋 Checking issue types...');
            const issueTypesResult = await this.ensureIssueTypes(param);
            if (!issueTypesResult.success) {
                errors.push(...issueTypesResult.errors);
            } else {
                steps.push(`✅ Issue types checked: ${issueTypesResult.created} created, ${issueTypesResult.existing} already existed`);
            }

            results.push(
                new Result({
                    id: this.taskId,
                    success: errors.length === 0,
                    executed: true,
                    steps: steps,
                    errors: errors.length > 0 ? errors : undefined,
                })
            );
        } catch (error) {
            logError(error);
            errors.push(`Error ejecutando setup inicial: ${error}`);
            results.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: steps,
                    errors: errors,
                })
            );
        }

        return results;
    }

    private async verifyGitHubAccess(param: Execution): Promise<{ success: boolean; user?: string; errors: string[] }> {
        const errors: string[] = [];
        try {
            const projectRepository = new ProjectRepository();
            const user = await projectRepository.getUserFromToken(param.tokens.token);
            return { success: true, user, errors: [] };
        } catch (error) {
            logError(`Error verificando acceso a GitHub: ${error}`);
            errors.push(`No se pudo verificar el acceso a GitHub: ${error}`);
            return { success: false, errors };
        }
    }

    private async ensureLabels(param: Execution): Promise<{ success: boolean; created: number; existing: number; errors: string[] }> {
        try {
            const issueRepository = new IssueRepository();
            const result = await issueRepository.ensureLabels(
                param.owner,
                param.repo,
                param.labels,
                param.tokens.token
            );
            return {
                success: result.errors.length === 0,
                created: result.created,
                existing: result.existing,
                errors: result.errors,
            };
        } catch (error) {
            logError(`Error asegurando labels: ${error}`);
            return { success: false, created: 0, existing: 0, errors: [`Error asegurando labels: ${error}`] };
        }
    }

    private async ensureProgressLabels(param: Execution): Promise<{ created: number; existing: number; errors: string[] }> {
        try {
            const issueRepository = new IssueRepository();
            return await issueRepository.ensureProgressLabels(
                param.owner,
                param.repo,
                param.tokens.token
            );
        } catch (error) {
            logError(`Error asegurando progress labels: ${error}`);
            return { created: 0, existing: 0, errors: [`Error asegurando progress labels: ${error}`] };
        }
    }

    private async ensureIssueTypes(param: Execution): Promise<{ success: boolean; created: number; existing: number; errors: string[] }> {
        try {
            const issueRepository = new IssueRepository();
            const result = await issueRepository.ensureIssueTypes(
                param.owner,
                param.issueTypes,
                param.tokens.token
            );
            return {
                success: result.errors.length === 0,
                created: result.created,
                existing: result.existing,
                errors: result.errors,
            };
        } catch (error) {
            logError(`Error asegurando tipos de Issue: ${error}`);
            return { success: false, created: 0, existing: 0, errors: [`Error asegurando tipos de Issue: ${error}`] };
        }
    }

}

