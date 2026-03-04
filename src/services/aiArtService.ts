/**
 * 为 OpenAI 兼容 API 提供统一的请求封装
 */
import axios from "axios";
import type { AxiosInstance, CancelToken } from "axios";

export interface AiArtClientConfig {
  apiBaseUrl: string;
  apiKey?: string;
}

export interface ModelDescriptor {
  id: string;
  name?: string;
  object?: string;
  created_at?: number;
  owned_by?: string;
  description?: string;
}

export type ChatMessageContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: {
        url: string;
        detail?: "low" | "high" | "auto";
      };
    };

export type ChatCompletionContent = string | ChatMessageContentBlock[];

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: ChatCompletionContent;
}

export interface ImageGenerationOptions {
  prompt: string;
  model?: string;
  size?: string;
  n?: number;
  negativePrompt?: string;
  seed?: number;
  steps?: number;
  guidance?: number;
  cancelToken?: CancelToken;
}

export interface GeneratedImageResponse {
  b64_json?: string;
  url?: string;
  [key: string]: unknown;
}

const trimBaseUrl = (url: string) => url.replace(/\/+$/, "");

const buildClient = (config: AiArtClientConfig) => {
  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  return axios.create({
    baseURL: trimBaseUrl(config.apiBaseUrl),
    timeout: 0,
    headers,
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseModelList = (payload: unknown): ModelDescriptor[] => {
  const list =
    isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : isRecord(payload) && Array.isArray(payload.models)
      ? payload.models
      : [];

  return list
    .filter((item): item is Record<string, unknown> => {
      return isRecord(item) && typeof item.id === "string";
    })
    .map((item) => ({
      id: item.id as string,
      name: typeof item.name === "string" ? item.name : undefined,
      object: typeof item.object === "string" ? item.object : undefined,
      description:
        typeof item.description === "string"
          ? item.description
          : typeof item.owned_by === "string"
          ? item.owned_by
          : undefined,
      created_at:
        typeof item.created_at === "number" ? item.created_at : undefined,
      owned_by: typeof item.owned_by === "string" ? item.owned_by : undefined,
    }));
};

type AsyncTaskMeta = {
  taskId: string;
  taskStatus?: string;
  requestId?: string;
};

const TASK_COMPLETED_STATUSES = new Set([
  "SUCCEED",
  "SUCCEEDED",
  "SUCCESS",
  "COMPLETED",
  "FINISHED",
  "DONE",
]);

const TASK_FAILED_STATUSES = new Set([
  "FAILED",
  "FAIL",
  "ERROR",
  "CANCELED",
  "CANCELLED",
  "REJECTED",
  "TIMEOUT",
]);

const toStringId = (value: unknown) => {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return undefined;
};

const normalizeStatus = (value?: string) => value?.trim().toUpperCase();

const isTaskCompleted = (status?: string) => {
  if (!status) {
    return false;
  }
  return TASK_COMPLETED_STATUSES.has(normalizeStatus(status) ?? "");
};

const isTaskFailed = (status?: string) => {
  if (!status) {
    return false;
  }
  return TASK_FAILED_STATUSES.has(normalizeStatus(status) ?? "");
};

const normalizeImageItem = (
  item: unknown
): GeneratedImageResponse | undefined => {
  if (typeof item === "string") {
    const value = item.trim();
    if (!value) {
      return undefined;
    }
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return { url: value };
    }
    return {
      b64_json: value.replace(/^data:image\/\w+;base64,/, ""),
    };
  }

  if (!isRecord(item)) {
    return undefined;
  }

  const urlCandidates = [item.url, item.image_url, item.output_url, item.path];
  const b64Candidates = [item.b64_json, item.base64, item.image_base64];

  const url = urlCandidates.find(
    (candidate): candidate is string => typeof candidate === "string"
  );
  const b64 = b64Candidates.find(
    (candidate): candidate is string => typeof candidate === "string"
  );

  if (!url && !b64) {
    return undefined;
  }

  return {
    ...item,
    ...(url ? { url } : {}),
    ...(b64 ? { b64_json: b64.replace(/^data:image\/\w+;base64,/, "") } : {}),
  };
};

const normalizeImageList = (list: unknown[]): GeneratedImageResponse[] => {
  return list
    .map((item) => normalizeImageItem(item))
    .filter((item): item is GeneratedImageResponse => Boolean(item));
};

const normalizeImagePayload = (raw: unknown): GeneratedImageResponse[] => {
  if (Array.isArray(raw)) {
    return normalizeImageList(raw);
  }

  if (!isRecord(raw)) {
    return [];
  }

  const dataRecord = isRecord(raw.data) ? raw.data : undefined;
  const outputRecord = isRecord(raw.output) ? raw.output : undefined;
  const resultRecord = isRecord(raw.result) ? raw.result : undefined;

  const candidates: unknown[] = [
    raw.images,
    raw.data,
    raw.results,
    raw.output_images,
    dataRecord?.images,
    dataRecord?.results,
    dataRecord?.output_images,
    outputRecord?.images,
    outputRecord?.results,
    outputRecord?.output_images,
    resultRecord?.images,
    resultRecord?.results,
    resultRecord?.output_images,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const normalized = normalizeImageList(candidate);
      if (normalized.length) {
        return normalized;
      }
    }
  }

  return [];
};

const extractTaskMeta = (payload: unknown): AsyncTaskMeta | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }

  const dataRecord = isRecord(payload.data) ? payload.data : undefined;
  const outputRecord = isRecord(payload.output) ? payload.output : undefined;

  const taskId =
    toStringId(payload.task_id) ??
    toStringId(dataRecord?.task_id) ??
    toStringId(outputRecord?.task_id);

  if (!taskId) {
    return undefined;
  }

  const taskStatus =
    typeof payload.task_status === "string"
      ? payload.task_status
      : typeof dataRecord?.task_status === "string"
      ? dataRecord.task_status
      : typeof outputRecord?.task_status === "string"
      ? outputRecord.task_status
      : undefined;

  const requestId =
    toStringId(payload.request_id) ??
    toStringId(dataRecord?.request_id) ??
    toStringId(outputRecord?.request_id);

  return {
    taskId,
    taskStatus,
    requestId,
  };
};

