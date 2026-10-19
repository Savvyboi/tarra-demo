import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

interface RootErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  RootErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: null };
  }

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    return {
      hasError: true,
      message:
        error instanceof Error
          ? error.message
          : 'An unexpected application error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh w-full bg-[#121417] text-[#f5f3eb] flex items-center justify-center p-6">
          <div className="max-w-md w-full p-6 rounded-2xl bg-[#14171c] border-3 border-[#f4f1ea] shadow-[6px_8px_0px_#07080a] text-center space-y-4">
            <h1 className="font-display-slap text-xl uppercase text-[#ffe600]">
              TARRA // Recovery Mode
            </h1>
            <p className="font-mono-stamp text-xs text-[#d5d2c8] leading-relaxed">
              {this.state.message}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <a
                href="?city=turku&view=list"
                className="px-4 py-2 rounded-lg bg-[#ffe600] text-[#0d0e11] border-2 border-[#0d0e11] font-grotesk font-extrabold text-xs uppercase"
              >
                Open Street Pole Feed
              </a>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg bg-[#22262e] text-[#f4f1ea] border border-[#f4f1ea] font-grotesk font-bold text-xs uppercase cursor-pointer"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
