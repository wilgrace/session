"use client";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
      <div className="mb-8">
        <div className="w-16 h-16 rounded-2xl bg-sky-100 flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-sky-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">You&apos;re offline</h1>
        <p className="text-slate-500 text-sm max-w-xs">
          Check your internet connection and try again to continue booking.
        </p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="bg-sky-500 text-white rounded-xl px-6 py-3 text-sm font-medium active:bg-sky-600 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
