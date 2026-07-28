"use client";

interface TopBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  live: boolean;
  secondsAgo: number | null;
  onRefresh: () => void;
}

const NAV_ITEMS = [
  { id: "overview", key: "1", label: "OVERVIEW" },
  { id: "holdings", key: "2", label: "HOLDINGS" },
  { id: "dca", key: "3", label: "DCA" },
];

export default function TopBar({ activeTab, onTabChange, live, secondsAgo, onRefresh }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-grid bg-bg/95 backdrop-blur">
      <div className="flex h-11 items-stretch">
        {/* Wordmark */}
        <div className="flex items-center gap-1 border-r border-grid px-4">
          <span className="text-[13px] font-bold tracking-[0.25em] text-amber">TRACKER</span>
          <span className="blink text-[13px] text-amber">▮</span>
        </div>

        {/* Tabs */}
        <nav className="flex items-stretch">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center gap-2 border-r border-grid px-4 text-[11px] tracking-[0.15em] transition-colors ${
                  isActive
                    ? "bg-panel-2 text-amber shadow-[inset_0_-2px_0_0_var(--color-amber)]"
                    : "text-ink-2 hover:bg-panel hover:text-ink"
                }`}
              >
                <span className={isActive ? "text-amber" : "text-ink-3"}>[{item.key}]</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right status cluster */}
        <div className="ml-auto flex items-stretch">
          {live && (
            <div className="flex items-center gap-2 border-l border-grid px-4 text-[11px] tracking-[0.1em]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-up" />
              </span>
              <span className="text-up">LIVE</span>
              {secondsAgo !== null && (
                <span className="text-ink-3">
                  {secondsAgo < 5 ? "NOW" : `${secondsAgo}S`}
                </span>
              )}
            </div>
          )}
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 border-l border-grid px-4 text-[11px] tracking-[0.15em] text-amber transition-colors hover:bg-amber hover:text-bg"
            title="Refresh (R)"
          >
            ⟳ REFRESH <span className="opacity-60">[R]</span>
          </button>
        </div>
      </div>
    </header>
  );
}
