import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';

// Create a deep mock of PrismaClient
export const prismaMock = mockDeep<PrismaClient>();

// Reset mock before each test
export const resetPrismaMock = () => {
  mockReset(prismaMock);
};

// Helper to mock the prisma import
export const mockPrisma = () => {
  vi.mock('../../src/server.js', () => ({
    prisma: prismaMock,
  }));
};

// Type export for use in tests
export type PrismaMock = DeepMockProxy<PrismaClient>;
