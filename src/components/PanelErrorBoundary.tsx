import React from 'react';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class PanelErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[DoorDrop PanelErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[50vh] flex items-center justify-center p-8">
          <div className="max-w-lg w-full rounded-3xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-slate-900 p-8 text-center shadow-xl">
            <p className="text-lg font-black text-gray-900 dark:text-white mb-2">Algo falló al cargar el panel</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 break-words">
              {this.state.error?.message || 'Error inesperado'}
            </p>
            <button
              type="button"
              onClick={() => window.location.assign('/panel/quote?fresh=' + Date.now())}
              className="px-6 py-3 rounded-full font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-500"
            >
              Reintentar cotizador
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default PanelErrorBoundary;
