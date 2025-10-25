import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

interface ServiceStatus {
  http_server: boolean;
  websocket_server: boolean;
  extension_connected: boolean;
  messages_received: number;
}

interface DuckMessage {
  message: string;
  timestamp: string;
  type: string;
}

function App() {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [messages, setMessages] = useState<DuckMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load service status
  async function loadStatus() {
    try {
      const result = await invoke<ServiceStatus>("get_service_status");
      setStatus(result);
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to load status:", error);
      setIsLoading(false);
    }
  }

  // Listen for duck messages from Rust backend
  useEffect(() => {
    const unlisten = listen<DuckMessage>("duck-message", (event) => {
      console.log("Received duck message:", event.payload);
      setMessages((prev) => [event.payload, ...prev].slice(0, 50)); // Keep last 50 messages
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Load status on mount and every 5 seconds
  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (isActive: boolean) => {
    return isActive ? "#00ff00" : "#ff3333";
  };

  const getStatusText = (isActive: boolean) => {
    return isActive ? "Running" : "Stopped";
  };

  if (isLoading) {
    return (
      <div className="container">
        <h1>🦆 Duck Controller</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="container">
      <header>
        <h1>🦆 Duck Controller</h1>
        <p className="subtitle">Desktop Control Panel</p>
      </header>

      <div className="card">
        <h2>📊 Services Status</h2>
        <div className="status-grid">
          <div className="status-item">
            <div className="status-label">
              <span
                className="status-dot"
                style={{ backgroundColor: getStatusColor(status?.http_server ?? false) }}
              />
              HTTP Server
            </div>
            <div className="status-value">
              {getStatusText(status?.http_server ?? false)}
            </div>
          </div>

          <div className="status-item">
            <div className="status-label">
              <span
                className="status-dot"
                style={{ backgroundColor: getStatusColor(status?.websocket_server ?? false) }}
              />
              WebSocket Server
            </div>
            <div className="status-value">
              {getStatusText(status?.websocket_server ?? false)}
            </div>
          </div>

          <div className="status-item">
            <div className="status-label">
              <span
                className="status-dot"
                style={{ backgroundColor: getStatusColor(status?.extension_connected ?? false) }}
              />
              Browser Extension
            </div>
            <div className="status-value">
              {status?.extension_connected ? "Connected" : "Disconnected"}
            </div>
          </div>

          <div className="status-item">
            <div className="status-label">📨 Messages Received</div>
            <div className="status-value">{status?.messages_received ?? 0}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>📝 Activity Log</h2>
        <div className="message-log">
          {messages.length === 0 ? (
            <div className="empty-state">
              <p>No messages yet...</p>
              <p className="help-text">
                Messages from the Python backend will appear here
              </p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={index} className="message-item">
                <div className="message-icon">🦆</div>
                <div className="message-content">
                  <div className="message-text">{msg.message}</div>
                  <div className="message-time">
                    {new Date(msg.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <h2>ℹ️ Instructions</h2>
        <ol className="instructions">
          <li>
            <strong>Start Python Backend:</strong>
            <code>cd python-backend && python3 main.py</code>
          </li>
          <li>
            <strong>Load Extension:</strong> Open Chrome → Extensions → Load
            Unpacked → Select <code>browser-extension</code> folder
          </li>
          <li>
            <strong>Visit any website:</strong> Duck messages will appear on
            the page!
          </li>
        </ol>
      </div>

      <footer className="footer">
        <p>🦆 Duck Controller v1.0.0</p>
        <p className="help-text">
          Messages flow: Python → Tauri (HTTP) → Extension (WebSocket)
        </p>
      </footer>
    </div>
  );
}

export default App;
