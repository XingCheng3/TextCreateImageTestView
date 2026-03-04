/**
 * 全局错误处理中间件
 */
import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // 保留形参用于兼容 Express 错误处理中间件签名
  void req;
  void next;

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // 未预期的错误
  console.error("❌ Unexpected Error:", err);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export const asyncHandler = (fn: AsyncRequestHandler): RequestHandler => {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
};
