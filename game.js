/**
 * ============================================================================
 * 萌萌治愈消消乐 (Cozy Match-3 Game) - 极限生存倒计时与累计计分引擎
 * ============================================================================
 * 
 * 🎮 游戏模式规则：
 * 1. 取消目标分数与步数限制：纯粹的极速生存挑战，无限累计最高得分！
 * 2. 初始倒计时 15 秒：做出第一次移动后正式启动计时。
 * 3. 消除方块加时机制：每次消除根据消去的方块数量延长倒计时，多消与连锁连击大幅回血！
 * 4. 倒计时归零立即结束：倒计时到达 0 秒立即结算本局累计得分与生存时长。
 * 5. 特效合成与大面积消除：四连出直线、五连出同色、L/T出范围、十字出十字、双特效互换出超神大招！
 */

// ==========================================
// 1. 游戏配置中心 (Game Configuration)
// ==========================================
const CONFIG = {
  // 核心生存倒计时参数
  initialTime: 15.0,          // 初始倒计时：15 秒
  baseMatch3Time: 1.0,        // 普通 3 消基础加时：精确增加 1.0 秒
  extraTileTime: 0.18,        // 超过 3 个方块，每个额外方块边际增加的时间 (秒)
  comboTimeBonus: 0.2,        // 每次连击额外奖励的时间 (秒)
  maxStepTimeBonus: 4.0,      // 单次单步消除严格封顶时间上限：最多不超过 4.0 秒
  maxTime: 60.0,              // 倒计时能量槽上限 (秒，防止无限溢出)
  gridSize: 16,               // 棋盘大小：16 × 16 (支持切换 8, 10, 12, 16)
  matchMin: 3,                // 消除最少连续数量：3 个及以上

  // 4 张方块图案素材 (使用相对路径，纯网页开箱即玩)
  tileImages: [
    './assets/images/tile1.jpg',
    './assets/images/tile2.jpg',
    './assets/images/tile3.jpg',
    './assets/images/tile4.jpg'
  ],

  // 计分规则 (累计得分)
  scorePerTile: 10,           // 每个被消除方块的基础得分
  bonus4: 30,                 // 4连消额外奖励分
  bonus5: 80,                 // 5连消额外奖励分
  comboMultiplierStep: 0.5,   // 连击倍率增长步长 (x1.0, x1.5, x2.0...)

  // 动画与交互时长 (毫秒)
  swapDuration: 220,          // 交换动画时长
  matchDuration: 340,         // 消除爆破动画时长
  dropDuration: 260,          // 补位掉落动画时长
  idleHintDelay: 5000         // 发呆多少毫秒后自动触发闪烁提示 (5秒)
};

// ==========================================
// 2. 音效合成器 (Web Audio API Synthesizer)
// ==========================================
class SoundSynthesizer {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  // 选中音效：轻柔水滴叮声
  playSelect() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(560, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  // 交换滑动音效：柔和微风轻响
  playSwap() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(540, now + 0.12);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.14);
  }

  // 无效移动弹回音效：低沉轻弹
  playInvalid() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.16);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.18);
  }

  // 消除晶莹音效：随连击升高音调的八音盒和弦
  playMatch(combo = 1) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5];
    const baseFreq = notes[Math.min(combo - 1, notes.length - 1)];

    const now = this.ctx.currentTime;
    [baseFreq, baseFreq * 1.5].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);

      gain.gain.setValueAtTime(0.18, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35 + idx * 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + idx * 0.04);
      osc.stop(now + 0.38 + idx * 0.04);
    });
  }

  // 直线激光射击音效：高能电光呼啸
  playLaser() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.25);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.28);
  }

  // 炸弹爆炸音效：沉闷震撼低频冲击波
  playExplosion() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.35);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.38);
  }

  // 彩虹同色消除音效：神秘闪耀宇宙星芒
  playColorBomb() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [659.25, 783.99, 987.77, 1318.5, 1567.98, 1975.5];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const time = now + idx * 0.05;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(time);
      osc.stop(time + 0.42);
    });
  }

  // 特效组合超级大招音效：壮阔和弦洪流
  playSuperCombo() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const chords = [
      [523.25, 659.25, 783.99, 1046.5],
      [659.25, 830.61, 987.77, 1318.5],
      [783.99, 987.77, 1174.66, 1567.98]
    ];
    chords.forEach((chord, i) => {
      const time = now + i * 0.12;
      chord.forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.14, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(time);
        osc.stop(time + 0.52);
      });
    });
  }

  // 洗牌风铃音效
  playShuffle() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const notes = [440, 554, 659, 880, 1108];
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const time = now + idx * 0.06;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.1, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(time);
      osc.stop(time + 0.3);
    });
  }

  // 游戏结束提示音
  playGameOver() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const notes = [440, 392, 349, 329, 261.6];
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const time = now + idx * 0.18;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(time);
      osc.stop(time + 0.5);
    });
  }
}

