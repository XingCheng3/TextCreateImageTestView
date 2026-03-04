/**
 * 用户控制器 - 支持后端分页、筛选、排序
 */
import { Request, Response } from "express";
import { userService } from "../services/userService.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const userController = {
  // GET /api/users?page=1&pageSize=10&search=&sortBy=createdAt&sortOrder=desc
  getAll: asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const search = (req.query.search as string) || "";
    const sortBy = (req.query.sortBy as string) || "createdAt";
    const sortOrder = (req.query.sortOrder as string) || "desc";

    const result = await userService.getAllPaginated({
      page,
      pageSize,
      search,
      sortBy,
      sortOrder: sortOrder as "asc" | "desc",
    });

    res.json({
      success: true,
      data: result.data,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  }),

  // GET /api/users/:id
  getById: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const data = await userService.getById(id);
    res.json({
      success: true,
      data,
    });
  }),

  // POST /api/users
  create: asyncHandler(async (req: Request, res: Response) => {
    const data = await userService.create(req.body);
    res.status(201).json({
      success: true,
      data,
    });
  }),

  // PUT /api/users/:id
  update: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const data = await userService.update(id, req.body);
    res.json({
      success: true,
      data,
    });
  }),

  // DELETE /api/users/:id
  delete: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const result = await userService.delete(id);
    res.json({
      success: true,
      ...result,
    });
  }),
};
