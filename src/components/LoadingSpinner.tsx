"use client";

interface LoadingSpinnerProps {
  message: string;
}

export default function LoadingSpinner({ message }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-32">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2b3139] border-t-[#f0b90b]" />
      <p className="text-sm text-[#848e9c]">{message}</p>
    </div>
  );
}
