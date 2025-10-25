"use strict";
// UI Elements
const quackBtn = document.getElementById('quackBtn');
const showDuckToggle = document.getElementById('showDuckToggle');
const reconnectBtn = document.getElementById('reconnectBtn');
const alwaysSpawnToggle = document.getElementById('alwaysSpawnToggle');
const prevPositionBtn = document.getElementById('prevPositionBtn');
const nextPositionBtn = document.getElementById('nextPositionBtn');
const showAllPositionsBtn = document.getElementById('showAllPositionsBtn');
const statusMessage = document.getElementById('statusMessage');
const eegIndicator = document.getElementById('eegIndicator');
const eegStatus = document.getElementById('eegStatus');
const backendIndicator = document.getElementById('backendIndicator');
const backendStatus = document.getElementById('backendStatus');
function showStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message ' + (isError ? 'error' : 'success');
    setTimeout(() => {
        statusMessage.className = 'status-message';
    }, 3000);
}
function updateConnectionStatus(eegConnected, backendConnected) {
    // Update EEG status
    if (eegConnected) {
        eegIndicator.className = 'status-indicator connected';
        eegStatus.textContent = 'Connected';
    }
    else {
        eegIndicator.className = 'status-indicator disconnected';
        eegStatus.textContent = 'Disconnected';
    }
    // Update Backend status
    if (backendConnected) {
        backendIndicator.className = 'status-indicator connected';
        backendStatus.textContent = 'Connected';
        // Hide reconnect button when connected
        if (reconnectBtn)
            reconnectBtn.style.display = 'none';
    }
    else {
        backendIndicator.className = 'status-indicator disconnected';
        backendStatus.textContent = 'Disconnected';
        // Show reconnect button when disconnected
        if (reconnectBtn)
            reconnectBtn.style.display = 'block';
    }
}
function updateScrollHistoryUI(scrollPositions) {
    const scrollSection = document.querySelector('.settings-section:has(#prevPositionBtn)');
    if (scrollPositions.total === 0) {
        if (scrollSection)
            scrollSection.style.display = 'none';
        return;
    }
    if (scrollSection)
        scrollSection.style.display = 'block';
    // Update button states
    if (prevPositionBtn) {
        prevPositionBtn.disabled = !scrollPositions.hasPrev;
        prevPositionBtn.style.opacity = scrollPositions.hasPrev ? '1' : '0.5';
    }
    if (nextPositionBtn) {
        nextPositionBtn.disabled = !scrollPositions.hasNext;
        nextPositionBtn.style.opacity = scrollPositions.hasNext ? '1' : '0.5';
    }
    // Update title with position count
    const titleEl = scrollSection?.querySelector('.settings-title');
    if (titleEl) {
        titleEl.textContent = `Scroll History (${scrollPositions.currentIndex + 1} of ${scrollPositions.total})`;
    }
}
async function loadStatus() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id)
            return;
        const url = tab.url || '';
        if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
            url.startsWith('edge://') || url.startsWith('about:') || url === '') {
            return;
        }
        try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'get_status' });
            if (response?.success) {
                updateConnectionStatus(response.eegConnected ?? false, response.backendConnected ?? false);
                if (response.alwaysSpawn !== undefined) {
                    alwaysSpawnToggle.checked = response.alwaysSpawn;
                }
                if (response.visible !== undefined) {
                    showDuckToggle.checked = response.visible;
                }
                if (response.scrollPositions !== undefined) {
                    updateScrollHistoryUI(response.scrollPositions);
                }
            }
        }
        catch (error) {
            // Content script not loaded yet
            console.log('Content script not loaded');
        }
    }
    catch (error) {
        console.error('Error loading status:', error);
    }
}
async function sendMessage(action, value) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
            showStatus('No active tab found', true);
            return;
        }
        // Check if we can inject content scripts on this page
        const url = tab.url || '';
        if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
            url.startsWith('edge://') || url.startsWith('about:') || url === '') {
            showStatus('Cannot run on browser internal pages', true);
            return;
        }
        // Try to send message
        try {
            const message = { action };
            if (value !== undefined) {
                message.value = value;
            }
            const response = await chrome.tabs.sendMessage(tab.id, message);
            if (response?.success) {
                switch (action) {
                    case 'quack':
                        showStatus('Quack sent!');
                        break;
                    case 'set_duck_visible':
                        showStatus(`Duck ${value ? 'shown' : 'hidden'}!`);
                        if (response.visible !== undefined) {
                            showDuckToggle.checked = response.visible;
                        }
                        break;
                    case 'reconnect':
                        showStatus('Reconnecting to backend...');
                        break;
                    case 'set_always_spawn':
                        showStatus(`Always spawn: ${value ? 'ON' : 'OFF'}`);
                        break;
                }
                // Update status
                if (response.eegConnected !== undefined && response.backendConnected !== undefined) {
                    updateConnectionStatus(response.eegConnected, response.backendConnected);
                }
            }
            else {
                showStatus('Something went wrong', true);
            }
        }
        catch (error) {
            // Content script not ready, inject it manually
            console.log('Injecting content script...');
            try {
                // Check if chrome.scripting is available
                if (!chrome.scripting) {
                    showStatus('Scripting API not available. Refresh the page and try again.', true);
                    return;
                }
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['dist/content.js']
                });
                // Wait for script to initialize
                await new Promise(resolve => setTimeout(resolve, 500));
                // Try again
                try {
                    const message = { action };
                    if (value !== undefined) {
                        message.value = value;
                    }
                    const response = await chrome.tabs.sendMessage(tab.id, message);
                    if (response?.success) {
                        switch (action) {
                            case 'quack':
                                showStatus('Quack sent!');
                                break;
                            case 'set_duck_visible':
                                showStatus(`Duck ${value ? 'shown' : 'hidden'}!`);
                                if (response.visible !== undefined) {
                                    showDuckToggle.checked = response.visible;
                                }
                                break;
                            case 'reconnect':
                                showStatus('Reconnecting...');
                                break;
                            case 'set_always_spawn':
                                showStatus(`Always spawn: ${value ? 'ON' : 'OFF'}`);
                                break;
                        }
                        // Update status
                        if (response.eegConnected !== undefined && response.backendConnected !== undefined) {
                            updateConnectionStatus(response.eegConnected, response.backendConnected);
                        }
                    }
                    else {
                        showStatus('Failed to communicate', true);
                    }
                }
                catch (retryError) {
                    showStatus('Refresh the page and try again', true);
                }
            }
            catch (injectError) {
                console.error('Injection error:', injectError);
                showStatus('Cannot inject on this page. Try a different website.', true);
            }
        }
    }
    catch (error) {
        console.error('Error:', error);
        showStatus('Error: ' + error.message, true);
    }
}
// Event Listeners
quackBtn?.addEventListener('click', () => {
    sendMessage('quack');
});
showDuckToggle?.addEventListener('change', () => {
    sendMessage('set_duck_visible', showDuckToggle.checked);
});
reconnectBtn?.addEventListener('click', () => {
    sendMessage('reconnect');
});
alwaysSpawnToggle?.addEventListener('change', () => {
    sendMessage('set_always_spawn', alwaysSpawnToggle.checked);
});
prevPositionBtn?.addEventListener('click', () => {
    sendMessage('scroll_prev');
});
nextPositionBtn?.addEventListener('click', () => {
    sendMessage('scroll_next');
});
showAllPositionsBtn?.addEventListener('click', () => {
    sendMessage('scroll_show_all');
});
// Load status on popup open
loadStatus();
// Update status every 2 seconds
setInterval(loadStatus, 2000);
