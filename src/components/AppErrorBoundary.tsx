import React from 'react';

interface State { hasError: boolean; message?: string }

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : undefined };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[NutriShake UI Error]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-stone-50 text-stone-900 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-sm text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <h1 className="text-lg font-black">Bu bölüm yüklenemedi</h1>
          <p className="mt-2 text-sm text-stone-500">
            Uygulamanın bir bölümü beklenmeyen bir hata verdi. Verilerinizi korumak için uygulama işlemi durduruldu.
          </p>
          {import.meta.env.DEV && this.state.message && (
            <p className="mt-3 rounded-xl bg-stone-100 p-3 text-left text-xs text-stone-600 break-words">{this.state.message}</p>
          )}
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-5 w-full rounded-2xl bg-stone-900 px-4 py-3 text-sm font-black text-white"
          >
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }
}
