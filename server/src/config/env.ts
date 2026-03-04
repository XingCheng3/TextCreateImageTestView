/**
 * 环境变量配置
 */
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
} as const;

// 验证必需的环境变量
if (!config.databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

