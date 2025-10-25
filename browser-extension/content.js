/**
 * Duck Controller - Content Script
 * Displays duck messages on web pages
 */

console.log('🦆 Duck Controller content script loaded!');

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DUCK_MESSAGE') {
    // Only show duck alerts (when user is unfocused)
    // Ignore regular brain_metrics messages
    if (message.data.type === 'duck_alert') {
      console.log('🦆 DUCK ALERT! User is unfocused:', message.data);
      displayDuckMessage(message.data);
      sendResponse({ received: true });
    } else {
      // Ignore regular metrics messages (they go to Tauri dashboard)
      sendResponse({ received: true, ignored: true });
    }
  }
});

// Display duck message as a floating notification
function displayDuckMessage(data) {
  const container = createMessageContainer();
  const messageBox = createMessageBox(data);

  container.appendChild(messageBox);
  document.body.appendChild(container);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    messageBox.style.animation = 'duckSlideOut 0.5s ease-in forwards';
    setTimeout(() => {
      if (container.parentNode) {
        container.remove();
      }
    }, 500);
  }, 5000);
}

// Create container for messages
function createMessageContainer() {
  let container = document.getElementById('duck-controller-container');

  if (!container) {
    container = document.createElement('div');
    container.id = 'duck-controller-container';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
  }

  return container;
}

// Create individual message box
function createMessageBox(data) {
  const messageBox = document.createElement('div');
  messageBox.className = 'duck-message-box';
  messageBox.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 15px 20px;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 16px;
    font-weight: 600;
    min-width: 250px;
    max-width: 350px;
    pointer-events: auto;
    cursor: pointer;
    animation: duckSlideIn 0.5s ease-out;
    transition: transform 0.2s ease;
  `;

  messageBox.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <span style="font-size: 28px;">🦆</span>
      <div style="flex: 1;">
        <div style="margin-bottom: 4px;">${escapeHtml(data.message)}</div>
        <div style="font-size: 11px; opacity: 0.8;">
          ${new Date(data.timestamp).toLocaleTimeString()}
        </div>
      </div>
      <span style="font-size: 14px; opacity: 0.6; cursor: pointer;" onclick="this.parentElement.parentElement.remove()">✕</span>
    </div>
  `;

  // Hover effect
  messageBox.addEventListener('mouseenter', () => {
    messageBox.style.transform = 'scale(1.05) translateX(-5px)';
  });

  messageBox.addEventListener('mouseleave', () => {
    messageBox.style.transform = 'scale(1) translateX(0)';
  });

  // Click to dismiss
  messageBox.addEventListener('click', () => {
    messageBox.style.animation = 'duckSlideOut 0.3s ease-in forwards';
    setTimeout(() => messageBox.remove(), 300);
  });

  return messageBox;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Inject CSS animations
if (!document.getElementById('duck-controller-styles')) {
  const style = document.createElement('style');
  style.id = 'duck-controller-styles';
  style.textContent = `
    @keyframes duckSlideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes duckSlideOut {
      from {
        transform: translateX(0) scale(1);
        opacity: 1;
      }
      to {
        transform: translateX(400px) scale(0.8);
        opacity: 0;
      }
    }

    @keyframes duckWobble {
      0%, 100% { transform: rotate(0deg); }
      25% { transform: rotate(-5deg); }
      75% { transform: rotate(5deg); }
    }
  `;
  document.head.appendChild(style);
}

console.log('✅ Duck Controller ready to receive messages!');
