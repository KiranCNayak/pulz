import { PrismaClient } from "@prisma/client";
import { isProduction } from "../config/env.js";

// Single shared Prisma client instance for the whole process. Only the
// durable entities (Creator, Quiz, Question, Option, ResultsSnapshot) go
// through this client — GameSession/Participant/Answer are in-memory
// (ARCHITECTURE.md §2, Decision #16) and never touch Prisma.
export const prisma = new PrismaClient({
  log: isProduction ? ["error", "warn"] : ["error", "warn", "query"],
});

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
