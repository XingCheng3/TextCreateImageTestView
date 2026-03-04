/**
 * 服务器入口文件
 */
import app from "./app.js";
import { config } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";

async function startServer() {
  try {
    // 连接数据库
    await connectDatabase();

    // 启动服务器
    const server = app.listen(config.port, () => {
      console.log(`🚀 Server is running on http://localhost:${config.port}`);
      console.log(`📝 Environment: ${config.nodeEnv}`);
      console.log(`🔗 API Endpoints: http://localhost:${config.port}/api`);
    });

    // 优雅关闭
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n${signal} received, shutting down gracefully...`);

      server.close(async () => {
        await disconnectDatabase();
        console.log("Server closed");
        process.exit(0);
      });

      // 强制关闭超时
      setTimeout(() => {
        console.error(
          "Could not close connections in time, forcefully shutting down"
        );
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
