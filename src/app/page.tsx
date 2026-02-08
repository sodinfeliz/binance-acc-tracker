import Dashboard from "@/components/Dashboard";

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-8 text-2xl font-bold text-white">
          Binance Portfolio Tracker
        </h1>
        <Dashboard />
      </div>
    </div>
  );
}
