/**
 * Duck Controller - Background Service Worker
 * Connects to Tauri WebSocket and forwards messages to content scripts
 */

const WEBSOCKET_URL = 'ws://127.0.0.1:3030/ws';
const RECONNECT_INTERVAL = 3000; // 3 seconds
const MAX_RECONNECT_ATTEMPTS = 10;

let websocket = null;
let reconnectAttempts = 0;
let reconnectTimeout = null;
let isConnected = false;

// Status tracking
let stats = {
  connected: false,
  messagesReceived: 0,
  lastMessage: null,
  lastConnected: null,
};

// Connect to Tauri WebSocket server
function connectWebSocket() {
  try {
    console.log('🔌 Attempting to connect to Tauri WebSocket...');

    websocket = new WebSocket(WEBSOCKET_URL);

    websocket.onopen = () => {
      console.log('✅ WebSocket connected to Tauri!');
      isConnected = true;
      reconnectAttempts = 0;
      stats.connected = true;
      stats.lastConnected = new Date().toISOString();

      // Update icon to show connected status
      chrome.action.setIcon({ path: 'icons/icon48.png' });
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#00AA00' });
    };

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 Received message from Tauri:', data);

        stats.messagesReceived++;
        stats.lastMessage = data;

        // Forward message to all tabs
        forwardMessageToAllTabs(data);
      } catch (error) {
        console.error('❌ Error parsing message:', error);
      }
    };

    websocket.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };

    websocket.onclose = () => {
      console.log('🔌 WebSocket disconnected');
      isConnected = false;
      stats.connected = false;

      // Update icon to show disconnected status
      chrome.action.setBadgeText({ text: '✗' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });

      // Attempt to reconnect
      attemptReconnect();
    };
  } catch (error) {
    console.error('❌ Failed to create WebSocket:', error);
    attemptReconnect();
  }
}

// Reconnection logic
function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('❌ Max reconnection attempts reached. Please restart extension.');
    chrome.action.setBadgeText({ text: '!' });
    return;
  }

  reconnectAttempts++;
  console.log(`🔄 Reconnecting... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

  reconnectTimeout = setTimeout(() => {
    connectWebSocket();
  }, RECONNECT_INTERVAL);
}

// Forward message to all active tabs
async function forwardMessageToAllTabs(message) {
  try {
    const tabs = await chrome.tabs.query({ status: 'complete' });

    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'DUCK_MESSAGE',
          data: message,
        });
      } catch (error) {
        // Tab might not have content script injected yet, ignore
      }
    }
  } catch (error) {
    console.error('❌ Error forwarding message:', error);
  }
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    sendResponse({
      status: 'ok',
      stats: stats,
      isConnected: isConnected,
    });
    return true;
  }

  if (message.type === 'RECONNECT') {
    reconnectAttempts = 0;
    connectWebSocket();
    sendResponse({ status: 'reconnecting' });
    return true;
  }
});

// Initialize connection when extension loads
console.log('🦆 Duck Controller Extension - Background Worker Starting...');
connectWebSocket();

// Keep service worker alive
chrome.runtime.onInstalled.addListener(() => {
  console.log('🦆 Duck Controller Extension installed!');
});
