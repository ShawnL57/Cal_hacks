type MessageAction = 'quack' | 'toggle';

interface Message {
    action: MessageAction;
}

interface DuckConfig {
    size: number;
    bounceHeight: number;
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

class AnnoyingDuck {
    private duckVisible: boolean = false;
    private duckElement: HTMLDivElement | null = null;
    private config: DuckConfig = {
        size: 100,
        bounceHeight: 20,
        position: 'bottom-right'
    };

    constructor() {
        this.init();
    }

    private init(): void {
        this.addStyles();
        this.setupMessageListener();
        // Auto-show duck after 1 second
        setTimeout(() => this.createDuck(), 1000);
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
        console.log(`Duck starting from: ${corner}`);
        
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
        
        // Listen for animation end to restart with new random corner
        this.duckElement.addEventListener('animationend', () => {
            this.restartDuckAnimation();
        });
        
        document.body.appendChild(this.duckElement);
        this.duckVisible = true;
    }

    private restartDuckAnimation(): void {
        if (!this.duckElement) return;

        // Pick a new random corner
        const corner = this.getRandomCorner();
        console.log(`Duck restarting from: ${corner}`);
        
        // Create new animation for this corner
        const animationName = this.createDiagonalAnimation(corner);
        
        // Reset and apply new animation
        this.duckElement.style.animation = 'none';
        // Force reflow to restart animation
        void this.duckElement.offsetHeight;
        this.duckElement.style.animation = `${animationName} 4s linear forwards`;
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
                            this.animateQuack();
                            sendResponse({ success: true, action: 'quack' });
                            break;
                        case 'toggle':
                            this.toggleDuck();
                            sendResponse({ success: true, action: 'toggle', visible: this.duckVisible });
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
}

// Initialize the duck when the script loads
new AnnoyingDuck();