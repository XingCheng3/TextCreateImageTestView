/**
 * 主应用组件 - 使用 shadcn/ui
 */
import { AiArtStudio } from "@/components/AiArtStudio";
import { NovelAiStudio } from "@/components/NovelAiStudio";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/toaster";
import { Image, Zap } from "lucide-react";

function App() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            AI Art Studio
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            纯前端 OpenAI 兼容画图 + NovelAI 流式生成，所有配置/历史缓存于浏览器。
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="ai-art" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 gap-3 mb-8">
            <TabsTrigger value="ai-art" className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              文本画图
            </TabsTrigger>
            <TabsTrigger value="novel-ai" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              NovelAI
            </TabsTrigger>
          </TabsList>
          <TabsContent value="ai-art">
            <AiArtStudio />
          </TabsContent>
          <TabsContent value="novel-ai">
            <NovelAiStudio />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t mt-16">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          <p>纯前端 AI 画图体验 | OpenAI 兼容 + NovelAI 流式生成 ✨</p>
        </div>
      </footer>

      <Toaster />
    </div>
  );
}

export default App;
