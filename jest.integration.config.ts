import type { Config } from "jest";

/**
 * Integration config — requires a live database.
 *
 *   npx jest --config jest.integration.config.ts
 *
 * Deliberately separate from jest.config.ts so `npm test` stays runnable
 * without a database. Runs serially: the checks share fixtures and assert on
 * real row state.
 */
const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  transform: { "^.+\\.tsx?$": ["ts-jest", { tsconfig: { strict: false } }] },
  testMatch: ["**/__integration__/**/*.test.ts"],
  maxWorkers: 1,
  testTimeout: 60_000,
  clearMocks: false,
};

export default config;
