import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { createAiArtClient } from "@/services/aiArtService";
import type {
  GeneratedImageResponse,
  ModelDescriptor,
  ChatMessageContentBlock,
} from "@/services/aiArtService";
import { useLocalStorageState } from "@/lib/use-local-storage";
import { dataUrlToFile, fileToDataUrl } from "@/lib/image-utils";
import axios from "axios";
import type { CancelToken, CancelTokenSource } from "axios";
import {
  Image,
  Sparkles,
  Wand2,
  RefreshCw,
  Layers,
  Clock3,
  Loader2,
} from "lucide-react";

type AiArtConfig = {
  apiBaseUrl: string;
  apiKey: string;
  imageModel: string;
  llmModel: string;
  size: string;
  outputCount: number;
  useLLM: boolean;
  seed: string;
  steps: string;
  guidance: string;
};

type AiArtHistoryEntry = {
  id: string;
  prompt: string;
  finalPrompt: string;
  images: string[];
  createdAt: string;
  usedReference: boolean;
  configSnapshot: Pick<AiArtConfig, "imageModel" | "size" | "outputCount">;
};

const DEFAULT_CONFIG: AiArtConfig = {
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  imageModel: "gpt-image-1",
  llmModel: "gpt-4o-mini",
  size: "1024x1024",
  outputCount: 1,
  useLLM: true,
  seed: "",
  steps: "",
  guidance: "",
};

const DEFAULT_HISTORY: AiArtHistoryEntry[] = [];

const MODEL_SELECT_PLACEHOLDER = "请选择模型";
const EMPTY_LLM_RESULT_VALUE = "__no_llm_model_result__";

const MAX_HISTORY_ITEMS = 6;

const SIZE_OPTIONS = ["512x512", "768x768", "1024x1024"];

const OUTPUT_OPTIONS = [1, 2, 3, 4];

const DEFAULT_LLM_MODELS = ["gpt-4o-mini", "gpt-4o"];
const DEFAULT_IMAGE_MODELS = ["gpt-image-1", "dall-e-3", "claude-3.5-sonic"];

const SYSTEM_PROMPT =
  "你是一名专业的 AI 绘图提示词优化师。将用户提供的描述升级为更清晰、细致且适配图像生成模型的提示词，保留原意并补充风格、场景、光线等细节。";

const LOCAL_STORAGE_KEYS = {
  CONFIG: "ai-art-config-v1",
  HISTORY: "ai-art-history-v1",
};

const formatTimestamp = (iso?: string | null) => {
  if (!iso) {
    return "尚未同步";
  }
  return new Date(iso).toLocaleString("zh-CN");
};

