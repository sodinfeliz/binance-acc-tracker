import Dashboard from "@/components/Dashboard";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#181a20]">
      {/* Nav bar */}
      <header className="bg-[#1e2329]">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-6 py-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L6.5 7.5L8.36 9.36L12 5.72L15.64 9.36L17.5 7.5L12 2Z" fill="#F0B90B"/>
            <path d="M2 12L3.86 10.14L5.72 12L3.86 13.86L2 12Z" fill="#F0B90B"/>
            <path d="M6.5 16.5L12 22L17.5 16.5L15.64 14.64L12 18.28L8.36 14.64L6.5 16.5Z" fill="#F0B90B"/>
            <path d="M18.28 12L20.14 10.14L22 12L20.14 13.86L18.28 12Z" fill="#F0B90B"/>
            <path d="M14.83 12L12 9.17L9.17 12L12 14.83L14.83 12Z" fill="#F0B90B"/>
          </svg>
          <span className="text-base font-semibold tracking-wide text-white">
            BINANCE
          </span>
          <span className="ml-4 text-sm text-[#848e9c]">
            Portfolio Tracker
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <Dashboard />
      </main>
    </div>
  );
}
