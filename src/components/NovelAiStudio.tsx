import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useLocalStorageState } from "@/lib/use-local-storage";
import { fileToDataUrl } from "@/lib/image-utils";
import {
  buildNovelAiPayload,
  createNovelAiClient,
} from "@/services/novelAiService";
import type { NovelAiStreamEvent } from "@/services/novelAiService";
import {
  Clipboard,
  Cpu,
  Download,
  Image,
  Settings,
  Trash,
  Zap,
} from "lucide-react";

type NovelAiConfig = {
  apiBaseUrl: string;
  apiToken: string;
  model: string;
  sampler: string;
  width: number;
  height: number;
  steps: number;
  scale: number;
  nSamples: number;
  ucPreset: number;
  qualityToggle: boolean;
  noiseSchedule: string;
  cfgRescale: number;
  paramsVersion: number;
  dynamicThresholding: boolean;
  autoSmea: boolean;
  controlnetStrength: number;
  useCoords: boolean;
  useOrder: boolean;
  legacy: boolean;
  legacyUc: boolean;
  legacyV3Extend: boolean;
  skipCfgAboveSigma: number;
  normalizeReferenceStrengthMultiple: boolean;
  inpaintStrength: number;
  deliberateEulerAncestralBug: boolean;
  preferBrownian: boolean;
  useNewSharedTrial: boolean;
  recaptchaToken: string;
  characterPrompts: string;
};

type NovelAiHistoryEntry = {
  id: string;
  prompt: string;
  negativePrompt?: string;
  images: string[];
  createdAt: string;
  payloadPreview: string;
};

const DEFAULT_NOVEL_CONFIG: NovelAiConfig = {
  apiBaseUrl: "https://image.novelai.net",
  apiToken: "",
  model: "nai-diffusion-4-5-full",
  sampler: "k_euler_ancestral",
  width: 832,
  height: 1216,
  steps: 28,
  scale: 5,
  nSamples: 1,
  ucPreset: 0,
  qualityToggle: true,
  noiseSchedule: "karras",
  cfgRescale: 0,
  paramsVersion: 3,
  dynamicThresholding: false,
  autoSmea: false,
  controlnetStrength: 1,
  useCoords: false,
  useOrder: true,
  legacy: false,
  legacyUc: false,
  legacyV3Extend: false,
  skipCfgAboveSigma: 0,
  normalizeReferenceStrengthMultiple: true,
  inpaintStrength: 1,
  deliberateEulerAncestralBug: false,
  preferBrownian: true,
  useNewSharedTrial: true,
  recaptchaToken: "",
  characterPrompts: "",
};

const LOCAL_STORAGE_KEYS = {
  CONFIG: "novel-ai-config",
  HISTORY: "novel-ai-history",
};

const SAMPLER_OPTIONS = [
  "k_euler_ancestral",
  "k_euler",
  "k_dpmpp_sde",
  "k_dpmpp_2m",
  "k_dpmpp_2s_ancestral",
];

const MODEL_OPTIONS = ["nai-diffusion-4-5-curated", "nai-diffusion-4-5-full"];

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** 尝试将任意值转为有效数字（可用于 step、sigma 等字段） */
const parseNumeric = (value: unknown) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

/** 将纯 base64 或者 data URL 转成前端可识别的 data:image 形式 */
const toDataUrl = (value?: string | null) => {
  if (!value) {
    return undefined;
  }
  if (value.startsWith("data:")) {
    return value;
  }
  return `data:image/png;base64,${value.replace(
    /^data:image\/\w+;base64,/,
    ""
  )}`;
};

/** 描述单个事件（用于实时日志与批量展示） */
const describeEvent = (event: NovelAiStreamEvent, index: number) => {
  const payload = event.payload;
  const eventType =
    (payload?.event_type as string | undefined) ??
    (event.type !== "message" ? event.type : undefined) ??
    `event-${index + 1}`;
  const steps = parseNumeric(
    payload?.step_ix ?? payload?.step ?? payload?.step_index
  );
  const sigma = parseNumeric(payload?.sigma);
  const details: string[] = [];
  if (steps !== undefined) {
    details.push(`step ${steps}`);
  }
  if (sigma !== undefined) {
    details.push(`sigma ${sigma.toFixed(2)}`);
  }
  if (payload?.gen_id) {
    details.push(`gen_id ${payload.gen_id}`);
  }
  const detailText = details.length ? ` (${details.join(", ")})` : "";
  return `${index + 1}. ${eventType}${detailText}`;
};

