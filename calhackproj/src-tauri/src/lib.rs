use std::sync::{Arc, Mutex};
use std::process::{Command, Child};
use tauri::{Manager, Emitter, AppHandle};
use serde::{Deserialize, Serialize};
use axum::{
    extract::{State, WebSocketUpgrade, ws::{WebSocket, Message}},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;
use tower_http::cors::{CorsLayer, Any};

// Global port configuration
const MUSE_API_PORTS: &[u16] = &[5000, 5001, 5002, 5003, 5004, 5005];

// Data structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuckMessage {
    pub message: String,
    pub timestamp: String,
    #[serde(rename = "type")]
    pub msg_type: String,
    pub focus_state: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MuseMetrics {
    pub attention: String,
    pub focus_score: f64,
    pub brain_state: String,
    pub head_orientation: String,
    pub heart_rate: f64,
    pub movement_intensity: f64,
    pub theta_beta_ratio: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServiceStatus {
    pub http_server: bool,
    pub websocket_server: bool,
    pub extension_connected: bool,
    pub messages_received: u32,
    pub muse_connected: bool,
}

// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub ws_tx: broadcast::Sender<DuckMessage>,
    pub message_count: Arc<Mutex<u32>>,
    pub tauri_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
    pub python_process: Arc<Mutex<Option<Child>>>,
    pub last_focus_state: Arc<Mutex<Option<String>>>,
    pub last_state_change: Arc<Mutex<Option<std::time::Instant>>>,
    pub muse_connected: Arc<Mutex<bool>>,
    pub consecutive_failures: Arc<Mutex<u32>>,
}

// Tauri commands
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn get_service_status(state: tauri::State<'_, AppState>) -> Result<ServiceStatus, String> {
    let message_count = *state.message_count.lock().unwrap();
    let muse_connected = *state.muse_connected.lock().unwrap();
    Ok(ServiceStatus {
        http_server: true,
        websocket_server: true,
        extension_connected: state.ws_tx.receiver_count() > 0,
        messages_received: message_count,
        muse_connected,
    })
}

// HTTP endpoint to receive messages from Python backend
async fn receive_message(
    State(state): State<AppState>,
    Json(message): Json<DuckMessage>,
) -> impl IntoResponse {
    println!("📨 Received from Python: {}", message.message);

    // Increment counter
    {
        let mut count = state.message_count.lock().unwrap();
        *count += 1;
    }

    // Emit to Tauri frontend
    if let Some(app) = state.tauri_handle.lock().unwrap().as_ref() {
        let _ = app.emit("duck-message", message.clone());
    }

    // Broadcast to WebSocket clients (browser extension)
    let _ = state.ws_tx.send(message.clone());

    Json(serde_json::json!({
        "status": "success",
        "broadcasted": true
    }))
}

// WebSocket handler for browser extension
async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_websocket(socket, state))
}

async fn handle_websocket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.ws_tx.subscribe();

    println!("🔌 WebSocket client connected");

    // Send welcome message
    let welcome = DuckMessage {
        message: "Connected to Duck Controller!".to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        msg_type: "connection".to_string(),
        focus_state: None,
    };

    if sender
        .send(Message::Text(serde_json::to_string(&welcome).unwrap()))
        .await
        .is_err()
    {
        return;
    }

    // Send current EEG connection status
    let is_connected = *state.muse_connected.lock().unwrap();
    let status_msg = DuckMessage {
        message: if is_connected {
            "EEG Connected".to_string()
        } else {
            "EEG Disconnected - Please connect your Muse headset".to_string()
        },
        timestamp: chrono::Utc::now().to_rfc3339(),
        msg_type: "connection_status".to_string(),
        focus_state: None,
    };

    if sender
        .send(Message::Text(serde_json::to_string(&status_msg).unwrap()))
        .await
        .is_err()
    {
        return;
    }

    // Spawn task to forward broadcast messages to this WebSocket
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let json = serde_json::to_string(&msg).unwrap();
            if sender.send(Message::Text(json)).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages from WebSocket (if any)
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                println!("📩 Received from extension: {}", text);
            }
        }
    });

    // Wait for either task to finish (connection closed)
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }

    println!("🔌 WebSocket client disconnected");
}

// Health check endpoint
async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "running",
        "service": "Duck Controller - Tauri Backend"
    }))
}

// Discover which port the Muse API is running on
async fn discover_muse_port(client: &reqwest::Client) -> Option<u16> {
    for &port in MUSE_API_PORTS {
        let url = format!("http://localhost:{}/api/metrics", port);
        match client.get(&url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    println!("✅ Found Muse API on port {}", port);
                    return Some(port);
                } else {
                    println!("⚠️ Port {} responded with status: {}", port, response.status());
                }
            }
            Err(e) => {
                println!("❌ Port {} error: {}", port, e);
            }
        }
    }
    println!("❌ No Muse API found on any port");
    None
}

