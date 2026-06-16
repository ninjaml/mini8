import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100vh", background: "#f8f9fa",
          color: "#374151", fontFamily: "Inter, sans-serif", padding: "2rem",
          textAlign: "center"
        }}>
          <h1 style={{ color: "#ef4444", marginBottom: "1rem" }}>⚠️ 出错了</h1>
          <p style={{ marginBottom: "1.5rem", opacity: 0.8 }}>
            应用遇到了意外错误，请刷新页面重试。
          </p>
          <pre style={{
            background: "#f3f4f6", padding: "1rem", borderRadius: "8px",
            fontSize: "12px", maxWidth: "600px", overflow: "auto",
            textAlign: "left", color: "#ef4444", marginBottom: "1.5rem"
          }}>
            {this.state.error?.toString?.() || "Unknown error"}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "0.6rem 1.5rem", borderRadius: "8px", border: "none",
              background: "#10b981", color: "#fff", cursor: "pointer",
              fontSize: "14px", fontWeight: 600
            }}
          >
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
