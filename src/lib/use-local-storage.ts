/**
 * 简化 localStorage 状态管理的 Hook
 */
import { useEffect, useState } from "react";

/**
 * Hook: 读取 localStorage 的状态，发生变更时自动同步。
 */
export function useLocalStorageState<T>(key: string, defaultValue: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") {
      return defaultValue;
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        return JSON.parse(raw) as T;
      }
    } catch (error) {
      console.error("读取缓存失败:", error);
    }
    return defaultValue;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error("写入缓存失败:", error);
    }
  }, [key, state]);

  return [state, setState] as const;
}