// Background task to monitor Muse metrics and send focus state changes
async fn monitor_muse_metrics(state: AppState) {
    let client = reqwest::Client::new();
    let mut last_connection_message_sent = false;
    let mut muse_port: Option<u16> = None;

    loop {
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // Discover port if not found
        if muse_port.is_none() {
            muse_port = discover_muse_port(&client).await;
            if muse_port.is_none() {
                handle_muse_failure(&state, &mut last_connection_message_sent, "API not found on any port").await;
                continue;
            }
        }

        // Fetch metrics from Muse backend
        let url = format!("http://localhost:{}/api/metrics", muse_port.unwrap());
        match client.get(&url).send().await {
            Ok(response) => {
                // Check if response is successful (not 404)
                if response.status().is_success() {
                    if let Ok(metrics) = response.json::<MuseMetrics>().await {
                        // Mark as connected
                        {
                            let mut connected = state.muse_connected.lock().unwrap();
                            let mut failures = state.consecutive_failures.lock().unwrap();

                            if !*connected {
                                println!("✅ Muse EEG connected!");
                                *connected = true;
                                *failures = 0;
                                last_connection_message_sent = false;

                                // Send connection status message
                                let conn_msg = DuckMessage {
                                    message: "EEG Connected".to_string(),
                                    timestamp: chrono::Utc::now().to_rfc3339(),
                                    msg_type: "connection_status".to_string(),
                                    focus_state: None,
                                };

                                if let Some(app) = state.tauri_handle.lock().unwrap().as_ref() {
                                    let _ = app.emit("duck-message", conn_msg.clone());
                                }
                                let _ = state.ws_tx.send(conn_msg);
                            }
                        }

                        let current_state = metrics.attention.clone();

                        println!("🧠 Current attention state: {} (focus_score: {:.2})",
                                 current_state, metrics.focus_score);

                        let mut should_send_message = false;
                        let mut message_to_send: Option<DuckMessage> = None;

                        {
                            let mut last_state = state.last_focus_state.lock().unwrap();
                            let mut last_change = state.last_state_change.lock().unwrap();

                            // Check if state has changed
                            let state_changed = match last_state.as_ref() {
                                Some(prev) => prev != &current_state,
                                None => true,
                            };

                            if state_changed {
                                // State changed, reset timer
                                println!("🔄 State changed to: {}", current_state);
                                *last_state = Some(current_state.clone());
                                *last_change = Some(std::time::Instant::now());
                            } else if let Some(change_time) = *last_change {
                                // State has been stable, check if 2 seconds have passed
                                let elapsed = change_time.elapsed();

                                if elapsed.as_secs() >= 2 {
                                    // Send message for this state
                                    let focus_state = if current_state.to_lowercase().contains("unfocused")
                                        || current_state.to_lowercase().contains("low") {
                                        "unfocused"
                                    } else {
                                        "focused"
                                    };

                                    println!("⏰ State stable for 2s, mapped to: {}", focus_state);

                                    let message = if focus_state == "unfocused" {
                                        "⚠️ Distraction detected! Duck spawned.".to_string()
                                    } else {
                                        "✅ Focus restored!".to_string()
                                    };

                                    message_to_send = Some(DuckMessage {
                                        message,
                                        timestamp: chrono::Utc::now().to_rfc3339(),
                                        msg_type: "focus_state_change".to_string(),
                                        focus_state: Some(focus_state.to_string()),
                                    });

                                    should_send_message = true;

                                    // Reset timer so we don't send duplicate messages
                                    *last_change = None;
                                } else {
                                    println!("⏳ State stable, waiting... ({:.1}s elapsed)", elapsed.as_secs_f32());
                                }
                            }
                        }

                        if should_send_message {
                            if let Some(msg) = message_to_send {
                                println!("📤 Sending focus state message: {:?}", msg);

                                // Increment counter
                                {
                                    let mut count = state.message_count.lock().unwrap();
                                    *count += 1;
                                }

                                // Emit to Tauri frontend
                                if let Some(app) = state.tauri_handle.lock().unwrap().as_ref() {
                                    let _ = app.emit("duck-message", msg.clone());
                                }

                                // Broadcast to WebSocket clients (browser extension)
                                let _ = state.ws_tx.send(msg);
                            }
                        }
                    } else {
                        // JSON parsing failed - API might not be ready
                        handle_muse_failure(&state, &mut last_connection_message_sent, "Invalid response from Muse API").await;
                    }
                } else {
                    // Non-200 status - port might have changed
                    println!("⚠️ Lost connection, rediscovering port...");
                    muse_port = None;
                    handle_muse_failure(&state, &mut last_connection_message_sent, "Connection lost").await;
                }
            }
            Err(_) => {
                // Connection error - port might have changed
                println!("⚠️ Connection error, rediscovering port...");
                muse_port = None;
                handle_muse_failure(&state, &mut last_connection_message_sent, "Connection error").await;
            }
        }
    }
}

