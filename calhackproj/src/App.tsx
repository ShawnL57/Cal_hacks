import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import TypingTest from "./TypingTest";
import { fetchMuseMetrics } from "./utils/portDiscovery";
import "./App.css";

interface ServiceStatus {
  http_server: boolean;
  websocket_server: boolean;
  extension_connected: boolean;
  messages_received: number;
  muse_connected: boolean;
}

interface DuckMessage {
  message: string;
  timestamp: string;
  type: string;
}

interface MuseMetrics {
  attention: string;
  focus_score: number;
  brain_state: string;
  head_orientation: string;
  heart_rate: number;
  movement_intensity: number;
  theta_beta_ratio: number;
}

function App() {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [messages, setMessages] = useState<DuckMessage[]>([]);
  const [museMetrics, setMuseMetrics] = useState<MuseMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showTypingTest, setShowTypingTest] = useState(false);
  const [museConnected, setMuseConnected] = useState(false);

  // Load service status
  async function loadStatus() {
    try {
      const result = await invoke<ServiceStatus>("get_service_status");
      setStatus(result);
      setMuseConnected(result.muse_connected);
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

  // Fetch Muse metrics every 500ms (for displaying metrics, not connection status)
  useEffect(() => {
    async function loadMetrics() {
      try {
        const data = await fetchMuseMetrics();
        setMuseMetrics(data);
      } catch (error) {
        setMuseMetrics(null);
      }
    }

    loadMetrics();
    const interval = setInterval(loadMetrics, 500);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (isActive: boolean) => {
    return isActive ? "#00ff00" : "#ff3333";
  };

  const getStatusText = (isActive: boolean) => {
    return isActive ? "Running" : "Stopped";
  };

  const getFocusColor = (attention: string) => {
    if (attention.toLowerCase().includes("high") || attention.toLowerCase().includes("focused")) {
      return "#00ff00";
    } else if (attention.toLowerCase().includes("medium")) {
      return "#ffaa00";
    } else {
      return "#ff3333";
    }
  };

  if (showTypingTest) {
    return <TypingTest />;
  }

  if (isLoading) {
    return (
      <div className="container">
        <h1>🦆 Duck Controller + 🧠 Muse Monitor</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="container">
      <header>
        <h1>🦆 Duck Focus Monitor</h1>
        <p className="subtitle">Real-time Brain Activity & Distraction Detection</p>
      </header>

      {/* EEG Connection Status Banner */}
      <div className="card" style={{
        background: museConnected
          ? 'rgba(76, 175, 80, 0.2)'
          : 'rgba(244, 67, 54, 0.2)',
        borderLeft: `4px solid ${museConnected ? '#4caf50' : '#f44336'}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{
            fontSize: '48px',
            animation: museConnected ? 'pulse 2s ease-in-out infinite' : 'none'
          }}>
            {museConnected ? '🧠' : '⚠️'}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '20px' }}>
              {museConnected ? 'Muse EEG Connected' : 'Muse EEG Disconnected'}
            </h2>
            <p style={{ margin: '5px 0 0 0', opacity: 0.8, fontSize: '14px' }}>
              {museConnected
                ? 'Actively monitoring your brain activity and focus levels'
                : 'Please connect your Muse headset to start monitoring'}
            </p>
          </div>
        </div>
      </div>

      {/* Muse Brain Metrics */}
      {museMetrics && museConnected && (
        <div className="card">
          <h2>🧠 Live Brain Metrics</h2>
          <div className="status-grid">
            <div className="status-item" style={{
              background: `${getFocusColor(museMetrics.attention)}20`,
              borderLeft: `4px solid ${getFocusColor(museMetrics.attention)}`
            }}>
              <div className="status-label">
                <span style={{ fontSize: '24px' }}>🎯</span>
                Focus Level
              </div>
              <div className="status-value" style={{ color: getFocusColor(museMetrics.attention) }}>
                {museMetrics.attention}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                {(museMetrics.focus_score * 100).toFixed(0)}% focused
              </div>
            </div>
            <div className="status-item">
              <div className="status-label">
                <span style={{ fontSize: '24px' }}>🧘</span>
                Brain State
              </div>
              <div className="status-value">{museMetrics.brain_state}</div>
            </div>
            <div className="status-item">
              <div className="status-label">
                <span style={{ fontSize: '24px' }}>🔄</span>
                Head Position
              </div>
              <div className="status-value">{museMetrics.head_orientation}</div>
            </div>
            <div className="status-item">
              <div className="status-label">
                <span style={{ fontSize: '24px' }}>❤️</span>
                Heart Rate
              </div>
              <div className="status-value">{Math.round(museMetrics.heart_rate)} bpm</div>
            </div>
          </div>
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <button
              onClick={() => setShowTypingTest(true)}
              style={{
                background: 'linear-gradient(135deg, #00ff00, #00aa00)',
                color: '#000',
                fontWeight: 'bold',
                fontSize: '16px',
                padding: '15px 30px'
              }}
            >
              📝 Start Focus Calibration Test
            </button>
          </div>
        </div>
      )}

      {/* System Status */}
      <div className="card">
        <h2>📊 System Status</h2>
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
            <div style={{ fontSize: '12px', opacity: 0.7 }}>
              Port 3030
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
            <div style={{ fontSize: '12px', opacity: 0.7 }}>
              ws://localhost:3030/ws
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
            <div style={{ fontSize: '12px', opacity: 0.7 }}>
              {status?.extension_connected ? 'Active' : 'Load extension in Chrome'}
            </div>
          </div>

          <div className="status-item">
            <div className="status-label">
              <span style={{ fontSize: '20px' }}>📨</span>
              Messages
            </div>
            <div className="status-value">{status?.messages_received ?? 0}</div>
            <div style={{ fontSize: '12px', opacity: 0.7 }}>
              Total received
            </div>
          </div>
        </div>
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button
            onClick={() => setShowTypingTest(true)}
            style={{
              background: museConnected
                ? 'linear-gradient(135deg, #00ff00, #00aa00)'
                : 'linear-gradient(135deg, #888, #666)',
              color: '#000',
              fontWeight: 'bold',
              fontSize: '16px',
              padding: '15px 30px',
              cursor: museConnected ? 'pointer' : 'not-allowed',
              opacity: museConnected ? 1 : 0.6
            }}
            disabled={!museConnected}
            title={museConnected ? 'Start typing test to calibrate your focus baseline' : 'Connect Muse headset first'}
          >
            📝 Start Focus Calibration Test
          </button>
          {!museConnected && (
            <p style={{ marginTop: '10px', fontSize: '14px', color: '#ff9800' }}>
              ⚠️ Connect your Muse headset to start calibration
            </p>
          )}
        </div>
      </div>

      {/* Activity Log */}
      <div className="card">
        <h2>📝 Activity Log</h2>
        <div className="message-log">
          {messages.length === 0 ? (
            <div className="empty-state">
              <p style={{ fontSize: '48px', marginBottom: '10px' }}>📭</p>
              <p style={{ fontSize: '18px', fontWeight: '500' }}>No messages yet</p>
              <p className="help-text">
                {museConnected
                  ? 'Focus state changes will appear here'
                  : 'Connect your Muse headset to start monitoring'}
              </p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={index} className="message-item">
                <div className="message-icon">
                  {msg.type === 'connection_status' ? '🔌' :
                   msg.message.includes('Distraction') ? '⚠️' :
                   msg.message.includes('Focus') ? '✅' : '🦆'}
                </div>
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

      {/* Quick Start Guide */}
      {!status?.extension_connected && (
        <div className="card" style={{
          background: 'rgba(255, 193, 7, 0.2)',
          borderLeft: '4px solid #ffc107'
        }}>
          <h2>🚀 Quick Start</h2>
          <ol className="instructions">
            <li>
              <strong>1. Connect Muse Headset</strong>
              Make sure your Muse 2 headset is powered on and the Python backend is running
              <code>cd python-backend && python3 main.py</code>
            </li>
            <li>
              <strong>2. Load Browser Extension</strong>
              Open Chrome → Extensions → Load Unpacked → Select <code>AnnoyingDuckExtension</code> folder
            </li>
            <li>
              <strong>3. Start Browsing</strong>
              Visit any website and the duck will appear when you lose focus!
            </li>
          </ol>
        </div>
      )}

      <footer className="footer">
        <p style={{ fontSize: '20px', marginBottom: '10px' }}>🦆 Duck Focus Monitor v1.0.0</p>
        <p className="help-text">
          Powered by Muse EEG + Tauri + WebSocket
        </p>
        <p className="help-text" style={{ marginTop: '10px', fontSize: '12px' }}>
          Messages flow: Muse → Python → Tauri (HTTP) → Extension (WebSocket) → Browser
        </p>
      </footer>
    </div>
  );
}

export default App;
