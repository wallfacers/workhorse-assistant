import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, FolderOpen, PanelRightClose, Tag, GitBranch, Hash, Calendar } from 'lucide-react';
import MonoPath from './MonoPath';
import FileTree from './FileTree';
import { MOCK_TASK_DETAILS, MOCK_FILE_TREE } from './right-panel.mock';

type Tab = 'directory' | 'info' | 'preview';

interface RightPanelProps {
  onClose: () => void;
}

export default function RightPanel({ onClose }: RightPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('directory');
  const details = MOCK_TASK_DETAILS;
  const tabs: { key: Tab; label: string }[] = [
    { key: 'directory', label: t('workspace.tabs.directory') },
    { key: 'info', label: t('workspace.tabs.info') },
    { key: 'preview', label: t('workspace.tabs.preview') },
  ];

  return (
    <div className="w-[340px] md:w-[400px] lg:w-[460px] xl:w-[540px] 2xl:w-[600px] bg-surface dark:bg-surface-dark-elevated flex flex-col h-full flex-shrink-0 rounded-lg lg:rounded-lg border border-outline dark:border-outline-dark overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.015)]">
      {/* Tab bar — no separate header above this */}
      <div className="px-3 pt-2.5 pb-2 flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Collapse work panel"
          title={t('workspace.collapsePanel')}
          className="flex-shrink-0 p-1.5 rounded-sm text-on-surface-muted dark:text-on-canvas-dark-muted hover:bg-canvas/70 dark:hover:bg-surface-dark-muted hover:text-on-surface dark:hover:text-on-canvas-dark transition-colors"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
        <div className="flex-1 flex bg-outline/60 dark:bg-surface-dark-muted/80 p-1 rounded-lg">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all duration-150 ${
                activeTab === tab.key
                  ? 'bg-surface dark:bg-surface-dark-elevated text-on-surface dark:text-on-canvas-dark shadow-sm'
                  : 'text-on-surface-muted dark:text-on-canvas-dark-muted hover:text-on-surface dark:hover:text-on-canvas-dark'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content — full remaining height */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar text-[13px]">
        {activeTab === 'directory' && (
          <div className="px-4 py-3">
            <FileTree nodes={MOCK_FILE_TREE} />
          </div>
        )}

        {activeTab === 'info' && (
          <div className="px-4 py-3">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Hash className="w-3.5 h-3.5 mt-0.5 text-on-surface-muted dark:text-on-canvas-dark-muted flex-shrink-0" />
                <div>
                  <span className="text-[11px] text-on-surface-muted dark:text-on-canvas-dark-muted">{t('workspace.fields.accessId')}</span>
                  <p className="text-[12.5px] text-on-surface dark:text-on-canvas-dark font-medium">{details.accessId}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Tag className="w-3.5 h-3.5 mt-0.5 text-on-surface-muted dark:text-on-canvas-dark-muted flex-shrink-0" />
                <div>
                  <span className="text-[11px] text-on-surface-muted dark:text-on-canvas-dark-muted">{t('workspace.fields.tags')}</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {details.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-block px-1.5 py-0.5 rounded-md bg-surface-muted dark:bg-surface-dark text-[11px] text-on-surface-muted dark:text-on-canvas-dark-muted border border-outline/40 dark:border-outline-dark/50"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="w-3.5 h-3.5 mt-0.5 text-on-surface-muted dark:text-on-canvas-dark-muted flex-shrink-0" />
                <div>
                  <span className="text-[11px] text-on-surface-muted dark:text-on-canvas-dark-muted">{t('workspace.fields.createdAt')}</span>
                  <p className="text-[12.5px] text-on-surface dark:text-on-canvas-dark">{details.created}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <GitBranch className="w-3.5 h-3.5 mt-0.5 text-on-surface-muted dark:text-on-canvas-dark-muted flex-shrink-0" />
                <div>
                  <span className="text-[11px] text-on-surface-muted dark:text-on-canvas-dark-muted">{t('workspace.fields.branch')}</span>
                  <p className="text-[12.5px] text-on-surface dark:text-on-canvas-dark font-mono">{details.branch}</p>
                </div>
              </div>
              <div className="mt-1">
                <span className="text-[11px] text-on-surface-muted dark:text-on-canvas-dark-muted">{t('workspace.fields.originalCommand')}</span>
                <p className="mt-0.5 text-[12px] text-on-surface dark:text-on-canvas-dark-muted bg-surface-muted dark:bg-surface-dark p-2 rounded-lg border border-outline/40 dark:border-outline-dark/50 leading-relaxed">
                  {details.originalPrompt}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="px-4 py-3">
            <div className="bg-surface dark:bg-surface-dark-elevated p-4 pb-5 rounded-lg border border-outline/50 dark:border-outline-dark/60 shadow-[0_2px_8px_rgba(0,0,0,0.015)] text-on-surface dark:text-on-canvas-dark">
              <h4 className="text-[14px] font-bold mb-3 text-on-surface dark:text-on-canvas-dark leading-tight">
                GPT-4o 系统卡深度分析报告
              </h4>
              <div className="space-y-1.5 mb-4 text-on-surface-muted dark:text-on-canvas-dark-muted text-[12px] leading-relaxed">
                <p>
                  <span className="text-on-surface-muted dark:text-on-canvas-dark-muted font-medium">论文标题：</span>
                  <span className="text-on-surface dark:text-on-canvas-dark font-medium">GPT-4o System Card</span>
                </p>
                <p>
                  <span className="text-on-surface-muted dark:text-on-canvas-dark-muted font-medium">作者：</span>
                  <span className="text-on-surface dark:text-on-canvas-dark font-medium">OpenAI (2024)</span>
                </p>
              </div>

              <div className="text-[11.5px] text-on-surface-muted dark:text-on-canvas-dark-muted space-y-2 bg-surface-muted dark:bg-surface-dark/60 p-3 rounded-lg border border-outline/40 dark:border-outline-dark/30">
                <h5 className="font-bold text-on-surface dark:text-on-canvas-dark leading-snug">
                  GPT-4o_System_Card_深度分析报告.md
                </h5>
                <p className="text-[11px] text-on-surface-muted dark:text-on-canvas-dark-muted mb-2 flex items-center font-medium">
                  Markdown 文档 <span className="mx-2 text-on-surface-muted">•</span> 15.65 KB
                </p>
                <div className="flex items-start min-w-0">
                  <span className="w-14 flex-shrink-0 text-on-surface-muted dark:text-on-canvas-dark-muted font-medium">文件位置</span>
                  <MonoPath
                    variant="block"
                    path="C:\\Users\\wushengzhou\\AppData\\Roaming\\Tencent\\Workhorse\\workspace\\output"
                    className="flex-1 min-w-0 text-on-surface dark:text-on-canvas-dark-muted text-[11px]"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-center space-x-3">
                <button
                  disabled
                  className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-surface dark:bg-surface-dark-muted border border-outline dark:border-outline-dark rounded-md text-[12px] font-semibold text-on-surface-muted dark:text-on-canvas-dark-muted cursor-not-allowed opacity-60"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>{t('workspace.actions.open')}</span>
                </button>
                <button
                  disabled
                  className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-surface dark:bg-surface-dark-muted border border-outline dark:border-outline-dark rounded-md text-[12px] font-semibold text-on-surface-muted dark:text-on-canvas-dark-muted cursor-not-allowed opacity-60"
                >
                  <MapPin className="w-4 h-4" />
                  <span>{t('workspace.actions.revealInFolder')}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