async fn handle_muse_failure(state: &AppState, last_message_sent: &mut bool, reason: &str) {
    let mut connected = state.muse_connected.lock().unwrap();
    let mut failures = state.consecutive_failures.lock().unwrap();

    *failures += 1;

    // Only mark as disconnected and send message after 5 consecutive failures
    // This prevents flapping on temporary network issues
    if *failures >= 5 && *connected {
        println!("❌ Muse EEG disconnected: {}", reason);
        *connected = false;
        *last_message_sent = false;

        // Clear focus state since we can't monitor anymore
        *state.last_focus_state.lock().unwrap() = None;
        *state.last_state_change.lock().unwrap() = None;
    }

    // Send disconnection message only once
    if !*connected && !*last_message_sent {
        let disconn_msg = DuckMessage {
            message: "EEG Disconnected - Please connect your Muse headset".to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            msg_type: "connection_status".to_string(),
            focus_state: None,
        };

        if let Some(app) = state.tauri_handle.lock().unwrap().as_ref() {
            let _ = app.emit("duck-message", disconn_msg.clone());
        }
        let _ = state.ws_tx.send(disconn_msg);

        *last_message_sent = true;
    }
}

// Launch Python backend subprocess
fn launch_python_backend() -> Result<Child, std::io::Error> {
    println!("🐍 Launching Python backend...");

    // Find python3 executable
    let python_cmd = if cfg!(target_os = "windows") {
        "python"
    } else {
        "python3"
    };

    // Get the path to python-backend directory
    let python_dir = std::env::current_dir()
        .unwrap()
        .parent()
        .unwrap()
        .join("python-backend");

    println!("📁 Python directory: {}", python_dir.display());

    // Launch Python process
    let child = Command::new(python_cmd)
        .arg("main.py")
        .current_dir(&python_dir)
        .spawn()?;

    println!("✅ Python backend started (PID: {})", child.id());
    Ok(child)
}

// Start HTTP + WebSocket server
async fn start_servers(app_handle: tauri::AppHandle) {
    let (tx, _rx) = broadcast::channel::<DuckMessage>(100);

    // Launch Python backend as subprocess
    let python_process = match launch_python_backend() {
        Ok(child) => {
            println!("✅ Python subprocess launched successfully");
            Some(child)
        }
        Err(e) => {
            eprintln!("❌ Failed to launch Python backend: {}", e);
            eprintln!("⚠️  Make sure python-backend/main.py exists");
            eprintln!("⚠️  You can still run Python manually if needed");
            None
        }
    };

    let state = AppState {
        ws_tx: tx,
        message_count: Arc::new(Mutex::new(0)),
        tauri_handle: Arc::new(Mutex::new(Some(app_handle.clone()))),
        python_process: Arc::new(Mutex::new(python_process)),
        last_focus_state: Arc::new(Mutex::new(None)),
        last_state_change: Arc::new(Mutex::new(None)),
        muse_connected: Arc::new(Mutex::new(false)),
        consecutive_failures: Arc::new(Mutex::new(0)),
    };

    // Start Muse monitoring task
    let monitor_state = state.clone();
    tokio::spawn(async move {
        monitor_muse_metrics(monitor_state).await;
    });

    // Make state available to Tauri commands
    app_handle.manage(state.clone());

    // Build Axum router
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/message", post(receive_message))
        .route("/ws", get(websocket_handler))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state);

    // Start HTTP server on port 3030
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3030")
        .await
        .expect("Failed to bind to port 3030");

    println!("🚀 HTTP Server started on http://127.0.0.1:3030");
    println!("🔌 WebSocket Server started on ws://127.0.0.1:3030/ws");

    axum::serve(listener, app)
        .await
        .expect("Failed to start server");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Start HTTP + WebSocket servers in background
            tauri::async_runtime::spawn(async move {
                start_servers(app_handle).await;
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Clean up Python process on exit
                if let Some(state) = window.app_handle().try_state::<AppState>() {
                    if let Some(mut child) = state.python_process.lock().unwrap().take() {
                        println!("🛑 Shutting down Python backend...");
                        let _ = child.kill();
                        println!("✅ Python backend stopped");
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![greet, get_service_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
