/**
 * 数据库配置与连接管理
 */
import { PrismaClient } from "@prisma/client";

// 创建 Prisma Client 单例
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * 连接数据库
 */
export async function connectDatabase() {
  try {
    await prisma.$connect();
    console.log("✅ Database connected successfully");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  }
}

/**
 * 断开数据库连接
 */
export async function disconnectDatabase() {
  await prisma.$disconnect();
  console.log("Database disconnected");
}
