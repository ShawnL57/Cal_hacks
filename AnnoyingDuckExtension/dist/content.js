"use strict";
class AnnoyingDuck {
    constructor() {
        this.duckElements = []; // Track multiple ducks
        this.config = {
            size: 100,
            bounceHeight: 20,
            position: 'bottom-right'
        };
        this.ws = null;
        this.scrollPositions = [];
        this.currentPositionIndex = -1;
        this.WEBSOCKET_URL = 'ws://127.0.0.1:3030/ws';
        this.isUserFocused = true; // Track current focus state
        this.isEEGConnected = false; // Track EEG connection status
        this.isBackendConnected = false; // Track backend WebSocket connection
        this.statusIndicator = null;
        this.alwaysSpawnDuck = false; // Setting: always spawn duck regardless of EEG
        this.showDuckEnabled = true; // Setting: whether duck can be shown at all
        this.attentionHistory = []; // Last 2 minutes of attention data
        this.MAX_HISTORY_DURATION = 120000; // 2 minutes in ms
        // Sliding window for sustained focus detection
        this.focusWindow = [];
        this.WINDOW_MS = 3000; // 3 second sustained window
        this.FOCUS_THRESHOLD = 0.6; // Below this = unfocused
        this.lastFocusDropLoggedAt = 0;
        this.LOG_DEBOUNCE_MS = 5000; // Don't log same drop multiple times
        this.loadSettings();
        this.init();
        this.loadScrollPositions();
    }
    init() {
        this.addStyles();
        this.setupMessageListener();
        this.connectWebSocket();
        this.setupKeyboardShortcuts();
        this.createStatusIndicator();
        // Don't auto-spawn duck - only spawn when backend sends unfocused message
    }
    addStyles() {
        // Styles will be added dynamically when duck is created
    }
    getRandomSide() {
        const sides = ['top', 'bottom', 'left', 'right'];
        return sides[Math.floor(Math.random() * sides.length)];
    }
    createDiagonalAnimation(side) {
        const animationName = `duck-walk-${side}-${Date.now()}`;
        // Define start positions and transforms based on side
        let startX, startY, endX, endY, flipTransform;
        switch (side) {
            case 'top':
                // Random X position along top
                const topX = Math.random() * 80 + 10; // 10-90% of width
                startX = `${topX}vw`;
                startY = '-150px';
                endX = 'calc(50vw - 50px)';
                endY = 'calc(50vh - 50px)';
                flipTransform = topX > 50 ? 'scaleX(-1)' : '';
                break;
            case 'bottom':
                // Random X position along bottom
                const bottomX = Math.random() * 80 + 10;
                startX = `${bottomX}vw`;
                startY = 'calc(100vh + 150px)';
                endX = 'calc(50vw - 50px)';
                endY = 'calc(50vh - 50px)';
                flipTransform = bottomX > 50 ? 'scaleX(-1)' : '';
                break;
            case 'left':
                // Random Y position along left
                const leftY = Math.random() * 80 + 10;
                startX = '-150px';
                startY = `${leftY}vh`;
                endX = 'calc(50vw - 50px)';
                endY = 'calc(50vh - 50px)';
                flipTransform = ''; // Duck faces right
                break;
            case 'right':
                // Random Y position along right
                const rightY = Math.random() * 80 + 10;
                startX = 'calc(100vw + 150px)';
                startY = `${rightY}vh`;
                endX = 'calc(50vw - 50px)';
                endY = 'calc(50vh - 50px)';
                flipTransform = 'scaleX(-1)'; // Duck faces left
                break;
            default:
                startX = '-150px';
                startY = 'calc(50vh - 50px)';
                endX = 'calc(50vw - 50px)';
                endY = 'calc(50vh - 50px)';
                flipTransform = '';
        }
        // Create the keyframe animation with fade out
        // Total animation: 7 seconds (5s walk + 2s fade)
        // Percentages: 0-71.4% (5s) = walk, 71.4-100% (2s) = fade
        const style = document.createElement('style');
        style.id = animationName;
        style.textContent = `
            @keyframes ${animationName} {
                0% {
                    left: ${startX};
                    top: ${startY};
                    transform: ${flipTransform};
                    opacity: 1;
                }
                80% {
                    left: ${endX};
                    top: ${endY};
                    transform: ${flipTransform};
                    opacity: 1;
                }
                100% {
                    left: ${endX};
                    top: ${endY};
                    transform: ${flipTransform};
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
        return animationName;
    }
    getPositionStyles() {
        const positions = {
            'bottom-right': 'bottom: 20px; right: 20px;',
            'bottom-left': 'bottom: 20px; left: 20px;',
            'top-right': 'top: 20px; right: 20px;',
            'top-left': 'top: 20px; left: 20px;'
        };
        return positions[this.config.position];
    }
    createDuck() {
        // Always create a new duck - no limit!
        const side = this.getRandomSide();
        console.log(`[DUCK] Spawning from: ${side}`);
        const animationName = this.createDiagonalAnimation(side);
        const duckElement = document.createElement('div');
        duckElement.className = 'annoying-duck';
        // Create an img element for the walking duck GIF
        const duckImg = document.createElement('img');
        duckImg.src = chrome.runtime.getURL('duck-walking.gif');
        duckImg.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: contain;
        `;
        duckElement.appendChild(duckImg);
        duckElement.style.cssText = `
            position: fixed;
            left: 0;
            top: 0;
            width: ${this.config.size}px;
            height: ${this.config.size}px;
            z-index: 999999;
            cursor: pointer;
            animation: ${animationName} 4s linear forwards;
            user-select: none;
        `;
        // Remove this specific duck after animation
        duckElement.addEventListener('animationend', () => {
            console.log('[DUCK] Animation ended, removing duck');
            duckElement.remove();
            const index = this.duckElements.indexOf(duckElement);
            if (index > -1)
                this.duckElements.splice(index, 1);
        });
        document.body.appendChild(duckElement);
        this.duckElements.push(duckElement);
    }
    removeAllDucks() {
        this.duckElements.forEach(duck => duck.remove());
        this.duckElements = [];
    }
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            try {
                switch (message.action) {
                    case 'quack':
                        // Always create a new duck
                        this.createDuck();
                        sendResponse({
                            success: true,
                            action: 'quack',
                            eegConnected: this.isEEGConnected,
                            backendConnected: this.isBackendConnected,
                            visible: this.duckElements.length > 0
                        });
                        break;
                    case 'set_duck_visible':
                        this.showDuckEnabled = message.value ?? true;
                        this.saveSettings();
                        // If disabling, remove all ducks immediately
                        if (!this.showDuckEnabled) {
                            this.removeAllDucks();
                        }
                        console.log(`[Settings] Show Duck: ${this.showDuckEnabled ? 'ON' : 'OFF'}`);
                        sendResponse({
                            success: true,
                            action: 'set_duck_visible',
                            visible: this.showDuckEnabled,
                            eegConnected: this.isEEGConnected,
                            backendConnected: this.isBackendConnected
                        });
                        break;
                    case 'reconnect':
                        this.reconnectWebSocket();
                        sendResponse({
                            success: true,
                            action: 'reconnect',
                            eegConnected: this.isEEGConnected,
                            backendConnected: this.isBackendConnected
                        });
                        break;
                    case 'get_status':
                        const currentUrl = window.location.href;
                        const pagePositions = this.scrollPositions.filter(p => p.url === currentUrl);
                        sendResponse({
                            success: true,
                            eegConnected: this.isEEGConnected,
                            backendConnected: this.isBackendConnected,
                            alwaysSpawn: this.alwaysSpawnDuck,
                            visible: this.showDuckEnabled,
                            scrollPositions: {
                                total: pagePositions.length,
                                currentIndex: this.currentPositionIndex,
                                hasPrev: this.currentPositionIndex > 0,
                                hasNext: this.currentPositionIndex < pagePositions.length - 1
                            },
                            attentionHistory: this.attentionHistory
                        });
                        break;
                    case 'set_always_spawn':
                        this.alwaysSpawnDuck = message.value ?? false;
                        this.saveSettings();
                        sendResponse({
                            success: true,
                            eegConnected: this.isEEGConnected,
                            backendConnected: this.isBackendConnected,
                            alwaysSpawn: this.alwaysSpawnDuck
                        });
                        break;
                    case 'scroll_prev':
                        this.navigateToPreviousPosition();
                        sendResponse({ success: true });
                        break;
                    case 'scroll_next':
                        this.navigateToNextPosition();
                        sendResponse({ success: true });
                        break;
                    case 'scroll_show_all':
                        this.showPositionsList();
                        sendResponse({ success: true });
                        break;
                    case 'test_distraction':
                        // Manually log current position as if distraction was detected
                        const scrollPercent = this.getScrollPercent();
                        if (scrollPercent !== null) {
                            this.logFocusDrop(scrollPercent);
                            this.spawnDuckCue();
                            this.showNotification('Test: Position logged at ' + (scrollPercent * 100).toFixed(1) + '% scroll');
                        }
                        else {
                            this.showNotification('Test: Unable to get scroll position');
                        }
                        sendResponse({ success: true });
                        break;
                    default:
                        sendResponse({ success: false, error: 'Unknown action' });
                }
            }
            catch (error) {
                sendResponse({ success: false, error: String(error) });
            }
            return true; // Keep the message channel open for async response
        });
    }
    reconnectWebSocket() {
        if (this.ws) {
            this.ws.close();
        }
        this.connectWebSocket();
    }
    loadSettings() {
        try {
            const saved = localStorage.getItem('duck_settings');
            if (saved) {
                const settings = JSON.parse(saved);
                this.alwaysSpawnDuck = settings.alwaysSpawn ?? false;
                this.showDuckEnabled = settings.showDuck ?? true;
                console.log('[Settings] Loaded:', settings);
            }
        }
        catch (error) {
            console.error('Failed to load settings:', error);
        }
    }
    saveSettings() {
        try {
            const settings = {
                alwaysSpawn: this.alwaysSpawnDuck,
                showDuck: this.showDuckEnabled
            };
            localStorage.setItem('duck_settings', JSON.stringify(settings));
            console.log('[Settings] Saved:', settings);
        }
        catch (error) {
            console.error('Failed to save settings:', error);
        }
    }
    addAttentionData(attention, focusScore) {
        const now = Date.now();
        // Add new data point
        this.attentionHistory.push({
            timestamp: now,
            attention: attention,
            focusScore: focusScore
        });
        // Remove data older than 2 minutes
        const cutoff = now - this.MAX_HISTORY_DURATION;
        this.attentionHistory = this.attentionHistory.filter(d => d.timestamp > cutoff);
        // Also add to sliding focus window for sustained detection
        this.updateFocusWindow(focusScore);
    }
    updateFocusWindow(focusScore) {
        const now = Date.now();
        this.focusWindow.push({ score: focusScore, ts: now });
        // Remove data older than WINDOW_MS
        const cutoff = now - this.WINDOW_MS;
        this.focusWindow = this.focusWindow.filter(f => f.ts >= cutoff);
        // Check for sustained focus drop
        this.checkSustainedFocusDrop();
    }
    checkSustainedFocusDrop() {
        if (this.focusWindow.length === 0)
            return;
        // Calculate average focus over the window
        const avgFocus = this.focusWindow.reduce((sum, f) => sum + f.score, 0) / this.focusWindow.length;
        // If sustained drop below threshold
        if (avgFocus < this.FOCUS_THRESHOLD) {
            const now = Date.now();
            // Debounce to avoid duplicate logs
            if (now - this.lastFocusDropLoggedAt < this.LOG_DEBOUNCE_MS)
                return;
            const scrollPercent = this.getScrollPercent();
            if (scrollPercent !== null) {
                this.logFocusDrop(scrollPercent);
                this.spawnDuckCue();
                this.lastFocusDropLoggedAt = now;
                console.log(`[SUSTAINED DROP] Avg focus: ${(avgFocus * 100).toFixed(1)}% over ${this.WINDOW_MS}ms at scroll ${(scrollPercent * 100).toFixed(1)}%`);
            }
        }
    }
    getScrollPercent() {
        try {
            // Try to find PDF iframe first
            const iframes = document.querySelectorAll('iframe');
            for (const iframe of Array.from(iframes)) {
                try {
                    if (iframe.contentDocument) {
                        const viewerContainer = iframe.contentDocument.getElementById('viewerContainer');
                        if (viewerContainer) {
                            const scrollTop = viewerContainer.scrollTop;
                            const scrollHeight = viewerContainer.scrollHeight - viewerContainer.clientHeight;
                            if (scrollHeight > 0) {
                                return scrollTop / scrollHeight;
                            }
                        }
                    }
                }
                catch (e) {
                    // Cross-origin iframe, skip
                }
            }
        }
        catch (e) {
            console.error('[Scroll] Error accessing iframe:', e);
        }
        // Fallback to regular page scroll
        try {
            const el = document.scrollingElement || document.documentElement;
            const scrollHeight = el.scrollHeight - el.clientHeight;
            if (scrollHeight > 0) {
                return el.scrollTop / scrollHeight;
            }
        }
        catch (e) {
            console.error('[Scroll] Error accessing page scroll:', e);
        }
        return null;
    }
    logFocusDrop(scrollPercent) {
        const position = {
            url: window.location.href,
            scrollY: window.scrollY,
            timestamp: new Date().toISOString(),
            message: `Focus drop at ${(scrollPercent * 100).toFixed(1)}% scroll`
        };
        this.scrollPositions.push(position);
        this.currentPositionIndex = this.scrollPositions.length - 1;
        this.saveScrollPositions();
        console.log('[FOCUS DROP LOGGED]', position);
    }
    spawnDuckCue() {
        const cue = document.createElement('div');
        cue.innerText = '🦆';
        cue.style.cssText = `
            position: fixed;
            bottom: 10%;
            left: 5%;
            font-size: 32px;
            z-index: 2147483647;
            opacity: 0.8;
            pointer-events: none;
            animation: fadeInOut 3s ease-in-out;
        `;
        // Add fadeInOut animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: scale(0.5); }
                20% { opacity: 0.8; transform: scale(1); }
                80% { opacity: 0.8; transform: scale(1); }
                100% { opacity: 0; transform: scale(0.5); }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(cue);
        setTimeout(() => {
            if (document.body.contains(cue)) {
                cue.remove();
            }
        }, 3000);
    }
    connectWebSocket() {
        console.log(`[WebSocket] Attempting connection to ${this.WEBSOCKET_URL}`);
        try {
            this.ws = new WebSocket(this.WEBSOCKET_URL);
            this.ws.onopen = () => {
                console.log('[WebSocket] Connected successfully');
                this.isBackendConnected = true;
                this.updateStatusIndicator();
            };
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    console.log('📨 Message from backend:', message);
                    this.handleBackendMessage(message);
                }
                catch (error) {
                    console.error('Failed to parse message:', error);
                }
            };
            this.ws.onerror = (error) => {
                console.error('[WebSocket] Connection error:', error);
                console.error('[WebSocket] Check if Tauri app is running: npm run tauri dev');
                this.isBackendConnected = false;
                this.updateStatusIndicator();
            };
            this.ws.onclose = (event) => {
                console.log(`[WebSocket] Closed (code: ${event.code}, clean: ${event.wasClean})`);
                console.log('[WebSocket] Reconnecting in 5s...');
                this.isBackendConnected = false;
                this.updateStatusIndicator();
                setTimeout(() => this.connectWebSocket(), 5000);
            };
        }
        catch (error) {
            console.error('[WebSocket] Failed to create WebSocket:', error);
            this.isBackendConnected = false;
            this.updateStatusIndicator();
            setTimeout(() => this.connectWebSocket(), 5000);
        }
    }
    handleBackendMessage(message) {
        console.log('Processing message:', {
            type: message.type,
            focus_state: message.focus_state,
            message: message.message,
            eegConnected: this.isEEGConnected,
            alwaysSpawn: this.alwaysSpawnDuck
        });
        // Track attention data if metrics are present
        if (message.metrics?.attention && message.metrics?.focus_score !== undefined) {
            this.addAttentionData(message.metrics.attention, message.metrics.focus_score);
        }
        // Handle connection status messages
        if (message.type === 'connection_status') {
            if (message.message.includes('Connected')) {
                console.log('EEG connected');
                this.isEEGConnected = true;
                this.updateStatusIndicator();
                this.showNotification('EEG Connected');
            }
            else if (message.message.includes('Disconnected')) {
                console.log('EEG disconnected');
                this.isEEGConnected = false;
                this.updateStatusIndicator();
                this.showNotification('EEG Disconnected - Please connect your Muse headset', 10000);
                this.removeAllDucks();
            }
            return;
        }
        // Check if duck is enabled
        if (!this.showDuckEnabled) {
            console.log('Blocked: Show Duck is disabled in settings');
            return;
        }
        // Only process focus state messages if EEG is connected OR always spawn is enabled
        if (!this.isEEGConnected && !this.alwaysSpawnDuck) {
            console.log('Blocked: EEG not connected and always spawn disabled');
            return;
        }
        // Update focus state based on message
        if (message.focus_state === 'unfocused') {
            console.log('User unfocused - spawning duck');
            this.isUserFocused = false;
            this.saveCurrentScrollPosition(message.message);
            // Always spawn a new duck
            this.createDuck();
            this.showNotification(message.message);
        }
        else if (message.focus_state === 'focused') {
            console.log('User focused - removing all ducks');
            this.isUserFocused = true;
            this.removeAllDucks();
            this.showNotification('Focus restored!');
        }
    }
    saveCurrentScrollPosition(message) {
        const position = {
            url: window.location.href,
            scrollY: window.scrollY,
            timestamp: new Date().toISOString(),
            message: message
        };
        this.scrollPositions.push(position);
        this.currentPositionIndex = this.scrollPositions.length - 1;
        // Save to localStorage
        this.saveScrollPositions();
        console.log('Saved scroll position:', position);
    }
    loadScrollPositions() {
        try {
            const saved = localStorage.getItem('duck_scroll_positions');
            if (saved) {
                this.scrollPositions = JSON.parse(saved);
                console.log(`Loaded ${this.scrollPositions.length} scroll positions`);
            }
        }
        catch (error) {
            console.error('Failed to load scroll positions:', error);
        }
    }
    saveScrollPositions() {
        try {
            localStorage.setItem('duck_scroll_positions', JSON.stringify(this.scrollPositions));
        }
        catch (error) {
            console.error('Failed to save scroll positions:', error);
        }
    }
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Alt + Left Arrow: Go to previous scroll position
            if (e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                this.navigateToPreviousPosition();
            }
            // Alt + Right Arrow: Go to next scroll position
            else if (e.altKey && e.key === 'ArrowRight') {
                e.preventDefault();
                this.navigateToNextPosition();
            }
            // Alt + L: List all saved positions
            else if (e.altKey && e.key === 'l') {
                e.preventDefault();
                this.showPositionsList();
            }
        });
    }
    navigateToPreviousPosition() {
        if (this.scrollPositions.length === 0) {
            this.showNotification('No saved positions');
            return;
        }
        // Find positions on current page
        const currentUrl = window.location.href;
        const pagePositions = this.scrollPositions
            .map((pos, idx) => ({ pos, idx }))
            .filter(item => item.pos.url === currentUrl);
        if (pagePositions.length === 0) {
            this.showNotification('No positions saved on this page');
            return;
        }
        // Find current position in the filtered list
        let currentIdx = pagePositions.findIndex(item => item.idx === this.currentPositionIndex);
        // If not found or at the beginning, wrap to end
        if (currentIdx <= 0) {
            currentIdx = pagePositions.length - 1;
        }
        else {
            currentIdx--;
        }
        this.currentPositionIndex = pagePositions[currentIdx].idx;
        this.scrollToPosition(pagePositions[currentIdx].pos);
        console.log(`[SCROLL] Navigating to position ${currentIdx + 1}/${pagePositions.length}`);
    }
    navigateToNextPosition() {
        if (this.scrollPositions.length === 0) {
            this.showNotification('No saved positions');
            return;
        }
        // Find positions on current page
        const currentUrl = window.location.href;
        const pagePositions = this.scrollPositions
            .map((pos, idx) => ({ pos, idx }))
            .filter(item => item.pos.url === currentUrl);
        if (pagePositions.length === 0) {
            this.showNotification('No positions saved on this page');
            return;
        }
        // Find current position in the filtered list
        let currentIdx = pagePositions.findIndex(item => item.idx === this.currentPositionIndex);
        // If not found or at the end, wrap to beginning
        if (currentIdx === -1 || currentIdx >= pagePositions.length - 1) {
            currentIdx = 0;
        }
        else {
            currentIdx++;
        }
        this.currentPositionIndex = pagePositions[currentIdx].idx;
        this.scrollToPosition(pagePositions[currentIdx].pos);
        console.log(`[SCROLL] Navigating to position ${currentIdx + 1}/${pagePositions.length}`);
    }
    scrollToPosition(position) {
        console.log(`[SCROLL] Scrolling to Y=${position.scrollY}px`);
        window.scrollTo({
            top: position.scrollY,
            behavior: 'smooth'
        });
        this.showNotification(`Position ${this.currentPositionIndex + 1}: ${position.message}`);
    }
    showPositionsList() {
        const currentUrl = window.location.href;
        const pagePositions = this.scrollPositions.filter(p => p.url === currentUrl);
        if (pagePositions.length === 0) {
            this.showNotification('No saved positions on this page');
            return;
        }
        // Create overlay with list
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.95);
            color: white;
            padding: 20px;
            border-radius: 10px;
            max-height: 80vh;
            overflow-y: auto;
            z-index: 1000000;
            min-width: 400px;
            font-family: monospace;
        `;
        const title = document.createElement('h3');
        title.textContent = 'Saved Scroll Positions';
        title.style.cssText = 'margin: 0 0 15px 0; color: #00ff00;';
        overlay.appendChild(title);
        pagePositions.forEach((pos, idx) => {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 10px;
                margin: 5px 0;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 5px;
                cursor: pointer;
                transition: background 0.2s;
            `;
            item.innerHTML = `
                <div style="font-weight: bold; color: #00ff00;">${idx + 1}. ${pos.message}</div>
                <div style="font-size: 12px; color: #999;">Scroll: ${pos.scrollY}px | ${new Date(pos.timestamp).toLocaleString()}</div>
            `;
            item.addEventListener('mouseenter', () => {
                item.style.background = 'rgba(255, 255, 255, 0.2)';
            });
            item.addEventListener('mouseleave', () => {
                item.style.background = 'rgba(255, 255, 255, 0.1)';
            });
            item.addEventListener('click', () => {
                this.scrollToPosition(pos);
                document.body.removeChild(overlay);
            });
            overlay.appendChild(item);
        });
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close (ESC)';
        closeBtn.style.cssText = `
            margin-top: 15px;
            padding: 8px 16px;
            background: #ff3333;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            width: 100%;
        `;
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });
        overlay.appendChild(closeBtn);
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
                document.removeEventListener('keydown', escHandler);
            }
        });
        document.body.appendChild(overlay);
    }
    createStatusIndicator() {
        this.statusIndicator = document.createElement('div');
        this.statusIndicator.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 10px 14px;
            border-radius: 8px;
            z-index: 999997;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;
        document.body.appendChild(this.statusIndicator);
        this.updateStatusIndicator();
        this.createNavigationButtons();
    }
    createNavigationButtons() {
        const navContainer = document.createElement('div');
        navContainer.style.cssText = `
            position: fixed;
            top: 60px;
            left: 10px;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 8px;
            border-radius: 8px;
            z-index: 999997;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;
        const btnStyle = `
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
            padding: 6px 12px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 11px;
            transition: all 0.2s;
        `;
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '← Prev';
        prevBtn.style.cssText = btnStyle;
        prevBtn.onclick = () => this.navigateToPreviousPosition();
        prevBtn.onmouseenter = () => prevBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        prevBtn.onmouseleave = () => prevBtn.style.background = 'rgba(255, 255, 255, 0.1)';
        const allBtn = document.createElement('button');
        allBtn.textContent = 'View All';
        allBtn.style.cssText = btnStyle;
        allBtn.onclick = () => this.showPositionsList();
        allBtn.onmouseenter = () => allBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        allBtn.onmouseleave = () => allBtn.style.background = 'rgba(255, 255, 255, 0.1)';
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Next →';
        nextBtn.style.cssText = btnStyle;
        nextBtn.onclick = () => this.navigateToNextPosition();
        nextBtn.onmouseenter = () => nextBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        nextBtn.onmouseleave = () => nextBtn.style.background = 'rgba(255, 255, 255, 0.1)';
        navContainer.appendChild(prevBtn);
        navContainer.appendChild(allBtn);
        navContainer.appendChild(nextBtn);
        document.body.appendChild(navContainer);
    }
    updateStatusIndicator() {
        if (!this.statusIndicator)
            return;
        const eegDot = this.isEEGConnected
            ? '<span style="color: #4caf50;">●</span>'
            : '<span style="color: #f44336;">●</span>';
        const backendDot = this.isBackendConnected
            ? '<span style="color: #4caf50;">●</span>'
            : '<span style="color: #f44336;">●</span>';
        this.statusIndicator.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px;">
                ${eegDot} <span style="opacity: 0.9;">EEG</span>
            </div>
            <div style="opacity: 0.3;">|</div>
            <div style="display: flex; align-items: center; gap: 6px;">
                ${backendDot} <span style="opacity: 0.9;">Backend</span>
            </div>
        `;
    }
    showNotification(message, duration = 3000) {
        const notification = document.createElement('div');
        notification.textContent = `[DUCK] ${message}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.9);
            color: #00ff00;
            padding: 15px 20px;
            border-radius: 5px;
            z-index: 999998;
            font-family: monospace;
            font-size: 14px;
            animation: slideIn 0.3s ease-out;
            max-width: 400px;
        `;
        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.style.transition = 'opacity 0.3s';
            notification.style.opacity = '0';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, duration);
    }
}
// Initialize the duck when the script loads
new AnnoyingDuck();
