"use client";

interface LoadingSpinnerProps {
  message: string;
}

export default function LoadingSpinner({ message }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-600 border-t-blue-500" />
      <p className="text-sm text-zinc-400">{message}</p>
    </div>
  );
}
