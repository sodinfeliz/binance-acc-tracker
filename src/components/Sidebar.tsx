"use client";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const NAV_ITEMS = [
  {
    id: "overview",
    label: "Overview",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: "holdings",
    label: "Holdings",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 010-4h14v4" />
        <path d="M3 5v14a2 2 0 002 2h16v-5" />
        <path d="M18 12a2 2 0 100 4h4v-4h-4z" />
      </svg>
    ),
  },
  {
    id: "dca",
    label: "DCA Analysis",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
];

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 flex h-screen w-60 flex-col bg-[#1e2329]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L6.5 7.5L8.36 9.36L12 5.72L15.64 9.36L17.5 7.5L12 2Z" fill="#F0B90B"/>
          <path d="M2 12L3.86 10.14L5.72 12L3.86 13.86L2 12Z" fill="#F0B90B"/>
          <path d="M6.5 16.5L12 22L17.5 16.5L15.64 14.64L12 18.28L8.36 14.64L6.5 16.5Z" fill="#F0B90B"/>
          <path d="M18.28 12L20.14 10.14L22 12L20.14 13.86L18.28 12Z" fill="#F0B90B"/>
          <path d="M14.83 12L12 9.17L9.17 12L12 14.83L14.83 12Z" fill="#F0B90B"/>
        </svg>
        <span className="text-base font-semibold tracking-wide text-white">TRACKER</span>
      </div>

      {/* Nav items */}
      <nav className="mt-2 flex flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-[#2b3139] text-[#f0b90b]"
                  : "text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-[#eaecef]"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto border-t border-[#2b3139] px-5 py-4">
        <p className="text-xs text-[#5e6673]">Spot + Earn + Auto-Invest</p>
      </div>
    </aside>
  );
}
