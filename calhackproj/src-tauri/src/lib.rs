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

// Data structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuckMessage {
    pub message: String,
    pub timestamp: String,
    #[serde(rename = "type")]
    pub msg_type: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServiceStatus {
    pub http_server: bool,
    pub websocket_server: bool,
    pub extension_connected: bool,
    pub messages_received: u32,
}

// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub ws_tx: broadcast::Sender<DuckMessage>,
    pub message_count: Arc<Mutex<u32>>,
    pub tauri_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
    pub python_process: Arc<Mutex<Option<Child>>>,
}

// Tauri commands
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn get_service_status(state: tauri::State<'_, AppState>) -> Result<ServiceStatus, String> {
    let message_count = *state.message_count.lock().unwrap();
    Ok(ServiceStatus {
        http_server: true,
        websocket_server: true,
        extension_connected: state.ws_tx.receiver_count() > 0,
        messages_received: message_count,
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
    };

    if sender
        .send(Message::Text(serde_json::to_string(&welcome).unwrap()))
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
    };

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
