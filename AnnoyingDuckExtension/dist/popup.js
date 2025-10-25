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
const attentionChart = document.getElementById('attentionChart');
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
function drawAttentionChart(history) {
    if (!attentionChart)
        return;
    const ctx = attentionChart.getContext('2d');
    if (!ctx)
        return;
    const width = attentionChart.width;
    const height = attentionChart.height;
    const padding = 10;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    if (!history || history.length === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No attention data yet', width / 2, height / 2);
        return;
    }
    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding + (plotHeight * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    // Map attention states to colors
    const getColor = (attention) => {
        switch (attention) {
            case 'focused': return '#4caf50';
            case 'neutral': return '#ffeb3b';
            case 'distracted': return '#ff9800';
            case 'drowsy': return '#f44336';
            default: return '#9e9e9e';
        }
    };
    // Draw line chart
    if (history.length > 1) {
        const xStep = plotWidth / (history.length - 1);
        for (let i = 0; i < history.length - 1; i++) {
            const x1 = padding + i * xStep;
            const x2 = padding + (i + 1) * xStep;
            const y1 = padding + plotHeight - (history[i].focusScore * plotHeight);
            const y2 = padding + plotHeight - (history[i + 1].focusScore * plotHeight);
            // Draw line segment
            ctx.strokeStyle = getColor(history[i].attention);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            // Draw point
            ctx.fillStyle = getColor(history[i].attention);
            ctx.beginPath();
            ctx.arc(x1, y1, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        // Draw last point
        const lastIdx = history.length - 1;
        const lastX = padding + lastIdx * xStep;
        const lastY = padding + plotHeight - (history[lastIdx].focusScore * plotHeight);
        ctx.fillStyle = getColor(history[lastIdx].attention);
        ctx.beginPath();
        ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    // Draw current attention state text
    const current = history[history.length - 1];
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`${current.attention} (${Math.round(current.focusScore * 100)}%)`, padding, padding + 12);
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
                if (response.attentionHistory !== undefined) {
                    drawAttentionChart(response.attentionHistory);
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
