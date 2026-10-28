import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_policy';
const ensureGitHubDirs = jest.fn();
const copySetupFiles = jest.fn();
const hasValidSetupToken = jest.fn();

jest.mock('../../utils/setup_files', () => ({
    ensureGitHubDirs,
    copySetupFiles,
    hasValidSetupToken,
}));

import { SetupWorkspaceMutationAdapter, SetupDoctorWorkspaceQueryAdapter, SetupReconcileWorkspaceAdapter } from '../setup_workspace_adapter';

describe('SetupWorkspaceMutationAdapter', () => {
    const originalCwd = process.cwd;

    beforeEach(() => {
        jest.clearAllMocks();
        process.cwd = jest.fn(() => '/workspace') as typeof process.cwd;
    });

    afterEach(() => {
        process.cwd = originalCwd;
    });

    it('prepares the current workspace through the setup file port', () => {
        const result = { copied: ['action.yml'], skipped: [] };
        copySetupFiles.mockReturnValue(result);
        const adapter = new SetupWorkspaceMutationAdapter();

        expect(adapter.prepare()).toBe(result);
        expect(ensureGitHubDirs).toHaveBeenCalledWith('/workspace');
        expect(copySetupFiles).toHaveBeenCalledWith('/workspace');
    });

    it('delegates token validation to the setup file boundary', () => {
        hasValidSetupToken.mockReturnValue(true);

        expect(new SetupWorkspaceMutationAdapter().hasValidToken()).toBe(true);
        expect(hasValidSetupToken).toHaveBeenCalledWith('/workspace');
    });
    it('reads issue form drift through the query adapter without preparing any assets',()=>{
      const root=mkdtempSync(join(tmpdir(),'copilot-725-query-'));process.cwd=()=>root;try{const config=createDefaultSetupConfiguration();config.issueWorkflows={enabled:['bugfix']};expect(new SetupDoctorWorkspaceQueryAdapter().inspectIssueForms(config)).toEqual([expect.objectContaining({status:'fail',missing:true,path:'.github/ISSUE_TEMPLATE/bug_report.yml'})]);expect(readdirSync(root)).toEqual([]);expect(copySetupFiles).not.toHaveBeenCalled();}finally{rmSync(root,{recursive:true,force:true});}
    });
    it('uses the same read-only issue form inspection in reconcile',()=>{
      const root=mkdtempSync(join(tmpdir(),'copilot-725-reconcile-'));process.cwd=()=>root;try{const config=createDefaultSetupConfiguration();config.issueWorkflows={enabled:['help']};expect(new SetupReconcileWorkspaceAdapter().inspectIssueForms(config)[0]).toMatchObject({id:'issue-form.help',missing:true});expect(readdirSync(root)).toEqual([]);expect(copySetupFiles).not.toHaveBeenCalled();}finally{rmSync(root,{recursive:true,force:true});}
    });

});
