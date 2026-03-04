import { decodeMulti } from "@msgpack/msgpack";

const DEFAULT_BASE_URL = "https://image.novelai.net";

const trimBaseUrl = (url: string) => url.replace(/\/+$/, "");

/** 将多个流式数据块拼接为一个连续的 Uint8Array */
const concatUint8Arrays = (chunks: Uint8Array[]) => {
  const total = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const buffer = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    buffer.set(chunk, offset);
    offset += chunk.length;
  });
  return buffer;
};

/** 确保传入的图片是完整 data URL，方便直接作为 <img> src 使用 */
const ensureDataUrl = (value: string) =>
  value.startsWith("data:")
    ? value
    : `data:image/png;base64,${value.replace(/^data:image\/\w+;base64,/, "")}`;

/** 去除 data:image 前缀，仅留下 base64 内容，方便 NovelAI 接受 */
const stripDataUrlPrefix = (dataUrl?: string | null) => {
  if (!dataUrl) {
    return undefined;
  }
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    return dataUrl;
  }
  return dataUrl.slice(commaIndex + 1);
};

export interface NovelAiClientConfig {
  apiToken: string;
  apiBaseUrl?: string;
}

export interface NovelAiRequestPayload {
  input: string;
  model: string;
  action?: string;
  parameters: Record<string, unknown>;
  stream?: "msgpack" | "raw";
  [key: string]: unknown;
}

export interface NovelAiGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  model: string;
  width: number;
  height: number;
  steps: number;
  scale: number;
  sampler: string;
  nSamples: number;
  seed?: number | null;
  stream?: "msgpack" | "raw";
  paramsVersion?: number;
  ucPreset?: number;
  qualityToggle?: boolean;
  noiseSchedule?: string;
  cfgRescale?: number;
  useCoords?: boolean;
  useOrder?: boolean;
  action?: "generate" | "img2img";
  referenceImage?: string | null;
  characterPrompts?: string[];
  extraParameters?: Record<string, unknown>;
  dynamicThresholding?: boolean;
  autoSmea?: boolean;
}

export interface NovelAiStreamEvent {
  type: string;
  payload?: Record<string, unknown>;
}

export interface NovelAiGenerateResult {
  images: string[];
  events: NovelAiStreamEvent[];
  rawBinary?: Uint8Array;
  payload: NovelAiRequestPayload;
}

export interface NovelAiRequestOptions {
  onEvent?: (event: NovelAiStreamEvent) => void;
}

/** 将 payload 中的 JSON 字符串解析为对象，否则直接返回原始值 */
const normalizePayload = (payload: unknown): unknown => {
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  }
  return payload;
};

/** 将 NovelAI 返回的 msgpack 流解码为带事件类型和 payload 的数组 */
const decodeMsgpackStream = (buffer: Uint8Array): NovelAiStreamEvent[] => {
  const events: NovelAiStreamEvent[] = [];
  try {
    for (const value of decodeMulti(buffer)) {
      const isTuple = Array.isArray(value) && value.length >= 2;
      const rawPayload = isTuple ? (value as [unknown, unknown])[1] : value;
      const normalized = normalizePayload(rawPayload);
      const payload =
        normalized && typeof normalized === "object"
          ? (normalized as Record<string, unknown>)
          : undefined;
      let type = "message";
      if (payload?.event_type && typeof payload.event_type === "string") {
        type = payload.event_type;
      } else if (isTuple) {
        const rawType = (value as [unknown, unknown])[0];
        if (typeof rawType === "string") {
          type = rawType;
        } else if (typeof rawType === "number") {
          type = `event-${rawType}`;
        } else {
          type = "event";
        }
      } else if (typeof value === "string") {
        type = value;
      }
      events.push({ type, payload });
    }
    if (!events.length) {
      events.push({ type: "raw" });
    }
    return events;
  } catch (error) {
    console.error("NovelAI msgpack 解析失败", error);
    return [{ type: "raw" }];
  }
};

/** 从解析后的事件中收集所有可能的图像字段（image/images/data） */
const extractImagesFromEvents = (events: NovelAiStreamEvent[]) => {
  const images: string[] = [];
  events.forEach((event) => {
    const payload = event.payload;
    if (payload) {
      if (typeof payload.image === "string") {
        images.push(ensureDataUrl(payload.image));
      }
      if (Array.isArray(payload.images)) {
        payload.images.forEach((img) => {
          if (typeof img === "string") {
            images.push(ensureDataUrl(img));
          }
        });
      }
      if (
        typeof payload.data === "string" &&
        payload.data.startsWith("data:image")
      ) {
        images.push(payload.data);
      }
    }
  });
  return images;
};

