/**
 * TestTable 控制器 - 支持后端分页、筛选、排序
 */
import { Request, Response } from "express";
import { testTableService } from "../services/testTableService.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const testTableController = {
  // GET /api/test-table?page=1&pageSize=10&search=&sortBy=ID&sortOrder=asc
  getAll: asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const search = (req.query.search as string) || "";
    const sortBy = (req.query.sortBy as string) || "ID";
    const sortOrder = (req.query.sortOrder as string) || "asc";

    const result = await testTableService.getAllPaginated({
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

  // GET /api/test-table/:id
  getById: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const data = await testTableService.getById(id);
    res.json({
      success: true,
      data,
    });
  }),

  // POST /api/test-table
  create: asyncHandler(async (req: Request, res: Response) => {
    const data = await testTableService.create(req.body);
    res.status(201).json({
      success: true,
      data,
    });
  }),

  // PUT /api/test-table/:id
  update: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const data = await testTableService.update(id, req.body);
    res.json({
      success: true,
      data,
    });
  }),

  // DELETE /api/test-table/:id
  delete: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const result = await testTableService.delete(id);
    res.json({
      success: true,
      ...result,
    });
  }),
};
