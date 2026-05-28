import {
  FileText,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Plus,
  ArrowUp,
} from 'lucide-react';
import MonoPath from './MonoPath';

export default function MainChat() {
  return (
    <div className="flex-1 min-w-0 flex flex-col bg-surface-muted dark:bg-surface-dark h-full relative overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 flex-shrink-0 flex items-center justify-center">
        <h2 className="text-[15px] font-semibold text-gray-950 dark:text-gray-100 flex items-center gap-1">
          与Workhorse的对话
        </h2>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 custom-scrollbar">
        
        {/* Conversation */}
        <div className="flex flex-col mx-auto w-full px-4 sm:px-6 max-w-full md:max-w-[720px] lg:max-w-[820px] xl:max-w-[940px] 2xl:max-w-[1040px]">

          {/* User Message */}
          <div className="flex justify-end mb-8">
            <div className="max-w-[80%] bg-pink-50 dark:bg-pink-950/40 rounded-xl px-5 py-3 text-pink-900 dark:text-pink-200 text-[13.5px] leading-relaxed shadow-sm">
              请帮我深度分析一下这份 GPT-4o System Card，整理出核心发现、关键数据和可借鉴的内容，保存为 Markdown 报告。
            </div>
          </div>

          {/* Assistant Message (Logo + Bubble + Actions) */}
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 flex-shrink-0 rounded-xl bg-gradient-to-br from-primary via-secondary to-tertiary text-white font-bold text-[13px] flex items-center justify-center shadow-sm">
              M
            </div>
            <div className="flex-1 min-w-0">
              <div className="bg-white dark:bg-surface-dark-elevated rounded-xl p-7 text-gray-800 dark:text-gray-200 text-[13.5px] leading-relaxed border border-outline/50 dark:border-neutral-800/60 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <p className="mb-4 text-gray-700 dark:text-gray-300">
              我已经对提交的文件进行了系统性分析，并生成了<span className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 font-medium px-2 py-0.5 rounded-lg underline decoration-2 decoration-blue-500/30 underline-offset-2">详细</span> 的评估报告。
            </p>
            
            <h3 className="font-bold text-gray-900 dark:text-gray-50 mb-2.5 text-[14px]">核心发现：</h3>
            <ol className="list-decimal pl-5 mb-5 space-y-1.5 text-gray-700 dark:text-gray-300">
              <li><span className="font-semibold text-gray-900 dark:text-gray-100">论文性质：</span>这是 OpenAI 发布的 GPT-4o 系统卡，属于技术报告与安全评估文档</li>
              <li><span className="font-semibold text-gray-900 dark:text-gray-100">核心贡献：</span>建立了首个全模态模型的安全评估框架，特别关注语音到语音能力引入的新风险</li>
              <li><span className="font-semibold text-gray-900 dark:text-gray-100">评估结论：</span><span className="text-red-500 dark:text-red-400 font-bold bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-lg">强烈推荐精读</span> - 为多模态 AI 安全设定了行业标准</li>
            </ol>

            <h3 className="font-bold text-gray-900 dark:text-gray-50 mb-2.5 text-[14px]">报告亮点：</h3>
            <ul className="list-disc pl-5 mb-5 space-y-1.5 text-gray-700 dark:text-gray-300">
              <li><span className="font-semibold text-gray-900 dark:text-gray-100">六维度结构化分析：</span>研究问题、方法论、实验设计、核心结论、创新点、局限性</li>
              <li><span className="font-semibold text-gray-900 dark:text-gray-100">数据驱动：</span>包含 30+ 个关键数据点（安全性能提升、能力评估、风险等级）</li>
              <li><span className="font-semibold text-gray-900 dark:text-gray-100">实用指导：</span>识别了 5 条可借鉴的具体内容 and 3 个可延展的研究方向</li>
              <li><span className="font-semibold text-gray-900 dark:text-gray-100">专业排版：</span>使用 Markdown 表格清晰展示对比数据和评估框架</li>
            </ul>

            <h3 className="font-bold text-gray-900 dark:text-gray-50 mb-2.5 text-[14px]">关键结论：</h3>
            <ul className="list-disc pl-5 mb-6 space-y-1.5 text-gray-700 dark:text-gray-300">
              <li>GPT-4o 在说话人识别安全行为上提升 <span className="font-medium text-gray-900 dark:text-white">15 点 (0.83→0.98)</span></li>
              <li>医疗评估 MedQA USMLE 从 <span className="font-medium text-gray-900 dark:text-white">78.2% 提升到 89.4%</span></li>
              <li>少数语言性能提升 <span className="font-medium text-gray-900 dark:text-white">10 倍以上</span> (如 Hausa 从 6.1% 到 71.4%)</li>
              <li>Preparedness Framework：说服力为中等风险，其他三类为低风险</li>
            </ul>

            {/* Attachment Card */}
            <div className="flex items-center gap-3 border border-outline dark:border-neutral-700 bg-white dark:bg-surface-dark rounded-md p-4.5 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all hover:bg-gray-50/50 dark:hover:bg-neutral-800/30">
              <div className="flex-shrink-0 p-2.5 bg-surface-muted dark:bg-neutral-800 rounded-xl border border-gray-200/60 dark:border-neutral-700">
                <FileText className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </div>
              <div className="flex-1 min-w-0 text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">
                GPT-4o_System_Card_深度分析报告.md
              </div>
              <MonoPath
                path="C:\\Users\\wushengzhou\\...\\conv_19e4f0..."
                className="hidden md:block min-w-0 max-w-[220px] text-[11px] text-gray-400 dark:text-gray-500"
              />
              <span className="flex-shrink-0 text-[11px] text-gray-400 dark:text-gray-500 font-medium bg-gray-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">16KB</span>
            </div>

            <p className="text-[13px] text-gray-600 dark:text-gray-400 mt-4 leading-relaxed">
              报告已生成并保存为 Markdown 文件，包含完整的学术分析框架和具体数据引用，可直接用于学术研究或技术参考。
            </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-3 text-gray-400 dark:text-gray-500 mt-3.5 ml-3">
                <button className="p-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="复制内容"><Copy className="w-3.5 h-3.5" /></button>
                <button className="p-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="觉得好用"><ThumbsUp className="w-3.5 h-3.5" /></button>
                <button className="p-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="觉得不好"><ThumbsDown className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Input Area */}
      <div className="px-4 sm:px-6 pt-0 pb-2 sm:pb-3 flex-shrink-0 mx-auto w-full max-w-full md:max-w-[720px] lg:max-w-[820px] xl:max-w-[940px] 2xl:max-w-[1040px]">
        <div className="bg-white dark:bg-surface-dark-elevated border border-outline dark:border-neutral-800 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-none rounded-xl p-4 pb-2.5 flex flex-col transition-all focus-within:ring-1 focus-within:ring-gray-300 dark:focus-within:ring-neutral-700">
          <textarea
            placeholder="请输入任务，交给我来帮你完成"
            className="w-full resize-none h-24 bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-[13px] leading-relaxed"
          ></textarea>
          
          <div className="flex items-center justify-between mt-2">
            <button className="flex items-center space-x-1.5 px-4 py-1.5 rounded-full border border-outline dark:border-neutral-700 bg-surface-muted dark:bg-neutral-800/80 hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-600 dark:text-gray-300 text-xs font-semibold transition-colors">
              <Plus className="w-3.5 h-3.5" />
              <span>选择文件</span>
            </button>
            
            <button className="p-2 mr-0.5 rounded-full bg-neutral-200/90 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-gray-600 dark:text-gray-200 transition-colors self-end flex items-center justify-center">
              <ArrowUp className="w-4 h-4 font-bold" />
            </button>
          </div>
        </div>
        <div className="text-center mt-2 text-[10.5px] text-gray-400 dark:text-gray-500 tracking-wider">
           以上内容由 AI 生成
        </div>
      </div>
    </div>
  );
}
