/**
 * Express 应用配置
 */
import express from "express";
import cors from "cors";
import { config } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import routes from "./routes/index.js";

const app = express();

// 中间件 - CORS 配置
app.use(
  cors({
    origin: (origin, callback) => {
      // 开发环境允许所有 localhost 端口
      if (config.nodeEnv === "development") {
        if (
          !origin ||
          origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:")
        ) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      } else {
        // 生产环境使用环境变量配置
        const allowedOrigins = config.corsOrigin
          .split(",")
          .map((o) => o.trim());
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      }
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求日志 (开发环境)
if (config.nodeEnv === "development") {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// API 路由
app.use("/api", routes);

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// 错误处理
app.use(errorHandler);

export default app;
