# AI Art Studio

这是一个纯前端的文本画图演示，整合 OpenAI 兼容接口与 NovelAI 官方流式服务，将提示词、参考图、自定义参数串成闭环画图体验。

## 快速启动

```bash
npm install
npm run dev
```

打开 http://localhost:5173/ 直接进入 “文本画图” 与 “NovelAI” 两大模块，所有配置信息/历史纪录都缓存于浏览器。

## 核心功能

### 文本画图（OpenAI 兼容）

- 通过 `GET /v1/models` 读取模型列表，支持用户手动选择 LLM（用于提示词优化）与图像模型。
- 支持将描述文本、附加提示、负面词以及可选参考图按 OpenAI 多模态格式打包到 `/v1/chat/completions`。
- 按输出张数逐次调用 `/v1/images/generations` 或 `/v1/images/edits`（带参考图/遮罩），将结果累积至历史记录。

### NovelAI 画图

- 调用 `https://image.novelai.net/ai/generate-image-stream`，可设置模型、采样器、步数、Seed、CFG、尺寸、参考图、质量等参数。
- 自动解析 msgpack 流、提取 Base64 图片并展示，用户可以复制 JSON 请求体便于复刻官网行为。
- 生成记录保存在本地，支持再加载提示词或将该图作为下一次微调的参考。

### 说明

- 所有 API 地址、Key、模型、尺寸、数量等配置保存在 `LocalStorage`，页面刷新后仍可恢复上次环境。
- 仅剩上述两个模块，所有旧的 TestTable / User 管理、后端演示代码已经被移除，项目现在只专注于 AI 画图与提示词优化。
