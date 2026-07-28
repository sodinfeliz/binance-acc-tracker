"use client";

interface ErrorMessageProps {
  message: string;
  onRetry: () => void;
}

export default function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div className="mx-auto mt-28 max-w-md">
      <div className="panel border-down/60">
        <div className="panel-title border-down/60 text-down">
          <span>Error</span>
          <span>CODE: FETCH_FAIL</span>
        </div>
        <div className="p-4">
          <p className="text-[13px] text-ink-2">
            <span className="text-down">!</span> {message}
          </p>
          <button onClick={onRetry} className="btn-term mt-5">
            ⟳ Retry
          </button>
        </div>
      </div>
    </div>
  );
}
