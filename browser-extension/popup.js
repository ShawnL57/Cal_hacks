/**
 * Duck Controller - Popup Script
 */

// Get status from background script
async function updateStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });

    if (response && response.stats) {
      const stats = response.stats;

      // Update connection status
      const statusIndicator = document.getElementById('status-indicator');
      const statusText = document.getElementById('status-text');

      if (stats.connected) {
        statusIndicator.className = 'status-indicator status-connected';
        statusText.textContent = 'Connected';
      } else {
        statusIndicator.className = 'status-indicator status-disconnected';
        statusText.textContent = 'Disconnected';
      }

      // Update message count
      document.getElementById('message-count').textContent = stats.messagesReceived;

      // Update last connected
      if (stats.lastConnected) {
        const date = new Date(stats.lastConnected);
        document.getElementById('last-connected').textContent = date.toLocaleTimeString();
      }

      // Update last message preview
      if (stats.lastMessage) {
        const lastMessageDiv = document.getElementById('last-message');
        lastMessageDiv.innerHTML = `
          <strong>Last Message:</strong><br>
          ${escapeHtml(stats.lastMessage.message)}<br>
          <small>${new Date(stats.lastMessage.timestamp).toLocaleString()}</small>
        `;
      }
    }
  } catch (error) {
    console.error('Error getting status:', error);
  }
}

// Reconnect button
document.getElementById('reconnect-btn').addEventListener('click', async () => {
  const btn = document.getElementById('reconnect-btn');
  btn.textContent = '⏳ Reconnecting...';
  btn.disabled = true;

  try {
    await chrome.runtime.sendMessage({ type: 'RECONNECT' });

    setTimeout(() => {
      btn.textContent = '🔄 Reconnect';
      btn.disabled = false;
      updateStatus();
    }, 2000);
  } catch (error) {
    console.error('Reconnect failed:', error);
    btn.textContent = '❌ Failed';
    setTimeout(() => {
      btn.textContent = '🔄 Reconnect';
      btn.disabled = false;
    }, 2000);
  }
});

// Open dashboard button
document.getElementById('open-dashboard-btn').addEventListener('click', () => {
  // This would open the Tauri app (not implemented yet)
  alert('Open the Duck Controller desktop app to access the full dashboard!');
});

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initial status update
updateStatus();

// Update status every 2 seconds
setInterval(updateStatus, 2000);
