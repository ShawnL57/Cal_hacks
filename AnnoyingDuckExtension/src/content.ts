type MessageAction = 'quack' | 'set_duck_visible' | 'reconnect' | 'get_status' | 'set_always_spawn';

interface Message {
    action: MessageAction;
    value?: boolean;
}

interface DuckConfig {
    size: number;
    bounceHeight: number;
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

interface DuckMessage {
    message: string;
    timestamp: string;
    type: string;
    focus_state?: 'focused' | 'unfocused';
}

interface ScrollPosition {
    url: string;
    scrollY: number;
    timestamp: string;
    message: string;
}

class AnnoyingDuck {
    private duckVisible: boolean = false;
    private duckElement: HTMLDivElement | null = null;
    private config: DuckConfig = {
        size: 100,
        bounceHeight: 20,
        position: 'bottom-right'
    };
    private ws: WebSocket | null = null;
    private scrollPositions: ScrollPosition[] = [];
    private currentPositionIndex: number = -1;
    private readonly WEBSOCKET_URL = 'ws://127.0.0.1:3030/ws';
    private isUserFocused: boolean = true; // Track current focus state
    private isEEGConnected: boolean = false; // Track EEG connection status
    private isBackendConnected: boolean = false; // Track backend WebSocket connection
    private statusIndicator: HTMLDivElement | null = null;
    private alwaysSpawnDuck: boolean = false; // Setting: always spawn duck regardless of EEG

    constructor() {
        this.loadSettings();
        this.init();
        this.loadScrollPositions();
    }

    private init(): void {
        this.addStyles();
        this.setupMessageListener();
        this.connectWebSocket();
        this.setupKeyboardShortcuts();
        this.createStatusIndicator();
        // Don't auto-spawn duck - only spawn when backend sends unfocused message
    }

    private addStyles(): void {
        // Styles will be added dynamically when duck is created
    }

    private getRandomCorner(): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' {
        const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
        return corners[Math.floor(Math.random() * corners.length)];
    }

