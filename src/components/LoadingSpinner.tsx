"use client";

interface LoadingSpinnerProps {
  message: string;
}

export default function LoadingSpinner({ message }: LoadingSpinnerProps) {
  return (
    <div className="mx-auto mt-28 max-w-md">
      <div className="panel">
        <div className="panel-title">
          <span>System</span>
          <span className="text-ink-3">STDOUT</span>
        </div>
        <div className="p-4 text-[13px]">
          <p className="text-ink-2">
            <span className="text-up">$</span> {message.toUpperCase()}
            <span className="blink text-amber">▮</span>
          </p>
        </div>
      </div>
    </div>
  );
}
