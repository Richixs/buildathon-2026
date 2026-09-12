import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  // Scoped to the profile module (the part of the codebase this suite
  // covers) rather than `global`, so untested legacy files elsewhere don't
  // fail CI. Raise scope as more of the app gets test coverage.
  coverageThreshold: {
    // Required by Jest's type even when left empty — no thresholds are
    // enforced repo-wide, only for the paths listed below.
    global: {},
    "components/profile/RegistrationForm.tsx": {
      statements: 85,
      branches: 85,
      functions: 85,
      lines: 85,
    },
    "components/profile/ProfileDashboard.tsx": {
      statements: 85,
      branches: 85,
      functions: 85,
      lines: 85,
    },
    "components/web3/ConnectButton.tsx": {
      statements: 85,
      branches: 85,
      functions: 85,
      lines: 85,
    },
    "components/layout/HeaderNav.tsx": {
      statements: 85,
      branches: 85,
      functions: 85,
      lines: 85,
    },
    "app/api/profile/route.ts": {
      statements: 85,
      branches: 85,
      functions: 85,
      lines: 85,
    },
    "app/api/campaigns/route.ts": {
      statements: 85,
      branches: 85,
      functions: 85,
      lines: 85,
    },
    "app/api/campaigns/[id]/route.ts": {
      statements: 85,
      branches: 85,
      functions: 85,
      lines: 85,
    },
    "app/api/investments/route.ts": {
      statements: 85,
      branches: 85,
      functions: 85,
      lines: 85,
    },
  },
};

export default createJestConfig(config);
