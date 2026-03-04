/**
 * TestTable 服务层 - 支持后端分页、筛选、排序
 */
import { prisma } from "../config/database.js";
import { Prisma } from "@prisma/client";

interface PaginationParams {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

export const testTableService = {
  /**
   * 获取所有数据 - 带分页、筛选、排序
   */
  async getAllPaginated(params: PaginationParams) {
    const { page, pageSize, search, sortBy, sortOrder } = params;

    // 构建查询条件
    const where: Prisma.TestTableWhereInput = search
      ? {
          OR: [
            { Name: { contains: search, mode: "insensitive" } },
            { Value: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    // 构建排序条件
    const orderBy: Prisma.TestTableOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    // 计算总数
    const total = await prisma.testTable.count({ where });

    // 计算总页数
    const totalPages = Math.ceil(total / pageSize);

    // 计算跳过的记录数
    const skip = (page - 1) * pageSize;

    // 查询数据
    const data = await prisma.testTable.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
    });

    return {
      data,
      page,
      pageSize,
      total,
      totalPages,
    };
  },

  /**
   * 根据 ID 获取数据
   */
  async getById(id: number) {
    const record = await prisma.testTable.findUnique({
      where: { ID: id },
    });

    if (!record) {
      throw new Error("数据不存在");
    }

    return record;
  },

  /**
   * 创建数据
   */
  async create(data: { ID: number; Name?: string; Value?: string }) {
    return await prisma.testTable.create({
      data,
    });
  },

  /**
   * 更新数据
   */
  async update(id: number, data: { Name?: string; Value?: string }) {
    return await prisma.testTable.update({
      where: { ID: id },
      data,
    });
  },

  /**
   * 删除数据
   */
  async delete(id: number) {
    await prisma.testTable.delete({
      where: { ID: id },
    });

    return {
      message: "删除成功",
    };
  },
};
