/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/database/migrate.ts'],
  coverageDirectory: 'coverage',
  clearMocks: true,
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
};
