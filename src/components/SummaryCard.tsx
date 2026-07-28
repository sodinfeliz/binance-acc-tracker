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
  valueColor = "text-ink",
}: SummaryCardProps) {
  return (
    <div className="panel p-4">
      <p className="text-[11px] tracking-[0.2em] text-ink-3">{label.toUpperCase()}</p>
      <p className={`mt-2 text-xl ${valueColor}`}>{value}</p>
      {subValue && (
        <p className={`mt-0.5 text-[13px] ${valueColor}`}>{subValue}</p>
      )}
    </div>
  );
}
