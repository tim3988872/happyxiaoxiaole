/**
 * ============================================================================
 * 萌萌治愈消消乐 (Cozy Match-3 Game) - 核心逻辑与游戏引擎
 * ============================================================================
 * 
 * 🎮 自定义参数说明：
 * - 如需更换方块图片，请将图片放置于 assets/images/ 并在 CONFIG.tileImages 中配置相对路径；
 * - 如需修改初始步数、通关目标分数或网格大小，可直接修改 CONFIG 对象中的对应字段。
 */

// ==========================================
// 1. 游戏配置中心 (Game Configuration)
// ==========================================
const CONFIG = {
  // 默认游戏参数
  gridSize: 16,               // 棋盘大小：16 × 16 (支持切换为 8, 10, 12, 16)
  initialMoves: 30,           // 初始步数：30 步
  targetScore: 3000,          // 通关目标分数：3000 分
  matchMin: 3,                // 消除最少连续数量：3 个及以上

  // 4 张方块图案素材 (使用相对路径，纯网页开箱即玩)
  tileImages: [
    './assets/images/tile1.jpg',
    './assets/images/tile2.jpg',
    './assets/images/tile3.jpg',
    './assets/images/tile4.jpg'
  ],

  // 计分规则
  scorePerTile: 10,           // 每个被消除方块的基础得分
  bonus4: 30,                 // 4连消额外奖励分
  bonus5: 80,                 // 5连消额外奖励分
  comboMultiplierStep: 0.5,   // 连击倍率增长步长 (x1.0, x1.5, x2.0...)

  // 动画与交互时长 (毫秒)
  swapDuration: 220,          // 交换动画时长
  matchDuration: 340,         // 消除爆破动画时长
  dropDuration: 260,          // 补位掉落动画时长
  idleHintDelay: 6000         // 发呆多少毫秒后自动触发闪烁提示 (6秒)
};

