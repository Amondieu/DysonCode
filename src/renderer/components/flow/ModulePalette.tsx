import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MODULE_REGISTRY, getModulesByCategory, type ModuleCategory, type ModuleDefinition } from '../../data/module-registry';

export interface PalettePosition {
  x: number;
  y: number;
}

interface Props {
  position: PalettePosition;
  onSelect: (mod: ModuleDefinition) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<ModuleCategory, { label: string; icon: string }> = {
  thinking:   { label: 'THINKING',   icon: '🧠' },
  council:    { label: 'COUNCIL',    icon: '💬' },
  data:       { label: 'DATA',       icon: '🌐' },
  execution:  { label: 'EXECUTION',  icon: '⚡' },
  creative:   { label: 'CREATIVE',   icon: '🎨' },
  meta:       { label: 'META',       icon: '🔧' },
};

export default function ModulePalette({ position, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<ModuleCategory | 'all'>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  // Auto-focus search input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid immediate close from the context menu click
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const grouped = useMemo(() => getModulesByCategory(), []);

  const filtered = useMemo(() => {
    let modules = activeCategory === 'all'
      ? MODULE_REGISTRY
      : grouped[activeCategory];

    if (search.trim()) {
      const q = search.toLowerCase();
      modules = modules.filter((m) =>
        m.label.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.capabilities.some((c) => c.toLowerCase().includes(q)),
      );
    }
    return modules;
  }, [search, activeCategory, grouped]);

  // Clamp position to viewport
  const style: React.CSSProperties = {
    position: 'absolute',
    left: Math.min(position.x, window.innerWidth - 320),
    top: Math.min(position.y, window.innerHeight - 420),
    zIndex: 1000,
  };

  return (
    <div
      ref={paletteRef}
      style={style}
      className="w-[300px] max-h-[400px] bg-[#111115] border border-[rgba(255,255,255,0.1)] rounded-xl shadow-2xl flex flex-col overflow-hidden"
    >
      {/* Search */}
      <div className="p-2 border-b border-[rgba(255,255,255,0.06)]">
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search modules..."
          className="w-full bg-[#1a1a1e] border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-1.5 text-[11px] text-[#e8e8ea] outline-none focus:border-[#6c8cf8] placeholder:text-[#444450]"
        />
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-[rgba(255,255,255,0.04)] overflow-x-auto flex-shrink-0">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap transition-colors ${
            activeCategory === 'all' ? 'bg-[#6c8cf8]/20 text-[#6c8cf8]' : 'text-[#555560] hover:text-[#888890]'
          }`}
        >
          ALL
        </button>
        {(Object.keys(CATEGORY_LABELS) as ModuleCategory[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap transition-colors ${
              activeCategory === cat ? 'bg-[#6c8cf8]/20 text-[#6c8cf8]' : 'text-[#555560] hover:text-[#888890]'
            }`}
          >
            {CATEGORY_LABELS[cat].icon} {CATEGORY_LABELS[cat].label}
          </button>
        ))}
      </div>

      {/* Module list */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {filtered.length === 0 && (
          <div className="text-[11px] text-[#555560] text-center py-4">No modules found</div>
        )}
        {filtered.map((mod) => (
          <button
            key={mod.id}
            onClick={() => onSelect(mod)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#1a1a1e] transition-colors text-left group"
          >
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: mod.color }}
            />
            <span className="text-[13px]">{mod.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-[#e8e8ea] font-medium">{mod.label}</div>
              <div className="text-[9px] text-[#555560] truncate">
                {mod.frame && <span className="mr-1.5 px-1 py-0.5 rounded bg-[#1a1a1e] text-[#888890]">{mod.frame}</span>}
                {mod.role && <span className="mr-1.5 text-[#666670]">{mod.role}</span>}
                <span>{mod.capabilities.slice(0, 2).join(', ')}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="px-2 py-1 border-t border-[rgba(255,255,255,0.04)] text-[9px] text-[#444450] text-right">
        {filtered.length} module{filtered.length !== 1 ? 's' : ''} · Esc to close
      </div>
    </div>
  );
}
