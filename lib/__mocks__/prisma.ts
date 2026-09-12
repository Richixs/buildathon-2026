import { mockDeep, mockReset, type DeepMockProxy } from "jest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Intercepts every `import { prisma } from "@/lib/prisma"` across the test
// file that imports this module, replacing the real client (which opens a
// real Postgres connection via PrismaPg) with a deep mock. Import order
// matters: import `prismaMock` from here *before* importing the route/hook
// under test, so the mock is registered before that module resolves
// "@/lib/prisma".
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: mockDeep<PrismaClient>(),
}));

beforeEach(() => {
  mockReset(prismaMock);
});

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
