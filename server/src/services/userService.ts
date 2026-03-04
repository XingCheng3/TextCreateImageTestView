/**
 * 用户服务层 - 支持后端分页、筛选、排序
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

export const userService = {
  /**
   * 获取所有用户 - 带分页、筛选、排序
   */
  async getAllPaginated(params: PaginationParams) {
    const { page, pageSize, search, sortBy, sortOrder } = params;

    // 构建查询条件
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    // 构建排序条件
    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    // 计算总数
    const total = await prisma.user.count({ where });

    // 计算总页数
    const totalPages = Math.ceil(total / pageSize);

    // 计算跳过的记录数
    const skip = (page - 1) * pageSize;

    // 查询数据
    const data = await prisma.user.findMany({
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
   * 根据 ID 获取用户
   */
  async getById(id: number) {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new Error("用户不存在");
    }

    return user;
  },

  /**
   * 创建用户
   */
  async create(data: { email: string; name?: string }) {
    return await prisma.user.create({
      data,
    });
  },

  /**
   * 更新用户
   */
  async update(id: number, data: { email?: string; name?: string }) {
    return await prisma.user.update({
      where: { id },
      data,
    });
  },

  /**
   * 删除用户
   */
  async delete(id: number) {
    await prisma.user.delete({
      where: { id },
    });

    return {
      message: "删除成功",
    };
  },
};