const extractErrorMessage = (payload: unknown): string | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }

  const dataRecord = isRecord(payload.data) ? payload.data : undefined;
  const outputRecord = isRecord(payload.output) ? payload.output : undefined;

  const candidates: unknown[] = [
    payload.message,
    payload.error,
    payload.error_msg,
    payload.detail,
    payload.task_error,
    dataRecord?.message,
    dataRecord?.error,
    dataRecord?.detail,
    outputRecord?.message,
    outputRecord?.error,
    outputRecord?.detail,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
};

const isTaskEndpointMissingError = (error: unknown) => {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  if (error.response?.status !== 404) {
    return false;
  }

  const payload = error.response?.data;
  if (typeof payload === "string") {
    return payload.includes("Invalid URL") || payload.includes("/tasks/");
  }

  if (!isRecord(payload)) {
    return false;
  }

  const message = extractErrorMessage(payload);
  return Boolean(
    message && message.includes("Invalid URL") && message.includes("/tasks/")
  );
};

const waitWithCancel = (ms: number, cancelToken?: CancelToken) => {
  if (!cancelToken) {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve();
    }, ms);

    cancelToken.promise
      .then((reason) => {
        clearTimeout(timer);
        reject(reason);
      })
      .catch(() => {
        clearTimeout(timer);
      });
  });
};

