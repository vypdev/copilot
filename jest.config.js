module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  passWithNoTests: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.ts'
  ],
  coverageThreshold: {
    global: {
      lines: 90,
      statements: 90,
      functions: 88,
      branches: 82
    }
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    // @actions/github v8 exposes an ESM Octokit dependency. The published
    // action is bundled by ncc, while Jest exercises this external boundary
    // through explicit mocks and this stable test double.
    '^@actions/github$': '<rootDir>/test-support/actions-github.cjs'
  },
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  verbose: true
};
