/**
 * 公共类型定义
 */

// API 响应格式
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// 分页参数
export interface PaginationParams {
  page?: number;
  limit?: number;
}

// 分页响应
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
