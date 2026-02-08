"use client";

interface ErrorMessageProps {
  message: string;
  onRetry: () => void;
}

export default function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div className="mx-auto max-w-md py-32 text-center">
      <p className="mb-6 text-sm text-[#f6465d]">{message}</p>
      <button
        onClick={onRetry}
        className="rounded bg-[#fcd535] px-6 py-2.5 text-sm font-medium text-[#202630] transition-colors hover:bg-[#f0b90b]"
      >
        Retry
      </button>
    </div>
  );
}
