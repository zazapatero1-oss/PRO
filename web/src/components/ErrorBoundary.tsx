import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * Without this, a render or handler crash leaves the page looking alive but doing nothing —
 * the worst failure mode for a patient mid-conversation. Show it, and offer a reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('unhandled UI error', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="page page--center" id="main">
        <div className="alert alert--danger" role="alert">
          <p style={{ margin: 0 }}>
            Something went wrong on this page. Your answers so far are saved.
          </p>
          <p className="small muted" style={{ margin: '4px 0 8px' }}>{this.state.error.message}</p>
          <button type="button" className="btn btn--sm" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </main>
    )
  }
}
