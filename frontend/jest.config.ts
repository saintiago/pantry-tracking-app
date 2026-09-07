import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^\\./catalog-urls$': '<rootDir>/src/i18n/__mocks__/catalog-urls.ts',
    '\\.css$': '<rootDir>/src/__mocks__/styleMock.ts',
  },
};

export default config;
