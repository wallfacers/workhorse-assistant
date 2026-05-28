import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Search, PlusSquare, Clock, Wrench,
  LayoutGrid, FileText, Image as ImageIcon, Monitor,
  ChevronDown, ChevronRight, Briefcase, Moon, Sun, Bell
} from 'lucide-react';

export default function Sidebar({ isDarkMode, setIsDarkMode }: { isDarkMode: boolean, setIsDarkMode: (dark: boolean) => void }) {
  const [docExpanded, setDocExpanded] = useState(true);
  const [imgExpanded, setImgExpanded] = useState(true);
  const [pcExpanded, setPcExpanded] = useState(false);

  return (
    <div className="w-64 bg-white dark:bg-surface-dark-elevated flex flex-col rounded-lg border border-outline dark:border-neutral-800/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] h-full text-[13px] flex-shrink-0 overflow-hidden">
      {/* Brand */}
      <div className="p-6 pb-2 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-normal text-gray-950 dark:text-gray-50 flex items-center gap-1.5 font-sans">
          Workhorse
        </h1>
        <button
          type="button"
          aria-label="Notifications"
          title="Notifications"
          className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-200/70 dark:hover:bg-neutral-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <Bell className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2">
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input 
            type="text" 
            placeholder="搜索" 
            className="w-full pl-9 pr-3 py-1.5 bg-surface-muted dark:bg-surface-dark border border-outline dark:border-neutral-800 rounded-xl outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-neutral-700 transition-shadow dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 text-[13px]"
          />
        </div>
      </div>

      {/* Main Nav */}
      <div className="px-2.5 space-y-0.5 mt-2">
        <NavItem icon={<PlusSquare className="w-4 h-4" />} label="新建对话" active />
        <NavItem icon={<Clock className="w-4 h-4" />} label="自动任务" />
        <NavItem icon={<Wrench className="w-4 h-4" />} label="技能广场" />
      </div>

      <div className="flex-1 overflow-y-auto mt-5 px-2.5 custom-scrollbar">
        {/* Knowledge Base */}
        <div className="mb-4">
          <div className="px-3 pb-1 text-xs font-normal text-gray-400 dark:text-gray-500 tracking-wider">本地知识库</div>
          <NavItem icon={<LayoutGrid className="w-4 h-4" />} label="应用" />
          
          <CollapsibleNavItem 
            icon={<FileText className="w-4 h-4" />} 
            label="文档" 
            expanded={docExpanded} 
            onClick={() => setDocExpanded(!docExpanded)}
          >
            <SubNavItem label="文档识别" active />
          </CollapsibleNavItem>

          <CollapsibleNavItem 
            icon={<ImageIcon className="w-4 h-4" />} 
            label="图库" 
            expanded={imgExpanded} 
            onClick={() => setImgExpanded(!imgExpanded)}
          >
            <SubNavItem label="图片识别" />
            <SubNavItem label="人物印象" />
            <SubNavItem label="足迹地点" />
            <SubNavItem label="时光长廊" />
          </CollapsibleNavItem>

          <CollapsibleNavItem 
            icon={<Monitor className="w-4 h-4" />} 
            label="此电脑" 
            expanded={pcExpanded} 
            onClick={() => setPcExpanded(!pcExpanded)}
          />
        </div>

        {/* Dialogues */}
        <div>
          <div className="px-3 pb-1 text-xs font-normal text-gray-400 dark:text-gray-500 tracking-wider">对话</div>
          <NavItem icon={<Briefcase className="w-4 h-4" />} label="办公室" />
          <div className="px-2 mt-1">
            <div className="bg-gray-200/50 dark:bg-neutral-800/60 text-gray-600 dark:text-gray-400 rounded-xl px-3 py-1.5 text-xs truncate max-w-full">
              请使用 `read-arxiv-pa...`
            </div>
            <div className="bg-gray-200/50 dark:bg-neutral-800/60 text-gray-600 dark:text-gray-400 rounded-xl px-3 py-1.5 text-xs truncate max-w-full mt-1.5">
              请使用 `chart-visualiz...`
            </div>
          </div>
        </div>
      </div>

      {/* Footer Profile & Dark Mode */}
      <div className="p-4 border-t border-gray-100 dark:border-neutral-800/65 flex items-center justify-between bg-gray-50/70 dark:bg-neutral-800/20">
        <div className="flex items-center space-x-2.5">
          {/* Avatar built identical to profile image */}
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 via-pink-500 to-indigo-500 flex-shrink-0 border border-white/20 shadow-inner flex items-center justify-center text-[10px] text-white font-bold">
            W
          </div>
          <div className="flex items-center max-w-[140px]">
            <span className="font-semibold text-gray-800 dark:text-gray-200 truncate">wallfacers</span>
          </div>
        </div>
        
        <button 
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="p-1.5 rounded-xl hover:bg-gray-200/80 dark:hover:bg-neutral-800 text-gray-500 dark:text-gray-400 transition-colors"
          title="Toggle Dark Mode"
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: ReactNode, label: string, active?: boolean }) {
  return (
    <button className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl transition-all duration-150 ${
      active 
        ? 'bg-gray-200/70 dark:bg-neutral-800/90 text-gray-900 dark:text-gray-100 font-medium' 
        : 'hover:bg-gray-200/40 dark:hover:bg-neutral-800/50 text-gray-700 dark:text-gray-400'
    }`}>
      <span className={active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>{icon}</span>
      <span className="truncate text-[13px]">{label}</span>
      {active && <div className="ml-auto w-1 h-3 bg-gray-400 dark:bg-gray-600 rounded-full" />}
    </button>
  );
}

function CollapsibleNavItem({ 
  icon, label, expanded, onClick, children 
}: { 
  icon: ReactNode, label: string, expanded: boolean, onClick: () => void, children?: ReactNode 
}) {
  return (
    <div>
      <button 
        onClick={onClick}
        className="w-full flex items-center px-3 py-2 rounded-xl hover:bg-gray-200/40 dark:hover:bg-neutral-800/50 text-gray-700 dark:text-gray-400 transition-all duration-150"
      >
        <span className="text-gray-400 dark:text-gray-500">{icon}</span>
        <span className="ml-3 flex-1 text-left truncate text-[13px]">{label}</span>
        <span className="text-gray-400">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
      </button>
      {expanded && children && (
        <div className="ml-4 pl-2 border-l border-gray-200 dark:border-neutral-800/60 space-y-0.5 mt-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

function SubNavItem({ label, active = false }: { label: string, active?: boolean }) {
  return (
    <button className={`w-full text-left px-3 py-1.5 rounded-lg transition-all duration-150 text-[12.5px] truncate ${
      active 
        ? 'text-gray-900 dark:text-gray-100 bg-outline/40 dark:bg-neutral-800/40 font-medium' 
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/30'
    }`}>
      {label}
    </button>
  );
}
