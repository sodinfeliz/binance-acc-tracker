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
    <div>
      <p className="mb-1 text-sm text-[#848e9c]">{label}</p>
      <p className={`text-2xl font-semibold ${valueColor}`}>{value}</p>
      {subValue && (
        <p className={`mt-0.5 text-sm ${valueColor}`}>{subValue}</p>
      )}
    </div>
  );
}
