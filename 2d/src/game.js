// ============================================================
//  רוד ראן - Road Run
//  משחק ריצה אינסופית דו-ממדי. כל הגרפיקה כרגע מצוירת בקוד
//  (placeholder) כדי שיהיה קל להחליף לספרייטים אמיתיים בהמשך.
// ============================================================

(() => {
  'use strict';

  // ---------- קבועים ----------
  const W = 960, H = 540;
  const ROAD_TOP = H - 150;      // שפת המדרכה
  const GROUND = H - 70;         // קו הריצה (כפות הרגליים)
  const GRAVITY = 2300;
  const JUMP_V = -820;
  const PLAYER_X = 230;
  const COP_START_GAP = 250;
  const COP_MAX_GAP = 320;
  const COP_CATCH_GAP = 55;
  const HIT_PENALTY = 95;
  const PANCAKE_BONUS = 8;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ---------- עזרים ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---------- צלילים (WebAudio קטן, בלי קבצים) ----------
  let audio = null;
  function ensureAudio() {
    if (audio) return;
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
  }
  function beep(freq, dur = 0.08, type = 'square', vol = 0.06) {
    if (!audio) return;
    try {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + dur);
    } catch (e) { /* ignore */ }
  }
  const sfx = {
    jump: () => beep(420, 0.1, 'square'),
    pancake: () => { beep(880, 0.06, 'triangle', 0.08); setTimeout(() => beep(1320, 0.08, 'triangle', 0.08), 50); },
    hit: () => beep(120, 0.25, 'sawtooth', 0.1),
    caught: () => { beep(300, 0.3, 'sawtooth', 0.1); setTimeout(() => beep(200, 0.5, 'sawtooth', 0.1), 250); },
  };

  // ============================================================
  //  ציור דמויות (placeholder art)
  // ============================================================

  const CHARACTERS = {
    kid:    { name: 'הילד',           skin: '#f2c9a0', shirt: '#7b4fd1', pants: '#2b3a67', shoes: '#222', hair: '#5a3a1a' },
    dragon: { name: 'החבר הדרקון',    skin: '#f2c9a0', shirt: '#3cb371', pants: '#2e8b57', shoes: '#1f5c3a', hair: '#3cb371' },
    redhat: { name: 'החבר עם הכובע',  skin: '#e8b68c', shirt: '#f5d142', pants: '#3b6ea5', shoes: '#333', hair: '#1a1a1a' },
  };

  // דמות רצה. (x, y) = מרכז כפות הרגליים. t = זמן להנפשה.
  function drawRunner(c, x, y, t, cfg, opts = {}) {
    const airborne = !!opts.airborne;
    const swing = airborne ? 0.35 : Math.sin(t * 16);
    const bob = airborne ? 0 : Math.abs(Math.cos(t * 16)) * 3;
    y -= bob;

    c.lineCap = 'round';
    c.lineJoin = 'round';

    // זנב דרקון (מאחורי הגוף)
    if (opts.variant === 'dragon') {
      c.strokeStyle = cfg.shirt;
      c.lineWidth = 9;
      c.beginPath();
      c.moveTo(x - 10, y - 38);
      c.quadraticCurveTo(x - 32, y - 40 + Math.sin(t * 8) * 4, x - 44, y - 22 + Math.sin(t * 8) * 6);
      c.stroke();
      c.fillStyle = '#e74c3c';
      c.beginPath();
      c.moveTo(x - 44, y - 30 + Math.sin(t * 8) * 6);
      c.lineTo(x - 54, y - 22 + Math.sin(t * 8) * 6);
      c.lineTo(x - 44, y - 14 + Math.sin(t * 8) * 6);
      c.closePath();
      c.fill();
      // כנפיים
      c.fillStyle = '#2e8b57';
      const flap = Math.sin(t * 10) * 6;
      c.beginPath();
      c.moveTo(x - 8, y - 50);
      c.lineTo(x - 30, y - 68 - flap);
      c.lineTo(x - 22, y - 46);
      c.closePath();
      c.fill();
    }

    // רגליים
    c.strokeStyle = cfg.pants;
    c.lineWidth = 9;
    const l1x = x - 4 + swing * 12, l2x = x + 4 - swing * 12;
    const l1y = airborne ? y - 10 : y - Math.max(0, swing) * 6;
    const l2y = airborne ? y - 4 : y - Math.max(0, -swing) * 6;
    c.beginPath(); c.moveTo(x - 5, y - 32); c.lineTo(l1x, l1y); c.stroke();
    c.beginPath(); c.moveTo(x + 5, y - 32); c.lineTo(l2x, l2y); c.stroke();
    // נעליים
    c.fillStyle = cfg.shoes;
    c.beginPath(); c.ellipse(l1x + 3, l1y, 8, 4, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(l2x + 3, l2y, 8, 4, 0, 0, Math.PI * 2); c.fill();

    // גוף
    c.fillStyle = cfg.shirt;
    roundRect(c, x - 13, y - 62, 26, 32, 7);
    c.fill();

    // זרועות
    c.strokeStyle = cfg.shirt;
    c.lineWidth = 8;
    if (opts.armsForward) {
      c.beginPath(); c.moveTo(x - 2, y - 54); c.lineTo(x + 24, y - 50); c.stroke();
      c.beginPath(); c.moveTo(x + 2, y - 52); c.lineTo(x + 26, y - 44); c.stroke();
      c.fillStyle = cfg.skin;
      c.beginPath(); c.arc(x + 27, y - 50, 4.5, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + 29, y - 44, 4.5, 0, Math.PI * 2); c.fill();
    } else {
      c.beginPath(); c.moveTo(x - 2, y - 54); c.lineTo(x - 4 - swing * 12, y - 38); c.stroke();
      c.beginPath(); c.moveTo(x + 2, y - 54); c.lineTo(x + 6 + swing * 12, y - 38); c.stroke();
      c.fillStyle = cfg.skin;
      c.beginPath(); c.arc(x - 4 - swing * 12, y - 37, 4.5, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + 6 + swing * 12, y - 37, 4.5, 0, Math.PI * 2); c.fill();
      // הילד מחזיק פחית ספריי (רמז לגרפיטי)
      if (opts.variant === 'kid') {
        c.fillStyle = '#1abc9c';
        roundRect(c, x + 3 + swing * 12, y - 45, 7, 12, 2);
        c.fill();
        c.fillStyle = '#e74c3c';
        c.fillRect(x + 4 + swing * 12, y - 48, 5, 3);
      }
    }

    // ראש
    const hx = x + 3, hy = y - 74;
    if (opts.variant === 'dragon') {
      // ראש תחפושת דרקון עם פרצוף הילד מציץ מהפה
      c.fillStyle = cfg.shirt;
      c.beginPath(); c.arc(hx, hy - 2, 18, 0, Math.PI * 2); c.fill();
      // אף/חוטם
      roundRect(c, hx + 8, hy - 8, 16, 12, 4); c.fill();
      // קרניים
      c.fillStyle = '#f1c40f';
      c.beginPath(); c.moveTo(hx - 10, hy - 16); c.lineTo(hx - 14, hy - 30); c.lineTo(hx - 3, hy - 18); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(hx + 4, hy - 18); c.lineTo(hx + 4, hy - 32); c.lineTo(hx + 12, hy - 16); c.closePath(); c.fill();
      // עיני הדרקון
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(hx + 6, hy - 10, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#000';
      c.beginPath(); c.arc(hx + 7, hy - 10, 2, 0, Math.PI * 2); c.fill();
      // הפנים של הילד
      c.fillStyle = cfg.skin;
      c.beginPath(); c.arc(hx + 2, hy + 4, 9, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#000';
      c.beginPath(); c.arc(hx + 6, hy + 2, 1.6, 0, Math.PI * 2); c.fill();
      // שיניים
      c.fillStyle = '#fff';
      c.beginPath(); c.moveTo(hx + 10, hy + 4); c.lineTo(hx + 13, hy + 9); c.lineTo(hx + 16, hy + 4); c.closePath(); c.fill();
    } else {
      c.fillStyle = cfg.skin;
      c.beginPath(); c.arc(hx, hy, 14, 0, Math.PI * 2); c.fill();
      // עין
      c.fillStyle = '#000';
      c.beginPath(); c.arc(hx + 7, hy - 2, 2, 0, Math.PI * 2); c.fill();
      // פה
      c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(hx + 6, hy + 4, 4, 0.1, Math.PI - 0.3); c.stroke();

      if (opts.variant === 'redhat') {
        // כובע אדום
        c.fillStyle = '#e02b2b';
        c.beginPath(); c.arc(hx, hy - 2, 15, Math.PI, 0); c.closePath(); c.fill();
        roundRect(c, hx - 4, hy - 6, 28, 6, 3); c.fill();
        c.fillStyle = '#b81f1f';
        c.fillRect(hx - 15, hy - 4, 30, 3);
      } else if (opts.variant === 'cop') {
        // כובע שוטר
        c.fillStyle = '#1f2f5f';
        c.fillRect(hx - 14, hy - 12, 28, 8);
        c.beginPath(); c.arc(hx, hy - 12, 14, Math.PI, 0); c.closePath(); c.fill();
        c.fillStyle = '#111';
        roundRect(c, hx - 2, hy - 6, 22, 4, 2); c.fill();
        c.fillStyle = '#f1c40f';
        c.beginPath(); c.arc(hx + 2, hy - 13, 4, 0, Math.PI * 2); c.fill();
        // שפם
        c.fillStyle = '#4a2e13';
        roundRect(c, hx, hy + 1, 12, 4, 2); c.fill();
        // תג על החזה
        c.fillStyle = '#f1c40f';
        c.beginPath(); c.arc(x + 6, y - 52, 4, 0, Math.PI * 2); c.fill();
      } else {
        // שיער פרוע
        c.fillStyle = cfg.hair;
        c.beginPath(); c.arc(hx - 2, hy - 5, 13, Math.PI * 1.05, Math.PI * 1.95); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(hx - 12, hy - 6); c.lineTo(hx - 16, hy - 14); c.lineTo(hx - 6, hy - 12); c.closePath(); c.fill();
      }
    }
  }

  const COP_CFG = { skin: '#f2c9a0', shirt: '#2b3f7a', pants: '#1a2649', shoes: '#111', hair: '#000' };

  function drawPancake(c, x, y, t) {
    const bob = Math.sin(t * 5 + x * 0.01) * 3;
    y += bob;
    for (let i = 2; i >= 0; i--) {
      const yy = y + i * 5;
      c.fillStyle = '#b8712f';
      c.beginPath(); c.ellipse(x, yy + 2, 15, 6, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e8a752';
      c.beginPath(); c.ellipse(x, yy, 15, 6, 0, 0, Math.PI * 2); c.fill();
    }
    // סירופ
    c.fillStyle = '#7a3e0e';
    c.beginPath(); c.ellipse(x, y - 1, 10, 4, 0, 0, Math.PI * 2); c.fill();
    c.fillRect(x + 4, y, 3, 6);
    // חמאה
    c.fillStyle = '#fff176';
    c.fillRect(x - 3, y - 5, 6, 5);
  }

  const OBSTACLE_TYPES = {
    cone:    { w: 30, h: 42 },
    trash:   { w: 40, h: 56 },
    hydrant: { w: 28, h: 46 },
    bench:   { w: 96, h: 40 },
  };

  function drawObstacle(c, ob) {
    const { x, w, h } = ob;
    const y = GROUND;
    switch (ob.type) {
      case 'cone':
        c.fillStyle = '#222';
        c.fillRect(x - 4, y - 5, w + 8, 5);
        c.fillStyle = '#ff7f11';
        c.beginPath(); c.moveTo(x + w / 2, y - h); c.lineTo(x + w, y - 4); c.lineTo(x, y - 4); c.closePath(); c.fill();
        c.fillStyle = '#fff';
        c.fillRect(x + 6, y - h * 0.55, w - 12, 6);
        break;
      case 'trash':
        c.fillStyle = '#5d6d7e';
        roundRect(c, x, y - h + 8, w, h - 8, 5); c.fill();
        c.fillStyle = '#34495e';
        for (let i = 0; i < 3; i++) c.fillRect(x + 6 + i * 11, y - h + 16, 4, h - 26);
        c.fillStyle = '#7f8c8d';
        roundRect(c, x - 4, y - h, w + 8, 10, 4); c.fill();
        break;
      case 'hydrant':
        c.fillStyle = '#c0392b';
        roundRect(c, x + 4, y - h + 8, w - 8, h - 8, 6); c.fill();
        c.beginPath(); c.arc(x + w / 2, y - h + 8, 10, Math.PI, 0); c.fill();
        c.fillStyle = '#e74c3c';
        c.fillRect(x - 2, y - h * 0.55, w + 4, 8);
        c.fillStyle = '#922b21';
        c.fillRect(x, y - 6, w, 6);
        break;
      case 'bench':
        c.fillStyle = '#2c3e50';
        c.fillRect(x + 8, y - 22, 6, 22);
        c.fillRect(x + w - 14, y - 22, 6, 22);
        c.fillStyle = '#8e5a2b';
        for (let i = 0; i < 2; i++) c.fillRect(x, y - 30 + i * 7, w, 5);
        c.fillRect(x, y - h, w, 6);
        c.fillRect(x, y - h + 8, w, 5);
        c.fillStyle = '#2c3e50';
        c.fillRect(x + 8, y - h - 2, 6, 14);
        c.fillRect(x + w - 14, y - h - 2, 6, 14);
        break;
    }
  }

  // ============================================================
  //  רקע: שכבות פרלקסה
  // ============================================================
  const SEG = 2400; // אורך מקטע חוזר

  function makeBuildings(seed, palette, minH, maxH, minW, maxW) {
    const list = [];
    let x = 0;
    while (x < SEG) {
      const w = randInt(minW, maxW);
      const h = randInt(minH, maxH);
      const cols = Math.max(1, Math.floor((w - 10) / 18));
      const rows = Math.max(1, Math.floor((h - 14) / 20));
      const windows = [];
      for (let r = 0; r < rows; r++)
        for (let col = 0; col < cols; col++)
          windows.push(Math.random() < 0.55);
      list.push({ x, w, h, color: pick(palette), cols, rows, windows, graffiti: Math.random() < 0.35 ? pick(['#ff2d95', '#00e5ff', '#ffe600', '#7cff00']) : null });
      x += w + randInt(4, 18);
    }
    return list;
  }

  const farBuildings = makeBuildings(1, ['#6d7fa8', '#7c8db5', '#5f6f97', '#8592b8'], 90, 220, 50, 110);
  const nearBuildings = makeBuildings(2, ['#c9705e', '#d99a5b', '#b7674f', '#e0b070', '#9c6f9a'], 70, 170, 70, 140);

  function drawBuildingLayer(c, list, offset, baseY, windowColor, drawGraffiti) {
    for (let k = 0; k < 2; k++) {
      const shift = -offset + k * SEG;
      for (const b of list) {
        const bx = b.x + shift;
        if (bx + b.w < 0 || bx > W) continue;
        c.fillStyle = b.color;
        c.fillRect(bx, baseY - b.h, b.w, b.h);
        // חלונות
        let i = 0;
        for (let r = 0; r < b.rows; r++) {
          for (let col = 0; col < b.cols; col++, i++) {
            if (!b.windows[i]) continue;
            c.fillStyle = windowColor;
            c.fillRect(bx + 6 + col * 18, baseY - b.h + 8 + r * 20, 10, 12);
          }
        }
        // גרפיטי (הרי בגלל זה כל הבלגן)
        if (drawGraffiti && b.graffiti) {
          c.strokeStyle = b.graffiti;
          c.lineWidth = 4;
          c.lineCap = 'round';
          c.beginPath();
          const gy = baseY - 22;
          c.moveTo(bx + 8, gy);
          c.bezierCurveTo(bx + b.w * 0.3, gy - 18, bx + b.w * 0.6, gy + 12, bx + b.w - 8, gy - 6);
          c.stroke();
        }
      }
    }
  }

  function drawBackground(c, scroll, t) {
    // שמיים
    const sky = c.createLinearGradient(0, 0, 0, ROAD_TOP);
    sky.addColorStop(0, '#5aa9e6');
    sky.addColorStop(1, '#bde3ff');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, ROAD_TOP);

    // שמש
    c.fillStyle = '#ffe680';
    c.beginPath(); c.arc(W - 140, 80, 42, 0, Math.PI * 2); c.fill();

    // עננים
    c.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 300 - scroll * 0.08) % (W + 200) + W + 200) % (W + 200) - 100;
      const cy = 60 + (i % 2) * 40;
      c.beginPath();
      c.arc(cx, cy, 20, 0, Math.PI * 2);
      c.arc(cx + 22, cy - 8, 26, 0, Math.PI * 2);
      c.arc(cx + 48, cy, 20, 0, Math.PI * 2);
      c.fill();
    }

    // בניינים רחוקים וקרובים
    drawBuildingLayer(c, farBuildings, (scroll * 0.2) % SEG, ROAD_TOP - 16, 'rgba(255,240,180,0.7)', false);
    drawBuildingLayer(c, nearBuildings, (scroll * 0.5) % SEG, ROAD_TOP - 16, '#fff3b0', true);

    // מדרכה
    c.fillStyle = '#c8c8c8';
    c.fillRect(0, ROAD_TOP - 16, W, 16);
    c.fillStyle = '#9a9a9a';
    c.fillRect(0, ROAD_TOP - 4, W, 4);

    // פנסי רחוב
    const lampOff = (scroll * 1.0) % 340;
    for (let lx = -lampOff; lx < W + 20; lx += 340) {
      c.fillStyle = '#444';
      c.fillRect(lx, ROAD_TOP - 110, 5, 94);
      c.fillRect(lx - 2, ROAD_TOP - 114, 20, 5);
      c.fillStyle = '#fff2a8';
      c.beginPath(); c.arc(lx + 18, ROAD_TOP - 108, 6, 0, Math.PI * 2); c.fill();
    }

    // כביש
    c.fillStyle = '#3d3d47';
    c.fillRect(0, ROAD_TOP, W, H - ROAD_TOP);
    // קו מקווקו
    c.fillStyle = '#f5d142';
    const dashOff = scroll % 80;
    for (let dx = -dashOff; dx < W; dx += 80) c.fillRect(dx, GROUND + 28, 44, 5);
    // צל של קו הריצה (כדי לעזור להבין איפה הקרקע)
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(0, GROUND, W, 2);
  }

  // ============================================================
  //  מצב המשחק
  // ============================================================
  const state = {
    mode: 'menu',          // menu | playing | gameover
    character: 'kid',
    time: 0,
    speed: 0,
    scroll: 0,
    distance: 0,
    pancakes: 0,
    player: { y: GROUND, vy: 0, onGround: true, jumps: 0, invincible: 0, hitFlash: 0 },
    copGap: COP_START_GAP,
    obstacles: [],
    items: [],
    particles: [],
    spawnDist: 0,
    shake: 0,
    best: Number(localStorage.getItem('roadrun_best') || 0),
  };

  const PLAYER_BOX = { w: 26, h: 60 };

  function reset() {
    state.time = 0;
    state.speed = 330;
    state.scroll = 0;
    state.distance = 0;
    state.pancakes = 0;
    state.player = { y: GROUND, vy: 0, onGround: true, jumps: 0, invincible: 0, hitFlash: 0 };
    state.copGap = COP_START_GAP;
    state.obstacles = [];
    state.items = [];
    state.particles = [];
    state.spawnDist = 500;
    state.shake = 0;
  }

  function jump() {
    const p = state.player;
    if (p.onGround) {
      p.vy = JUMP_V; p.onGround = false; p.jumps = 1; sfx.jump();
    } else if (p.jumps < 2) {
      p.vy = JUMP_V * 0.85; p.jumps = 2; sfx.jump();
      spawnParticles(PLAYER_X, p.y, 6, '#fff', 120);
    }
  }

  function spawnParticles(x, y, n, color, power) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(power * 0.4, power);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: rand(0.4, 0.8), color, size: rand(3, 6) });
    }
  }

  function spawnWave() {
    const roll = Math.random();
    const startX = W + 80;

    if (roll < 0.55) {
      // מכשול (לפעמים שניים צמודים)
      const type = pick(Object.keys(OBSTACLE_TYPES));
      const def = OBSTACLE_TYPES[type];
      state.obstacles.push({ type, x: startX, w: def.w, h: def.h, hit: false });
      if (Math.random() < 0.25 && type !== 'bench') {
        const t2 = pick(['cone', 'hydrant']);
        const d2 = OBSTACLE_TYPES[t2];
        state.obstacles.push({ type: t2, x: startX + def.w + 14, w: d2.w, h: d2.h, hit: false });
      }
      // פנקייק מעל המכשול, מזמין לקפוץ
      if (Math.random() < 0.6) {
        state.items.push({ x: startX + def.w / 2, y: GROUND - def.h - 70 });
      }
    } else {
      // שורה / קשת של פנקייקים
      const n = randInt(3, 6);
      const arc = Math.random() < 0.5;
      const baseY = arc ? GROUND - 60 : pick([GROUND - 35, GROUND - 110]);
      for (let i = 0; i < n; i++) {
        const yy = arc ? baseY - Math.sin((i / (n - 1)) * Math.PI) * 90 : baseY;
        state.items.push({ x: startX + i * 46, y: yy });
      }
    }
    state.spawnDist = rand(340, 640) + Math.max(0, 500 - state.speed) * 0.5;
  }

  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function update(dt) {
    if (state.mode !== 'playing') return;
    const p = state.player;

    state.time += dt;
    state.speed = Math.min(330 + state.time * 7, 760);
    const dx = state.speed * dt;
    state.scroll += dx;
    state.distance += dx / 40;

    // פיזיקה של השחקן
    p.vy += GRAVITY * dt;
    p.y += p.vy * dt;
    if (p.y >= GROUND) {
      if (!p.onGround) spawnParticles(PLAYER_X, GROUND, 4, '#bbb', 60);
      p.y = GROUND; p.vy = 0; p.onGround = true; p.jumps = 0;
    }
    p.invincible = Math.max(0, p.invincible - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);

    // יצירת מכשולים
    state.spawnDist -= dx;
    if (state.spawnDist <= 0) spawnWave();

    // הזזת אובייקטים
    for (const ob of state.obstacles) ob.x -= dx;
    for (const it of state.items) it.x -= dx;
    state.obstacles = state.obstacles.filter(o => o.x + o.w > -50);
    state.items = state.items.filter(i => i.x > -50 && !i.taken);

    // קופסת התנגשות של השחקן
    const px = PLAYER_X - PLAYER_BOX.w / 2, py = p.y - PLAYER_BOX.h;

    // מכשולים
    for (const ob of state.obstacles) {
      if (ob.hit || p.invincible > 0) continue;
      if (overlap(px, py, PLAYER_BOX.w, PLAYER_BOX.h, ob.x + 4, GROUND - ob.h + 4, ob.w - 8, ob.h - 4)) {
        ob.hit = true;
        p.invincible = 1.1;
        p.hitFlash = 0.35;
        state.copGap -= HIT_PENALTY;
        state.shake = 0.3;
        spawnParticles(PLAYER_X, p.y - 30, 12, '#ff5e5e', 200);
        sfx.hit();
      }
    }

    // פנקייקים
    for (const it of state.items) {
      if (overlap(px - 6, py - 6, PLAYER_BOX.w + 12, PLAYER_BOX.h + 12, it.x - 14, it.y - 8, 28, 22)) {
        it.taken = true;
        state.pancakes++;
        state.copGap = Math.min(COP_MAX_GAP, state.copGap + PANCAKE_BONUS);
        spawnParticles(it.x, it.y, 8, '#ffd166', 140);
        sfx.pancake();
      }
    }

    // השוטר מתקרב לאט לאט, ומהר יותר ככל שהזמן עובר
    const closing = Math.min(3 + state.time * 0.15, 26);
    state.copGap -= closing * dt;

    if (state.copGap <= COP_CATCH_GAP) endGame();

    // חלקיקים
    for (const pt of state.particles) {
      pt.life -= dt;
      pt.vy += 600 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    state.particles = state.particles.filter(pt => pt.life > 0);
    state.shake = Math.max(0, state.shake - dt);

    updateHud();
  }

  function endGame() {
    state.mode = 'gameover';
    sfx.caught();
    const score = Math.floor(state.pancakes * 10 + state.distance);
    if (score > state.best) {
      state.best = score;
      localStorage.setItem('roadrun_best', String(score));
    }
    document.getElementById('go-pancakes').textContent = state.pancakes;
    document.getElementById('go-distance').textContent = Math.floor(state.distance);
    document.getElementById('go-score').textContent = score;
    document.getElementById('go-best').textContent = state.best;
    setTimeout(() => {
      document.getElementById('hud').classList.add('hidden');
      document.getElementById('gameover').classList.remove('hidden');
    }, 700);
  }

  function updateHud() {
    document.getElementById('hud-pancakes').textContent = state.pancakes;
    document.getElementById('hud-distance').textContent = Math.floor(state.distance);
    const danger = 1 - clamp((state.copGap - COP_CATCH_GAP) / (COP_MAX_GAP - COP_CATCH_GAP), 0, 1);
    document.getElementById('hud-cop').style.width = (danger * 100).toFixed(0) + '%';
  }

  // ============================================================
  //  רינדור
  // ============================================================
  function render(t) {
    ctx.save();
    if (state.shake > 0) {
      ctx.translate(rand(-6, 6) * state.shake * 3, rand(-6, 6) * state.shake * 3);
    }

    drawBackground(ctx, state.scroll, t);

    // מכשולים
    for (const ob of state.obstacles) drawObstacle(ctx, ob);

    // פנקייקים
    for (const it of state.items) if (!it.taken) drawPancake(ctx, it.x, it.y, t);

    const p = state.player;
    const runT = state.mode === 'playing' ? t : 0;

    // השוטר (מאחורי השחקן)
    const copX = PLAYER_X - state.copGap;
    const copBob = Math.sin(t * 12) * 2;
    drawRunner(ctx, copX, GROUND + copBob, runT, COP_CFG, { variant: 'cop', armsForward: true });
    // בועת "עצור!" כשקרוב
    if (state.mode === 'playing' && state.copGap < 150 && Math.floor(t * 3) % 2 === 0) {
      ctx.fillStyle = '#fff';
      roundRect(ctx, copX + 20, GROUND - 130, 60, 26, 8); ctx.fill();
      ctx.fillStyle = '#c0392b';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('עצור!', copX + 50, GROUND - 111);
    }

    // השחקן
    const cfg = CHARACTERS[state.character];
    const visible = state.mode !== 'playing' || p.invincible <= 0 || Math.floor(t * 20) % 2 === 0;
    if (visible) {
      // צל
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      const shadowScale = clamp(1 - (GROUND - p.y) / 300, 0.4, 1);
      ctx.beginPath(); ctx.ellipse(PLAYER_X, GROUND + 2, 22 * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2); ctx.fill();
      drawRunner(ctx, PLAYER_X, p.y, runT, cfg, { variant: state.character, airborne: !p.onGround });
    }

    // חלקיקים
    for (const pt of state.particles) {
      ctx.globalAlpha = clamp(pt.life * 2, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // וינייטה אדומה כשהשוטר קרוב
    if (state.mode === 'playing' && state.copGap < 140) {
      const a = (1 - (state.copGap - COP_CATCH_GAP) / (140 - COP_CATCH_GAP)) * 0.45;
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.9);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(255,0,0,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    // הבזק פגיעה
    if (p.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${p.hitFlash * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ============================================================
  //  לולאה ראשית
  // ============================================================
  let last = 0, elapsed = 0;
  function frame(ts) {
    const dt = Math.min((ts - last) / 1000 || 0, 0.05);
    last = ts;
    elapsed += dt;
    update(dt);
    render(elapsed);
    requestAnimationFrame(frame);
  }

  // ============================================================
  //  ממשק וקלט
  // ============================================================
  const $ = id => document.getElementById(id);
  const screens = { menu: $('menu'), hud: $('hud'), gameover: $('gameover') };

  function startGame() {
    ensureAudio();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    reset();
    state.mode = 'playing';
    screens.menu.classList.add('hidden');
    screens.gameover.classList.add('hidden');
    screens.hud.classList.remove('hidden');
    updateHud();
  }

  function toMenu() {
    state.mode = 'menu';
    reset();
    screens.gameover.classList.add('hidden');
    screens.hud.classList.add('hidden');
    screens.menu.classList.remove('hidden');
  }

  $('start').addEventListener('click', startGame);
  $('restart').addEventListener('click', startGame);
  $('tomenu').addEventListener('click', toMenu);

  // בחירת דמות + ציור תצוגה מקדימה בכל כרטיס
  document.querySelectorAll('#chars .char').forEach(btn => {
    const key = btn.dataset.char;
    const pc = btn.querySelector('canvas').getContext('2d');
    btn.addEventListener('click', () => {
      state.character = key;
      document.querySelectorAll('#chars .char').forEach(b => b.classList.toggle('selected', b === btn));
    });
    (function animatePreview() {
      pc.clearRect(0, 0, 110, 120);
      drawRunner(pc, 52, 108, elapsed, CHARACTERS[key], { variant: key });
      requestAnimationFrame(animatePreview);
    })();
  });

  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (state.mode === 'playing') jump();
      else if (state.mode === 'menu') startGame();
      else if (state.mode === 'gameover' && !screens.gameover.classList.contains('hidden')) startGame();
    }
    if (e.code === 'Escape' && state.mode !== 'menu') toMenu();
  });

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    ensureAudio();
    if (state.mode === 'playing') jump();
  });

  reset();
  requestAnimationFrame(frame);

  // חשיפה לדיבוג בקונסול
  window.RoadRun = { state, jump, startGame, toMenu };
})();
