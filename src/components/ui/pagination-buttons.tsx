/**
 * 基于 Shadcn Pagination 的按钮版本
 * 适用于客户端分页场景
 */
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationButtonsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function PaginationButtons({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationButtonsProps) {
  // 生成要显示的页码数组
  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];

    if (totalPages <= 7) {
      // 如果总页数 <= 7,显示所有页码
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 始终显示第一页
      pages.push(1);

      if (currentPage <= 3) {
        // 当前页在前面,显示 1 2 3 4 ... 最后
        pages.push(2, 3, 4, "ellipsis", totalPages);
      } else if (currentPage >= totalPages - 2) {
        // 当前页在后面,显示 1 ... 倒数4 倒数3 倒数2 倒数1
        pages.push(
          "ellipsis",
          totalPages - 3,
          totalPages - 2,
          totalPages - 1,
          totalPages
        );
      } else {
        // 当前页在中间,显示 1 ... 当前-1 当前 当前+1 ... 最后
        pages.push(
          "ellipsis",
          currentPage - 1,
          currentPage,
          currentPage + 1,
          "ellipsis",
          totalPages
        );
      }
    }

    return pages;
  };

  const pages = getPageNumbers();

  return (
    <Pagination>
      <PaginationContent>
        {/* 上一页按钮 */}
        <PaginationItem>
          <Button
            variant="outline"
            size="default"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="gap-1 pl-2.5"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>上一页</span>
          </Button>
        </PaginationItem>

        {/* 页码按钮 */}
        {pages.map((page, index) => (
          <PaginationItem key={index}>
            {page === "ellipsis" ? (
              <PaginationEllipsis />
            ) : (
              <Button
                variant={currentPage === page ? "default" : "outline"}
                size="icon"
                onClick={() => onPageChange(page)}
                className="w-9"
              >
                {page}
              </Button>
            )}
          </PaginationItem>
        ))}

        {/* 下一页按钮 */}
        <PaginationItem>
          <Button
            variant="outline"
            size="default"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="gap-1 pr-2.5"
          >
            <span>下一页</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