// ==========================================
// 2. 音效合成器 (Web Audio API Synthesizer)
// 免外部音频文件，零依赖，跨平台即开即响
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

    // 五声音阶基础频率表 (C5 ~ C6)
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

  // 胜利祝贺和弦
  playVictory() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const chords = [
      [523.25, 659.25, 783.99],
      [587.33, 739.99, 880.00],
      [659.25, 830.61, 987.77],
      [1046.5, 1318.5, 1567.98]
    ];
    const now = this.ctx.currentTime;

    chords.forEach((chord, i) => {
      const time = now + i * 0.18;
      chord.forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.12, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.6);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(time);
        osc.stop(time + 0.65);
      });
    });
  }

  // 失败柔和音
  playGameOver() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const notes = [440, 392, 349, 329];
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const time = now + idx * 0.22;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.12, time);
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
        alpha: Math.random() * 0.45 + 0.15,
        type: Math.random() > 0.5 ? 'circle' : 'star'
      });
    }
  }

  // 消除时产生绚丽治愈光斑
  spawnBurst(x, y, count = 12) {
    const colors = ['#FFD54F', '#FF8A65', '#FF4081', '#00E676', '#40C4FF'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 1.5;
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

    // 绘制环境漂浮粒子
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

    // 绘制消除爆破粒子
    for (let i = this.burstParticles.length - 1; i >= 0; i--) {
      const b = this.burstParticles[i];
      b.x += b.vx;
      b.y += b.vy;
      b.vy += 0.1; // 重力加速度
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
    // 基础状态
    this.gridSize = CONFIG.gridSize;
    this.movesLeft = CONFIG.initialMoves;
    this.targetScore = CONFIG.targetScore;
    this.currentScore = 0;
    this.bestScore = parseInt(localStorage.getItem('match3_best_score') || '0', 10);
    this.board = []; // 2D 数组 [row][col]
    this.selected = null; // 当前选中的方块 { row, col }
    this.isLocked = false; // 是否正在动画执行中（锁定用户操作）
    this.combo = 0; // 当前连锁消除次数
    this.idleTimer = null; // 发呆提示计时器
    this.hintTiles = []; // 当前提示高亮的两个方块

    // 拖拽手势状态
    this.pointerStart = null;

    // 音效与粒子
    this.sound = new SoundSynthesizer();
    this.particles = new ParticleSystem(document.getElementById('bg-canvas'));

    // DOM 元素引用
    this.dom = {
      board: document.getElementById('grid-board'),
      boardFrame: document.getElementById('board-frame'),
      currentScore: document.getElementById('current-score'),
      targetScore: document.getElementById('target-score'),
      movesLeft: document.getElementById('moves-left'),
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
      modalWin: document.getElementById('modal-win'),
      modalLose: document.getElementById('modal-lose'),
      modalRules: document.getElementById('modal-rules'),
      winFinalScore: document.getElementById('win-final-score'),
      winRemainingMoves: document.getElementById('win-remaining-moves'),
      winStars: document.getElementById('win-stars'),
      loseFinalScore: document.getElementById('lose-final-score'),
      loseGapScore: document.getElementById('lose-gap-score'),
      btnWinReplay: document.getElementById('btn-win-replay'),
      btnShare: document.getElementById('btn-share'),
      btnLoseReplay: document.getElementById('btn-lose-replay'),
      btnLoseRelax: document.getElementById('btn-lose-relax'),
      btnRulesClose: document.getElementById('btn-rules-close')
    };

    // 预加载方块素材，消除首次渲染延迟
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
    // 切换棋盘规格
    this.dom.gridSelect.addEventListener('change', (e) => {
      this.gridSize = parseInt(e.target.value, 10);
      this.startNewGame();
      this.showToast(`已切换为 ${this.gridSize} × ${this.gridSize} 棋盘规格`);
    });

    // 顶部按钮操作
    this.dom.btnSound.addEventListener('click', () => {
      const on = this.sound.toggle();
      this.dom.btnSound.querySelector('.icon').textContent = on ? '🔊' : '🔇';
      this.showToast(on ? '🎵 音效已开启' : '🔇 音效已静音');
    });

    this.dom.btnHint.addEventListener('click', () => this.showManualHint());
    this.dom.btnShuffle.addEventListener('click', () => this.shuffleBoardWithAnimation(true));
    this.dom.btnRestart.addEventListener('click', () => {
      if (confirm('确定要重新开始当前关卡吗？')) {
        this.startNewGame();
      }
    });

    this.dom.btnRules.addEventListener('click', () => this.openModal(this.dom.modalRules));
    this.dom.btnRulesClose.addEventListener('click', () => this.closeModal(this.dom.modalRules));

    // 胜利弹窗按钮
    this.dom.btnWinReplay.addEventListener('click', () => {
      this.closeModal(this.dom.modalWin);
      this.startNewGame();
    });

    this.dom.btnShare.addEventListener('click', () => {
      const shareText = `我在【萌萌治愈消消乐】中获得了 ${this.currentScore} 分！剩余步数 ${this.movesLeft} 步！快来一起治愈放松吧~ 💖`;
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

    // 失败弹窗按钮
    this.dom.btnLoseReplay.addEventListener('click', () => {
      this.closeModal(this.dom.modalLose);
      this.startNewGame();
    });

    this.dom.btnLoseRelax.addEventListener('click', () => {
      this.closeModal(this.dom.modalLose);
      this.gridSize = 8;
      this.dom.gridSelect.value = '8';
      this.startNewGame();
      this.showToast('已切换至 8×8 轻松模式，继续治愈吧~');
    });

    // 弹窗背景点击关闭 (仅规则弹窗)
    this.dom.modalRules.addEventListener('click', (e) => {
      if (e.target === this.dom.modalRules) this.closeModal(this.dom.modalRules);
    });

    // 棋盘指针与滑动交互 (同时支持点击与拖拽手势)
    this.dom.board.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    window.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
  }

  // ----------------------------------------
  // 开始新游戏
  // ----------------------------------------
  startNewGame() {
    this.clearIdleTimer();
    this.clearHints();
    this.selected = null;
    this.isLocked = false;
    this.combo = 0;
    this.movesLeft = CONFIG.initialMoves;
    this.currentScore = 0;

    // 更新界面配置
    document.documentElement.style.setProperty('--grid-size', this.gridSize);
    this.dom.board.style.gridTemplateColumns = `repeat(${this.gridSize}, 1fr)`;

    this.updateDashboard();
    this.generateValidBoard();
    this.renderBoard();
    this.resetIdleTimer();
  }

  // ----------------------------------------
  // 仪表盘与进度条更新
  // ----------------------------------------
  updateDashboard() {
    this.dom.currentScore.textContent = this.currentScore;
    this.dom.targetScore.textContent = this.targetScore;
    this.dom.movesLeft.textContent = this.movesLeft;
    this.dom.bestScore.textContent = this.bestScore;

    // 计算达成进度
    const pct = Math.min(100, Math.round((this.currentScore / this.targetScore) * 100));
    this.dom.progressFill.style.width = `${pct}%`;
    this.dom.progressPercent.textContent = `${pct}%`;

    if (this.currentScore >= this.targetScore) {
      this.dom.progressStatus.textContent = '🎉 目标达成！治愈满分！';
    } else {
      const remaining = this.targetScore - this.currentScore;
      this.dom.progressStatus.textContent = `距离目标还差 ${remaining} 分`;
    }

    // 历史最高分记录
    if (this.currentScore > this.bestScore) {
      this.bestScore = this.currentScore;
      localStorage.setItem('match3_best_score', this.bestScore);
      this.dom.bestScore.textContent = this.bestScore;
    }
  }

  // ----------------------------------------
  // 生成无初始可消除且有解的初始棋盘
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
            type: type
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
        fragment.appendChild(tileEl);
      }
    }

    this.dom.board.appendChild(fragment);
  }

  // ----------------------------------------
  // 寻找盘面任意一个可消除的合法移动 (用于死锁检测和提示)
  // ----------------------------------------
  findPossibleMove() {
    const N = this.gridSize;
    // 遍历所有相邻方块模拟交换
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        // 尝试向右交换
        if (c + 1 < N) {
          if (this.testSwapHasMatch(r, c, r, c + 1)) {
            return [{ r, c }, { r, c: c + 1 }];
          }
        }
        // 尝试向下交换
        if (r + 1 < N) {
          if (this.testSwapHasMatch(r, c, r + 1, c)) {
            return [{ r, c }, { r: r + 1, c }];
          }
        }
      }
    }
    return null;
  }

  // 模拟交换并测试是否产生三消
  testSwapHasMatch(r1, c1, r2, c2) {
    if (!this.board[r1] || !this.board[r2]) return false;
    // 临时交换
    const item1 = this.board[r1][c1];
    const item2 = this.board[r2][c2];
    this.board[r1][c1] = item2;
    this.board[r2][c2] = item1;

    const matches = this.findAllMatches();

    // 恢复原状
    this.board[r1][c1] = item1;
    this.board[r2][c2] = item2;

    return matches.length > 0;
  }

  // ----------------------------------------
  // 查找棋盘上所有横向与纵向连续 3+ 的方块
  // ----------------------------------------
  findAllMatches() {
    const N = this.gridSize;
    const matchMap = new Map(); // key: "r,c" -> { row, col }

    // 1. 横向扫描连续
    for (let r = 0; r < N; r++) {
      let startCol = 0;
      let matchLen = 1;
      let currType = this.board[r][0] ? this.board[r][0].type : -1;

      for (let c = 1; c <= N; c++) {
        const itemType = (c < N && this.board[r][c]) ? this.board[r][c].type : -1;
        if (itemType === currType && currType !== -1) {
          matchLen++;
        } else {
          if (matchLen >= CONFIG.matchMin && currType !== -1) {
            for (let k = startCol; k < startCol + matchLen; k++) {
              matchMap.set(`${r},${k}`, { row: r, col: k });
            }
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
      let currType = this.board[0][c] ? this.board[0][c].type : -1;

      for (let r = 1; r <= N; r++) {
        const itemType = (r < N && this.board[r][c]) ? this.board[r][c].type : -1;
        if (itemType === currType && currType !== -1) {
          matchLen++;
        } else {
          if (matchLen >= CONFIG.matchMin && currType !== -1) {
            for (let k = startRow; k < startRow + matchLen; k++) {
              matchMap.set(`${k},${c}`, { row: k, col: c });
            }
          }
          startRow = r;
          currType = itemType;
          matchLen = 1;
        }
      }
    }

    return Array.from(matchMap.values());
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
    if (this.isLocked) return;
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
    if (!this.pointerStart || this.isLocked || this.pointerStart.hasMoved) return;

    const dx = e.clientX - this.pointerStart.x;
    const dy = e.clientY - this.pointerStart.y;
    const threshold = 18; // 滑动判定阈值

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

      // 边界检查
      if (targetRow >= 0 && targetRow < this.gridSize && targetCol >= 0 && targetCol < this.gridSize) {
        this.clearSelection();
        this.attemptSwap(row, col, targetRow, targetCol);
      }
    }
  }

  handlePointerUp(e) {
    if (!this.pointerStart) return;

    // 如果未触发滑动判定，则作为常规点击处理
    if (!this.pointerStart.hasMoved && !this.isLocked) {
      const tileData = this.getTileCoordinatesFromElement(e.target);
      if (tileData) {
        this.handleTileClick(tileData.row, tileData.col);
      }
    }

    this.pointerStart = null;
  }

  // 点击选择与邻格交换处理
  handleTileClick(r, c) {
    this.sound.playSelect();
    this.clearHints();
    this.resetIdleTimer();

    // 尚未选中任何方块
    if (!this.selected) {
      this.selectTile(r, c);
      return;
    }

    // 重复点击同一方块，取消选中
    if (this.selected.row === r && this.selected.col === c) {
      this.clearSelection();
      return;
    }

    // 判断是否相邻 (曼哈顿距离为 1)
    const dist = Math.abs(this.selected.row - r) + Math.abs(this.selected.col - c);
    if (dist === 1) {
      const { row: prevR, col: prevC } = this.selected;
      this.clearSelection();
      this.attemptSwap(prevR, prevC, r, c);
    } else {
      // 不相邻，改选新方块
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
  // 核心逻辑：尝试交换两方块并结算
  // ----------------------------------------
  async attemptSwap(r1, c1, r2, c2) {
    this.isLocked = true;
    this.clearHints();
    this.clearIdleTimer();

    const el1 = document.getElementById(`tile-${r1}-${c1}`);
    const el2 = document.getElementById(`tile-${r2}-${c2}`);

    // 计算两者相对偏移坐标以执行丝滑 CSS 位移动画
    const rect1 = el1.getBoundingClientRect();
    const rect2 = el2.getBoundingClientRect();
    const dx = rect2.left - rect1.left;
    const dy = rect2.top - rect1.top;

    this.sound.playSwap();

    // 播放交换移动动画
    el1.style.transition = `transform ${CONFIG.swapDuration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
    el2.style.transition = `transform ${CONFIG.swapDuration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
    el1.style.transform = `translate(${dx}px, ${dy}px)`;
    el2.style.transform = `translate(${-dx}px, ${-dy}px)`;
    el1.style.zIndex = '15';
    el2.style.zIndex = '15';

    await this.wait(CONFIG.swapDuration);

    // 数据交换
    const item1 = this.board[r1][c1];
    const item2 = this.board[r2][c2];
    this.board[r1][c1] = item2;
    this.board[r2][c2] = item1;

    const initialMatches = this.findAllMatches();

    if (initialMatches.length === 0) {
      // 无法形成消除，弹回原位
      this.sound.playInvalid();
      el1.style.transform = 'translate(0, 0)';
      el2.style.transform = 'translate(0, 0)';
      await this.wait(CONFIG.swapDuration);

      // 复原样式与数据
      el1.style.transition = '';
      el2.style.transition = '';
      el1.style.transform = '';
      el2.style.transform = '';
      el1.style.zIndex = '';
      el2.style.zIndex = '';

      this.board[r1][c1] = item1;
      this.board[r2][c2] = item2;

      this.isLocked = false;
      this.resetIdleTimer();
      return;
    }

    // 形成有效消除：消耗 1 步
    this.movesLeft--;
    this.updateDashboard();

    // 重置元素变换并重新渲染盘面准备消除
    el1.style.transition = '';
    el2.style.transition = '';
    el1.style.transform = '';
    el2.style.transform = '';
    el1.style.zIndex = '';
    el2.style.zIndex = '';

    this.updateTileElement(r1, c1);
    this.updateTileElement(r2, c2);

    // 进入连锁消除循环
    this.combo = 0;
    await this.processCascadeLoop();

    // 关卡胜负判定
    if (this.currentScore >= this.targetScore) {
      this.handleGameWin();
      return;
    }

    if (this.movesLeft <= 0) {
      this.handleGameLose();
      return;
    }

    // 检查死锁：若无路可走则自动洗牌
    if (!this.findPossibleMove()) {
      await this.shuffleBoardWithAnimation(false, '无路可走，已为你施展魔法重新洗牌 ✨');
    }

    this.isLocked = false;
    this.resetIdleTimer();
  }

  // ----------------------------------------
  // 级联消除与连锁反应循环 (Cascade Loop)
  // ----------------------------------------
  async processCascadeLoop() {
    let matches = this.findAllMatches();

    while (matches.length > 0) {
      this.combo++;
      const matchCount = matches.length;

      // 计分计算：包含基础分、多消奖励与连击加成
      const bonus = (matchCount > 3) ? (matchCount - 3) * CONFIG.bonus4 : 0;
      const basePoints = matchCount * CONFIG.scorePerTile + bonus;
      const multiplier = 1 + (this.combo - 1) * CONFIG.comboMultiplierStep;
      const earnedScore = Math.round(basePoints * multiplier);

      this.currentScore += earnedScore;
      this.updateDashboard();
      this.popScoreAnimation();

      // 音效播放
      this.sound.playMatch(this.combo);

      // 显示连击提示横幅
      if (this.combo >= 2) {
        this.showComboBanner(this.combo);
      }

      // 为消除的方块添加爆炸动效、飘字与粒子
      for (const m of matches) {
        const el = document.getElementById(`tile-${m.row}-${m.col}`);
        if (el) {
          el.classList.add('matched');
          const rect = el.getBoundingClientRect();
          this.particles.spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 8);
        }
      }

      // 在其中一个消除方块处弹出得分小标签
      if (matches.length > 0) {
        const centerTile = matches[Math.floor(matches.length / 2)];
        this.spawnScorePopup(centerTile.row, centerTile.col, earnedScore, this.combo);
      }

      await this.wait(CONFIG.matchDuration);

      // 掉落补位算法处理
      await this.dropAndRefill(matches);

      // 再次检查是否由掉落触发了新一轮消除
      matches = this.findAllMatches();
    }
  }

  // ----------------------------------------
  // 掉落补位算法与新方块补充
  // ----------------------------------------
  async dropAndRefill(matches) {
    const N = this.gridSize;
    // 将已消除位置置为 null
    for (const m of matches) {
      this.board[m.row][m.col] = null;
    }

    // 记录发生掉落或新生成方块的坐标，用于针对性播放下落微弹动画
    const movedTiles = new Set();

    // 按列自底向上让已有方块下落
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

      // 顶部空缺生成新随机方块
      while (writeRow >= 0) {
        this.board[writeRow][c] = {
          id: `${writeRow}-${c}-${Date.now()}-${Math.random()}`,
          type: Math.floor(Math.random() * 4)
        };
        movedTiles.add(`${writeRow},${c}`);
        writeRow--;
      }
    }

    // 重新渲染掉落后的方块并附加掉落动效
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const el = document.getElementById(`tile-${r}-${c}`);
        const item = this.board[r][c];
        if (el && item) {
          el.classList.remove('matched');
          const img = el.querySelector('img');
          if (img) img.src = CONFIG.tileImages[item.type];

          // 仅对发生移动或新生成的方块赋予入场跳跃动效
          if (movedTiles.has(`${r},${c}`)) {
            el.classList.remove('dropped');
            void el.offsetWidth; // 触发回流重置动效
            el.classList.add('dropped');
          }
        }
      }
    }

    await this.wait(CONFIG.dropDuration);
  }

  // 更新单个方块 DOM 内容
  updateTileElement(r, c) {
    const el = document.getElementById(`tile-${r}-${c}`);
    const item = this.board[r][c];
    if (el && item) {
      const img = el.querySelector('img');
      if (img) img.src = CONFIG.tileImages[item.type];
    }
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
      '💖 治愈力爆棚！',
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
    if (this.isLocked) return;
    this.isLocked = true;
    this.clearHints();
    this.clearSelection();

    this.dom.overlayMsg.textContent = customMsg || (isManual ? '重新整理方块中...' : '棋盘无路可走，正在施展魔法重新洗牌 ✨');
    this.dom.boardOverlay.classList.add('active');
    this.sound.playShuffle();

    await this.wait(400);

    // 收集所有方块类型并打乱
    let types = [];
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        types.push(this.board[r][c].type);
      }
    }

    let valid = false;
    let attempts = 0;

    while (!valid && attempts < 100) {
      // Fisher-Yates 洗牌
      for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
      }

      let idx = 0;
      for (let r = 0; r < this.gridSize; r++) {
        for (let c = 0; c < this.gridSize; c++) {
          this.board[r][c].type = types[idx++];
        }
      }

      // 洗牌后确保无直接三消且至少有一步可移动
      if (this.findAllMatches().length === 0 && this.findPossibleMove()) {
        valid = true;
      }
      attempts++;
    }

    // 若无法通过重排得到合法棋盘，直接重新生成一份全新棋盘
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
  // 智能提示系统 (发呆自动提示 + 手动求助)
  // ----------------------------------------
  showManualHint() {
    if (this.isLocked) return;
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
      if (!this.isLocked && !this.selected) {
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
  // 结算与弹窗管理 (Win / Lose / Modal)
  // ----------------------------------------
  handleGameWin() {
    this.clearIdleTimer();
    this.sound.playVictory();

    // 计算星级评级
    let stars = '⭐⭐⭐';
    if (this.movesLeft < 5) stars = '⭐⭐';
    if (this.movesLeft === 0) stars = '⭐';

    this.dom.winFinalScore.textContent = this.currentScore;
    this.dom.winRemainingMoves.textContent = this.movesLeft;
    this.dom.winStars.textContent = stars;

    // 粒子喷射庆祝
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        this.particles.spawnBurst(cx + (Math.random() - 0.5) * 200, cy + (Math.random() - 0.5) * 200, 24);
      }, i * 200);
    }

    setTimeout(() => this.openModal(this.dom.modalWin), 500);
  }

  handleGameLose() {
    this.clearIdleTimer();
    this.sound.playGameOver();

    this.dom.loseFinalScore.textContent = this.currentScore;
    this.dom.loseGapScore.textContent = Math.max(0, this.targetScore - this.currentScore);

    setTimeout(() => this.openModal(this.dom.modalLose), 500);
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
