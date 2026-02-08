"use client";

interface SummaryCardProps {
  label: string;
  value: string;
  subValue?: string;
  valueColor?: string;
}

export default function SummaryCard({
  label,
  value,
  subValue,
  valueColor = "text-white",
}: SummaryCardProps) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
      {subValue && (
        <p className={`mt-1 text-sm ${valueColor}`}>{subValue}</p>
      )}
    </div>
  );
}
