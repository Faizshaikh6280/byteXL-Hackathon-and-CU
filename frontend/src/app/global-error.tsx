'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-900 text-slate-100 text-center font-sans">
        <div className="max-w-md p-6 bg-slate-800 border border-slate-700 rounded-xl shadow-lg">
          <h2 className="text-xl font-bold text-red-400 mb-2">Critical Application Error</h2>
          <p className="text-sm text-slate-400 mb-4">
            {error?.message || 'An unexpected application-level error occurred.'}
          </p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
          >
            Retry
          </button>
        </div>
      </body>
    </html>
  );
}
