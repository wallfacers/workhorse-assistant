import { MapPin, FolderOpen, PanelRightClose } from 'lucide-react';
import MonoPath from './MonoPath';

interface RightPanelProps {
  onClose: () => void;
}

export default function RightPanel({ onClose }: RightPanelProps) {
  return (
    <div className="w-[340px] md:w-[400px] lg:w-[460px] xl:w-[540px] 2xl:w-[600px] bg-white dark:bg-surface-dark-elevated flex flex-col h-full flex-shrink-0 rounded-2xl lg:rounded-lg border border-outline dark:border-neutral-800 overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.015)]">
      {/* Tabs Capsule + Collapse */}
      <div className="px-5 pt-4 mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Collapse work panel"
          title="收起工作台"
          className="flex-shrink-0 p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-200/70 dark:hover:bg-neutral-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
        <div className="flex-1 flex bg-outline/60 dark:bg-neutral-800/80 p-1 rounded-xl">
          <button className="flex-1 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            工作日志
          </button>
          <button className="flex-1 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            产出物
          </button>
          <button className="flex-1 py-1.5 text-xs font-semibold text-gray-950 dark:text-gray-100 bg-white dark:bg-neutral-700 shadow-sm rounded-lg transition-all duration-150" id="preview-tab">
            预览
          </button>
        </div>
      </div>

      {/* Content Space */}
      <div className="flex-1 overflow-y-auto px-5 pb-6 custom-scrollbar text-[13px]">
        
        {/* Main Document Preview Card */}
        <div className="bg-white dark:bg-surface-dark-elevated p-6 pb-8 rounded-xl border border-outline/50 dark:border-neutral-800/60 shadow-[0_2px_8px_rgba(0,0,0,0.015)] text-gray-800 dark:text-gray-200">
          <h1 className="text-lg font-bold mb-5 text-gray-950 dark:text-gray-50 leading-tight tracking-tight">GPT-4o 系统卡深度分析报告</h1>
          
          <div className="space-y-2 mb-6 text-gray-600 dark:text-gray-400 text-[12.5px] leading-relaxed">
            <p><span className="text-gray-400 dark:text-gray-400 font-medium">论文标题：</span><span className="text-gray-900 dark:text-gray-100 font-medium font-sans">GPT-4o System Card</span></p>
            <p><span className="text-gray-400 dark:text-gray-400 font-medium">作者：</span><span className="text-gray-900 dark:text-gray-100 font-medium font-sans">OpenAI (2024)</span></p>
            <p><span className="text-gray-400 dark:text-gray-400 font-medium">发布时间：</span><span className="text-gray-900 dark:text-gray-100 font-medium">August 8, 2024</span></p>
            <p><span className="text-gray-400 dark:text-gray-400 font-medium">arXiv ID：</span><span className="text-gray-900 dark:text-gray-100 font-medium font-mono">2410.21276</span></p>
            <p><span className="text-gray-400 dark:text-gray-400 font-medium">分类：</span><span className="text-gray-900 dark:text-gray-100 font-medium">cs.CL, cs.AI, cs.CV, cs.SD</span></p>
            <p className="mt-3.5 leading-relaxed bg-surface-muted dark:bg-neutral-800/40 p-3 rounded-xl border border-gray-100 dark:border-neutral-800">
              <strong className="text-gray-800 dark:text-gray-200 block mb-1 text-[12px]">信息范围：</strong>
              基于完整 LaTeX 源文档分析，包含正文、表格、图表、参考文献、附录等完整内容
            </p>
          </div>

          <h2 className="text-[14.5px] font-bold mb-3.5 text-gray-955 dark:text-gray-100 mt-6 border-t border-gray-100 dark:border-neutral-800/60 pt-4 flex items-center gap-1.5">(1) 定位与获取论文</h2>
          
          <h3 className="font-semibold text-gray-900 dark:text-gray-200 mb-2.5 text-[13px]">元信息概览</h3>
          <ul className="list-disc pl-5 space-y-1.5 text-gray-650 dark:text-gray-400 text-[12.5px] mb-5">
            <li><strong className="text-gray-800 dark:text-gray-300">标题：</strong> GPT-4o System Card</li>
            <li><strong className="text-gray-800 dark:text-gray-300">作者：</strong> OpenAI 团队（超过 500 名贡献者）</li>
            <li><strong className="text-gray-800 dark:text-gray-300">所属机构：</strong> OpenAI</li>
            <li><strong className="text-gray-800 dark:text-gray-300">发布时间：</strong> 2024年8月8日</li>
            <li><strong className="text-gray-800 dark:text-gray-300">arXiv分类：</strong> cs.CL, cs.AI, cs.CV, cs.SD</li>
            <li><strong className="text-gray-800 dark:text-gray-300">论文类型：</strong> 系统卡 (System Card) - 技术报告与安全评估文档</li>
          </ul>

          <h3 className="font-semibold text-gray-900 dark:text-gray-200 mb-2 text-[13px]">内容范围</h3>
          <p className="text-gray-400 dark:text-gray-500 italic">精简展现...</p>
        </div>

        {/* File Metainfo Area (Bottom Card) */}
        <div className="mt-5 px-3">
          <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1.5 leading-snug">GPT-4o_System_Card_深度分析报告.md</h4>
          <p className="text-[11.5px] text-gray-400 dark:text-gray-500 mb-4 flex items-center font-medium">
            Markdown 文档 <span className="mx-2 text-gray-300">•</span> 15.65 KB
          </p>
          
          <div className="text-[11.5px] text-gray-500 dark:text-gray-400 space-y-3.5 bg-white/40 dark:bg-neutral-800/20 p-4.5 rounded-md border border-outline/40 dark:border-neutral-800/30">
            <div className="flex items-start min-w-0">
              <span className="w-16 flex-shrink-0 text-gray-400 dark:text-gray-500 font-medium">文件位置</span>
              <MonoPath
                variant="block"
                path={"C:\\Users\\wushengzhou\\AppData\\Roaming\\Tencent\\Workhorse\\User\\oAN1i2Xjx2OqOALIffZXwsVCmTrU\\workspace\\conv_19e4f089559_ab4750c195e\\output"}
                className="flex-1 min-w-0 text-gray-700 dark:text-gray-300 text-[11px]"
              />
            </div>
            <div className="flex items-center">
              <span className="w-16 flex-shrink-0 text-gray-400 dark:text-gray-500 font-medium">修改时间</span>
              <p className="text-gray-700 dark:text-gray-300 font-medium">2026/05/22 17:49</p>
            </div>
          </div>
        </div>
        
        {/* Actions Buttons */}
        <div className="mt-6 flex items-center justify-center space-x-3.5 px-2">
          <button className="flex-1 flex items-center justify-center space-x-2 px-5 py-2.5 bg-white dark:bg-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-700 border border-outline dark:border-neutral-700 rounded-[14px] text-[12.5px] font-semibold text-gray-700 dark:text-gray-200 transition-colors shadow-sm cursor-pointer">
            <FolderOpen className="w-4 h-4" />
            <span>打开</span>
          </button>
          <button className="flex-1 flex items-center justify-center space-x-2 px-5 py-2.5 bg-white dark:bg-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-700 border border-outline dark:border-neutral-700 rounded-[14px] text-[12.5px] font-semibold text-gray-700 dark:text-gray-200 transition-colors shadow-sm cursor-pointer">
            <MapPin className="w-4 h-4" />
            <span>所在位置</span>
          </button>
        </div>
      </div>
    </div>
  );
}