const parseNumberInput = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const isValidHttpUrl = (value?: string) => {
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const isDataUrl = (value: string) => value.startsWith("data:");

const extractErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isCancel(error)) {
    return "请求已取消";
  }
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string; error?: string }
      | undefined;
    const payloadMessage = data?.message ?? data?.error;
    if (payloadMessage) {
      return payloadMessage;
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

export function AiArtStudio() {
  const { toast } = useToast();

  const [config, setConfig] = useLocalStorageState<AiArtConfig>(
    LOCAL_STORAGE_KEYS.CONFIG,
    DEFAULT_CONFIG
  );
  const [history, setHistory] = useLocalStorageState<AiArtHistoryEntry[]>(
    LOCAL_STORAGE_KEYS.HISTORY,
    DEFAULT_HISTORY
  );

  const [prompt, setPrompt] = useState("");
  const [extraHint, setExtraHint] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const [modelsUpdatedAt, setModelsUpdatedAt] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [llmModelFilter, setLlmModelFilter] = useState("");

  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [remoteReferenceUrl, setRemoteReferenceUrl] = useState("");
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceDataUrl, setReferenceDataUrl] = useState<string | null>(null);
  const [maskFile, setMaskFile] = useState<File | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [analysisLog, setAnalysisLog] = useState<string[]>([]);
  const [finalPrompt, setFinalPrompt] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [cancelSource, setCancelSource] = useState<CancelTokenSource | null>(
    null
  );
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const referenceSectionRef = useRef<HTMLElement | null>(null);

  const apiClient = useMemo(
    () =>
      createAiArtClient({
        apiBaseUrl: config.apiBaseUrl,
        apiKey: config.apiKey,
      }),
    [config.apiBaseUrl, config.apiKey]
  );

  useEffect(() => {
    if (!referenceFile) {
      setReferencePreview(remoteReferenceUrl || null);
      return;
    }
    const url = URL.createObjectURL(referenceFile);
    setReferencePreview(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [referenceFile, remoteReferenceUrl]);

  const ensureReferenceDataUrl = async () => {
    if (referenceFile) {
      if (referenceDataUrl) {
        return referenceDataUrl;
      }
      try {
        const dataUrl = await fileToDataUrl(referenceFile);
        setReferenceDataUrl(dataUrl);
        return dataUrl;
      } catch (error) {
        console.error("读取参考图失败", error);
        return null;
      }
    }
    const trimmedRemote = remoteReferenceUrl.trim();
    if (trimmedRemote) {
      return trimmedRemote;
    }
    return referenceDataUrl;
  };

  const availableLLMModels: ModelDescriptor[] = models.length
    ? models
    : DEFAULT_LLM_MODELS.map<ModelDescriptor>((id) => ({ id }));
  const availableImageModels: ModelDescriptor[] = models.length
    ? models
    : DEFAULT_IMAGE_MODELS.map<ModelDescriptor>((id) => ({ id }));

  const filteredLLMModels = useMemo(() => {
    const keyword = llmModelFilter.trim().toLowerCase();
    if (!keyword) {
      return availableLLMModels;
    }
    return availableLLMModels.filter((model) => {
      const haystack = [model.id, model.name, model.description, model.owned_by]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [availableLLMModels, llmModelFilter]);

  const mapModelList = (list: ModelDescriptor[]) =>
    list.map((model) => (
      <SelectItem key={model.id} value={model.id}>
        {model.id}
        {model.description ? ` · ${model.description}` : ""}
      </SelectItem>
    ));

  const pushLog = (message: string) => {
    setAnalysisLog((prev) => {
      const next = [...prev, `${new Date().toLocaleTimeString()} · ${message}`];
      if (next.length > 8) {
        next.shift();
      }
      return next;
    });
  };

  const updateConfig = (partial: Partial<AiArtConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  };

  const stopRequestTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    startTimeRef.current = 0;
    setElapsedSeconds(0);
  };

  const beginRequestTimer = () => {
    stopRequestTimer();
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setElapsedSeconds(Math.floor(elapsed / 1000));
    }, 1000);
  };

  useEffect(() => {
    return () => {
      stopRequestTimer();
    };
  }, []);

  const handleFetchModels = async () => {
    if (!config.apiBaseUrl) {
      setModelsError("请先填写 API 地址");
      return;
    }
    setLoadingModels(true);
    setModelsError(null);
    try {
      const list = await apiClient.fetchModels();
      setModels(list);
      setModelsUpdatedAt(new Date().toISOString());
      toast({
        title: "模型列表已更新",
        description: `共找到 ${list.length} 个模型`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "获取模型失败，请检查网络和 API Key";
      setModelsError(message);
      toast({
        title: "获取模型失败",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoadingModels(false);
    }
  };

  const handleReferenceUpload = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      setReferenceFile(file);
      setRemoteReferenceUrl("");
      setReferenceDataUrl(null);
      fileToDataUrl(file)
        .then((dataUrl) => setReferenceDataUrl(dataUrl))
        .catch((error) => {
          console.error("参考图转换失败", error);
        });
      event.target.value = "";
    }
  };

  const handleMaskUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setMaskFile(file);
      event.target.value = "";
    }
  };

  const handleRemoteReferenceChange = (value: string) => {
    setRemoteReferenceUrl(value);
    if (value) {
      setReferenceFile(null);
      setReferenceDataUrl(null);
    }
  };

  const handleUseHistoryImage = (image: string) => {
    try {
      if (isDataUrl(image)) {
        const file = dataUrlToFile(image);
        setReferenceFile(file);
        setReferenceDataUrl(image);
        setRemoteReferenceUrl("");
      } else {
        setReferenceFile(null);
        setReferenceDataUrl(null);
        setRemoteReferenceUrl(image);
      }

      referenceSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      toast({
        title: "已采用历史图片",
        description: "已切换到参考图区域，可直接继续微调",
      });
    } catch (error) {
      toast({
        title: "设置参考图失败",
        description: error instanceof Error ? error.message : "请重试",
        variant: "destructive",
      });
    }
  };

  const handleClearReference = () => {
    setReferenceFile(null);
    setMaskFile(null);
    setReferenceDataUrl(null);
    setRemoteReferenceUrl("");
    toast({
      title: "参考图片已清空",
      description: "下一次生成将不会带入参考图像",
    });
  };

  const responsesToUrls = (responses: GeneratedImageResponse[]) =>
    (responses ?? [])
      .map((item) => {
        if (item.b64_json) {
          return `data:image/png;base64,${item.b64_json}`;
        }
        if (item.url) {
          return item.url;
        }
        return null;
      })
      .filter(Boolean) as string[];

  const callImageApiOnce = async (
    promptForModel: string,
    cancelToken?: CancelToken
  ) => {
    const seedValue = parseNumberInput(config.seed);
    const stepsValue = parseNumberInput(config.steps);
    const guidanceValue = parseNumberInput(config.guidance);
    const normalizedNegativePrompt = negativePrompt.trim() || undefined;
    const normalizedEditNotes = editNotes.trim() || undefined;
    const trimmedRemoteReference = remoteReferenceUrl.trim();
    if (referenceFile || trimmedRemoteReference) {
      const form = new FormData();
      if (referenceFile) {
        form.append("image", referenceFile);
      } else if (trimmedRemoteReference) {
        form.append("image_url", trimmedRemoteReference);
      }
      if (maskFile) {
        form.append("mask", maskFile);
      }
      form.append("prompt", promptForModel);
      form.append("model", config.imageModel);
      form.append("n", "1");
      form.append("size", config.size);
      if (normalizedNegativePrompt) {
        form.append("negative_prompt", normalizedNegativePrompt);
      }
      if (normalizedEditNotes) {
        form.append("edit_prompt", normalizedEditNotes);
      }
      if (seedValue !== undefined) {
        form.append("seed", seedValue.toString());
      }
      if (stepsValue !== undefined) {
        form.append("steps", stepsValue.toString());
      }
      if (guidanceValue !== undefined) {
        form.append("guidance", guidanceValue.toString());
      }
      const responses = await apiClient.editImage(form, {
        cancelToken,
      });
      return responsesToUrls(responses);
    }
    const responses = await apiClient.generateImages({
      prompt: promptForModel,
      model: config.imageModel,
      size: config.size,
      n: 1,
      negativePrompt: normalizedNegativePrompt,
      seed: seedValue,
      steps: stepsValue,
      guidance: guidanceValue,
      cancelToken,
    });
    return responsesToUrls(responses);
  };

  const handleGenerate = async () => {
    const normalizedPrompt = prompt.trim();
    const normalizedExtraHint = extraHint.trim();
    const normalizedRemoteReferenceUrl = remoteReferenceUrl.trim();

    if (!normalizedPrompt) {
      toast({
        title: "请输入描述文本",
        variant: "destructive",
      });
      return;
    }
    if (normalizedRemoteReferenceUrl && !isValidHttpUrl(normalizedRemoteReferenceUrl)) {
      toast({
        title: "参考图 URL 无效",
        description: "请填写以 http:// 或 https:// 开头的可访问地址",
        variant: "destructive",
      });
      return;
    }
    if (!config.apiBaseUrl || !config.imageModel) {
      toast({
        title: "请完善 API 配置",
        variant: "destructive",
        description: "需要 API 地址和画图模型才能执行",
      });
      return;
    }
    setGenerating(true);
    setGeneratedImages([]);
    setAnalysisLog([]);
    setFinalPrompt("");
    setErrorMessage(null);
    const source = axios.CancelToken.source();
    setCancelSource(source);
    beginRequestTimer();

    let promptForModel = normalizedPrompt;

    try {
      if (config.useLLM && config.llmModel) {
        pushLog("使用 LLM 优化提示词");
        const referenceData = await ensureReferenceDataUrl();
        const userContent: ChatMessageContentBlock[] = [
          { type: "text", text: `原始描述：${normalizedPrompt}` },
        ];
        if (normalizedExtraHint) {
          userContent.push({
            type: "text",
            text: `补充要求：${normalizedExtraHint}`,
          });
        }
        if (negativePrompt) {
          userContent.push({
            type: "text",
            text: `排除内容：${negativePrompt}`,
          });
        }
        if (referenceData) {
          userContent.push({
            type: "image_url",
            image_url: { url: referenceData, detail: "high" },
          });
          pushLog("已向 LLM 传入参考图像");
        }

        const completion = await apiClient.chatCompletion({
          model: config.llmModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: userContent,
            },
          ],
        });
        if (completion) {
          promptForModel = completion;
          pushLog("LLM 输出已采用");
        } else {
          pushLog("LLM 未返回优化结果，保留原始描述");
        }
      } else if (normalizedExtraHint) {
        promptForModel = `${normalizedPrompt}\n${normalizedExtraHint}`;
        pushLog("已将附加细节合并到提示词");
      }
      setFinalPrompt(promptForModel);
      pushLog("开始调用画图 API");
      const collected: string[] = [];
      const failedAttempts: string[] = [];
      for (let i = 0; i < config.outputCount; i += 1) {
        pushLog(`画图进度：第 ${i + 1}/${config.outputCount} 次`);
        try {
          const urls = await callImageApiOnce(promptForModel, source.token);
          if (urls.length) {
            pushLog(`第 ${i + 1} 次返回 ${urls.length} 张图片`);
            collected.push(...urls);
            setGeneratedImages([...collected]);
          } else {
            pushLog(`第 ${i + 1} 次未返回图片`);
          }
        } catch (error) {
          if (axios.isCancel(error)) {
            throw error;
          }
          const message = extractErrorMessage(
            error,
            `第 ${i + 1} 次生成失败`
          );
          failedAttempts.push(message);
          pushLog(`第 ${i + 1} 次失败：${message}`);
        }
      }

      if (!collected.length) {
        throw new Error("未收到任何图片结果，请检查 API 响应");
      }

      setGeneratedImages(collected);
      pushLog(`共生成 ${collected.length} 张图片`);

      const entry: AiArtHistoryEntry = {
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        prompt: normalizedPrompt,
        finalPrompt: promptForModel,
        images: collected.slice(0, 4),
        createdAt: new Date().toISOString(),
        usedReference: Boolean(referenceFile || normalizedRemoteReferenceUrl),
        configSnapshot: {
          imageModel: config.imageModel,
          size: config.size,
          outputCount: config.outputCount,
        },
      };

      setHistory((prev) => {
        const next = [entry, ...prev];
        return next.slice(0, MAX_HISTORY_ITEMS);
      });

      toast({
        title:
          referenceFile || normalizedRemoteReferenceUrl ? "微调完成" : "生成完成",
        description: `生成 ${collected.length} 张图片`,
      });

      if (failedAttempts.length) {
        toast({
          title: "部分请求失败",
          description: `有 ${failedAttempts.length} 次请求未成功，已保留成功结果`,
          variant: "destructive",
        });
      }
    } catch (error) {
      const isCanceled = axios.isCancel(error);
      const message = extractErrorMessage(error, "生成过程出现异常");
      setErrorMessage(message);
      pushLog(`失败：${message}`);
      toast({
        title: isCanceled ? "请求已取消" : "操作失败",
        description: message,
        variant: isCanceled ? undefined : "destructive",
      });
    } finally {
      stopRequestTimer();
      setCancelSource(null);
      setGenerating(false);
    }
  };

  const handleCancelRequest = () => {
    if (cancelSource) {
      cancelSource.cancel("用户主动取消");
    }
  };

  return (
    <Card className="lg:border lg:shadow-sm">
      <CardHeader className="space-y-2 pb-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>OpenAI 兼容 AI 画图工作室</CardTitle>
        </div>
        <CardDescription className="text-sm text-muted-foreground">
          左侧调参与提示词，右侧看实时反馈、最新生成与历史微调。
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="space-y-4">
            <section className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-primary" />
                    <p className="text-base font-medium">API 配置</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleFetchModels}
                    disabled={!config.apiBaseUrl || loadingModels}
                  >
                    <RefreshCw className="h-4 w-4" />
                    刷新模型
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  API 需遵循 OpenAI/v1 格式，如{" "}
                  {config.apiBaseUrl || "https://api.openai.com/v1"}。
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="api-base">API 地址</Label>
                  <Input
                    id="api-base"
                    placeholder="https://xxxx/v1"
                    value={config.apiBaseUrl}
                    onChange={(e) => updateConfig({ apiBaseUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="api-key">API Key</Label>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={() => updateConfig({ apiKey: "" })}
                    >
                      清空
                    </Button>
                  </div>
                  <Input
                    id="api-key"
                    type="password"
                    placeholder="Bearer ..."
                    value={config.apiKey}
                    onChange={(e) => updateConfig({ apiKey: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2 md:col-span-2 xl:col-span-1">
                  <div className="flex items-center justify-between">
                    <Label>LLM 模型（优化提示词）</Label>
                    <span className="text-xs text-muted-foreground">
                      {filteredLLMModels.length}/{availableLLMModels.length}
                    </span>
                  </div>
                  <Input
                    placeholder="搜索模型"
                    className="text-sm"
                    value={llmModelFilter}
                    onChange={(e) => setLlmModelFilter(e.target.value)}
                  />
                  <Select
                    value={config.llmModel}
                    onValueChange={(value) => updateConfig({ llmModel: value })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={MODEL_SELECT_PLACEHOLDER} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredLLMModels.length > 0 ? (
                        mapModelList(filteredLLMModels)
                      ) : (
                        <SelectItem value={EMPTY_LLM_RESULT_VALUE} disabled>
                          未找到匹配模型
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>画图模型</Label>
                  <Input
                    placeholder="手动输入模型 ID"
                    list="image-model-suggestions"
                    value={config.imageModel}
                    onChange={(e) => updateConfig({ imageModel: e.target.value })}
                  />
                  <datalist id="image-model-suggestions">
                    {availableImageModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.description ?? model.name ?? model.id}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1">
                  <Label>分辨率</Label>
                  <Select
                    value={config.size}
                    onValueChange={(value) => updateConfig({ size: value })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择分辨率" />
                    </SelectTrigger>
                    <SelectContent>
                      {SIZE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={size}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>输出张数</Label>
                  <Select
                    value={config.outputCount.toString()}
                    onValueChange={(value) =>
                      updateConfig({ outputCount: Number(value) })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="1" />
                    </SelectTrigger>
                    <SelectContent>
                      {OUTPUT_OPTIONS.map((count) => (
                        <SelectItem key={count} value={count.toString()}>
                          {count} 张
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="seed">随机种子（seed）</Label>
                  <Input
                    id="seed"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="可选"
                    value={config.seed ?? ""}
                    onChange={(e) => updateConfig({ seed: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="steps">采样步数（steps）</Label>
                  <Input
                    id="steps"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="例如 30"
                    value={config.steps ?? ""}
                    onChange={(e) => updateConfig({ steps: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="guidance">引导系数（guidance）</Label>
                  <Input
                    id="guidance"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="例如 3.5"
                    value={config.guidance ?? ""}
                    onChange={(e) => updateConfig({ guidance: e.target.value })}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                模型列表：
                {models.length
                  ? `${models.length} 个模型，最后同步 ${formatTimestamp(
                      modelsUpdatedAt
                    )}`
                  : "未同步"}
              </p>
              {modelsError && (
                <Alert variant="destructive">
                  <AlertDescription>{modelsError}</AlertDescription>
                </Alert>
              )}
            </section>

            <section className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <Image className="h-4 w-4 text-secondary" />
                <p className="text-base font-medium">输入提示与思考</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt">主要描述</Label>
                <textarea
                  id="prompt"
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                  placeholder="描述你想要的画面、风格、构图等"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="extra-hint">附加细节（可选）</Label>
                  <textarea
                    id="extra-hint"
                    rows={2}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    placeholder="例如光线、场景、情绪、参考艺术家、色调"
                    value={extraHint}
                    onChange={(e) => setExtraHint(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="negative-prompt">排除内容（可选）</Label>
                  <textarea
                    id="negative-prompt"
                    rows={2}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    placeholder="例如不要阴影噪点、人物不要有水印"
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  id="llm-switch"
                  type="checkbox"
                  checked={config.useLLM}
                  onChange={(e) => updateConfig({ useLLM: e.target.checked })}
                  className="h-4 w-4 rounded border border-border bg-background"
                />
                <label htmlFor="llm-switch">是否启用 LLM 优化提示词（可选）</label>
              </div>

              {finalPrompt && (
                <Badge className="inline-flex max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs">
                  最终提示词：{finalPrompt}
                </Badge>
              )}
            </section>

            <section
              ref={referenceSectionRef}
              className="space-y-3 rounded-lg border border-border p-4"
            >
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-secondary" />
                <p className="text-base font-medium">参考图片 / 微调</p>
              </div>
              <p className="text-xs text-muted-foreground">
                上传一张用于微调的图片，或在右侧历史区点“继续微调”自动带入。
              </p>
              <div className="flex flex-wrap gap-3">
                <label className="cursor-pointer rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition hover:border-primary">
                  上传参考图
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleReferenceUpload}
                  />
                </label>
                <label className="cursor-pointer rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition hover:border-primary">
                  上传遮罩
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleMaskUpload}
                  />
                </label>
                <Button size="sm" variant="outline" onClick={handleClearReference}>
                  清除参考图
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="remote-reference-url">远程待编辑图片 URL（可选）</Label>
                <Input
                  id="remote-reference-url"
                  placeholder="https://your-host/image.png"
                  value={remoteReferenceUrl}
                  onChange={(event) =>
                    handleRemoteReferenceChange(event.target.value)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  仅在不上传本地图片时使用，请确保地址可公网访问。
                </p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {referencePreview && (
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">参考图预览</p>
                    <div className="mt-2 aspect-square overflow-hidden rounded-md border bg-muted/20">
                      <img
                        src={referencePreview}
                        alt="参考图"
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-contain"
                      />
                    </div>
                  </div>
                )}
                {maskFile && (
                  <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
                    已选择遮罩：{maskFile.name}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes">微调补充说明（可选）</Label>
                <textarea
                  id="edit-notes"
                  rows={2}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                  placeholder="例如：只调整人物表情、加强天空色彩"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-secondary" />
                  <p className="text-base font-medium">实时反馈</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={handleGenerate} disabled={generating}>
                    {generating && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
                    )}
                    {generating ? "生成中..." : "立即生成"}
                  </Button>
                  {generating && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancelRequest}
                    >
                      取消请求
                    </Button>
                  )}
                </div>
              </div>
              {generating && (
                <p className="text-xs text-muted-foreground">
                  请求已等待 {elapsedSeconds} 秒
                </p>
              )}
              {errorMessage && (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                {analysisLog.length > 0 ? (
                  analysisLog.map((log, index) => (
                    <p
                      key={`${index}-${log}`}
                      className="text-xs text-muted-foreground"
                    >
                      {log}
                    </p>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    暂无日志，点击“立即生成”后会显示调用过程。
                  </p>
                )}
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <Image className="h-4 w-4 text-primary" />
                <p className="text-base font-medium">最新生成</p>
              </div>
              {generatedImages.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {generatedImages.map((url, index) => (
                    <div
                      key={`${url}-${index}`}
                      className="rounded-lg border bg-muted/20 p-2 transition hover:border-primary"
                    >
                      <div className="aspect-square overflow-hidden rounded-md border bg-muted/10">
                        <img
                          src={url}
                          alt="生成结果"
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUseHistoryImage(url)}
                        >
                          继续微调
                        </Button>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground underline"
                        >
                          预览
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  暂无生成结果，左侧设置好参数后即可开始。
                </p>
              )}
            </section>

            <section className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-secondary" />
                <p className="text-base font-medium">
                  历史记录（最多保留 {MAX_HISTORY_ITEMS} 条）
                </p>
              </div>
              {history.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {history.map((item) => (
                    <div key={item.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{new Date(item.createdAt).toLocaleString("zh-CN")}</span>
                        <Badge variant="outline">
                          {item.usedReference ? "微调" : "原始生成"}
                        </Badge>
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm text-foreground break-words">
                        {item.finalPrompt}
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {item.images.slice(0, 2).map((image, imageIndex) => (
                          <button
                            key={`${item.id}-${imageIndex}`}
                            className="rounded border border-border p-1"
                            type="button"
                            onClick={() => handleUseHistoryImage(image)}
                          >
                            <div className="aspect-square overflow-hidden rounded-sm bg-muted/20">
                              <img
                                src={image}
                                alt="历史图"
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-contain"
                              />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  暂无历史记录，生成后会自动保存到浏览器。
                </p>
              )}
            </section>
          </div>
        </div>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        所有数据保存在浏览器缓存中，API 请求直接发送给用户配置的 OpenAI
        兼容服务。
      </CardFooter>
    </Card>
  );
}
