import { useState } from 'react';
import { MapPin, FolderOpen, PanelRightClose, Tag, GitBranch, Hash, Calendar } from 'lucide-react';
import MonoPath from './MonoPath';
import FileTree from './FileTree';
import { MOCK_TASK_DETAILS, MOCK_FILE_TREE } from './right-panel.mock';

type Tab = '目录' | '信息' | '预览';

interface RightPanelProps {
  onClose: () => void;
}

export default function RightPanel({ onClose }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('目录');
  const details = MOCK_TASK_DETAILS;
  const tabs: Tab[] = ['目录', '信息', '预览'];

  return (
    <div className="w-[340px] md:w-[400px] lg:w-[460px] xl:w-[540px] 2xl:w-[600px] bg-white dark:bg-surface-dark-elevated flex flex-col h-full flex-shrink-0 rounded-2xl lg:rounded-lg border border-outline dark:border-neutral-800 overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.015)]">
      {/* Tab bar — no separate header above this */}
      <div className="px-3 pt-2.5 pb-2 flex items-center gap-2 flex-shrink-0">
        <div className="flex-1 flex bg-outline/60 dark:bg-neutral-800/80 p-1 rounded-xl">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 ${
                activeTab === tab
                  ? 'bg-white dark:bg-neutral-700 text-gray-950 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Collapse work panel"
          title="收起工作台"
          className="flex-shrink-0 p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-200/70 dark:hover:bg-neutral-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>

      {/* Tab content — full remaining height */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar text-[13px]">
        {activeTab === '目录' && (
          <div className="px-4 py-3">
            <FileTree nodes={MOCK_FILE_TREE} />
          </div>
        )}

        {activeTab === '信息' && (
          <div className="px-4 py-3">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Hash className="w-3.5 h-3.5 mt-0.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <div>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">访问 ID</span>
                  <p className="text-[12.5px] text-gray-800 dark:text-gray-200 font-medium">{details.accessId}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Tag className="w-3.5 h-3.5 mt-0.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <div>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">标签</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {details.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-block px-1.5 py-0.5 rounded-md bg-surface-muted dark:bg-surface-dark text-[11px] text-gray-600 dark:text-gray-400 border border-outline/40 dark:border-neutral-800/50"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="w-3.5 h-3.5 mt-0.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <div>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">创建时间</span>
                  <p className="text-[12.5px] text-gray-800 dark:text-gray-200">{details.created}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <GitBranch className="w-3.5 h-3.5 mt-0.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <div>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">分支</span>
                  <p className="text-[12.5px] text-gray-800 dark:text-gray-200 font-mono">{details.branch}</p>
                </div>
              </div>
              <div className="mt-1">
                <span className="text-[11px] text-gray-400 dark:text-gray-500">原始指令</span>
                <p className="mt-0.5 text-[12px] text-gray-700 dark:text-gray-300 bg-surface-muted dark:bg-surface-dark p-2 rounded-lg border border-outline/40 dark:border-neutral-800/50 leading-relaxed">
                  {details.originalPrompt}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === '预览' && (
          <div className="px-4 py-3">
            <div className="bg-white dark:bg-surface-dark-elevated p-4 pb-5 rounded-xl border border-outline/50 dark:border-neutral-800/60 shadow-[0_2px_8px_rgba(0,0,0,0.015)] text-gray-800 dark:text-gray-200">
              <h4 className="text-[14px] font-bold mb-3 text-gray-950 dark:text-gray-50 leading-tight">
                GPT-4o 系统卡深度分析报告
              </h4>
              <div className="space-y-1.5 mb-4 text-gray-600 dark:text-gray-400 text-[12px] leading-relaxed">
                <p>
                  <span className="text-gray-400 dark:text-gray-500 font-medium">论文标题：</span>
                  <span className="text-gray-900 dark:text-gray-100 font-medium">GPT-4o System Card</span>
                </p>
                <p>
                  <span className="text-gray-400 dark:text-gray-500 font-medium">作者：</span>
                  <span className="text-gray-900 dark:text-gray-100 font-medium">OpenAI (2024)</span>
                </p>
              </div>

              <div className="text-[11.5px] text-gray-500 dark:text-gray-400 space-y-2 bg-surface-muted dark:bg-surface-dark/60 p-3 rounded-lg border border-outline/40 dark:border-neutral-800/30">
                <h5 className="font-bold text-gray-900 dark:text-gray-100 leading-snug">
                  GPT-4o_System_Card_深度分析报告.md
                </h5>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2 flex items-center font-medium">
                  Markdown 文档 <span className="mx-2 text-gray-300">•</span> 15.65 KB
                </p>
                <div className="flex items-start min-w-0">
                  <span className="w-14 flex-shrink-0 text-gray-400 dark:text-gray-500 font-medium">文件位置</span>
                  <MonoPath
                    variant="block"
                    path="C:\\Users\\wushengzhou\\AppData\\Roaming\\Tencent\\Workhorse\\workspace\\output"
                    className="flex-1 min-w-0 text-gray-700 dark:text-gray-300 text-[11px]"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-center space-x-3">
                <button
                  disabled
                  className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-white dark:bg-neutral-800 border border-outline dark:border-neutral-700 rounded-xl text-[12px] font-semibold text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-60"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>打开</span>
                </button>
                <button
                  disabled
                  className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-white dark:bg-neutral-800 border border-outline dark:border-neutral-700 rounded-xl text-[12px] font-semibold text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-60"
                >
                  <MapPin className="w-4 h-4" />
                  <span>所在位置</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
