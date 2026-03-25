class GameEngine {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.handCanvas = document.getElementById('handCanvas');
        this.handCtx = this.handCanvas.getContext('2d');
        this.videoElement = document.getElementById('videoElement');
        
        this.gameState = 'menu';
        this.score = 0;
        this.lives = 3;
        this.timer = 0;
        this.combo = 0;
        this.lastGestureTime = 0;
        
        this.player = { x: 0, y: 0, size: 30, color: '#00ff88', shield: false, shieldTime: 0 };
        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        this.stars = [];
        
        this.handX = 0;
        this.handY = 0;
        this.currentGesture = 'Əl gözlənilir...';
        this.handDetected = false;
        this.cameraActive = false;
        
        this.init();
    }

    init() {
        this.setupCanvas();
        this.setupMediaPipe();
        this.setupEvents();
        this.createStars();
        this.gameLoop();
    }

    setupCanvas() {
        const resize = () => {
            const container = this.canvas.parentElement;
            const videoContainer = this.videoElement.parentElement;
            
            this.canvas.width = container.offsetWidth;
            this.canvas.height = container.offsetHeight;
            this.handCanvas.width = videoContainer.offsetWidth;
            this.handCanvas.height = videoContainer.offsetHeight;
            
            this.player.x = this.canvas.width / 2;
            this.player.y = this.canvas.height - 100;
        };
        
        resize();
        window.addEventListener('resize', resize);
    }

    setupMediaPipe() {
        this.hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.hands.onResults((results) => this.processHandData(results));
    }

    async startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: 640, 
                    height: 480,
                    facingMode: 'user'
                } 
            });
            
            this.videoElement.srcObject = stream;
            
            this.camera = new Camera(this.videoElement, {
                onFrame: async () => {
                    if (this.cameraActive) {
                        await this.hands.send({ image: this.videoElement });
                    }
                },
                width: 640,
                height: 480
            });
            
            this.camera.start();
            this.cameraActive = true;
            this.updateCameraStatus('active');
            console.log('Kamera uğurla başladıldı');
        } catch (error) {
            console.error('Kamera xətası:', error);
            this.updateCameraStatus('error');
            alert('Kamera açılmadı. Zəhmət olmasa kamera icazəsi verin və yenidən cəhd edin.');
        }
    }

    processHandData(results) {
        this.handCtx.clearRect(0, 0, this.handCanvas.width, this.handCanvas.height);
        
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            this.handDetected = true;
            
            this.drawHand(landmarks);
            
            const palmX = landmarks[0].x;
            const palmY = landmarks[0].y;
            
            // Əl mövqeyini tam ekran koordinatlarına çevir
            this.handX = palmX * this.canvas.width;
            this.handY = palmY * this.canvas.height;
            
            // Əlin kamera çərçivəsindəki mövqeyini də saxla
            this.handCameraX = palmX * this.handCanvas.width;
            this.handCameraY = palmY * this.handCanvas.height;
            
            this.detectGesture(landmarks);
            
            if (this.gameState === 'playing') {
                this.movePlayer(this.handX, this.handY);
            }
        } else {
            this.handDetected = false;
            this.currentGesture = 'Əl gözlənilir...';
            this.updateGestureDisplay();
        }
    }

    drawHand(landmarks) {
        const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],
            [0, 5], [5, 6], [6, 7], [7, 8],
            [5, 9], [9, 10], [10, 11], [11, 12],
            [9, 13], [13, 14], [14, 15], [15, 16],
            [13, 17], [17, 18], [18, 19], [19, 20],
            [0, 17]
        ];

        this.handCtx.strokeStyle = '#00ff88';
        this.handCtx.lineWidth = 3;
        this.handCtx.lineCap = 'round';
        
        connections.forEach(([start, end]) => {
            const startPt = landmarks[start];
            const endPt = landmarks[end];
            
            this.handCtx.beginPath();
            this.handCtx.moveTo(startPt.x * this.handCanvas.width, startPt.y * this.handCanvas.height);
            this.handCtx.lineTo(endPt.x * this.handCanvas.width, endPt.y * this.handCanvas.height);
            this.handCtx.stroke();
        });

        landmarks.forEach((landmark, index) => {
            const x = landmark.x * this.handCanvas.width;
            const y = landmark.y * this.handCanvas.height;
            
            // Barmaq ucları daha böyük və parlaq
            if (index === 0) {
                this.handCtx.fillStyle = '#ff0088';
                this.handCtx.beginPath();
                this.handCtx.arc(x, y, 8, 0, 2 * Math.PI);
                this.handCtx.fill();
            } else if ([4, 8, 12, 16, 20].includes(index)) {
                this.handCtx.fillStyle = '#ffff00';
                this.handCtx.beginPath();
                this.handCtx.arc(x, y, 6, 0, 2 * Math.PI);
                this.handCtx.fill();
            } else {
                this.handCtx.fillStyle = '#00ff88';
                this.handCtx.beginPath();
                this.handCtx.arc(x, y, 4, 0, 2 * Math.PI);
                this.handCtx.fill();
            }
        });
        
        // Əlin mərkəzində kiçik dairə
        const palmX = landmarks[0].x * this.handCanvas.width;
        const palmY = landmarks[0].y * this.handCanvas.height;
        this.handCtx.strokeStyle = '#ff0000';
        this.handCtx.lineWidth = 2;
        this.handCtx.beginPath();
        this.handCtx.arc(palmX, palmY, 15, 0, 2 * Math.PI);
        this.handCtx.stroke();
    }

    detectGesture(landmarks) {
        const now = Date.now();
        if (now - this.lastGestureTime < 300) return;
        
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];
        const ringTip = landmarks[16];
        const pinkyTip = landmarks[20];
        const wrist = landmarks[0];
        
        const fingersExtended = [
            thumbTip.y < wrist.y,
            indexTip.y < wrist.y,
            middleTip.y < wrist.y,
            ringTip.y < wrist.y,
            pinkyTip.y < wrist.y
        ].filter(Boolean).length;
        
        if (fingersExtended >= 4) {
            this.currentGesture = '✋ Açıq Əl';
            if (this.gameState === 'playing') this.shoot();
            this.lastGestureTime = now;
        } else if (fingersExtended <= 1) {
            this.currentGesture = '👊 Qapalı Əl';
            if (this.gameState === 'playing') this.activateShield();
        } else if (fingersExtended === 2) {
            this.currentGesture = '☝️ Barmaq';
            if (this.gameState === 'playing') this.specialAttack();
            this.lastGestureTime = now;
        } else {
            this.currentGesture = '🖐️ Yarı Açıq';
        }
        
        this.updateGestureDisplay();
    }

    createStars() {
        for (let i = 0; i < 100; i++) {
            this.stars.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 2,
                speed: Math.random() * 0.5 + 0.1,
                opacity: Math.random() * 0.8 + 0.2
            });
        }
    }

    movePlayer(x, y) {
        const targetX = this.canvas.width - x;
        const targetY = Math.min(y, this.canvas.height - 50);
        
        this.player.x += (targetX - this.player.x) * 0.25;
        this.player.y += (targetY - this.player.y) * 0.25;
        
        // Sərhədləri yoxla
        if (this.player.x < this.player.size) this.player.x = this.player.size;
        if (this.player.x > this.canvas.width - this.player.size) this.player.x = this.canvas.width - this.player.size;
        if (this.player.y < this.player.size) this.player.y = this.player.size;
        if (this.player.y > this.canvas.height - this.player.size) this.player.y = this.canvas.height - this.player.size;
    }

    shoot() {
        this.bullets.push({
            x: this.player.x,
            y: this.player.y - this.player.size,
            vx: 0,
            vy: -15,
            size: 6,
            color: '#00ff88'
        });
    }

    activateShield() {
        this.player.shield = true;
        this.player.shieldTime = 180;
    }

    specialAttack() {
        for (let i = -2; i <= 2; i++) {
            this.bullets.push({
                x: this.player.x,
                y: this.player.y - this.player.size,
                vx: i * 2,
                vy: -8,
                size: 6,
                color: '#ff00ff'
            });
        }
        
        this.createExplosion(this.player.x, this.player.y, '#ff00ff', 20);
    }

    spawnEnemy() {
        if (Math.random() < 0.002 && this.enemies.length < 4) {
            this.enemies.push({
                x: Math.random() * this.canvas.width,
                y: -30,
                vx: (Math.random() - 0.5) * 0.3,
                vy: Math.random() * 0.3 + 0.2,
                size: 30 + Math.random() * 10,
                color: '#ff4444',
                health: 1
            });
        }
    }

    createExplosion(x, y, color, count = 15) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const velocity = Math.random() * 5 + 2;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * velocity,
                vy: Math.sin(angle) * velocity,
                size: Math.random() * 4 + 2,
                color: color,
                life: 30
            });
        }
    }

    update() {
        if (this.gameState !== 'playing') return;
        
        this.timer++;
        if (this.timer % 60 === 0) {
            document.getElementById('timer').textContent = Math.floor(this.timer / 60);
        }
        
        this.stars.forEach(star => {
            star.y += star.speed;
            if (star.y > this.canvas.height) {
                star.y = 0;
                star.x = Math.random() * this.canvas.width;
            }
        });
        
        if (this.player.shieldTime > 0) {
            this.player.shieldTime--;
            if (this.player.shieldTime === 0) {
                this.player.shield = false;
            }
        }
        
        this.bullets = this.bullets.filter(bullet => {
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            return bullet.y > -10 && bullet.x > -10 && bullet.x < this.canvas.width + 10;
        });
        
        this.enemies = this.enemies.filter(enemy => {
            enemy.x += enemy.vx;
            enemy.y += enemy.vy;
            
            if (enemy.x <= enemy.size || enemy.x >= this.canvas.width - enemy.size) {
                enemy.vx *= -1;
            }
            
            return enemy.y < this.canvas.height + 30;
        });
        
        this.particles = this.particles.filter(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vx *= 0.98;
            particle.vy *= 0.98;
            particle.life--;
            return particle.life > 0;
        });
        
        this.spawnEnemy();
        this.checkCollisions();
    }

    checkCollisions() {
        this.bullets.forEach((bullet, bulletIndex) => {
            this.enemies.forEach((enemy, enemyIndex) => {
                const dx = bullet.x - enemy.x;
                const dy = bullet.y - enemy.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < bullet.size + enemy.size) {
                    this.createExplosion(enemy.x, enemy.y, enemy.color);
                    this.enemies.splice(enemyIndex, 1);
                    this.bullets.splice(bulletIndex, 1);
                    this.score += 20;
                    this.combo++;
                    this.updateScore();
                }
            });
        });
        
        if (!this.player.shield) {
            this.enemies.forEach((enemy, index) => {
                const dx = this.player.x - enemy.x;
                const dy = this.player.y - enemy.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < this.player.size + enemy.size) {
                    this.createExplosion(enemy.x, enemy.y, '#ff0000');
                    this.enemies.splice(index, 1);
                    this.lives--;
                    this.combo = 0;
                    this.updateScore();
                    
                    if (this.lives <= 0) {
                        this.endGame();
                    }
                }
            });
        }
    }

    updateScore() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('lives').textContent = this.lives;
        document.getElementById('combo').textContent = this.combo;
    }

    render() {
        this.ctx.fillStyle = 'rgba(10, 10, 10, 0.1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.stars.forEach(star => {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
        
        if (this.gameState === 'playing') {
            this.ctx.save();
            if (this.player.shield) {
                this.ctx.strokeStyle = '#00ffff';
                this.ctx.lineWidth = 3;
                this.ctx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.01) * 0.3;
                this.ctx.beginPath();
                this.ctx.arc(this.player.x, this.player.y, this.player.size + 10, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.globalAlpha = 1;
            }
            
            this.ctx.fillStyle = this.player.color;
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = this.player.color;
            this.ctx.beginPath();
            this.ctx.arc(this.player.x, this.player.y, this.player.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
            
            this.bullets.forEach(bullet => {
                this.ctx.fillStyle = bullet.color;
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = bullet.color;
                this.ctx.beginPath();
                this.ctx.arc(bullet.x, bullet.y, bullet.size, 0, Math.PI * 2);
                this.ctx.fill();
            });
            
            this.enemies.forEach(enemy => {
                this.ctx.fillStyle = enemy.color;
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = enemy.color;
                this.ctx.beginPath();
                this.ctx.arc(enemy.x, enemy.y, enemy.size, 0, Math.PI * 2);
                this.ctx.fill();
                
                if (enemy.health < 3) {
                    this.ctx.fillStyle = '#ff0000';
                    this.ctx.fillRect(enemy.x - 15, enemy.y - enemy.size - 10, 30, 3);
                    this.ctx.fillStyle = '#00ff00';
                    this.ctx.fillRect(enemy.x - 15, enemy.y - enemy.size - 10, 10 * enemy.health, 3);
                }
            });
        }
        
        this.particles.forEach(particle => {
            this.ctx.fillStyle = particle.color;
            this.ctx.globalAlpha = particle.life / 30;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1;
    }

    gameLoop() {
        this.update();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }

    startGame() {
        this.gameState = 'playing';
        this.score = 0;
        this.lives = 7;
        this.timer = 0;
        this.combo = 0;
        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        
        this.updateScore();
        this.hideOverlay();
        
        document.getElementById('startGame').disabled = true;
        document.getElementById('pauseGame').disabled = false;
    }

    pauseGame() {
        if (this.gameState === 'playing') {
            this.gameState = 'paused';
            this.showOverlay('⏸️ Fasilə', 'Oyun fasilədədir.', 'Davam et');
            document.getElementById('pauseGame').textContent = '▶️ Davam et';
        } else if (this.gameState === 'paused') {
            this.gameState = 'playing';
            this.hideOverlay();
            document.getElementById('pauseGame').textContent = '⏸️ Fasilə';
        }
    }

    resetGame() {
        this.gameState = 'menu';
        this.showOverlay('🎮 Hand Control Game', 'Əlinizi hərəkət etdirərək oyunu idarə edin!', 'Başla');
        document.getElementById('startGame').disabled = false;
        document.getElementById('pauseGame').disabled = true;
    }

    endGame() {
        this.gameState = 'gameOver';
        this.showOverlay('💀 Game Over', `Skor: ${this.score}`, 'Yenidən Başla');
        document.getElementById('startGame').disabled = false;
        document.getElementById('pauseGame').disabled = true;
    }

    showOverlay(title, message, buttonText) {
        const overlay = document.getElementById('gameOverlay');
        document.getElementById('overlayTitle').textContent = title;
        document.getElementById('overlayMessage').textContent = message;
        document.getElementById('overlayButton').textContent = buttonText;
        overlay.style.display = 'flex';
    }

    hideOverlay() {
        document.getElementById('gameOverlay').style.display = 'none';
    }

    updateGestureDisplay() {
        document.getElementById('currentGesture').textContent = this.currentGesture;
    }

    updateCameraStatus(status) {
        const statusElement = document.getElementById('cameraStatus');
        const statusText = {
            'active': 'Kamera: ✅ Aktiv',
            'inactive': 'Kamera: ❌ Qapalı',
            'error': 'Kamera: ❌ Xəta'
        };
        statusElement.textContent = statusText[status] || 'Kamera: Qoşulmur';
        statusElement.className = status === 'active' ? 'camera-status active' : 'camera-status';
    }

    setupEvents() {
        document.getElementById('startCamera').addEventListener('click', () => {
            if (this.cameraActive) {
                this.stopCamera();
                document.getElementById('startCamera').textContent = 'Kamera';
            } else {
                this.startCamera();
                document.getElementById('startCamera').textContent = 'Dayandır';
            }
        });

        // Mobile camera toggle
        const mobileCameraToggle = document.getElementById('mobileCameraToggle');
        if (mobileCameraToggle) {
            mobileCameraToggle.addEventListener('click', () => {
                if (this.cameraActive) {
                    this.stopCamera();
                    mobileCameraToggle.textContent = '📷';
                    mobileCameraToggle.classList.remove('active');
                } else {
                    this.startCamera();
                    mobileCameraToggle.textContent = '📵';
                    mobileCameraToggle.classList.add('active');
                }
            });
        }

        document.getElementById('startGame').addEventListener('click', () => this.startGame());
        document.getElementById('pauseGame').addEventListener('click', () => this.pauseGame());
        document.getElementById('resetGame').addEventListener('click', () => this.resetGame());
        document.getElementById('overlayButton').addEventListener('click', () => {
            if (this.gameState === 'menu') {
                this.startGame();
            } else if (this.gameState === 'paused') {
                this.pauseGame();
            } else if (this.gameState === 'gameOver') {
                this.resetGame();
            }
        });

        // Mouse controls (fallback)
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.gameState !== 'playing') return;
            
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.movePlayer(x, y);
        });

        this.canvas.addEventListener('click', () => {
            if (this.gameState === 'playing') {
                this.shoot();
            }
        });

        // Touch controls for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.gameState === 'playing') {
                this.shoot();
            }
        });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (this.gameState !== 'playing') return;
            
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches[0];
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            this.movePlayer(x, y);
        });

        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (this.gameState !== 'playing') return;
            
            switch(e.key) {
                case ' ':
                case 'Enter':
                    e.preventDefault();
                    this.shoot();
                    break;
                case 'Shift':
                    this.activateShield();
                    break;
                case 'x':
                case 'X':
                    this.specialAttack();
                    break;
            }
        });

        // Auto-start camera on page load
        setTimeout(() => {
            if (!this.cameraActive) {
                console.log('Kamera avtomatik başladılır...');
                this.startCamera();
            }
        }, 1000);
    }

    stopCamera() {
        if (this.camera) {
            this.camera.stop();
            this.cameraActive = false;
            this.updateCameraStatus('inactive');
        }
        
        if (this.videoElement.srcObject) {
            const tracks = this.videoElement.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            this.videoElement.srcObject = null;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const game = new GameEngine();
    document.getElementById('clientId').textContent = 'player_' + Math.random().toString(36).substr(2, 9);
});
