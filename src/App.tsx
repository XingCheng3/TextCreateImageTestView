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
      <header className="border-b bg-card/90 backdrop-blur">
        <div className="w-full px-4 py-5 lg:px-8">
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight lg:text-3xl">
            AI Art Studio
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            纯前端 OpenAI 兼容画图 + NovelAI 流式生成，所有配置/历史缓存于浏览器。
          </p>
        </div>
      </header>

      <main className="w-full px-4 py-5 lg:px-8 lg:py-6">
        <Tabs defaultValue="ai-art" className="w-full space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2 gap-3">
            <TabsTrigger value="ai-art" className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              文本画图
            </TabsTrigger>
            <TabsTrigger value="novel-ai" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              NovelAI
            </TabsTrigger>
          </TabsList>
          <TabsContent value="ai-art" className="mt-0">
            <AiArtStudio />
          </TabsContent>
          <TabsContent value="novel-ai" className="mt-0">
            <NovelAiStudio />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t">
        <div className="w-full px-4 py-4 text-center text-sm text-muted-foreground lg:px-8">
          <p>纯前端 AI 画图体验 | OpenAI 兼容 + NovelAI 流式生成 ✨</p>
        </div>
      </footer>

      <Toaster />
    </div>
  );
}

export default App;