export const createAiArtClient = (config: AiArtClientConfig) => {
  const client: AxiosInstance = buildClient(config);

  async function pollImageTask(
    task: AsyncTaskMeta,
    options?: {
      cancelToken?: CancelToken;
      intervalMs?: number;
      timeoutMs?: number;
    }
  ): Promise<GeneratedImageResponse[]> {
    const intervalMs = options?.intervalMs ?? 1500;
    const timeoutMs = options?.timeoutMs ?? 120000;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      options?.cancelToken?.throwIfRequested?.();

      let payload: unknown;
      try {
        const response = await client.get(
          `/tasks/${encodeURIComponent(task.taskId)}`,
          {
            cancelToken: options?.cancelToken,
            headers: {
              "X-ModelScope-Task-Type": "image_generation",
            },
          }
        );
        payload = response.data;
      } catch (error) {
        if (isTaskEndpointMissingError(error)) {
          throw new Error(
            "当前网关不支持 /v1/tasks 查询（常见于 NewAPI 代理）。请改为直连 ModelScope，或在网关侧增加任务查询转发后再试。"
          );
        }
        throw error;
      }
      const images = normalizeImagePayload(payload);
      if (images.length) {
        return images;
      }

      const latestTask = extractTaskMeta(payload);
      const currentStatus = latestTask?.taskStatus ?? task.taskStatus;

      if (isTaskFailed(currentStatus)) {
        const message =
          extractErrorMessage(payload) ??
          `任务执行失败（task_id=${task.taskId}, status=${currentStatus ?? "FAILED"}）`;
        throw new Error(message);
      }

      if (isTaskCompleted(currentStatus)) {
        const message =
          extractErrorMessage(payload) ??
          `任务已完成但未返回图片（task_id=${task.taskId}）`;
        throw new Error(message);
      }

      if (attempt < maxAttempts - 1) {
        await waitWithCancel(intervalMs, options?.cancelToken);
      }
    }

    throw new Error(`任务轮询超时（task_id=${task.taskId}）`);
  }

  async function fetchModels(): Promise<ModelDescriptor[]> {
    const response = await client.get("/models");
    return parseModelList(response.data);
  }

  async function chatCompletion(params: {
    model: string;
    messages: ChatCompletionMessage[];
    temperature?: number;
    max_tokens?: number;
    response_format?: Record<string, unknown>;
  }): Promise<string | undefined> {
    if (!params.model) {
      return undefined;
    }
    const response = await client.post("/chat/completions", {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_tokens ?? 300,
      response_format: params.response_format,
    });
    const content =
      response.data?.choices?.[0]?.message?.content ??
      response.data?.choices?.[0]?.text;
    if (typeof content === "string") {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const text = content
        .filter((block: ChatMessageContentBlock) => block.type === "text")
        .map((block: ChatMessageContentBlock & { type: "text" }) => block.text)
        .join("\n")
        .trim();
      return text || undefined;
    }
    return undefined;
  }

  async function generateImages(options: ImageGenerationOptions) {
    const payload: Record<string, unknown> = {
      prompt: options.prompt,
      n: options.n ?? 1,
      size: options.size,
      model: options.model,
      negative_prompt: options.negativePrompt,
    };
    if (options.seed !== undefined) {
      payload.seed = options.seed;
    }
    if (options.steps !== undefined) {
      payload.steps = options.steps;
    }
    if (options.guidance !== undefined) {
      payload.guidance = options.guidance;
    }

    const response = await client.post("/images/generations", payload, {
      cancelToken: options.cancelToken,
    });

    const immediateImages = normalizeImagePayload(response.data);
    if (immediateImages.length) {
      return immediateImages;
    }

    const taskMeta = extractTaskMeta(response.data);
    if (taskMeta?.taskId) {
      return pollImageTask(taskMeta, {
        cancelToken: options.cancelToken,
      });
    }

    const message = extractErrorMessage(response.data);
    if (message) {
      throw new Error(message);
    }

    return [];
  }

  async function editImage(
    form: FormData,
    options?: { cancelToken?: CancelToken }
  ) {
    const response = await client.post("/images/edits", form, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      cancelToken: options?.cancelToken,
    });
    return normalizeImagePayload(response.data);
  }

  return {
    fetchModels,
    chatCompletion,
    generateImages,
    editImage,
  };
};
