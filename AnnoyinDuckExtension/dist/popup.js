"use strict";
const quackBtn = document.getElementById('quackBtn');
const toggleBtn = document.getElementById('toggleBtn');
const statusDiv = document.createElement('div');
statusDiv.style.cssText = 'margin-top: 10px; font-size: 12px; color: #666;';
document.body.appendChild(statusDiv);
function showStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.style.color = isError ? '#d32f2f' : '#2e7d32';
    setTimeout(() => {
        statusDiv.textContent = '';
    }, 3000);
}
async function sendMessage(action) {
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
            const response = await chrome.tabs.sendMessage(tab.id, { action });
            if (response?.success) {
                showStatus(action === 'quack' ? '🦆 Quack sent!' : `🦆 Duck ${response.visible ? 'shown' : 'hidden'}!`);
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
                await new Promise(resolve => setTimeout(resolve, 300));
                // Try again
                try {
                    const response = await chrome.tabs.sendMessage(tab.id, { action });
                    if (response?.success) {
                        showStatus(action === 'quack' ? '🦆 Quack sent!' : `🦆 Duck ${response.visible ? 'shown' : 'hidden'}!`);
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
quackBtn?.addEventListener('click', () => {
    sendMessage('quack');
});
toggleBtn?.addEventListener('click', () => {
    sendMessage('toggle');
});
