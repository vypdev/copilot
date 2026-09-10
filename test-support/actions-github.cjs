'use strict';

const context = {
  payload: {},
  eventName: '',
  sha: '',
  ref: '',
  workflow: '',
  action: '',
  actor: '',
  job: '',
  runNumber: 0,
  runId: 0,
  apiUrl: 'https://api.github.com',
  serverUrl: 'https://github.com',
  graphqlUrl: 'https://api.github.com/graphql',
  repo: { owner: '', repo: '' },
  issue: { owner: '', repo: '', number: 0 }
};

module.exports = {
  context,
  getOctokit: () => ({})
};
