/**
 * 常量配置
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";

export const ENDPOINTS = {
  HEALTH: "/health",
  TEST_TABLE: "/test-table",
  USERS: "/users",
} as const;
