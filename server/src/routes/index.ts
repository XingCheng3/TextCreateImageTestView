/**
 * 路由聚合
 */
import { Router } from "express";
import testTableRoutes from "./testTableRoutes.js";
import userRoutes from "./userRoutes.js";

const router = Router();

// API 路由
router.use("/test-table", testTableRoutes);
router.use("/users", userRoutes);

// 健康检查
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

export default router;
