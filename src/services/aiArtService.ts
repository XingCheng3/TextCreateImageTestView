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

const normalizeImagePayload = (raw: unknown): GeneratedImageResponse[] => {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && typeof raw === "object") {
    const candidates = [
      (raw as Record<string, unknown>).images,
      (raw as Record<string, unknown>).data,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter(
          (item) => item && typeof item === "object"
        ) as GeneratedImageResponse[];
      }
    }
  }
  return [];
};

export const createAiArtClient = (config: AiArtClientConfig) => {
  const client: AxiosInstance = buildClient(config);

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
    return normalizeImagePayload(response.data);
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