/** 构建与 NovelAI 文档一致的请求体，包括提示词、参考图与参数 */
export const buildNovelAiPayload = (
  options: NovelAiGenerationOptions
): NovelAiRequestPayload => {
  const baseCaption = options.prompt?.trim() || "masterpiece";
  const negativeCaption = options.negativePrompt?.trim();
  //  ||
  // "nsfw, lowres, jpeg artifacts, watermark, logo, low quality"

  const referenceImageBase64 = stripDataUrlPrefix(options.referenceImage);
  const parameters: Record<string, unknown> = {
    params_version: options.paramsVersion ?? 3,
    width: options.width,
    height: options.height,
    scale: options.scale,
    sampler: options.sampler,
    steps: options.steps,
    n_samples: options.nSamples,
    ucPreset: options.ucPreset ?? 0,
    qualityToggle: options.qualityToggle ?? true,
    noise_schedule: options.noiseSchedule ?? "karras",
    seed: typeof options.seed === "number" ? options.seed : null,
    cfg_rescale: options.cfgRescale ?? 0,
    use_coords: options.useCoords ?? false,
    negative_prompt: negativeCaption,
    characterPrompts: options.characterPrompts ?? [],
    v4_prompt: {
      caption: {
        base_caption: baseCaption,
        char_captions: [],
      },
      use_coords: options.useCoords ?? false,
      use_order: options.useOrder ?? true,
    },
    v4_negative_prompt: {
      caption: {
        base_caption: negativeCaption,
        char_captions: [],
      },
      legacy_uc: false,
    },
    ...options.extraParameters,
  };

  parameters.dynamic_thresholding = options.dynamicThresholding ?? false;
  parameters.autoSmea = options.autoSmea ?? false;

  if (referenceImageBase64) {
    parameters.add_original_image = true;
    parameters.image = referenceImageBase64;
  }

  return {
    input: baseCaption,
    model: options.model,
    action: options.action ?? "generate",
    parameters,
    stream: options.stream ?? "msgpack",
  };
};

export const createNovelAiClient = (config: NovelAiClientConfig) => {
  const baseUrl = trimBaseUrl(config.apiBaseUrl ?? DEFAULT_BASE_URL);
  const token = config.apiToken?.trim();

  /** 发送 POST 请求并逐块解析 NovelAI 返回的 SSE/msgpack 流 */
  async function request(
    payload: NovelAiRequestPayload,
    options?: NovelAiRequestOptions
  ): Promise<NovelAiGenerateResult> {
    if (!token) {
      throw new Error("NovelAI 需要先配置 API Token");
    }

    const response = await fetch(`${baseUrl}/ai/generate-image-stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`NovelAI 请求失败：${response.status} ${text}`);
    }

    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    const decoder = new TextDecoder();
    let sseBuffer = "";
    const sseEvents: NovelAiStreamEvent[] = [];
    const sseImages: string[] = [];

    const handleStreamEvent = (event: NovelAiStreamEvent) => {
      sseEvents.push(event);
      const parsedImages = extractImagesFromEvents([event]);
      if (parsedImages.length) {
        sseImages.push(...parsedImages);
      }
      options?.onEvent?.(event);
    };

    const parseSseBlock = (block: string): NovelAiStreamEvent | null => {
      const lines = block.split("\n");
      let eventType: string | undefined;
      const dataLines: string[] = [];
      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return;
        }
        const colonIndex = trimmed.indexOf(":");
        if (colonIndex === -1) {
          return;
        }
        const field = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();
        if (!value) {
          return;
        }
        if (field === "event") {
          eventType = value;
        } else if (field === "data") {
          dataLines.push(value);
        }
      });
      if (!dataLines.length) {
        return null;
      }
      const payloadContent = dataLines.join("\n");
      const normalized = normalizePayload(payloadContent);
      const payload =
        normalized && typeof normalized === "object"
          ? (normalized as Record<string, unknown>)
          : undefined;
      const type =
        (payload?.event_type as string | undefined) ?? eventType ?? "message";
      return { type, payload };
    };

    const processSseChunk = (chunk: Uint8Array) => {
      const text = decoder.decode(chunk, { stream: true });
      if (!text) {
        return;
      }
      sseBuffer += text.replace(/\r\n/g, "\n");
      let separatorIndex: number;
      while ((separatorIndex = sseBuffer.indexOf("\n\n")) >= 0) {
        const block = sseBuffer.slice(0, separatorIndex).trim();
        sseBuffer = sseBuffer.slice(separatorIndex + 2);
        if (block) {
          const event = parseSseBlock(block);
          if (event) {
            handleStreamEvent(event);
          }
        }
      }
    };

    const flushSseBuffer = () => {
      const leftover = sseBuffer.trim();
      if (leftover) {
        const event = parseSseBlock(leftover);
        if (event) {
          handleStreamEvent(event);
        }
        sseBuffer = "";
      }
    };

    if (reader) {
      // 浏览器环境：逐块读取
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          chunks.push(value);
          processSseChunk(value);
        }
      }
      flushSseBuffer();
    } else {
      const buffer = new Uint8Array(await response.arrayBuffer());
      chunks.push(buffer);
      processSseChunk(buffer);
      flushSseBuffer();
    }

    const merged = concatUint8Arrays(chunks);
    const events = sseEvents.length ? sseEvents : decodeMsgpackStream(merged);
    if (!sseEvents.length) {
      events.forEach((event) => options?.onEvent?.(event));
    }
    const images = sseImages.length
      ? sseImages
      : extractImagesFromEvents(events);
    return {
      images,
      events,
      rawBinary: merged,
      payload,
    };
  }

  /** 传入可选参数，自动构造 payload 并发起请求 */
  async function generateWithOptions(
    options: NovelAiGenerationOptions,
    requestOptions?: NovelAiRequestOptions
  ) {
    const payload = buildNovelAiPayload(options);
    return request(payload, requestOptions);
  }

  return {
    request,
    generateWithOptions,
  };
};
