import { join } from 'node:path';
it('loads only the standalone read-only bundle through the packaged bootstrap', () => {
  const entry = jest.fn().mockResolvedValue(undefined);
  jest.doMock(join(process.cwd(), 'build/deployment_recovery/index.js'), () => ({ runDeploymentCandidatePreflightAction: entry }), { virtual: true });
  jest.isolateModules(() => require(join(process.cwd(), 'deployment-recovery/index.cjs')));
  expect(entry).toHaveBeenCalledTimes(1);
});
