import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '60vh', padding: 32,
        }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              页面出现了错误
            </h2>
            <p style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>
              {this.state.error?.message || '发生了未知错误，请刷新页面重试。'}
            </p>
            <button
              className="btn-primary"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
