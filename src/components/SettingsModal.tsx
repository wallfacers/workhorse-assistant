import { useState } from 'react';
import type { ReactNode } from 'react';
import { Moon, Sun, X } from 'lucide-react';

type NavItem = '主题' | '快捷键';

interface SettingsModalProps {
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  onClose: () => void;
}

const SHORTCUTS: { key: string; desc: string }[] = [
  { key: '⌘ N',     desc: '新建任务' },
  { key: '⌘ K',     desc: '全局搜索' },
  { key: '⌘ ,',     desc: '打开设置' },
  { key: '⌘ W',     desc: '关闭面板' },
  { key: '⌘ \\',    desc: '切换侧栏' },
  { key: '⌘ T',     desc: '新建终端' },
  { key: '⌘ D',     desc: '分割终端' },
  { key: '⌘ Enter', desc: '发送消息' },
  { key: '⌘ /',     desc: '显示快捷键' },
  { key: 'Esc',     desc: '取消 / 关闭' },
];

export default function SettingsModal({ isDarkMode, setIsDarkMode, onClose }: SettingsModalProps) {
  const [activeNav, setActiveNav] = useState<NavItem>('主题');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[620px] h-[400px] bg-white dark:bg-surface-dark-elevated rounded-2xl border border-outline dark:border-neutral-800 shadow-[0_16px_48px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-outline/50 dark:border-neutral-800/60 flex-shrink-0">
          <span className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100">设置</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设置"
            className="p-1 rounded-md text-gray-400 dark:text-gray-500 hover:bg-gray-200/70 dark:hover:bg-neutral-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">

          {/* Left nav */}
          <div className="w-44 flex-shrink-0 border-r border-outline/40 dark:border-neutral-800/40 px-2 py-3 space-y-0.5">
            {(['主题', '快捷键'] as NavItem[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setActiveNav(item)}
                className={`w-full text-left px-3 py-2 rounded-xl text-[13px] transition-all duration-150 ${
                  activeNav === item
                    ? 'bg-gray-200/70 dark:bg-neutral-800/90 text-gray-900 dark:text-gray-100 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/40 dark:hover:bg-neutral-800/50'
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar px-6 py-4">
            {activeNav === '主题' && (
              <ThemeSection isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
            )}
            {activeNav === '快捷键' && <ShortcutsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeSection({
  isDarkMode,
  setIsDarkMode,
}: {
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
}) {
  return (
    <div>
      <p className="text-[11.5px] font-semibold text-gray-400 dark:text-gray-500 tracking-wider mb-4">外观</p>
      <div className="grid grid-cols-2 gap-3">
        <ThemeOption
          label="浅色"
          icon={<Sun className="w-5 h-5" />}
          active={!isDarkMode}
          onClick={() => setIsDarkMode(false)}
        />
        <ThemeOption
          label="深色"
          icon={<Moon className="w-5 h-5" />}
          active={isDarkMode}
          onClick={() => setIsDarkMode(true)}
        />
      </div>
    </div>
  );
}

function ThemeOption({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2.5 py-5 rounded-xl border-2 transition-all duration-150 ${
        active
          ? 'border-gray-800 dark:border-gray-200 bg-gray-50 dark:bg-neutral-800/80'
          : 'border-outline dark:border-neutral-700 hover:border-gray-400 dark:hover:border-neutral-500 hover:bg-gray-50/60 dark:hover:bg-neutral-800/30'
      }`}
    >
      <span className={active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>
        {icon}
      </span>
      <span className={`text-[12.5px] font-medium ${active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
        {label}
      </span>
    </button>
  );
}

function ShortcutsSection() {
  return (
    <div>
      <p className="text-[11.5px] font-semibold text-gray-400 dark:text-gray-500 tracking-wider mb-4">键盘快捷键</p>
      <div className="grid grid-cols-2 gap-x-8 gap-y-0">
        {SHORTCUTS.map(({ key, desc }) => (
          <div
            key={key}
            className="flex items-center justify-between py-2 border-b border-outline/30 dark:border-neutral-800/50"
          >
            <span className="text-[12.5px] text-gray-600 dark:text-gray-400">{desc}</span>
            <kbd className="px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-neutral-800 border border-outline/60 dark:border-neutral-700 text-[11px] font-mono text-gray-700 dark:text-gray-300 flex-shrink-0">
              {key}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