    private createDiagonalAnimation(corner: string): string {
        const animationName = `duck-walk-${corner}`;
        
        // Define start positions and transforms based on corner
        let startX, startY, endX, endY, flipTransform;
        
        switch(corner) {
            case 'top-left':
                startX = '-150px';
                startY = '-150px';
                endX = 'calc(50vw - 50px)';
                endY = 'calc(50vh - 50px)';
                flipTransform = '';  // Duck faces right
                break;
            case 'top-right':
                startX = 'calc(100vw + 150px)';
                startY = '-150px';
                endX = 'calc(50vw - 50px)';
                endY = 'calc(50vh - 50px)';
                flipTransform = 'scaleX(-1)';  // Duck faces left
                break;
            case 'bottom-left':
                startX = '-150px';
                startY = 'calc(100vh + 150px)';
                endX = 'calc(50vw - 50px)';
                endY = 'calc(50vh - 50px)';
                flipTransform = '';  // Duck faces right
                break;
            case 'bottom-right':
                startX = 'calc(100vw + 150px)';
                startY = 'calc(100vh + 150px)';
                endX = 'calc(50vw - 50px)';
                endY = 'calc(50vh - 50px)';
                flipTransform = 'scaleX(-1)';  // Duck faces left
                break;
            default:
                startX = '-150px';
                startY = 'calc(100vh + 150px)';
                endX = 'calc(50vw - 50px)';
                endY = 'calc(50vh - 50px)';
                flipTransform = '';
        }

        // Create the keyframe animation with fade out
        // Total animation: 7 seconds (5s walk + 2s fade)
        // Percentages: 0-71.4% (5s) = walk, 71.4-100% (2s) = fade
        const style = document.createElement('style');
        style.id = `duck-animation-${corner}`;
        style.textContent = `
            @keyframes ${animationName} {
                0% { 
                    left: ${startX}; 
                    top: ${startY};
                    transform: ${flipTransform};
                    opacity: 1;
                }
                71.4% { 
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

    private getPositionStyles(): string {
        const positions = {
            'bottom-right': 'bottom: 20px; right: 20px;',
            'bottom-left': 'bottom: 20px; left: 20px;',
            'top-right': 'top: 20px; right: 20px;',
            'top-left': 'top: 20px; left: 20px;'
        };
        return positions[this.config.position];
    }

    private createDuck(): void {
        if (this.duckElement) return;

        // Pick a random corner
        const corner = this.getRandomCorner();
        console.log(`[DUCK] Spawning from: ${corner}`);

        // Create the diagonal animation for this corner
        const animationName = this.createDiagonalAnimation(corner);

        this.duckElement = document.createElement('div');
        this.duckElement.id = 'annoying-duck';

        // Create an img element for the walking duck GIF
        const duckImg = document.createElement('img');
        duckImg.src = chrome.runtime.getURL('duck-walking.gif');
        duckImg.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: contain;
        `;

        this.duckElement.appendChild(duckImg);
        this.duckElement.style.cssText = `
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

        // Listen for animation end - but DON'T auto-restart
        // Duck should only spawn when backend sends unfocused message
        this.duckElement.addEventListener('animationend', () => {
            console.log('[DUCK] Animation ended');
            // Just remove the duck after animation, don't restart
            this.removeDuck();
        });

        document.body.appendChild(this.duckElement);
        this.duckVisible = true;
    }

    private removeDuck(): void {
        if (this.duckElement) {
            this.duckElement.remove();
            this.duckElement = null;
            this.duckVisible = false;
        }
    }

    private animateQuack(): void {
        if (!this.duckElement) {
            this.createDuck();
        }

        if (this.duckElement) {
            const originalSize = this.config.size;
            this.duckElement.style.fontSize = `${originalSize * 1.5}px`;

            setTimeout(() => {
                if (this.duckElement) {
                    this.duckElement.style.fontSize = `${originalSize}px`;
                }
            }, 200);
        }
    }

    private toggleDuck(): void {
        if (this.duckVisible) {
            this.removeDuck();
        } else {
            this.createDuck();
        }
    }

    private setupMessageListener(): void {
        chrome.runtime.onMessage.addListener(
            (message: Message, sender, sendResponse) => {
                try {
                    switch (message.action) {
                        case 'quack':
                            // Create duck if not visible, then animate
                            if (!this.duckVisible) {
                                this.createDuck();
                            }
                            this.animateQuack();
                            sendResponse({
                                success: true,
                                action: 'quack',
                                eegConnected: this.isEEGConnected,
                                backendConnected: this.isBackendConnected,
                                visible: this.duckVisible
                            });
                            break;
                        case 'set_duck_visible':
                            if (message.value) {
                                this.createDuck();
                            } else {
                                this.removeDuck();
                            }
                            sendResponse({
                                success: true,
                                action: 'set_duck_visible',
                                visible: this.duckVisible,
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
                            sendResponse({
                                success: true,
                                eegConnected: this.isEEGConnected,
                                backendConnected: this.isBackendConnected,
                                alwaysSpawn: this.alwaysSpawnDuck,
                                visible: this.duckVisible
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
                        default:
                            sendResponse({ success: false, error: 'Unknown action' });
                    }
                } catch (error) {
                    sendResponse({ success: false, error: String(error) });
                }
                return true; // Keep the message channel open for async response
            }
        );
    }

    private reconnectWebSocket(): void {
        if (this.ws) {
            this.ws.close();
        }
        this.connectWebSocket();
    }

    private loadSettings(): void {
        try {
            const saved = localStorage.getItem('duck_settings');
            if (saved) {
                const settings = JSON.parse(saved);
                this.alwaysSpawnDuck = settings.alwaysSpawn ?? false;
                console.log('📂 Loaded settings:', settings);
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    private saveSettings(): void {
        try {
            const settings = {
                alwaysSpawn: this.alwaysSpawnDuck
            };
            localStorage.setItem('duck_settings', JSON.stringify(settings));
            console.log('💾 Saved settings:', settings);
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    private connectWebSocket(): void {
        console.log(`[WebSocket] Attempting connection to ${this.WEBSOCKET_URL}`);

        try {
            this.ws = new WebSocket(this.WEBSOCKET_URL);

            this.ws.onopen = () => {
                console.log('[WebSocket] ✅ Connected successfully');
                this.isBackendConnected = true;
                this.updateStatusIndicator();
            };

            this.ws.onmessage = (event) => {
                try {
                    const message: DuckMessage = JSON.parse(event.data);
                    console.log('📨 Message from backend:', message);
                    this.handleBackendMessage(message);
                } catch (error) {
                    console.error('❌ Failed to parse message:', error);
                }
            };

            this.ws.onerror = (error) => {
                console.error('[WebSocket] ❌ Connection error:', error);
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
        } catch (error) {
            console.error('[WebSocket] ❌ Failed to create WebSocket:', error);
            this.isBackendConnected = false;
            this.updateStatusIndicator();
            setTimeout(() => this.connectWebSocket(), 5000);
        }
    }

    private handleBackendMessage(message: DuckMessage): void {
        console.log('📩 Processing message:', {
            type: message.type,
            focus_state: message.focus_state,
            message: message.message,
            eegConnected: this.isEEGConnected,
            alwaysSpawn: this.alwaysSpawnDuck
        });

        // Handle connection status messages
        if (message.type === 'connection_status') {
            if (message.message.includes('Connected')) {
                console.log('✅ EEG connected');
                this.isEEGConnected = true;
                this.updateStatusIndicator();
                this.showNotification('✅ EEG Connected');
            } else if (message.message.includes('Disconnected')) {
                console.log('❌ EEG disconnected');
                this.isEEGConnected = false;
                this.updateStatusIndicator();
                this.showNotification('❌ EEG Disconnected - Please connect your Muse headset', 10000);
                this.removeDuck();
            }
            return;
        }

        // Only process focus state messages if EEG is connected OR always spawn is enabled
        if (!this.isEEGConnected && !this.alwaysSpawnDuck) {
            console.log('⚠️ Blocked: EEG not connected and always spawn disabled');
            return;
        }

        // Update focus state based on message
        if (message.focus_state === 'unfocused') {
            console.log('🔴 User unfocused - spawning duck');
            this.isUserFocused = false;
            this.saveCurrentScrollPosition(message.message);

            // Show duck when unfocused
            if (!this.duckVisible) {
                this.createDuck();
            } else {
                this.animateQuack();
            }

            this.showNotification(message.message);
        } else if (message.focus_state === 'focused') {
            console.log('🟢 User focused - removing duck');
            this.isUserFocused = true;
            this.removeDuck();
            this.showNotification('Focus restored! 🎯');
        }
    }

    private saveCurrentScrollPosition(message: string): void {
        const position: ScrollPosition = {
            url: window.location.href,
            scrollY: window.scrollY,
            timestamp: new Date().toISOString(),
            message: message
        };

        this.scrollPositions.push(position);
        this.currentPositionIndex = this.scrollPositions.length - 1;

        // Save to localStorage
        this.saveScrollPositions();

        console.log('💾 Saved scroll position:', position);
    }

    private loadScrollPositions(): void {
        try {
            const saved = localStorage.getItem('duck_scroll_positions');
            if (saved) {
                this.scrollPositions = JSON.parse(saved);
                console.log(`📂 Loaded ${this.scrollPositions.length} scroll positions`);
            }
        } catch (error) {
            console.error('Failed to load scroll positions:', error);
        }
    }

    private saveScrollPositions(): void {
        try {
            localStorage.setItem('duck_scroll_positions', JSON.stringify(this.scrollPositions));
        } catch (error) {
            console.error('Failed to save scroll positions:', error);
        }
    }

    private setupKeyboardShortcuts(): void {
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

    private navigateToPreviousPosition(): void {
        if (this.scrollPositions.length === 0) {
            this.showNotification('No saved positions');
            return;
        }

        // Find previous position on the current page
        const currentUrl = window.location.href;
        let index = this.currentPositionIndex - 1;

        while (index >= 0) {
            if (this.scrollPositions[index].url === currentUrl) {
                this.currentPositionIndex = index;
                this.scrollToPosition(this.scrollPositions[index]);
                return;
            }
            index--;
        }

        this.showNotification('No previous position on this page');
    }

    private navigateToNextPosition(): void {
        if (this.scrollPositions.length === 0) {
            this.showNotification('No saved positions');
            return;
        }

        // Find next position on the current page
        const currentUrl = window.location.href;
        let index = this.currentPositionIndex + 1;

        while (index < this.scrollPositions.length) {
            if (this.scrollPositions[index].url === currentUrl) {
                this.currentPositionIndex = index;
                this.scrollToPosition(this.scrollPositions[index]);
                return;
            }
            index++;
        }

        this.showNotification('No next position on this page');
    }

    private scrollToPosition(position: ScrollPosition): void {
        window.scrollTo({
            top: position.scrollY,
            behavior: 'smooth'
        });

        this.showNotification(`Scrolled to: ${position.message}`);
    }

    private showPositionsList(): void {
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
        title.textContent = '📍 Saved Scroll Positions';
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

    private createStatusIndicator(): void {
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
    }

    private updateStatusIndicator(): void {
        if (!this.statusIndicator) return;

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

    private showNotification(message: string, duration: number = 3000): void {
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