/** 解析事件 payload 的图片字段，优先取 image，其次 images[0] 或 data */
const extractImageFromEvent = (event: NovelAiStreamEvent) => {
  const payload = event.payload;
  if (!payload) {
    return null;
  }
  const candidate =
    typeof payload.image === "string"
      ? payload.image
      : Array.isArray(payload.images) && typeof payload.images[0] === "string"
      ? payload.images[0]
      : typeof payload.data === "string"
      ? payload.data
      : undefined;
  return toDataUrl(candidate ?? undefined) ?? null;
};

export function NovelAiStudio() {
  const { toast } = useToast();
  const [config, setConfig] = useLocalStorageState<NovelAiConfig>(
    LOCAL_STORAGE_KEYS.CONFIG,
    DEFAULT_NOVEL_CONFIG
  );
  const [history, setHistory] = useLocalStorageState<NovelAiHistoryEntry[]>(
    LOCAL_STORAGE_KEYS.HISTORY,
    []
  );

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [seedText, setSeedText] = useState("");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceFileName, setReferenceFileName] = useState<string | null>(
    null
  );

  const [generating, setGenerating] = useState(false);
  const [analysisLog, setAnalysisLog] = useState<string[]>([]);
  const [payloadPreview, setPayloadPreview] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState<string | null>(null);
  const [finalImage, setFinalImage] = useState<string | null>(null);

  const novelClient = useMemo(
    () =>
      createNovelAiClient({
        apiToken: config.apiToken,
        apiBaseUrl: config.apiBaseUrl,
      }),
    [config.apiToken, config.apiBaseUrl]
  );

  const pushLog = (message: string) => {
    setAnalysisLog((prev) => {
      const next = [...prev, `${new Date().toLocaleTimeString()} · ${message}`];
      if (next.length > 10) {
        next.shift();
      }
      return next;
    });
  };

  const updateConfig = (partial: Partial<NovelAiConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  };

  const handleReferenceUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setReferenceImage(dataUrl);
      setReferenceFileName(file.name);
    } catch (error) {
      toast({
        title: "读取参考图失败",
        description: error instanceof Error ? error.message : "请重试",
        variant: "destructive",
      });
    } finally {
      event.target.value = "";
    }
  };

  const clearReference = () => {
    setReferenceImage(null);
    setReferenceFileName(null);
  };

  const handleCopyPayload = async () => {
    if (!payloadPreview) {
      return;
    }
    try {
      await navigator.clipboard.writeText(payloadPreview);
      toast({ title: "已复制调用参数" });
    } catch (error) {
      toast({
        title: "复制失败",
        description: error instanceof Error ? error.message : "请手动复制",
        variant: "destructive",
      });
    }
  };

  const ensureSeed = () => {
    if (!seedText.trim()) {
      return null;
    }
    const parsed = Number(seedText);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return parsed;
  };

  const handleReuseHistory = (entry: NovelAiHistoryEntry) => {
    setPrompt(entry.prompt);
    setNegativePrompt(entry.negativePrompt ?? "");
    setPayloadPreview(entry.payloadPreview);
    toast({
      title: "已载入历史提示词",
      description: "可在左侧调整参数后再次生成",
    });
  };

  const handleUseHistoryAsReference = (image: string) => {
    setReferenceImage(image);
    setReferenceFileName("history.png");
    toast({
      title: "已将历史图片作为参考",
      description: "下一次请求将携带该图片",
    });
  };

  const handleDeleteHistory = (id: string) => {
    setHistory((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleClearHistory = () => {
    setHistory([]);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({ title: "请输入 Prompt", variant: "destructive" });
      return;
    }
    if (!config.apiToken) {
      toast({ title: "请配置 NovelAI Token", variant: "destructive" });
      return;
    }

    setGenerating(true);
    setAnalysisLog([]);
    setPayloadPreview("");
    setErrorMessage(null);
    setLivePreview(null);
    setFinalImage(null);
    const parsedCharacterPrompts = (config.characterPrompts ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    try {
      const options = {
        prompt,
        negativePrompt,
        model: config.model,
        width: clampNumber(config.width, 512, 1536),
        height: clampNumber(config.height, 512, 1536),
        steps: clampNumber(config.steps, 10, 60),
        scale: clampNumber(config.scale, 1, 20),
        sampler: config.sampler,
        nSamples: clampNumber(config.nSamples, 1, 4),
        seed: ensureSeed(),
        stream: "msgpack" as const,
        noiseSchedule: config.noiseSchedule,
        ucPreset: config.ucPreset,
        qualityToggle: config.qualityToggle,
        cfgRescale: config.cfgRescale,
        paramsVersion: config.paramsVersion,
        dynamicThresholding: config.dynamicThresholding,
        autoSmea: config.autoSmea,
        controlnetStrength: config.controlnetStrength,
        useCoords: config.useCoords,
        useOrder: config.useOrder,
        legacy: config.legacy,
        legacyUc: config.legacyUc,
        legacyV3Extend: config.legacyV3Extend,
        skipCfgAboveSigma: config.skipCfgAboveSigma,
        normalizeReferenceStrengthMultiple:
          config.normalizeReferenceStrengthMultiple,
        inpaintStrength: config.inpaintStrength,
        deliberateEulerAncestralBug: config.deliberateEulerAncestralBug,
        preferBrownian: config.preferBrownian,
        useNewSharedTrial: config.useNewSharedTrial,
        recaptchaToken: config.recaptchaToken,
        characterPrompts: parsedCharacterPrompts,
        referenceImage,
      };

      const payload = buildNovelAiPayload(options);
      setPayloadPreview(JSON.stringify(payload, null, 2));

      pushLog("正在向 NovelAI 发送请求...");
      let streamEventIndex = 0;
      let latestFinalImage: string | null = null;
      const handleStreamEvent = (event: NovelAiStreamEvent) => {
        const image = extractImageFromEvent(event);
        if (image) {
          setLivePreview(image);
        }
        if (event.type === "final" && image) {
          latestFinalImage = image;
          setFinalImage(image);
        }
        pushLog(`事件 · ${describeEvent(event, streamEventIndex)}`);
        streamEventIndex += 1;
      };
      const result = await novelClient.request(payload, {
        onEvent: handleStreamEvent,
      });
      const finalResultImage = latestFinalImage ?? result.images[0] ?? null;
      if (finalResultImage) {
        setFinalImage(finalResultImage);
        setLivePreview(finalResultImage);
      }
      pushLog(`NovelAI 返回 ${result.images.length} 张图片`);

      if (!result.images.length) {
        pushLog("未解析出图片，请检查事件流");
      }

      const entry: NovelAiHistoryEntry = {
        id: crypto.randomUUID?.() ?? `${Date.now()}`,
        prompt,
        negativePrompt,
        images: finalResultImage ? [finalResultImage] : [],
        createdAt: new Date().toISOString(),
        payloadPreview: JSON.stringify(payload, null, 2),
      };

      setHistory((prev) => {
        const next = [entry, ...prev];
        return next.slice(0, 6);
      });

      toast({
        title: "NovelAI 生成完成",
        description: `共获得 ${result.images.length} 张图片`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成失败";
      setErrorMessage(message);
      pushLog(message);
      toast({
        title: "NovelAI 请求失败",
        description: message,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const previewImage = livePreview ?? finalImage;

  return (
    <Card className="space-y-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          NovelAI 图片生成器
        </CardTitle>
        <CardDescription>
          直接调用 NovelAI 官方流式接口，支持参考图、模型与采样器配置。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[0.95fr,1.15fr]">
          <div className="space-y-6">
            <section className="space-y-4 border border-border rounded-lg p-4">
              <h3 className="flex items-center gap-2 text-base font-medium">
                <Settings className="h-4 w-4 text-primary" />
                API 配置
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>API 地址</Label>
                  <Input
                    value={config.apiBaseUrl}
                    onChange={(e) =>
                      updateConfig({ apiBaseUrl: e.target.value })
                    }
                    placeholder="https://image.novelai.net"
                  />
                </div>
                <div className="space-y-1">
                  <Label>API Token</Label>
                  <Input
                    type="password"
                    value={config.apiToken}
                    onChange={(e) => updateConfig({ apiToken: e.target.value })}
                    placeholder="NovelAI Token"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>模型</Label>
                  <Select
                    value={config.model}
                    onValueChange={(value) => updateConfig({ model: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_OPTIONS.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>采样器</Label>
                  <Select
                    value={config.sampler}
                    onValueChange={(value) => updateConfig({ sampler: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="k_euler_ancestral" />
                    </SelectTrigger>
                    <SelectContent>
                      {SAMPLER_OPTIONS.map((sampler) => (
                        <SelectItem key={sampler} value={sampler}>
                          {sampler}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-3 border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-base font-medium">
                  <Image className="h-4 w-4 text-secondary" />
                  提示词
                </h3>
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? "生成中..." : "开始生成"}
                </Button>
              </div>
              <div className="space-y-2">
                <Label>主要描述</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="(masterpiece, best quality, ...)"
                />
              </div>
              <div className="space-y-2">
                <Label>负面提示</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                  rows={2}
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="nsfw, lowres, watermark..."
                />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Samples</Label>
                  <Input
                    type="number"
                    min={1}
                    max={4}
                    value={config.nSamples}
                    onChange={(e) =>
                      updateConfig({ nSamples: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Seed (可选)</Label>
                  <Input
                    value={seedText}
                    onChange={(e) => setSeedText(e.target.value)}
                    placeholder="随机留空"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Prompt Guidance (scale)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={config.scale}
                    onChange={(e) =>
                      updateConfig({ scale: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3 border border-border rounded-lg p-4">
              <h3 className="flex items-center gap-2 text-base font-medium">
                <Cpu className="h-4 w-4 text-secondary" />
                生成参数
              </h3>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>宽度</Label>
                  <Input
                    type="number"
                    value={config.width}
                    onChange={(e) =>
                      updateConfig({ width: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>高度</Label>
                  <Input
                    type="number"
                    value={config.height}
                    onChange={(e) =>
                      updateConfig({ height: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>步数</Label>
                  <Input
                    type="number"
                    value={config.steps}
                    onChange={(e) =>
                      updateConfig({ steps: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>UC 预设</Label>
                  <Input
                    type="number"
                    value={config.ucPreset}
                    onChange={(e) =>
                      updateConfig({ ucPreset: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Noise Schedule</Label>
                  <Input
                    value={config.noiseSchedule}
                    onChange={(e) =>
                      updateConfig({ noiseSchedule: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>CFG Rescale</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={config.cfgRescale}
                    onChange={(e) =>
                      updateConfig({ cfgRescale: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Params Version</Label>
                  <Input
                    type="number"
                    value={config.paramsVersion}
                    onChange={(e) =>
                      updateConfig({ paramsVersion: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Dynamic Thresholding</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.dynamicThresholding}
                      onChange={(e) =>
                        updateConfig({
                          dynamicThresholding: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border border-border"
                    />
                    <span className="text-xs text-muted-foreground">
                      {config.dynamicThresholding ? "开启" : "关闭"}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Auto SMEA</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.autoSmea}
                      onChange={(e) =>
                        updateConfig({ autoSmea: e.target.checked })
                      }
                      className="h-4 w-4 rounded border border-border"
                    />
                    <span className="text-xs text-muted-foreground">
                      {config.autoSmea ? "开启" : "关闭"}
                    </span>
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={config.qualityToggle}
                  onChange={(e) =>
                    updateConfig({ qualityToggle: e.target.checked })
                  }
                  className="h-4 w-4 rounded border border-border"
                />
                启用质量标签
              </label>
            </section>

            <section className="space-y-3 border border-border rounded-lg p-4">
              <h3 className="flex items-center gap-2 text-base font-medium">
                <Image className="h-4 w-4 text-secondary" />
                其他参数
              </h3>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Controlnet Strength</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={config.controlnetStrength}
                    onChange={(e) =>
                      updateConfig({
                        controlnetStrength: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Use Coords</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.useCoords}
                      onChange={(e) =>
                        updateConfig({ useCoords: e.target.checked })
                      }
                      className="h-4 w-4 rounded border border-border"
                    />
                    <span className="text-xs text-muted-foreground">
                      {config.useCoords ? "开启" : "关闭"}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Use Order</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.useOrder}
                      onChange={(e) =>
                        updateConfig({ useOrder: e.target.checked })
                      }
                      className="h-4 w-4 rounded border border-border"
                    />
                    <span className="text-xs text-muted-foreground">
                      {config.useOrder ? "启用" : "关闭"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Legacy</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.legacy}
                      onChange={(e) =>
                        updateConfig({ legacy: e.target.checked })
                      }
                      className="h-4 w-4 rounded border border-border"
                    />
                    <span className="text-xs text-muted-foreground">
                      {config.legacy ? "开启" : "关闭"}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Legacy UC</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.legacyUc}
                      onChange={(e) =>
                        updateConfig({ legacyUc: e.target.checked })
                      }
                      className="h-4 w-4 rounded border border-border"
                    />
                    <span className="text-xs text-muted-foreground">
                      {config.legacyUc ? "开启" : "关闭"}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Legacy V3 Extend</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.legacyV3Extend}
                      onChange={(e) =>
                        updateConfig({ legacyV3Extend: e.target.checked })
                      }
                      className="h-4 w-4 rounded border border-border"
                    />
                    <span className="text-xs text-muted-foreground">
                      {config.legacyV3Extend ? "开启" : "关闭"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Skip CFG Above Sigma</Label>
                  <Input
                    type="number"
                    value={config.skipCfgAboveSigma}
                    onChange={(e) =>
                      updateConfig({
                        skipCfgAboveSigma: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Normalize Ref Strength</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.normalizeReferenceStrengthMultiple}
                      onChange={(e) =>
                        updateConfig({
                          normalizeReferenceStrengthMultiple: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border border-border"
                    />
                    <span className="text-xs text-muted-foreground">
                      {config.normalizeReferenceStrengthMultiple
                        ? "启用"
                        : "禁用"}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Inpaint Img2Img</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={config.inpaintStrength}
                    onChange={(e) =>
                      updateConfig({
                        inpaintStrength: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Deliberate E.A. Bug</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.deliberateEulerAncestralBug}
                      onChange={(e) =>
                        updateConfig({
                          deliberateEulerAncestralBug: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border border-border"
                    />
                    <span className="text-xs text-muted-foreground">
                      {config.deliberateEulerAncestralBug ? "开启" : "关闭"}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Prefer Brownian</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.preferBrownian}
                      onChange={(e) =>
                        updateConfig({ preferBrownian: e.target.checked })
                      }
                      className="h-4 w-4 rounded border border-border"
                    />
                    <span className="text-xs text-muted-foreground">
                      {config.preferBrownian ? "启用" : "禁用"}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Use New Shared Trial</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.useNewSharedTrial}
                      onChange={(e) =>
                        updateConfig({ useNewSharedTrial: e.target.checked })
                      }
                      className="h-4 w-4 rounded border border-border"
                    />
                    <span className="text-xs text-muted-foreground">
                      {config.useNewSharedTrial ? "启用" : "禁用"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Recaptcha Token</Label>
                <Input
                  value={config.recaptchaToken}
                  onChange={(e) =>
                    updateConfig({ recaptchaToken: e.target.value })
                  }
                />
              </div>
            </section>

            <section className="space-y-3 border border-border rounded-lg p-4">
              <h3 className="flex items-center gap-2 text-base font-medium">
                <Image className="h-4 w-4 text-secondary" />
                Character Prompts
              </h3>
              <Label>每行一个角色提示（可留空）</Label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                rows={3}
                value={config.characterPrompts}
                onChange={(e) =>
                  updateConfig({ characterPrompts: e.target.value })
                }
                placeholder="角色提示，每行一个"
              />
            </section>

            <section className="space-y-3 border border-border rounded-lg p-4">
              <h3 className="flex items-center gap-2 text-base font-medium">
                <Image className="h-4 w-4 text-primary" />
                参考图片（可选）
              </h3>
              <div className="flex flex-wrap gap-3">
                <label className="cursor-pointer rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition hover:border-primary">
                  上传图片
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleReferenceUpload}
                  />
                </label>
                <Button variant="outline" size="sm" onClick={clearReference}>
                  清空
                </Button>
              </div>
              {referenceImage && (
                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {referenceFileName ?? "自定义参考图"}
                  </p>
                  <img
                    src={referenceImage}
                    alt="参考图"
                    className="max-h-48 w-full rounded-md object-contain"
                  />
                </div>
              )}
            </section>

            <section className="space-y-3 border border-border rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <p className="text-base font-medium">实时日志</p>
              </div>
              {errorMessage && (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2 text-xs text-muted-foreground">
                {analysisLog.map((log) => (
                  <p key={log}>{log}</p>
                ))}
              </div>
            </section>

            {payloadPreview && (
              <section className="space-y-2 border border-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <p className="text-base font-medium">调用参数</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyPayload}
                  >
                    <Clipboard className="h-4 w-4" />
                    复制 JSON
                  </Button>
                </div>
                <textarea
                  readOnly
                  className="w-full rounded-md border bg-muted/30 px-3 py-2 text-xs font-mono"
                  rows={8}
                  value={payloadPreview}
                />
              </section>
            )}
          </div>
          <div className="space-y-6">
            <section className="space-y-3 border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image className="h-4 w-4 text-primary" />
                  <p className="text-base font-medium">实时画面</p>
                </div>
                {finalImage && <Badge variant="outline">已完成</Badge>}
              </div>
              <div className="min-h-[320px] overflow-hidden rounded-md border border-border bg-muted/30">
                {previewImage ? (
                  <img
                    src={previewImage}
                    alt="NovelAI 画面"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-sm text-muted-foreground">
                    <p>流式帧将在此展示，请在左侧点击“开始生成”。</p>
                    <p>每一帧会替换上一帧，最终完成后只保留一张图。</p>
                  </div>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {generating
                  ? "生成中... 最新帧正在刷新"
                  : finalImage
                  ? "已完成，支持下载或继续微调"
                  : "点击开始生成以查看实时画面"}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!finalImage}
                  onClick={() =>
                    finalImage && handleUseHistoryAsReference(finalImage)
                  }
                >
                  设为参考
                </Button>
                {finalImage && (
                  <a
                    href={finalImage}
                    download="novelai.png"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-muted-foreground underline"
                  >
                    <Download className="h-3 w-3" />
                    下载
                  </a>
                )}
              </div>
            </section>

            <section className="space-y-3 border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image className="h-4 w-4 text-secondary" />
                  <p className="text-base font-medium">历史记录</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!history.length}
                  onClick={handleClearHistory}
                >
                  清空
                </Button>
              </div>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  暂无历史记录，生成一次即可自动保存。
                </p>
              ) : (
                <div className="space-y-3">
                  {history.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 rounded-lg border border-border p-3"
                    >
                      <div className="h-24 w-24 overflow-hidden rounded border border-border bg-muted/20">
                        {entry.images[0] ? (
                          <img
                            src={entry.images[0]}
                            alt="历史图"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                            无图
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-1 text-xs">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>
                            {new Date(entry.createdAt).toLocaleString("zh-CN")}
                          </span>
                          <Badge variant="outline">
                            共 {entry.images.length} 张
                          </Badge>
                        </div>
                        <p className="text-sm text-foreground break-words">
                          {entry.prompt}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReuseHistory(entry)}
                          >
                            载入提示词
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!entry.images[0]}
                            onClick={() =>
                              entry.images[0] &&
                              handleUseHistoryAsReference(entry.images[0])
                            }
                          >
                            用作参考
                          </Button>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteHistory(entry.id)}
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        请求均直接发送至 NovelAI，数据缓存在浏览器，可结合上方 JSON
        复刻官网设置。
      </CardFooter>
    </Card>
  );
}