// ==========================================
// 3. 背景与粒子特效 (Ambient & Match Particles)
// ==========================================
class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ambientParticles = [];
    this.burstParticles = [];
    this.initCanvasSize();
    this.createAmbientParticles();

    window.addEventListener('resize', () => this.initCanvasSize());
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initCanvasSize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  createAmbientParticles() {
    const count = Math.min(30, Math.floor(window.innerWidth / 35));
    const colors = ['#FFE0B2', '#FFCCBC', '#F8BBD0', '#E1BEE7', '#FFF9C4'];

    for (let i = 0; i < count; i++) {
      this.ambientParticles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        radius: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        speedX: (Math.random() - 0.5) * 0.6,
        speedY: -Math.random() * 0.6 - 0.2,
        alpha: Math.random() * 0.45 + 0.15
      });
    }
  }

  spawnBurst(x, y, count = 12) {
    const colors = ['#FFD54F', '#FF8A65', '#FF4081', '#00E676', '#40C4FF', '#E040FB'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4.5 + 1.5;
      this.burstParticles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        radius: Math.random() * 4 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1.0,
        decay: Math.random() * 0.03 + 0.02
      });
    }
  }

  animate() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let p of this.ambientParticles) {
      p.x += p.speedX;
      p.y += p.speedY;
      if (p.y < -10) {
        p.y = this.canvas.height + 10;
        p.x = Math.random() * this.canvas.width;
      }
      if (p.x < -10) p.x = this.canvas.width + 10;
      if (p.x > this.canvas.width + 10) p.x = -10;

      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    for (let i = this.burstParticles.length - 1; i >= 0; i--) {
      const b = this.burstParticles[i];
      b.x += b.vx;
      b.y += b.vy;
      b.vy += 0.1;
      b.life -= b.decay;

      if (b.life <= 0) {
        this.burstParticles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.globalAlpha = b.life;
      this.ctx.fillStyle = b.color;
      this.ctx.beginPath();
      this.ctx.arc(b.x, b.y, b.radius * b.life, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    requestAnimationFrame(this.animate);
  }
}

// ==========================================
// 4. 消除游戏核心主控制器 (Game Engine)
// ==========================================
class Match3Game {
  constructor() {
    this.gridSize = CONFIG.gridSize;
    this.currentScore = 0;
    this.bestScore = parseInt(localStorage.getItem('match3_best_score') || '0', 10);
    this.board = [];

    // 生存倒计时状态
    this.timeLeft = CONFIG.initialTime;
    this.totalSurvivedTime = 0.0;
    this.timerRunning = false;
    this.timerInterval = null;
    this.isGameOver = false;

    // 统计数据
    this.maxCombo = 1;
    this.totalClearedTiles = 0;

    this.selected = null;
    this.isLocked = false;
    this.combo = 0;
    this.idleTimer = null;
    this.hintTiles = [];

    this.pointerStart = null;

    this.sound = new SoundSynthesizer();
    this.particles = new ParticleSystem(document.getElementById('bg-canvas'));

    this.dom = {
      board: document.getElementById('grid-board'),
      boardFrame: document.getElementById('board-frame'),
      timeLeft: document.getElementById('time-left'),
      currentScore: document.getElementById('current-score'),
      maxCombo: document.getElementById('max-combo'),
      bestScore: document.getElementById('best-score'),
      progressFill: document.getElementById('progress-fill'),
      progressPercent: document.getElementById('progress-percent'),
      progressStatus: document.getElementById('progress-status'),
      comboBanner: document.getElementById('combo-banner'),
      boardOverlay: document.getElementById('board-overlay'),
      overlayMsg: document.getElementById('overlay-msg'),
      toastContainer: document.getElementById('toast-container'),
      gridSelect: document.getElementById('grid-size-select'),
      btnSound: document.getElementById('btn-sound'),
      btnHint: document.getElementById('btn-hint'),
      btnShuffle: document.getElementById('btn-shuffle'),
      btnRestart: document.getElementById('btn-restart'),
      btnRules: document.getElementById('btn-rules'),
      modalGameOver: document.getElementById('modal-gameover'),
      modalRules: document.getElementById('modal-rules'),
      gameoverTitle: document.getElementById('gameover-title'),
      gameoverDesc: document.getElementById('gameover-desc'),
      gameoverFinalScore: document.getElementById('gameover-final-score'),
      gameoverSurviveTime: document.getElementById('gameover-survive-time'),
      gameoverMaxCombo: document.getElementById('gameover-max-combo'),
      gameoverTotalCleared: document.getElementById('gameover-total-cleared'),
      gameoverRank: document.getElementById('gameover-rank'),
      btnGameoverReplay: document.getElementById('btn-gameover-replay'),
      btnShare: document.getElementById('btn-share'),
      btnRulesClose: document.getElementById('btn-rules-close')
    };

    CONFIG.tileImages.forEach(src => {
      const img = new Image();
      img.src = src;
    });

    this.bindEvents();
    this.startNewGame();
  }

  // ----------------------------------------
  // 事件监听绑定
  // ----------------------------------------
  bindEvents() {
    this.dom.gridSelect.addEventListener('change', (e) => {
      this.gridSize = parseInt(e.target.value, 10);
      this.startNewGame();
      this.showToast(`已切换为 ${this.gridSize} × ${this.gridSize} 棋盘规格`);
    });

    this.dom.btnSound.addEventListener('click', () => {
      const on = this.sound.toggle();
      this.dom.btnSound.querySelector('.icon').textContent = on ? '🔊' : '🔇';
      this.showToast(on ? '🎵 音效已开启' : '🔇 音效已静音');
    });

    this.dom.btnHint.addEventListener('click', () => this.showManualHint());
    this.dom.btnShuffle.addEventListener('click', () => this.shuffleBoardWithAnimation(true));
    this.dom.btnRestart.addEventListener('click', () => {
      if (confirm('确定要重新开始当前挑战吗？')) {
        this.startNewGame();
      }
    });

    this.dom.btnRules.addEventListener('click', () => this.openModal(this.dom.modalRules));
    this.dom.btnRulesClose.addEventListener('click', () => this.closeModal(this.dom.modalRules));

    this.dom.btnGameoverReplay.addEventListener('click', () => {
      this.closeModal(this.dom.modalGameOver);
      this.startNewGame();
    });

    this.dom.btnShare.addEventListener('click', () => {
      const shareText = `我在【开心消消乐】极限倒计时模式中坚持了 ${this.totalSurvivedTime.toFixed(1)} 秒，斩获累计得分 ${this.currentScore} 分！最高连击 x${this.maxCombo}！快来挑战我的纪录吧~ ⏰✨`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareText).then(() => {
          this.showToast('✨ 战绩已复制到剪贴板，快发给好友吧！');
        }).catch(() => {
          alert(shareText);
        });
      } else {
        alert(shareText);
      }
    });

    this.dom.modalRules.addEventListener('click', (e) => {
      if (e.target === this.dom.modalRules) this.closeModal(this.dom.modalRules);
    });

    this.dom.board.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    window.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
  }

  // ----------------------------------------
  // 开始新游戏
  // ----------------------------------------
  startNewGame() {
    this.stopTimer();
    this.clearIdleTimer();
    this.clearHints();

    this.selected = null;
    this.isLocked = false;
    this.isGameOver = false;
    this.combo = 0;
    this.maxCombo = 1;
    this.totalClearedTiles = 0;
    this.currentScore = 0;
    this.timeLeft = CONFIG.initialTime;
    this.totalSurvivedTime = 0.0;
    this.timerRunning = false;

    document.documentElement.style.setProperty('--grid-size', this.gridSize);
    this.dom.board.style.gridTemplateColumns = `repeat(${this.gridSize}, 1fr)`;

    this.updateDashboard();
    this.updateTimerDisplay();
    this.dom.progressStatus.textContent = '做出首次移动即可启动 15 秒倒计时';

    this.generateValidBoard();
    this.renderBoard();
    this.resetIdleTimer();
  }

  // ----------------------------------------
  // 倒计时计时器系统 (Time-Attack Engine)
  // ----------------------------------------
  startTimer() {
    if (this.timerRunning || this.isGameOver) return;
    this.timerRunning = true;
    this.dom.progressStatus.textContent = '⚡ 极限生存挑战中！消除方块加时！';

    let lastTimestamp = performance.now();
    this.timerInterval = setInterval(() => {
      if (!this.timerRunning || this.isGameOver) return;

      const now = performance.now();
      const dt = (now - lastTimestamp) / 1000;
      lastTimestamp = now;

      this.timeLeft = Math.max(0, this.timeLeft - dt);
      this.totalSurvivedTime += dt;
      this.updateTimerDisplay();

      // 倒计时结束，游戏立即结束！
      if (this.timeLeft <= 0) {
        this.handleGameOver();
      }
    }, 50);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.timerRunning = false;
  }

  // 根据消除方块增加倒计时时间
  addTime(seconds) {
    if (this.isGameOver) return;

    const actualAdded = Math.min(seconds, CONFIG.maxTime - this.timeLeft);
    this.timeLeft = Math.min(CONFIG.maxTime, this.timeLeft + seconds);
    this.updateTimerDisplay();

    // 时间跳动绿字动画
    this.dom.timeLeft.classList.remove('time-add');
    void this.dom.timeLeft.offsetWidth;
    this.dom.timeLeft.classList.add('time-add');
    setTimeout(() => this.dom.timeLeft.classList.remove('time-add'), 300);

    // 弹出悬浮加时气泡标签
    this.spawnTimePopup(`+${seconds.toFixed(1)}s ⏳`);
  }

  updateTimerDisplay() {
    this.dom.timeLeft.textContent = `${this.timeLeft.toFixed(1)}s`;
    this.dom.progressPercent.textContent = `${this.timeLeft.toFixed(1)}s`;

    // 计算能量槽比例 (以初始 15 秒为基准满格，最多展示到上限)
    const pct = Math.min(100, Math.max(0, (this.timeLeft / CONFIG.initialTime) * 100));
    this.dom.progressFill.style.width = `${pct}%`;

    // 紧急警示红光动效 (时间小于等于 5 秒)
    if (this.timeLeft <= 5.0 && this.timeLeft > 0) {
      this.dom.timeLeft.classList.add('urgent');
      this.dom.progressFill.classList.add('urgent');
    } else {
      this.dom.timeLeft.classList.remove('urgent');
      this.dom.progressFill.classList.remove('urgent');
    }
  }

  spawnTimePopup(text) {
    const popup = document.createElement('div');
    popup.className = 'time-popup';
    popup.textContent = text;

    const rect = this.dom.timeLeft.getBoundingClientRect();
    const frameRect = this.dom.boardFrame.getBoundingClientRect();

    popup.style.left = `${rect.left - frameRect.left + rect.width / 4}px`;
    popup.style.top = `${rect.top - frameRect.top - 20}px`;

    this.dom.boardFrame.appendChild(popup);
    setTimeout(() => popup.remove(), 850);
  }

  // ----------------------------------------
  // 仪表盘与累计计分更新
  // ----------------------------------------
  updateDashboard() {
    this.dom.currentScore.textContent = this.currentScore;
    this.dom.maxCombo.textContent = `x${this.maxCombo}`;
    this.dom.bestScore.textContent = this.bestScore;

    if (this.currentScore > this.bestScore) {
      this.bestScore = this.currentScore;
      localStorage.setItem('match3_best_score', this.bestScore);
      this.dom.bestScore.textContent = this.bestScore;
    }
  }

  // ----------------------------------------
  // 生成初始无三消且有解的棋盘
  // ----------------------------------------
  generateValidBoard() {
    let attempts = 0;
    do {
      this.board = [];
      for (let r = 0; r < this.gridSize; r++) {
        this.board[r] = [];
        for (let c = 0; c < this.gridSize; c++) {
          const forbidden = new Set();
          if (r >= 2 && this.board[r - 1][c].type === this.board[r - 2][c].type) {
            forbidden.add(this.board[r - 1][c].type);
          }
          if (c >= 2 && this.board[r][c - 1].type === this.board[r][c - 2].type) {
            forbidden.add(this.board[r][c - 1].type);
          }

          const allowed = [0, 1, 2, 3].filter(t => !forbidden.has(t));
          const type = allowed[Math.floor(Math.random() * allowed.length)];
          this.board[r][c] = {
            id: `${r}-${c}-${Date.now()}-${Math.random()}`,
            type: type,
            special: null
          };
        }
      }
      attempts++;
    } while (!this.findPossibleMove() && attempts < 100);
  }

  // ----------------------------------------
  // 渲染整个棋盘 DOM
  // ----------------------------------------
  renderBoard() {
    this.dom.board.innerHTML = '';
    const fragment = document.createDocumentFragment();

    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const item = this.board[r][c];
        const tileEl = document.createElement('div');
        tileEl.className = 'tile-item';
        tileEl.dataset.row = r;
        tileEl.dataset.col = c;
        tileEl.id = `tile-${r}-${c}`;

        const img = document.createElement('img');
        img.src = CONFIG.tileImages[item.type];
        img.alt = `Tile ${item.type + 1}`;
        img.loading = 'eager';
        img.draggable = false;
        tileEl.appendChild(img);

        this.applyTileVisuals(tileEl, item);
        fragment.appendChild(tileEl);
      }
    }

    this.dom.board.appendChild(fragment);
  }

  applyTileVisuals(tileEl, item) {
    if (!tileEl || !item) return;

    tileEl.classList.remove('special-line-h', 'special-line-v', 'special-bomb', 'special-cross', 'special-color');
    const existingBadge = tileEl.querySelector('.special-badge');
    if (existingBadge) existingBadge.remove();

    const img = tileEl.querySelector('img');
    if (img) img.src = CONFIG.tileImages[item.type];

    if (item.special) {
      tileEl.classList.add(`special-${item.special}`);
      const badge = document.createElement('div');
      badge.className = `special-badge ${item.special}-badge`;
      badge.textContent = {
        'line-h': '↔',
        'line-v': '↕',
        'bomb': '💣',
        'cross': '✚',
        'color': '🌈'
      }[item.special] || '';
      tileEl.appendChild(badge);
    }
  }

  updateTileElement(r, c) {
    const el = document.getElementById(`tile-${r}-${c}`);
    const item = this.board[r][c];
    if (el && item) {
      this.applyTileVisuals(el, item);
    }
  }

  // ----------------------------------------
  // 寻找盘面任意一个可消除的合法移动 (死锁检测与提示)
  // ----------------------------------------
  findPossibleMove() {
    const N = this.gridSize;

    // 1. 同色魔力鸟与任意相邻方块交换
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (this.board[r][c] && this.board[r][c].special === 'color') {
          if (c + 1 < N) return [{ r, c }, { r, c: c + 1 }];
          if (r + 1 < N) return [{ r, c }, { r: r + 1, c }];
          if (c - 1 >= 0) return [{ r, c }, { r, c: c - 1 }];
          if (r - 1 >= 0) return [{ r, c }, { r: r - 1, c }];
        }
      }
    }

    // 2. 两个相邻特殊方块
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (this.board[r][c] && this.board[r][c].special) {
          if (c + 1 < N && this.board[r][c + 1] && this.board[r][c + 1].special) {
            return [{ r, c }, { r, c: c + 1 }];
          }
          if (r + 1 < N && this.board[r + 1][c] && this.board[r + 1][c].special) {
            return [{ r, c }, { r: r + 1, c }];
          }
        }
      }
    }

    // 3. 常规三消匹配检测
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (c + 1 < N) {
          if (this.testSwapHasMatch(r, c, r, c + 1)) {
            return [{ r, c }, { r, c: c + 1 }];
          }
        }
        if (r + 1 < N) {
          if (this.testSwapHasMatch(r, c, r + 1, c)) {
            return [{ r, c }, { r: r + 1, c }];
          }
        }
      }
    }
    return null;
  }

  testSwapHasMatch(r1, c1, r2, c2) {
    if (!this.board[r1] || !this.board[r2]) return false;
    const item1 = this.board[r1][c1];
    const item2 = this.board[r2][c2];
    this.board[r1][c1] = item2;
    this.board[r2][c2] = item1;

    const analysis = this.analyzeMatches();

    this.board[r1][c1] = item1;
    this.board[r2][c2] = item2;

    return analysis.hasMatches;
  }

  // ----------------------------------------
  // 核心匹配算法与特效形状识别引擎 (Shape Recognition)
  // ----------------------------------------
  analyzeMatches(playerMove = null) {
    const N = this.gridSize;
    const hRuns = [];
    const vRuns = [];

    // 1. 横向扫描连续
    for (let r = 0; r < N; r++) {
      let startCol = 0;
      let matchLen = 1;
      let currType = (this.board[r] && this.board[r][0]) ? this.board[r][0].type : -1;

      for (let c = 1; c <= N; c++) {
        const itemType = (c < N && this.board[r][c]) ? this.board[r][c].type : -1;
        if (itemType === currType && currType !== -1) {
          matchLen++;
        } else {
          if (matchLen >= CONFIG.matchMin && currType !== -1) {
            const cells = [];
            for (let k = startCol; k < startCol + matchLen; k++) {
              cells.push({ row: r, col: k });
            }
            hRuns.push({
              row: r,
              colStart: startCol,
              colEnd: startCol + matchLen - 1,
              length: matchLen,
              type: currType,
              cells: cells
            });
          }
          startCol = c;
          currType = itemType;
          matchLen = 1;
        }
      }
    }

    // 2. 纵向扫描连续
    for (let c = 0; c < N; c++) {
      let startRow = 0;
      let matchLen = 1;
      let currType = (this.board[0] && this.board[0][c]) ? this.board[0][c].type : -1;

      for (let r = 1; r <= N; r++) {
        const itemType = (r < N && this.board[r][c]) ? this.board[r][c].type : -1;
        if (itemType === currType && currType !== -1) {
          matchLen++;
        } else {
          if (matchLen >= CONFIG.matchMin && currType !== -1) {
            const cells = [];
            for (let k = startRow; k < startRow + matchLen; k++) {
              cells.push({ row: k, col: c });
            }
            vRuns.push({
              col: c,
              rowStart: startRow,
              rowEnd: startRow + matchLen - 1,
              length: matchLen,
              type: currType,
              cells: cells
            });
          }
          startRow = r;
          currType = itemType;
          matchLen = 1;
        }
      }
    }

    if (hRuns.length === 0 && vRuns.length === 0) {
      return { hasMatches: false, eliminatedCells: [], specialsToCreate: [] };
    }

    const allRuns = [
      ...hRuns.map((hr, idx) => ({ ...hr, runType: 'h', runIndex: idx })),
      ...vRuns.map((vr, idx) => ({ ...vr, runType: 'v', runIndex: idx }))
    ];

    const parent = allRuns.map((_, i) => i);
    function find(i) {
      if (parent[i] === i) return i;
      return parent[i] = find(parent[i]);
    }
    function union(i, j) {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) parent[rootI] = rootJ;
    }

    const intersections = [];
    for (let i = 0; i < hRuns.length; i++) {
      for (let j = 0; j < vRuns.length; j++) {
        const hr = hRuns[i];
        const vr = vRuns[j];
        if (hr.type === vr.type) {
          if (hr.row >= vr.rowStart && hr.row <= vr.rowEnd &&
              vr.col >= hr.colStart && vr.col <= hr.colEnd) {
            const vIdx = hRuns.length + j;
            union(i, vIdx);

            const ir = hr.row;
            const ic = vr.col;
            const isCross = (ic > hr.colStart && ic < hr.colEnd && ir > vr.rowStart && ir < vr.rowEnd);
            intersections.push({
              runA: i,
              runB: vIdx,
              row: ir,
              col: ic,
              isCross: isCross
            });
          }
        }
      }
    }

    const groups = new Map();
    for (let i = 0; i < allRuns.length; i++) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(allRuns[i]);
    }

    const specialsToCreate = [];
    const allEliminatedCells = new Set();

    for (const [root, clusterRuns] of groups.entries()) {
      const clusterCellsMap = new Map();
      clusterRuns.forEach(r => {
        r.cells.forEach(c => clusterCellsMap.set(`${c.row},${c.col}`, c));
      });

      const clusterCells = Array.from(clusterCellsMap.values());
      const gemType = clusterRuns[0].type;

      const clusterIntersections = intersections.filter(item => 
        find(item.runA) === root || find(item.runB) === root
      );

      let specialType = null;
      let defaultPos = null;

      if (clusterIntersections.length > 0) {
        const crossInt = clusterIntersections.find(it => it.isCross);
        if (crossInt) {
          specialType = 'cross';
          defaultPos = { row: crossInt.row, col: crossInt.col };
        } else {
          specialType = 'bomb';
          defaultPos = { row: clusterIntersections[0].row, col: clusterIntersections[0].col };
        }
      } else {
        let maxLen = 0;
        let longestRun = clusterRuns[0];
        clusterRuns.forEach(r => {
          if (r.length > maxLen) {
            maxLen = r.length;
            longestRun = r;
          }
        });

        if (maxLen >= 5) {
          specialType = 'color';
          defaultPos = longestRun.cells[Math.floor(longestRun.cells.length / 2)];
        } else if (maxLen === 4) {
          specialType = (longestRun.runType === 'h') ? 'line-h' : 'line-v';
          defaultPos = longestRun.cells[Math.floor(longestRun.cells.length / 2)];
        }
      }

      let createPos = null;
      if (specialType) {
        if (playerMove) {
          const isTargetInCluster = clusterCells.some(c => c.row === playerMove.target.row && c.col === playerMove.target.col);
          const isSourceInCluster = clusterCells.some(c => c.row === playerMove.source.row && c.col === playerMove.source.col);

          if (isTargetInCluster) {
            createPos = { row: playerMove.target.row, col: playerMove.target.col };
          } else if (isSourceInCluster) {
            createPos = { row: playerMove.source.row, col: playerMove.source.col };
          } else {
            createPos = defaultPos || clusterCells[Math.floor(clusterCells.length / 2)];
          }
        } else {
          createPos = defaultPos || clusterCells[Math.floor(clusterCells.length / 2)];
        }

        specialsToCreate.push({
          type: specialType,
          pos: createPos,
          gemType: gemType
        });
      }

      for (const cell of clusterCells) {
        if (createPos && cell.row === createPos.row && cell.col === createPos.col) {
          continue;
        }
        allEliminatedCells.add(`${cell.row},${cell.col}`);
      }
    }

    return {
      hasMatches: true,
      eliminatedCells: Array.from(allEliminatedCells).map(k => {
        const [r, c] = k.split(',').map(Number);
        return { row: r, col: c };
      }),
      specialsToCreate: specialsToCreate
    };
  }

  // ----------------------------------------
  // 特效引爆与连锁波及计算 (Chain Detonations)
  // ----------------------------------------
  expandSpecialDetonations(initialEliminatedCells, initialSpecialTriggers = []) {
    const N = this.gridSize;
    const eliminatedMap = new Map();
    const triggeredSpecials = new Set();
    const queue = [];

    for (const cell of initialEliminatedCells) {
      eliminatedMap.set(`${cell.row},${cell.col}`, cell);
      const tile = this.board[cell.row][cell.col];
      if (tile && tile.special) {
        queue.push({
          row: cell.row,
          col: cell.col,
          special: tile.special,
          type: tile.type
        });
        triggeredSpecials.add(`${cell.row},${cell.col}`);
      }
    }

    for (const trig of initialSpecialTriggers) {
      eliminatedMap.set(`${trig.row},${trig.col}`, { row: trig.row, col: trig.col });
      if (!triggeredSpecials.has(`${trig.row},${trig.col}`)) {
        queue.push(trig);
        triggeredSpecials.add(`${trig.row},${trig.col}`);
      }
    }

    while (queue.length > 0) {
      const sp = queue.shift();
      const affected = [];

      if (sp.special === 'line-h') {
        this.showLaserH(sp.row);
        this.sound.playLaser();
        for (let c = 0; c < N; c++) affected.push({ row: sp.row, col: c });
      } else if (sp.special === 'line-v') {
        this.showLaserV(sp.col);
        this.sound.playLaser();
        for (let r = 0; r < N; r++) affected.push({ row: r, col: sp.col });
      } else if (sp.special === 'bomb') {
        this.showBombRipple(sp.row, sp.col, 1);
        this.sound.playExplosion();
        this.shakeBoard();
        for (let r = Math.max(0, sp.row - 1); r <= Math.min(N - 1, sp.row + 1); r++) {
          for (let c = Math.max(0, sp.col - 1); c <= Math.min(N - 1, sp.col + 1); c++) {
            affected.push({ row: r, col: c });
          }
        }
      } else if (sp.special === 'cross') {
        this.showLaserH(sp.row);
        this.showLaserV(sp.col);
        this.sound.playLaser();
        this.shakeBoard();
        for (let c = 0; c < N; c++) affected.push({ row: sp.row, col: c });
        for (let r = 0; r < N; r++) affected.push({ row: r, col: sp.col });
      } else if (sp.special === 'color') {
        this.showScreenFlash();
        this.sound.playColorBomb();
        const targetType = sp.type >= 0 ? sp.type : Math.floor(Math.random() * 4);
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            if (this.board[r][c] && this.board[r][c].type === targetType) {
              affected.push({ row: r, col: c });
            }
          }
        }
      }

      for (const aff of affected) {
        const key = `${aff.row},${aff.col}`;
        if (!eliminatedMap.has(key)) {
          eliminatedMap.set(key, aff);
        }
        if (!triggeredSpecials.has(key)) {
          const affTile = this.board[aff.row][aff.col];
          if (affTile && affTile.special) {
            triggeredSpecials.add(key);
            queue.push({
              row: aff.row,
              col: aff.col,
              special: affTile.special,
              type: affTile.type
            });
          }
        }
      }
    }

    return Array.from(eliminatedMap.values());
  }

  // ----------------------------------------
  // 视效触发器：激光、爆炸与震屏
  // ----------------------------------------
  showLaserH(row) {
    const laser = document.createElement('div');
    laser.className = 'fx-laser-h';
    const sampleTile = document.getElementById(`tile-${row}-0`);
    if (sampleTile) {
      const rect = sampleTile.getBoundingClientRect();
      const frameRect = this.dom.boardFrame.getBoundingClientRect();
      laser.style.top = `${rect.top - frameRect.top + rect.height / 2}px`;
    } else {
      laser.style.top = `${((row + 0.5) / this.gridSize) * 100}%`;
    }
    this.dom.boardFrame.appendChild(laser);
    setTimeout(() => laser.remove(), 420);
  }

  showLaserV(col) {
    const laser = document.createElement('div');
    laser.className = 'fx-laser-v';
    const sampleTile = document.getElementById(`tile-0-${col}`);
    if (sampleTile) {
      const rect = sampleTile.getBoundingClientRect();
      const frameRect = this.dom.boardFrame.getBoundingClientRect();
      laser.style.left = `${rect.left - frameRect.left + rect.width / 2}px`;
    } else {
      laser.style.left = `${((col + 0.5) / this.gridSize) * 100}%`;
    }
    this.dom.boardFrame.appendChild(laser);
    setTimeout(() => laser.remove(), 420);
  }

  showBombRipple(row, col, radius = 1) {
    const ripple = document.createElement('div');
    ripple.className = 'fx-bomb-ripple';
    const sampleTile = document.getElementById(`tile-${row}-${col}`);
    if (sampleTile) {
      const rect = sampleTile.getBoundingClientRect();
      const frameRect = this.dom.boardFrame.getBoundingClientRect();
      ripple.style.left = `${rect.left - frameRect.left + rect.width / 2}px`;
      ripple.style.top = `${rect.top - frameRect.top + rect.height / 2}px`;
      const size = rect.width * (radius * 2 + 1.2);
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
    }
    this.dom.boardFrame.appendChild(ripple);
    setTimeout(() => ripple.remove(), 480);
  }

  showScreenFlash() {
    const flash = document.createElement('div');
    flash.className = 'fx-screen-flash';
    this.dom.boardFrame.appendChild(flash);
    setTimeout(() => flash.remove(), 500);
  }

  shakeBoard() {
    this.dom.boardFrame.classList.remove('shake');
    void this.dom.boardFrame.offsetWidth;
    this.dom.boardFrame.classList.add('shake');
    setTimeout(() => this.dom.boardFrame.classList.remove('shake'), 400);
  }

  // ----------------------------------------
  // 指针与手势交互 (支持触摸滑动与点击选择)
  // ----------------------------------------
  getTileCoordinatesFromElement(el) {
    const tileEl = el.closest('.tile-item');
    if (!tileEl) return null;
    return {
      row: parseInt(tileEl.dataset.row, 10),
      col: parseInt(tileEl.dataset.col, 10),
      el: tileEl
    };
  }

  handlePointerDown(e) {
    if (this.isLocked || this.isGameOver) return;
    const tileData = this.getTileCoordinatesFromElement(e.target);
    if (!tileData) return;

    this.pointerStart = {
      x: e.clientX,
      y: e.clientY,
      row: tileData.row,
      col: tileData.col,
      hasMoved: false
    };
  }

  handlePointerMove(e) {
    if (!this.pointerStart || this.isLocked || this.isGameOver || this.pointerStart.hasMoved) return;

    const dx = e.clientX - this.pointerStart.x;
    const dy = e.clientY - this.pointerStart.y;
    const threshold = 18;

    if (Math.hypot(dx, dy) >= threshold) {
      this.pointerStart.hasMoved = true;
      const { row, col } = this.pointerStart;

      let targetRow = row;
      let targetCol = col;

      if (Math.abs(dx) > Math.abs(dy)) {
        targetCol += dx > 0 ? 1 : -1;
      } else {
        targetRow += dy > 0 ? 1 : -1;
      }

      if (targetRow >= 0 && targetRow < this.gridSize && targetCol >= 0 && targetCol < this.gridSize) {
        this.clearSelection();
        this.attemptSwap(row, col, targetRow, targetCol);
      }
    }
  }

  handlePointerUp(e) {
    if (!this.pointerStart) return;

    if (!this.pointerStart.hasMoved && !this.isLocked && !this.isGameOver) {
      const tileData = this.getTileCoordinatesFromElement(e.target);
      if (tileData) {
        this.handleTileClick(tileData.row, tileData.col);
      }
    }

    this.pointerStart = null;
  }

  handleTileClick(r, c) {
    if (this.isGameOver) return;

    this.sound.playSelect();
    this.clearHints();
    this.resetIdleTimer();

    if (!this.selected) {
      this.selectTile(r, c);
      return;
    }

    if (this.selected.row === r && this.selected.col === c) {
      this.clearSelection();
      return;
    }

    const dist = Math.abs(this.selected.row - r) + Math.abs(this.selected.col - c);
    if (dist === 1) {
      const { row: prevR, col: prevC } = this.selected;
      this.clearSelection();
      this.attemptSwap(prevR, prevC, r, c);
    } else {
      this.clearSelection();
      this.selectTile(r, c);
    }
  }

  selectTile(r, c) {
    this.selected = { row: r, col: c };
    const el = document.getElementById(`tile-${r}-${c}`);
    if (el) el.classList.add('selected');
  }

  clearSelection() {
    if (this.selected) {
      const el = document.getElementById(`tile-${this.selected.row}-${this.selected.col}`);
      if (el) el.classList.remove('selected');
      this.selected = null;
    }
  }

  // ----------------------------------------
  // 核心逻辑：尝试交换方块 (包含首次启动倒计时与特效互换)
  // ----------------------------------------
  async attemptSwap(r1, c1, r2, c2) {
    if (this.isGameOver) return;

    // 玩家做出第一次移动，立即启动 15 秒生存倒计时！
    if (!this.timerRunning) {
      this.startTimer();
    }

    this.isLocked = true;
    this.clearHints();
    this.clearIdleTimer();

    const el1 = document.getElementById(`tile-${r1}-${c1}`);
    const el2 = document.getElementById(`tile-${r2}-${c2}`);

    const rect1 = el1.getBoundingClientRect();
    const rect2 = el2.getBoundingClientRect();
    const dx = rect2.left - rect1.left;
    const dy = rect2.top - rect1.top;

    this.sound.playSwap();

    // 播放滑动交换动画
    el1.style.transition = `transform ${CONFIG.swapDuration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
    el2.style.transition = `transform ${CONFIG.swapDuration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
    el1.style.transform = `translate(${dx}px, ${dy}px)`;
    el2.style.transform = `translate(${-dx}px, ${-dy}px)`;
    el1.style.zIndex = '15';
    el2.style.zIndex = '15';

    await this.wait(CONFIG.swapDuration);

    const tile1 = this.board[r1][c1];
    const tile2 = this.board[r2][c2];

    el1.style.transition = '';
    el2.style.transition = '';
    el1.style.transform = '';
    el2.style.transform = '';
    el1.style.zIndex = '';
    el2.style.zIndex = '';

    // 判断是否为「特殊方块互换」或「同色方块互换」组合技
    const isSpecialCombo = (tile1.special && tile2.special);
    const isColorSwap = ((tile1.special === 'color' && !tile2.special) || (tile2.special === 'color' && !tile1.special));

    if (isSpecialCombo || isColorSwap) {
      // 特效交换 100% 成功
      this.board[r1][c1] = tile2;
      this.board[r2][c2] = tile1;
      this.updateTileElement(r1, c1);
      this.updateTileElement(r2, c2);

      await this.executeSpecialCombo(r1, c1, r2, c2, tile1, tile2);

      this.combo = 0;
      await this.processCascadeLoop();

      this.checkEndConditions();
      this.isLocked = false;
      this.resetIdleTimer();
      return;
    }

    // 常规交换逻辑
    this.board[r1][c1] = tile2;
    this.board[r2][c2] = tile1;

    const analysis = this.analyzeMatches({
      source: { row: r1, col: c1 },
      target: { row: r2, col: c2 }
    });

    if (!analysis.hasMatches) {
      // 无法形成消除，弹回原位
      this.sound.playInvalid();
      el1.style.transition = `transform ${CONFIG.swapDuration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
      el2.style.transition = `transform ${CONFIG.swapDuration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
      el1.style.transform = `translate(${dx}px, ${dy}px)`;
      el2.style.transform = `translate(${-dx}px, ${-dy}px)`;
      await this.wait(CONFIG.swapDuration);

      el1.style.transition = '';
      el2.style.transition = '';
      el1.style.transform = '';
      el2.style.transform = '';

      this.board[r1][c1] = tile1;
      this.board[r2][c2] = tile2;

      this.isLocked = false;
      this.resetIdleTimer();
      return;
    }

    this.updateTileElement(r1, c1);
    this.updateTileElement(r2, c2);

    this.combo = 0;
    await this.processMatchStep(analysis);

    await this.processCascadeLoop();

    this.checkEndConditions();
    this.isLocked = false;
    this.resetIdleTimer();
  }

  // ----------------------------------------
  // 执行特效组合技能 (Special Combos)
  // ----------------------------------------
  async executeSpecialCombo(r1, c1, r2, c2, t1, t2) {
    const N = this.gridSize;
    const cr = r2, cc = c2;
    const eliminated = [];

    // 1. 同色 + 同色 (Color + Color) ➔ 终极大招：全屏大清场！
    if (t1.special === 'color' && t2.special === 'color') {
      this.showToast('🌈 终极大招：全屏大清场！');
      this.showScreenFlash();
      this.sound.playSuperCombo();
      this.shakeBoard();

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          eliminated.push({ row: r, col: c });
        }
      }
      this.currentScore += 3000;
      this.updateDashboard();
      this.showComboBanner(5);
    }
    // 2. 同色 + 特效 (Color + Line/Bomb/Cross) ➔ 全图该颜色全变身并引爆！
    else if (t1.special === 'color' || t2.special === 'color') {
      const otherTile = (t1.special === 'color') ? t2 : t1;

      if (otherTile.special) {
        const targetType = otherTile.type;
        const specType = otherTile.special;
        this.showToast('✨ 极光全图扩散：全场变身并引爆！');
        this.sound.playSuperCombo();
        this.shakeBoard();

        const convertedSpecials = [];
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            if (this.board[r][c] && this.board[r][c].type === targetType) {
              this.board[r][c].special = specType;
              this.applyTileVisuals(document.getElementById(`tile-${r}-${c}`), this.board[r][c]);
              convertedSpecials.push({ row: r, col: c, special: specType, type: targetType });
            }
          }
        }
        await this.wait(260);

        const allCells = this.expandSpecialDetonations([], convertedSpecials);
        eliminated.push(...allCells);
        this.currentScore += 1800;
        this.showComboBanner(4);
      } else {
        const targetType = otherTile.type;
        this.showToast('🌈 彩虹同色大消除！');
        this.showScreenFlash();
        this.sound.playColorBomb();

        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            if (this.board[r][c] && this.board[r][c].type === targetType) {
              eliminated.push({ row: r, col: c });
            }
          }
        }
        eliminated.push({ row: r1, col: c1 }, { row: r2, col: c2 });
        this.currentScore += 800;
        this.showComboBanner(3);
      }
    }
    // 3. 炸弹 + 炸弹 (Bomb + Bomb) ➔ 5×5 巨型大核爆！
    else if (t1.special === 'bomb' && t2.special === 'bomb') {
      this.showToast('💥 5×5 巨型超级大核爆！');
      this.showBombRipple(cr, cc, 2);
      this.sound.playExplosion();
      this.shakeBoard();

      for (let r = Math.max(0, cr - 2); r <= Math.min(N - 1, cr + 2); r++) {
        for (let c = Math.max(0, cc - 2); c <= Math.min(N - 1, cc + 2); c++) {
          eliminated.push({ row: r, col: c });
        }
      }
      this.currentScore += 1000;
      this.showComboBanner(3);
    }
    // 4. 直线 + 炸弹 (Line + Bomb) ➔ 3行 + 3列 超级十字光束全屏扫射！
    else if ((t1.special.includes('line') && t2.special === 'bomb') ||
             (t2.special.includes('line') && t1.special === 'bomb')) {
      this.showToast('🌟 3×3 超级十字激光全屏扫射！');
      this.sound.playLaser();
      this.sound.playExplosion();
      this.shakeBoard();

      for (let offset = -1; offset <= 1; offset++) {
        const rr = cr + offset;
        const ccCol = cc + offset;
        if (rr >= 0 && rr < N) {
          this.showLaserH(rr);
          for (let c = 0; c < N; c++) eliminated.push({ row: rr, col: c });
        }
        if (ccCol >= 0 && ccCol < N) {
          this.showLaserV(ccCol);
          for (let r = 0; r < N; r++) eliminated.push({ row: r, col: ccCol });
        }
      }
      this.currentScore += 1200;
      this.showComboBanner(4);
    }
    // 5. 直线 + 直线 ➔ 十字激光清除整行 + 整列！
    else if (t1.special.includes('line') && t2.special.includes('line')) {
      this.showToast('⚡ 超级十字激光！');
      this.showLaserH(cr);
      this.showLaserV(cc);
      this.sound.playLaser();
      this.shakeBoard();

      for (let c = 0; c < N; c++) eliminated.push({ row: cr, col: c });
      for (let r = 0; r < N; r++) eliminated.push({ row: r, col: cc });
      this.currentScore += 600;
      this.showComboBanner(2);
    }
    // 6. 其他特殊互换
    else {
      this.showToast('✨ 超能特效大爆发！');
      this.sound.playSuperCombo();
      this.shakeBoard();

      const allCells = this.expandSpecialDetonations([], [
        { row: r1, col: c1, special: t1.special, type: t1.type },
        { row: r2, col: c2, special: t2.special, type: t2.type }
      ]);
      eliminated.push(...allCells);
      this.currentScore += 800;
      this.showComboBanner(3);
    }

    const unique = [];
    const seen = new Set();
    for (const cell of eliminated) {
      const key = `${cell.row},${cell.col}`;
      if (!seen.has(key) && cell.row >= 0 && cell.row < N && cell.col >= 0 && cell.col < N) {
        seen.add(key);
        unique.push(cell);
      }
    }

    // 特效组合直接互换：基础 2.0 秒，多出方块边际递减，单次消除严格封顶不超过 4.0 秒！
    const extraComboTiles = Math.max(0, unique.length - 3);
    const rawComboTime = 2.0 + extraComboTiles * CONFIG.extraTileTime;
    const timeEarned = Math.min(CONFIG.maxStepTimeBonus, parseFloat(rawComboTime.toFixed(2)));
    this.addTime(timeEarned);
    this.totalClearedTiles += unique.length;

    await this.animateAndRemoveCells(unique);
  }

  // ----------------------------------------
  // 单步消除与生成特殊方块 (根据消除数量增加时间)
  // ----------------------------------------
  async processMatchStep(analysis) {
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);

    const { eliminatedCells, specialsToCreate } = analysis;
    const fullElimination = this.expandSpecialDetonations(eliminatedCells);

    const count = fullElimination.length;
    this.totalClearedTiles += count;

    // 核心加时逻辑 (方案 A 优化版)：
    // 1. 普通 3 消精确增加 1.0 秒
    // 2. 超出 3 块的部分按平滑边际递减增长，每次连锁连击小额奖励 0.2 秒
    // 3. 严格封顶：单次单步消除增加的时间最多绝不超过 4.0 秒！
    const extraTiles = Math.max(0, count - 3);
    const tileBonus = extraTiles * CONFIG.extraTileTime;
    const comboBonus = (this.combo > 1) ? (this.combo - 1) * CONFIG.comboTimeBonus : 0;
    const rawTime = CONFIG.baseMatch3Time + tileBonus + comboBonus;
    const timeEarned = Math.min(CONFIG.maxStepTimeBonus, parseFloat(rawTime.toFixed(2)));
    this.addTime(timeEarned);

    // 计分计算：基础分 + 多消奖励 + 连击倍率
    const bonus = (count > 3) ? (count - 3) * CONFIG.bonus4 : 0;
    const basePoints = count * CONFIG.scorePerTile + bonus;
    const multiplier = 1 + (this.combo - 1) * CONFIG.comboMultiplierStep;
    const earnedScore = Math.round(basePoints * multiplier);

    this.currentScore += earnedScore;
    this.updateDashboard();
    this.popScoreAnimation();

    this.sound.playMatch(this.combo);
    if (this.combo >= 2) {
      this.showComboBanner(this.combo);
    }

    // 生成新特效方块
    for (const spec of specialsToCreate) {
      const { row, col } = spec.pos;
      if (this.board[row] && this.board[row][col]) {
        this.board[row][col].special = spec.type;
        this.board[row][col].type = spec.gemType;
        this.updateTileElement(row, col);

        const el = document.getElementById(`tile-${row}-${col}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          this.particles.spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 16);
        }
      }
    }

    if (fullElimination.length > 0) {
      const center = fullElimination[Math.floor(fullElimination.length / 2)];
      this.spawnScorePopup(center.row, center.col, earnedScore, this.combo);
    }

    await this.animateAndRemoveCells(fullElimination);
  }

  // 消除动画并下落
  async animateAndRemoveCells(cells) {
    for (const m of cells) {
      const el = document.getElementById(`tile-${m.row}-${m.col}`);
      if (el) {
        el.classList.add('matched');
        const rect = el.getBoundingClientRect();
        this.particles.spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 6);
      }
    }

    await this.wait(CONFIG.matchDuration);
    await this.dropAndRefill(cells);
  }

  // ----------------------------------------
  // 级联掉落与连续连锁循环 (Cascade Loop)
  // ----------------------------------------
  async processCascadeLoop() {
    let analysis = this.analyzeMatches();

    while (analysis.hasMatches) {
      await this.processMatchStep(analysis);
      analysis = this.analyzeMatches();
    }
  }

  // ----------------------------------------
  // 掉落补位算法与新方块补充
  // ----------------------------------------
  async dropAndRefill(matches) {
    const N = this.gridSize;

    for (const m of matches) {
      this.board[m.row][m.col] = null;
    }

    const movedTiles = new Set();

    for (let c = 0; c < N; c++) {
      let writeRow = N - 1;
      for (let r = N - 1; r >= 0; r--) {
        if (this.board[r][c] !== null) {
          if (r !== writeRow) {
            this.board[writeRow][c] = this.board[r][c];
            this.board[r][c] = null;
            movedTiles.add(`${writeRow},${c}`);
          }
          writeRow--;
        }
      }

      while (writeRow >= 0) {
        this.board[writeRow][c] = {
          id: `${writeRow}-${c}-${Date.now()}-${Math.random()}`,
          type: Math.floor(Math.random() * 4),
          special: null
        };
        movedTiles.add(`${writeRow},${c}`);
        writeRow--;
      }
    }

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const el = document.getElementById(`tile-${r}-${c}`);
        const item = this.board[r][c];
        if (el && item) {
          el.classList.remove('matched');
          this.applyTileVisuals(el, item);

          if (movedTiles.has(`${r},${c}`)) {
            el.classList.remove('dropped');
            void el.offsetWidth;
            el.classList.add('dropped');
          }
        }
      }
    }

    await this.wait(CONFIG.dropDuration);
  }

  // ----------------------------------------
  // 视觉反馈动效辅助函数
  // ----------------------------------------
  popScoreAnimation() {
    this.dom.currentScore.classList.remove('pop');
    void this.dom.currentScore.offsetWidth;
    this.dom.currentScore.classList.add('pop');
    setTimeout(() => this.dom.currentScore.classList.remove('pop'), 250);
  }

  showComboBanner(combo) {
    const titles = [
      '',
      '',
      '✨ 治愈双重奏！',
      '🌟 超级大连击！',
      '💖 极速狂飙！',
      '🌈 奇迹漫天飞舞！'
    ];
    const text = titles[Math.min(combo, titles.length - 1)] || `🔥 Combo × ${combo}！`;
    this.dom.comboBanner.textContent = `${text} (x${combo})`;
    this.dom.comboBanner.classList.add('show');

    setTimeout(() => {
      this.dom.comboBanner.classList.remove('show');
    }, 900);
  }

  spawnScorePopup(r, c, score, combo) {
    const tileEl = document.getElementById(`tile-${r}-${c}`);
    if (!tileEl) return;

    const popup = document.createElement('div');
    popup.className = 'score-popup';
    popup.textContent = combo >= 2 ? `+${score} 连击!` : `+${score}`;

    const rect = tileEl.getBoundingClientRect();
    const frameRect = this.dom.boardFrame.getBoundingClientRect();

    popup.style.left = `${rect.left - frameRect.left + rect.width / 4}px`;
    popup.style.top = `${rect.top - frameRect.top}px`;

    this.dom.boardFrame.appendChild(popup);
    setTimeout(() => popup.remove(), 750);
  }

  // ----------------------------------------
  // 洗牌算法 (带优雅遮罩与风铃动画)
  // ----------------------------------------
  async shuffleBoardWithAnimation(isManual = false, customMsg = null) {
    if (this.isLocked || this.isGameOver) return;
    this.isLocked = true;
    this.clearHints();
    this.clearSelection();

    this.dom.overlayMsg.textContent = customMsg || (isManual ? '重新整理方块中...' : '棋盘无路可走，正在施展魔法重新洗牌 ✨');
    this.dom.boardOverlay.classList.add('active');
    this.sound.playShuffle();

    await this.wait(400);

    const items = [];
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        items.push({
          type: this.board[r][c].type,
          special: this.board[r][c].special
        });
      }
    }

    let valid = false;
    let attempts = 0;

    while (!valid && attempts < 100) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }

      let idx = 0;
      for (let r = 0; r < this.gridSize; r++) {
        for (let c = 0; c < this.gridSize; c++) {
          this.board[r][c].type = items[idx].type;
          this.board[r][c].special = items[idx].special;
          idx++;
        }
      }

      if (!this.analyzeMatches().hasMatches && this.findPossibleMove()) {
        valid = true;
      }
      attempts++;
    }

    if (!valid) {
      this.generateValidBoard();
    }

    this.renderBoard();
    await this.wait(300);

    this.dom.boardOverlay.classList.remove('active');
    this.isLocked = false;
    this.resetIdleTimer();

    if (isManual) {
      this.showToast('🔀 洗牌完毕，好运连连！');
    }
  }

  // ----------------------------------------
  // 智能提示系统
  // ----------------------------------------
  showManualHint() {
    if (this.isLocked || this.isGameOver) return;
    this.clearHints();
    const move = this.findPossibleMove();
    if (move) {
      this.highlightHints(move);
      this.sound.playSelect();
      this.showToast('💡 找到啦！注意看发光的两个方块~');
    } else {
      this.showToast('✨ 盘面无解，为你自动洗牌！');
      this.shuffleBoardWithAnimation(false);
    }
  }

  highlightHints(move) {
    this.hintTiles = move;
    for (const pos of move) {
      const el = document.getElementById(`tile-${pos.r}-${pos.c}`);
      if (el) el.classList.add('hint-pulse');
    }
  }

  clearHints() {
    if (this.hintTiles && this.hintTiles.length > 0) {
      for (const pos of this.hintTiles) {
        const el = document.getElementById(`tile-${pos.r}-${pos.c}`);
        if (el) el.classList.remove('hint-pulse');
      }
      this.hintTiles = [];
    }
  }

  resetIdleTimer() {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      if (!this.isLocked && !this.selected && !this.isGameOver) {
        const move = this.findPossibleMove();
        if (move) this.highlightHints(move);
      }
    }, CONFIG.idleHintDelay);
  }

  clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  // ----------------------------------------
  // 结算与死锁检测
  // ----------------------------------------
  checkEndConditions() {
    if (this.timeLeft <= 0) {
      this.handleGameOver();
      return true;
    }

    if (!this.findPossibleMove()) {
      this.shuffleBoardWithAnimation(false, '无路可走，已为你施展魔法重新洗牌 ✨');
    }

    return false;
  }

  // 倒计时结束，游戏立即结算
  handleGameOver() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.stopTimer();
    this.clearIdleTimer();
    this.clearSelection();
    this.isLocked = true;

    this.sound.playGameOver();

    // 计算玩家荣誉称号
    let rank = '🌟 消除新秀';
    if (this.currentScore >= 5000) {
      rank = '⚡ 极光神级传说 (顶级手速)';
    } else if (this.currentScore >= 3000) {
      rank = '👑 治愈手速大师';
    } else if (this.currentScore >= 1500) {
      rank = '🏆 敏捷挑战者';
    }

    this.dom.gameoverFinalScore.textContent = this.currentScore;
    this.dom.gameoverSurviveTime.textContent = `${this.totalSurvivedTime.toFixed(1)} 秒`;
    this.dom.gameoverMaxCombo.textContent = `x${this.maxCombo}`;
    this.dom.gameoverTotalCleared.textContent = `${this.totalClearedTiles} 个`;
    this.dom.gameoverRank.textContent = rank;

    setTimeout(() => this.openModal(this.dom.modalGameOver), 400);
  }

  openModal(modalEl) {
    if (modalEl) modalEl.classList.add('open');
  }

  closeModal(modalEl) {
    if (modalEl) modalEl.classList.remove('open');
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-item';
    toast.textContent = message;
    this.dom.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ==========================================
// 5. 网页就绪自动启动
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new Match3Game();
});
