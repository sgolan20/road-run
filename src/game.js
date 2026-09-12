// ============================================================
//  רוד ראן - Road Run (גרסת תלת-ממד)
//  המצלמה מאחור ומהצד (מבט אלכסוני של כ-45 מעלות). השחקן רץ קדימה
//  לתוך המסך, השוטר רודף אחריו בין המצלמה לשחקן, והמכשולים
//  והפנקייקים מגיעים מהאופק שלפנים ועוברים לכיוון המצלמה.
//  כל המודלים בנויים מצורות בסיסיות (placeholder) כדי שיהיה קל
//  להחליף אותם במודלים אמיתיים בהמשך.
// ============================================================

(() => {
  'use strict';
  const THREE = window.THREE;
  if (!THREE) { alert('three.js לא נטען'); return; }

  // ---------- קבועים (מטרים, שניות) ----------
  const ROAD_W = 8, SIDEWALK_W = 2.2, ROAD_LEN = 320;
  const PLAYER_Z = 0;             // מיקום השחקן על ציר הכביש
  const SPAWN_Z = -115;           // איפה נולדים מכשולים (באופק, מאחורי השוטר)
  // מצלמה אלכסונית: מאחורי השחקן ומימינו, גבוהה. רואים את הפרופיל של הדמויות,
  // את השוטר שרודף מאחור ואת הדרך שלפנים.
  const CAM_POS = [7.5, 5.5, 11];
  const CAM_LOOK = [-1.5, 0.8, -10];
  const GRAVITY = 52, JUMP_V = 19;
  const COP_START_GAP = 5.0, COP_MAX_GAP = 6.5, COP_CATCH_GAP = 1.4;
  const HIT_PENALTY = 1.6, PANCAKE_BONUS = 0.16;
  const SPEED_START = 8, SPEED_MAX = 19, SPEED_ACCEL = 0.17;
  const SPECIAL_EVERY = 250;      // כל כמה מטרים מופיע פנקייק מיוחד
  const SHIELD_PUSH = 8.5;        // לאן השוטר נזרק כשהמגן עוצר אותו
  const FART_PUSH = 5.5;          // כמה הפלוץ מעיף את השוטר אחורה
  const LANE_W = 2.4;             // רוחב נתיב: הנתיבים ב-x = -2.4, 0, 2.4
  const LANE_SNAP = 12;           // כמה מהר השחקן עובר נתיב

  // ---------- עזרים ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  function shadowed(m) { m.castShadow = true; return m; }
  const box = (w, h, d, color) => shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)));
  const sphere = (r, color, seg = 16) => shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), mat(color)));
  const cyl = (rt, rb, h, color, seg = 16) => shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color)));
  const cone = (r, h, color, seg = 16) => shadowed(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color)));

  function disposeObject(obj) {
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }

  // ---------- צלילים ----------
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
    golden: () => { [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => beep(f, 0.12, 'triangle', 0.08), i * 70)); },
    rotten: () => { beep(200, 0.15, 'sawtooth', 0.06); setTimeout(() => beep(150, 0.2, 'sawtooth', 0.06), 120); },
    shield: () => { beep(500, 0.15, 'square', 0.08); setTimeout(() => beep(900, 0.25, 'square', 0.08), 100); },
    fart: () => { for (let i = 0; i < 7; i++) setTimeout(() => beep(70 + Math.random() * 40, 0.09, 'sawtooth', 0.12), i * 60); },
  };

  // ============================================================
  //  דמויות (placeholder low-poly). הדמות פונה ל-+Z (אל המצלמה).
  // ============================================================
  const CHARACTERS = {
    kid:    { name: 'הילד',          skin: '#f2c9a0', shirt: '#7b4fd1', pants: '#2b3a67', shoes: '#222',    hair: '#5a3a1a' },
    dragon: { name: 'החבר הדרקון',   skin: '#f2c9a0', shirt: '#3cb371', pants: '#2e8b57', shoes: '#1f5c3a', hair: '#3cb371' },
    redhat: { name: 'החבר עם הכובע', skin: '#e8b68c', shirt: '#f5d142', pants: '#3b6ea5', shoes: '#333',    hair: '#1a1a1a' },
    cop:    { name: 'השוטר',         skin: '#f2c9a0', shirt: '#2b3f7a', pants: '#1a2649', shoes: '#111',    hair: '#000' },
  };

  function addFace(parent, cfg, cx, cy, r) {
    for (const side of [-1, 1]) {
      const white = sphere(0.085, '#fff', 12); white.position.set(cx + side * 0.12, cy + 0.06, r - 0.06); parent.add(white);
      const pupil = sphere(0.045, '#111', 8); pupil.position.set(cx + side * 0.12, cy + 0.06, r + 0.015); parent.add(pupil);
      const brow = box(0.13, 0.035, 0.03, cfg.hair === '#3cb371' ? '#333' : cfg.hair); brow.position.set(cx + side * 0.12, cy + 0.18, r - 0.02); brow.rotation.z = side * 0.15; parent.add(brow);
    }
    const nose = sphere(0.045, '#e0a878', 8); nose.position.set(cx, cy - 0.02, r); parent.add(nose);
    const mouth = box(0.17, 0.05, 0.03, '#c0392b'); mouth.position.set(cx, cy - 0.13, r - 0.02); parent.add(mouth);
  }

  function buildCharacter(variant) {
    const cfg = CHARACTERS[variant];
    const group = new THREE.Group();
    const parts = {};

    // רגליים עם ברכיים: ירך (hip) -> ברך (knee) -> שוק + נעל
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.13, 0.85, 0);
      const thigh = box(0.17, 0.42, 0.17, cfg.pants); thigh.position.y = -0.21; hip.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
      const shin = box(0.15, 0.4, 0.15, cfg.pants); shin.position.y = -0.2; knee.add(shin);
      const shoe = box(0.19, 0.1, 0.3, cfg.shoes); shoe.position.set(0, -0.4, 0.06); knee.add(shoe);
      group.add(hip);
      parts[side < 0 ? 'hipL' : 'hipR'] = hip;
      parts[side < 0 ? 'kneeL' : 'kneeR'] = knee;
    }

    // פלג גוף עליון שמסתובב סביב האגן (כדי שהגוף ייטה קדימה בריצה)
    const upper = new THREE.Group(); upper.position.y = 0.85;
    const body = new THREE.Group(); body.position.y = -0.85;
    upper.add(body); group.add(upper);
    parts.upper = upper;

    const torso = box(0.52, 0.62, 0.3, cfg.shirt); torso.position.y = 1.16; body.add(torso);

    // זרועות עם מרפקים: כתף (shoulder) -> מרפק (elbow) -> אמה + כף יד
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.34, 1.42, 0);
      const upperArm = box(0.14, 0.3, 0.14, cfg.shirt); upperArm.position.y = -0.15; shoulder.add(upperArm);
      const elbow = new THREE.Group(); elbow.position.y = -0.3; shoulder.add(elbow);
      const forearm = box(0.13, 0.3, 0.13, cfg.shirt); forearm.position.y = -0.15; elbow.add(forearm);
      const hand = sphere(0.08, cfg.skin, 10); hand.position.y = -0.32; elbow.add(hand);
      body.add(shoulder);
      parts[side < 0 ? 'shoulderL' : 'shoulderR'] = shoulder;
      parts[side < 0 ? 'elbowL' : 'elbowR'] = elbow;
    }

    // ראש
    // פרצוף גדול וברור (עיניים עם לבן, גבות, אף ופה) כדי שיהיה ברור גם מרחוק שהדמות פונה אלינו
    if (variant !== 'dragon') {
      const head = sphere(0.32, cfg.skin); head.position.y = 1.8; body.add(head);
      addFace(body, cfg, 0, 1.8, 0.32);
    }

    if (variant === 'kid') {
      const hair = sphere(0.33, cfg.hair); hair.position.set(0, 1.96, -0.1); hair.scale.set(1, 0.6, 1); body.add(hair);
      for (let i = 0; i < 3; i++) {
        const spike = cone(0.06, 0.2, cfg.hair, 8);
        spike.position.set(-0.12 + i * 0.12, 2.18, -0.12);
        spike.rotation.z = (i - 1) * 0.4;
        body.add(spike);
      }
      // פחית ספריי ביד ימין
      const can = cyl(0.05, 0.05, 0.18, '#1abc9c', 10); can.position.set(0, -0.36, 0.08); parts.elbowR.add(can);
      const cap = cyl(0.03, 0.03, 0.05, '#e74c3c', 8); cap.position.set(0, -0.25, 0.08); parts.elbowR.add(cap);
    }

    if (variant === 'redhat') {
      const cap = sphere(0.34, '#e02b2b'); cap.position.set(0, 1.94, -0.04); cap.scale.set(1, 0.62, 1); body.add(cap);
      const brim = box(0.34, 0.04, 0.26, '#e02b2b'); brim.position.set(0, 2.0, 0.36); body.add(brim);
      const button = sphere(0.04, '#b81f1f', 8); button.position.set(0, 2.16, -0.04); body.add(button);
    }

    if (variant === 'dragon') {
      const dhead = sphere(0.44, cfg.shirt); dhead.position.set(0, 1.92, -0.1); body.add(dhead);
      // הפנים של הילד מציצות מהפה
      const face = sphere(0.25, cfg.skin); face.position.set(0, 1.72, 0.24); body.add(face);
      addFace(body, cfg, 0, 1.72, 0.49);
      for (const side of [-1, 1]) {
        const deye = sphere(0.1, '#fff', 10); deye.position.set(side * 0.19, 2.16, 0.28); body.add(deye);
        const pupil = sphere(0.045, '#111', 8); pupil.position.set(side * 0.19, 2.16, 0.37); body.add(pupil);
        const horn = cone(0.07, 0.3, '#f1c40f', 8); horn.position.set(side * 0.2, 2.4, -0.1); horn.rotation.z = -side * 0.35; body.add(horn);
      }
      for (let i = -1; i <= 1; i++) {
        const tooth = cone(0.035, 0.09, '#fff', 6); tooth.position.set(i * 0.14, 2.0, 0.42); tooth.rotation.x = Math.PI; body.add(tooth);
      }
      // זנב
      const tail = new THREE.Group(); tail.position.set(0, 0.9, -0.15);
      const tailBody = cyl(0.04, 0.1, 0.9, cfg.shirt, 10); tailBody.rotation.x = -Math.PI / 2; tailBody.position.z = -0.45; tail.add(tailBody);
      const tip = cone(0.1, 0.25, '#e74c3c', 8); tip.rotation.x = -Math.PI / 2; tip.position.z = -1.0; tail.add(tip);
      body.add(tail); parts.tail = tail;
      // כנפיים
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group(); pivot.position.set(side * 0.28, 1.45, -0.17);
        const wing = box(0.55, 0.35, 0.03, '#2e8b57'); wing.position.x = side * 0.27; pivot.add(wing);
        body.add(pivot);
        parts[side < 0 ? 'wingL' : 'wingR'] = pivot;
      }
    }

    if (variant === 'cop') {
      const cap = cyl(0.33, 0.33, 0.14, '#1f2f5f'); cap.position.set(0, 2.08, -0.02); body.add(cap);
      const capTop = cyl(0.36, 0.36, 0.05, '#1f2f5f'); capTop.position.set(0, 2.17, -0.04); body.add(capTop);
      const brim = box(0.34, 0.03, 0.24, '#111'); brim.position.set(0, 2.02, 0.34); body.add(brim);
      const badge = sphere(0.055, '#f1c40f', 8); badge.position.set(0, 2.1, 0.32); body.add(badge);
      const mustache = box(0.28, 0.07, 0.06, '#4a2e13'); mustache.position.set(0, 1.71, 0.31); body.add(mustache);
      const chestBadge = sphere(0.05, '#f1c40f', 8); chestBadge.position.set(0.14, 1.3, 0.16); body.add(chestBadge);
    }

    return { group, parts, variant };
  }

  // מחזור ריצה. הדמות פונה ל-+Z. סיבוב חיובי סביב X מזיז את קצה האיבר אחורה (-Z).
  // הרגל שמתנדנדת קדימה מרימה את הברך גבוה (הברך מתכופפת), הרגל שמאחור כמעט ישרה,
  // המרפקים כפופים והגוף נוטה קדימה - כל אלה הופכים את כיוון הריצה לחד-משמעי.
  function animateCharacter(ch, t, opts = {}) {
    const { parts, group } = ch;
    const air = !!opts.airborne;
    const phase = t * 16;
    const s = Math.sin(phase);

    const legPose = (hip, knee, ph, tuck) => {
      if (air) {
        hip.rotation.x = tuck ? -1.0 : 0.5;
        knee.rotation.x = tuck ? 1.3 : 0.5;
      } else {
        hip.rotation.x = -0.8 * Math.sin(ph);                       // קדימה כש-sin חיובי
        knee.rotation.x = 1.4 * Math.max(0, Math.sin(ph + 1.0));    // ברך מתכופפת בזמן ההנפה קדימה
      }
    };
    legPose(parts.hipL, parts.kneeL, phase, true);
    legPose(parts.hipR, parts.kneeR, phase + Math.PI, false);

    if (opts.armsForward) {
      parts.shoulderL.rotation.x = -1.3 + s * 0.15;
      parts.shoulderR.rotation.x = -1.3 - s * 0.15;
      parts.elbowL.rotation.x = -0.3;
      parts.elbowR.rotation.x = -0.3;
    } else if (air) {
      parts.shoulderL.rotation.x = -2.0; parts.shoulderR.rotation.x = -1.7;
      parts.elbowL.rotation.x = -0.5; parts.elbowR.rotation.x = -0.6;
    } else {
      // זרוע שמאל נגד רגל שמאל, מרפקים כפופים ב-90 מעלות
      parts.shoulderL.rotation.x = 0.9 * s;
      parts.shoulderR.rotation.x = -0.9 * s;
      parts.elbowL.rotation.x = -1.5;
      parts.elbowR.rotation.x = -1.5;
    }

    // נטייה קדימה + סיבוב קל של הכתפיים
    parts.upper.rotation.x = air ? 0.05 : 0.2;
    parts.upper.rotation.y = air ? 0 : s * 0.12;

    const bob = air ? 0 : Math.abs(Math.cos(phase)) * 0.06;
    group.position.y = (opts.y || 0) + bob;
    if (parts.tail) parts.tail.rotation.y = Math.sin(t * 8) * 0.4;
    if (parts.wingL) {
      parts.wingL.rotation.y = 0.5 + Math.sin(t * 10) * 0.35;
      parts.wingR.rotation.y = -0.5 - Math.sin(t * 10) * 0.35;
    }
  }

  // ============================================================
  //  מכשולים ופנקייקים
  // ============================================================
  const OBSTACLE_TYPES = {
    cone: {
      w: 0.8, h: 1.05, d: 0.8,
      build() {
        const g = new THREE.Group();
        const base = box(0.9, 0.08, 0.9, '#222'); base.position.y = 0.04; g.add(base);
        const body = cone(0.36, 1.0, '#ff7f11'); body.position.y = 0.58; g.add(body);
        const stripe = cyl(0.2, 0.25, 0.13, '#fff'); stripe.position.y = 0.66; g.add(stripe);
        return g;
      },
    },
    trash: {
      w: 1, h: 1.4, d: 1,
      build() {
        const g = new THREE.Group();
        const body = cyl(0.45, 0.4, 1.3, '#5d6d7e'); body.position.y = 0.65; g.add(body);
        const lid = cyl(0.5, 0.5, 0.12, '#7f8c8d'); lid.position.y = 1.36; g.add(lid);
        const knob = sphere(0.07, '#7f8c8d', 8); knob.position.y = 1.46; g.add(knob);
        return g;
      },
    },
    hydrant: {
      w: 0.7, h: 1.15, d: 0.7,
      build() {
        const g = new THREE.Group();
        const body = cyl(0.22, 0.27, 0.95, '#c0392b'); body.position.y = 0.5; g.add(body);
        const top = sphere(0.24, '#c0392b'); top.position.y = 1.0; g.add(top);
        const arms = cyl(0.09, 0.09, 0.75, '#e74c3c', 10); arms.rotation.z = Math.PI / 2; arms.position.y = 0.72; g.add(arms);
        const foot = cyl(0.3, 0.3, 0.1, '#922b21'); foot.position.y = 0.05; g.add(foot);
        return g;
      },
    },
    bench: {
      w: 2.0, h: 1.0, d: 0.7,
      build() {
        const g = new THREE.Group();
        const seat = box(2.0, 0.1, 0.6, '#8e5a2b'); seat.position.y = 0.5; g.add(seat);
        const back = box(2.0, 0.45, 0.08, '#8e5a2b'); back.position.set(0, 0.8, -0.28); g.add(back);
        for (const side of [-1, 1]) {
          const leg = box(0.1, 0.5, 0.5, '#2c3e50'); leg.position.set(side * 0.85, 0.25, 0); g.add(leg);
          const post = box(0.08, 0.5, 0.08, '#2c3e50'); post.position.set(side * 0.85, 0.75, -0.28); g.add(post);
        }
        return g;
      },
    },
  };

  function buildPancake(kind = 'normal') {
    const g = new THREE.Group();
    const colors = { normal: '#e8a752', golden: '#ffd700', rotten: '#8a9a4a' };
    const syrupColors = { normal: '#7a3e0e', golden: '#ff9f00', rotten: '#3f4a1f' };
    for (let i = 0; i < 3; i++) {
      const p = cyl(0.32, 0.32, 0.08, colors[kind], 20); p.position.y = i * 0.09; g.add(p);
      if (kind === 'golden') p.material.emissive = new THREE.Color('#8a6a00');
    }
    const syrup = cyl(0.23, 0.25, 0.04, syrupColors[kind], 20); syrup.position.y = 0.24; g.add(syrup);
    if (kind === 'rotten') {
      // נקודות עובש ועננוני סירחון
      for (let i = 0; i < 5; i++) {
        const spot = sphere(0.05, '#3a3a1a', 6); spot.position.set(rand(-0.22, 0.22), 0.27, rand(-0.22, 0.22)); g.add(spot);
      }
      const stink = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshLambertMaterial({ color: '#9acd32', transparent: true, opacity: 0.6 }));
        puff.position.set(-0.15 + i * 0.15, 0.55 + i * 0.12, 0); stink.add(puff);
      }
      g.add(stink); g.userData.stink = stink;
    } else {
      const butter = box(0.12, 0.08, 0.12, kind === 'golden' ? '#ffffff' : '#fff176'); butter.position.y = 0.3; g.add(butter);
    }
    if (kind === 'golden') {
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 16), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.25 }));
      halo.position.y = 0.15; g.add(halo);
      const star = sphere(0.07, '#ffffff', 6); star.position.set(0.5, 0.2, 0); g.add(star); g.userData.star = star;
    }
    return g;
  }

  // ============================================================
  //  סצנה
  // ============================================================
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const SKY = 0x7fc4f0;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 45, 125);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
  const camBase = new THREE.Vector3(...CAM_POS);
  const camLook = new THREE.Vector3(...CAM_LOOK);
  camera.position.copy(camBase);
  camera.lookAt(camLook);

  scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x6b6b6b, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(12, 25, 8);
  sun.target.position.set(0, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -16; sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 70;
  scene.add(sun, sun.target);

  // כדור שמש ועננים (מעבר לערפל, בלי ערפל)
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(6, 20, 20), new THREE.MeshBasicMaterial({ color: 0xffe680, fog: false }));
  sunBall.position.set(38, 48, -140);
  scene.add(sunBall);
  const clouds = [];
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    for (const [dx, dy, r] of [[-3, 0, 2.4], [0, 0.8, 3.2], [3.2, 0, 2.4]]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), m); s.position.set(dx, dy, 0); c.add(s);
    }
    c.position.set(rand(-70, 70), rand(22, 36), -135);
    clouds.push(c); scene.add(c);
  }

  // כביש עם קו מקווקו זז
  function makeRoadTexture() {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
    const c = cv.getContext('2d');
    c.fillStyle = '#3d3d47'; c.fillRect(0, 0, 128, 256);
    c.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 300; i++) c.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
    c.fillStyle = '#f5d142'; c.fillRect(60, 40, 8, 110);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  const ROAD_TILE = 6;
  const roadTex = makeRoadTexture();
  roadTex.repeat.set(1, ROAD_LEN / ROAD_TILE);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, ROAD_LEN), new THREE.MeshLambertMaterial({ map: roadTex }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -ROAD_LEN / 2 + 40);
  road.receiveShadow = true;
  scene.add(road);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, ROAD_LEN), mat('#8a8f96'));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, -ROAD_LEN / 2 + 40); ground.receiveShadow = true;
  scene.add(ground);

  function makeSidewalkTexture() {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const c = cv.getContext('2d');
    c.fillStyle = '#c8c8c8'; c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#a9a9a9'; c.fillRect(0, 0, 64, 4); c.fillRect(30, 0, 4, 64);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  const SIDEWALK_TILE = 2;
  const sidewalkTex = makeSidewalkTexture();
  sidewalkTex.repeat.set(1, ROAD_LEN / SIDEWALK_TILE);
  for (const side of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(SIDEWALK_W, ROAD_LEN), new THREE.MeshLambertMaterial({ map: sidewalkTex }));
    sw.rotation.x = -Math.PI / 2;
    sw.position.set(side * (ROAD_W / 2 + SIDEWALK_W / 2), 0.18, -ROAD_LEN / 2 + 40); sw.receiveShadow = true;
    scene.add(sw);
    const swBody = new THREE.Mesh(new THREE.BoxGeometry(SIDEWALK_W, 0.18, ROAD_LEN), mat('#b5b5b5'));
    swBody.position.set(side * (ROAD_W / 2 + SIDEWALK_W / 2), 0.09, -ROAD_LEN / 2 + 40);
    scene.add(swBody);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, ROAD_LEN), mat('#9a9a9a'));
    curb.position.set(side * (ROAD_W / 2 + 0.06), 0.1, -ROAD_LEN / 2 + 40);
    scene.add(curb);
  }

  // ---------- בניינים (מסוע ממוחזר) ----------
  const NEAR_PALETTE = ['#c9705e', '#d99a5b', '#b7674f', '#e0b070', '#9c6f9a', '#7fa6c9'];
  const FAR_PALETTE = ['#6d7fa8', '#7c8db5', '#5f6f97', '#8592b8'];
  const GRAFFITI_COLORS = ['#ff2d95', '#00e5ff', '#ffe600', '#7cff00'];

  function makeBuildingTexture(color, lit) {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const c = cv.getContext('2d');
    c.fillStyle = color; c.fillRect(0, 0, 64, 64);
    c.fillStyle = lit ? '#fff3b0' : 'rgba(30,30,50,0.6)';
    c.fillRect(18, 16, 28, 34);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  const buildingTextures = { near: [], far: [] };
  for (const col of NEAR_PALETTE) { buildingTextures.near.push(makeBuildingTexture(col, true), makeBuildingTexture(col, false)); }
  for (const col of FAR_PALETTE) { buildingTextures.far.push(makeBuildingTexture(col, true), makeBuildingTexture(col, false)); }

  const graffitiTextures = GRAFFITI_COLORS.map(col => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const c = cv.getContext('2d');
    c.strokeStyle = col; c.lineWidth = 14; c.lineCap = 'round';
    c.beginPath(); c.moveTo(20, 70);
    c.bezierCurveTo(70, 10, 120, 120, 170, 50);
    c.bezierCurveTo(200, 20, 220, 90, 240, 60);
    c.stroke();
    c.lineWidth = 6; c.strokeStyle = '#111';
    c.beginPath(); c.moveTo(40, 100); c.lineTo(110, 100); c.stroke();
    return new THREE.CanvasTexture(cv);
  });

  const buildingPools = [];
  function makeBuildingPool(side, row) {
    const pool = { side, row, items: [], nextZ: 26 };
    const count = row === 0 ? 16 : 14;
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      g.add(mesh);
      const graffiti = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      graffiti.visible = false;
      g.add(graffiti);
      const item = { group: g, mesh, graffiti, d: 1 };
      scene.add(g);
      pool.items.push(item);
      placeBuilding(pool, item);
    }
    buildingPools.push(pool);
  }

  function placeBuilding(pool, item) {
    const near = pool.row === 0;
    const w = near ? rand(4, 8) : rand(6, 11);
    const h = near ? rand(5, 14) : rand(12, 30);
    const d = near ? rand(5, 9) : rand(7, 12);
    const gap = rand(0.6, 3);
    const tex = pick(buildingTextures[near ? 'near' : 'far']).clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(w / 2.4)), Math.max(1, Math.round(h / 2.6)));
    if (item.mesh.material.map) item.mesh.material.map.dispose();
    item.mesh.material.map = tex;
    item.mesh.material.needsUpdate = true;
    item.mesh.scale.set(w, h, d);
    item.mesh.position.y = h / 2;
    const xBase = ROAD_W / 2 + SIDEWALK_W + (near ? rand(0.2, 1.5) : rand(10, 14));
    item.group.position.set(pool.side * (xBase + w / 2), 0, pool.nextZ - d / 2);
    item.d = d + gap;
    pool.nextZ -= d + gap;

    // גרפיטי על הקיר שפונה לכביש
    if (near && Math.random() < 0.4) {
      item.graffiti.visible = true;
      item.graffiti.material.map = pick(graffitiTextures);
      item.graffiti.material.needsUpdate = true;
      item.graffiti.position.set(-pool.side * (w / 2 + 0.03), 1.3, rand(-d / 4, d / 4));
      item.graffiti.rotation.y = -pool.side * Math.PI / 2;
    } else {
      item.graffiti.visible = false;
    }
  }

  // בניינים רק בצד שמאל. בצד ימין המצלמה עומדת, אז שם יש גדר חיה ועצים נמוכים שלא מסתירים.
  makeBuildingPool(-1, 0); makeBuildingPool(-1, 1);

  const hedge = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, ROAD_LEN), mat('#3f8f3f'));
  hedge.position.set(ROAD_W / 2 + SIDEWALK_W + 0.7, 0.5, -ROAD_LEN / 2 + 40);
  scene.add(hedge);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(40, ROAD_LEN), mat('#6fae5a'));
  grass.rotation.x = -Math.PI / 2; grass.position.set(ROAD_W / 2 + SIDEWALK_W + 20, 0.01, -ROAD_LEN / 2 + 40);
  scene.add(grass);
  const trees = [];
  for (let i = 0; i < 22; i++) {
    const g = new THREE.Group();
    const trunk = cyl(0.12, 0.16, 1.2, '#6b4423', 8); trunk.position.y = 0.6; g.add(trunk);
    const canopy = cone(rand(0.7, 1.0), rand(1.4, 2.0), pick(['#2e8b57', '#3cb371', '#228b22']), 10); canopy.position.y = 1.2 + canopy.geometry.parameters.height / 2; g.add(canopy);
    g.position.set(ROAD_W / 2 + SIDEWALK_W + rand(6, 13), 0, 22 - i * 9 + rand(-2, 2));
    scene.add(g); trees.push(g);
  }

  // פנסי רחוב
  const lamps = [];
  for (let i = 0; i < 13; i++) {
    const side = -1;
    const g = new THREE.Group();
    const pole = cyl(0.06, 0.08, 4.5, '#444', 8); pole.position.y = 2.25; g.add(pole);
    const arm = box(1.0, 0.08, 0.08, '#444'); arm.position.set(-side * 0.45, 4.45, 0); g.add(arm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), new THREE.MeshBasicMaterial({ color: 0xfff2a8 }));
    bulb.position.set(-side * 0.9, 4.4, 0); g.add(bulb);
    g.position.set(side * (ROAD_W / 2 + 1.6), 0, 20 - i * 14);
    scene.add(g);
    lamps.push(g);
  }

  function scrollScenery(dz) {
    for (const pool of buildingPools) {
      pool.nextZ += dz;
      for (const item of pool.items) {
        item.group.position.z += dz;
        if (item.group.position.z - item.d / 2 > 22) placeBuilding(pool, item);
      }
    }
    for (const l of lamps) {
      l.position.z += dz;
      if (l.position.z > 22) l.position.z -= 13 * 14;
    }
    for (const tr of trees) {
      tr.position.z += dz;
      if (tr.position.z > 24) { tr.position.z -= 22 * 9; tr.position.x = ROAD_W / 2 + SIDEWALK_W + rand(6, 13); }
    }
    for (const c of clouds) {
      c.position.x += dz * 0.03;
      if (c.position.x > 90) c.position.x = -90;
    }
    roadTex.offset.y += dz / ROAD_TILE;
    sidewalkTex.offset.y += dz / SIDEWALK_TILE;
  }

  // ---------- חלקיקים ----------
  const MAX_PARTICLES = 240;
  const particles = [];
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAX_PARTICLES * 3);
  const pCol = new Float32Array(MAX_PARTICLES * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pPoints = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, sizeAttenuation: true }));
  pPoints.frustumCulled = false;
  scene.add(pPoints);
  for (let i = 0; i < MAX_PARTICLES; i++) { particles.push({ life: 0, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1 }); }

  function spawnParticles(x, y, z, n, color, power) {
    const col = new THREE.Color(color);
    let spawned = 0;
    for (const pt of particles) {
      if (spawned >= n) break;
      if (pt.life > 0) continue;
      const a = rand(0, Math.PI * 2), e = rand(-0.3, 1.0);
      const s = rand(power * 0.4, power);
      pt.x = x; pt.y = y; pt.z = z;
      pt.vx = Math.cos(a) * s; pt.vz = Math.sin(a) * s * 0.5; pt.vy = e * s + 1.5;
      pt.life = rand(0.4, 0.8);
      pt.r = col.r; pt.g = col.g; pt.b = col.b;
      spawned++;
    }
  }

  function updateParticles(dt, dz) {
    particles.forEach((pt, i) => {
      if (pt.life > 0) {
        pt.life -= dt;
        pt.vy -= 14 * dt;
        pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.z += pt.vz * dt + dz;
        if (pt.life <= 0) pt.y = -100;
      }
      pPos[i * 3] = pt.x; pPos[i * 3 + 1] = pt.y; pPos[i * 3 + 2] = pt.z;
      pCol[i * 3] = pt.r; pCol[i * 3 + 1] = pt.g; pCol[i * 3 + 2] = pt.b;
    });
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  // ---------- בועת "עצור!" מעל השוטר ----------
  function makeTextSprite(text) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(20, 10); c.arcTo(236, 10, 236, 90, 18); c.arcTo(236, 90, 20, 90, 18); c.arcTo(20, 90, 20, 10, 18); c.arcTo(20, 10, 236, 10, 18);
    c.closePath(); c.fill();
    c.beginPath(); c.moveTo(60, 88); c.lineTo(40, 120); c.lineTo(90, 88); c.closePath(); c.fill();
    c.fillStyle = '#c0392b'; c.font = 'bold 56px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, 128, 52);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false }));
    sp.scale.set(2.0, 1.0, 1);
    return sp;
  }
  const stopBubble = makeTextSprite('עצור!');
  stopBubble.visible = false;
  scene.add(stopBubble);

  // בועת מגן סביב השחקן (אחרי פנקייק מוזהב)
  const shieldBubble = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 24), new THREE.MeshBasicMaterial({ color: '#66ccff', transparent: true, opacity: 0.28, depthWrite: false }));
  shieldBubble.visible = false;
  scene.add(shieldBubble);

  // ענן פלוץ ירוק שמתרחב מאחורי השחקן
  const fartCloud = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshBasicMaterial({ color: '#8fbf4f', transparent: true, opacity: 0.5, depthWrite: false }));
  fartCloud.visible = false;
  scene.add(fartCloud);

  // ============================================================
  //  מצב המשחק
  // ============================================================
  const state = {
    mode: 'menu',
    character: 'kid',
    time: 0, speed: 0, scroll: 0, distance: 0, pancakes: 0,
    player: { y: 0, vy: 0, onGround: true, jumps: 0, invincible: 0, hitFlash: 0, lane: 0, x: 0 },
    cop: { y: 0, vy: 0, onGround: true, x: 0 },
    copGap: COP_START_GAP,
    obstacles: [], items: [],
    spawnDist: 0, shake: 0,
    nextSpecialAt: SPECIAL_EVERY, shield: false, fart: false, fartFx: 0,
    best: Number(localStorage.getItem('roadrun_best') || 0),
  };

  let playerChar = null;
  const copChar = buildCharacter('cop');
  copChar.group.position.set(0, 0, PLAYER_Z + COP_START_GAP);
  copChar.group.rotation.y = Math.PI;   // רץ קדימה (ל--Z)
  scene.add(copChar.group);

  function setPlayerCharacter(key) {
    if (playerChar) { scene.remove(playerChar.group); disposeObject(playerChar.group); }
    playerChar = buildCharacter(key);
    playerChar.group.position.set(0, 0, PLAYER_Z);
    playerChar.group.rotation.y = Math.PI;   // רץ קדימה (ל--Z)
    scene.add(playerChar.group);
    state.character = key;
  }
  setPlayerCharacter('kid');

  function clearEntities() {
    for (const ob of state.obstacles) { scene.remove(ob.mesh); disposeObject(ob.mesh); }
    for (const it of state.items) { scene.remove(it.mesh); disposeObject(it.mesh); }
    state.obstacles = []; state.items = [];
  }

  function reset() {
    state.time = 0; state.speed = SPEED_START; state.scroll = 0; state.distance = 0; state.pancakes = 0;
    state.player = { y: 0, vy: 0, onGround: true, jumps: 0, invincible: 0, hitFlash: 0, lane: 0, x: 0 };
    state.cop = { y: 0, vy: 0, onGround: true, x: 0 };
    state.copGap = COP_START_GAP;
    clearEntities();
    state.spawnDist = 14;
    state.shake = 0;
    state.nextSpecialAt = SPECIAL_EVERY; state.shield = false; state.fart = false; state.fartFx = 0;
    for (const pt of particles) { pt.life = 0; pt.y = -100; }
  }

  function jump() {
    const p = state.player;
    if (p.onGround) {
      p.vy = JUMP_V; p.onGround = false; p.jumps = 1; sfx.jump();
    } else if (p.jumps < 2) {
      p.vy = JUMP_V * 0.85; p.jumps = 2; sfx.jump();
      spawnParticles(p.x, p.y, PLAYER_Z, 8, '#ffffff', 3);
    }
  }

  // פלוץ ענק: זמין רק אחרי פנקייק רקוב. מעיף את השוטר אחורה.
  function fart() {
    if (state.mode !== 'playing' || !state.fart) return false;
    state.fart = false;
    state.fartFx = 0.8;
    state.copGap = Math.min(state.copGap + FART_PUSH, SHIELD_PUSH);
    state.cop.vy = 13; state.cop.onGround = false;
    state.shake = 0.5;
    const p = state.player;
    spawnParticles(p.x, p.y + 0.7, PLAYER_Z + 0.5, 60, '#7fbf3f', 6);
    spawnParticles(p.x, p.y + 0.9, PLAYER_Z + 1.5, 40, '#b5d96b', 5);
    sfx.fart();
    return true;
  }

  // מעבר נתיב: dir = -1 שמאלה (מנקודת מבט הצופה), +1 ימינה
  function moveLane(dir) {
    if (state.mode !== 'playing') return;
    state.player.lane = clamp(state.player.lane + dir, -1, 1);
  }

  function spawnObstacle(type, z, lane) {
    const def = OBSTACLE_TYPES[type];
    const mesh = def.build();
    const x = lane * LANE_W;
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    state.obstacles.push({ type, z, x, w: def.w, h: def.h, d: def.d, mesh, hit: false });
    return def;
  }

  function spawnItem(z, y, lane, kind = 'normal') {
    const mesh = buildPancake(kind);
    const x = lane * LANE_W;
    mesh.position.set(x, y, z);
    scene.add(mesh);
    state.items.push({ z, y, x, mesh, taken: false, spin: rand(0, Math.PI * 2), kind });
  }

  // פנקייק מיוחד (מוזהב או רקוב) בנתיב שאין בו מכשול קרוב
  function spawnSpecial() {
    const kind = Math.random() < 0.5 ? 'golden' : 'rotten';
    const z = SPAWN_Z - 3;
    const lanes = [-1, 0, 1].sort(() => Math.random() - 0.5);
    const free = lanes.find(l => !state.obstacles.some(o => Math.round(o.x / LANE_W) === l && Math.abs(o.z - z) < 4));
    spawnItem(z, free === undefined ? 2.9 : 1.0, free === undefined ? lanes[0] : free, kind);
  }

  function spawnWave(z = SPAWN_Z) {
    const roll = Math.random();
    const lanes = [-1, 0, 1];
    if (roll < 0.6) {
      // מכשולים בנתיב אחד או שניים (תמיד נשאר נתיב פנוי)
      const twoLanes = Math.random() < (state.speed > 11 ? 0.45 : 0.2);
      const shuffled = lanes.slice().sort(() => Math.random() - 0.5);
      const used = shuffled.slice(0, twoLanes ? 2 : 1);
      for (const lane of used) {
        const type = pick(Object.keys(OBSTACLE_TYPES));
        const def = spawnObstacle(type, z, lane);
        if (Math.random() < 0.25 && type !== 'bench') {
          const t2 = pick(['cone', 'hydrant']);
          spawnObstacle(t2, z - def.d / 2 - OBSTACLE_TYPES[t2].d / 2 - 0.4, lane);
        }
        // פנקייק מעל המכשול, מזמין לקפוץ
        if (Math.random() < 0.5) spawnItem(z, def.h + 1.75, lane);
      }
      // ולפעמים פנקייק נמוך בנתיב הפנוי
      const free = shuffled[used.length];
      if (Math.random() < 0.4) spawnItem(z, 0.9, free);
    } else {
      const n = randInt(3, 6);
      const arc = Math.random() < 0.5;
      const baseY = arc ? 1.5 : pick([0.9, 2.75]);
      const lane = pick(lanes);
      for (let i = 0; i < n; i++) {
        const yy = arc ? baseY + Math.sin((i / (n - 1)) * Math.PI) * 2.2 : baseY;
        spawnItem(z - i * 1.15, yy, lane);
      }
    }
    state.spawnDist = rand(8.5, 16) + Math.max(0, 12.5 - state.speed) * 0.5;
  }

  function update(dt, t) {
    if (state.mode !== 'playing') {
      // בתפריט ובמסך הסיום העולם עומד, הדמויות "רצות במקום" רק בתפריט
      return;
    }
    const p = state.player;
    state.time += dt;
    state.speed = Math.min(SPEED_START + state.time * SPEED_ACCEL, SPEED_MAX);
    const dz = state.speed * dt;
    state.scroll += dz;
    state.distance += dz;

    // פיזיקה של השחקן
    p.vy -= GRAVITY * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      if (!p.onGround) spawnParticles(p.x, 0.05, PLAYER_Z, 6, '#bbbbbb', 1.5);
      p.y = 0; p.vy = 0; p.onGround = true; p.jumps = 0;
    }
    // מעבר נתיב חלק
    p.x += (p.lane * LANE_W - p.x) * Math.min(1, dt * LANE_SNAP);
    p.invincible = Math.max(0, p.invincible - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);

    // השוטר קופץ מעל מכשולים שמגיעים אליו
    const c = state.cop;
    const copZ = PLAYER_Z + state.copGap;
    c.x += (p.x - c.x) * Math.min(1, dt * 5);   // עוקב אחרי הנתיב של השחקן באיחור
    c.vy -= GRAVITY * dt; c.y += c.vy * dt;
    if (c.y <= 0) { c.y = 0; c.vy = 0; c.onGround = true; }
    if (c.onGround) {
      for (const ob of state.obstacles) {
        if (Math.abs(ob.x - c.x) < 1.2 && ob.z > copZ - 2.2 && ob.z < copZ - 0.2) { c.vy = 15; c.onGround = false; break; }
      }
    }

    // יצירת גלים
    state.spawnDist -= dz;
    if (state.spawnDist <= 0) spawnWave();
    if (state.distance >= state.nextSpecialAt) { spawnSpecial(); state.nextSpecialAt += SPECIAL_EVERY; }

    // הזזת אובייקטים לכיוון המצלמה. אחרי שעברו את השחקן הם מתכווצים ונעלמים
    // כדי שלא יכסו את המסך כשהם חולפים ליד המצלמה.
    const passStart = PLAYER_Z + state.copGap + 1.5;   // מתכווצים רק אחרי שעברו גם את השוטר
    const passScale = z => clamp(1 - (z - passStart) / 3.5, 0, 1);
    for (const ob of state.obstacles) {
      ob.z += dz; ob.mesh.position.z = ob.z;
      ob.mesh.scale.setScalar(Math.max(0.001, passScale(ob.z)));
    }
    for (const it of state.items) {
      it.z += dz; it.mesh.position.z = it.z;
      it.mesh.position.y = it.y + Math.sin(t * 5 + it.spin) * 0.12;
      it.mesh.rotation.y = t * 2 + it.spin;
      if (it.mesh.userData.star) it.mesh.userData.star.position.set(Math.cos(t * 6) * 0.5, 0.2 + Math.sin(t * 6) * 0.3, Math.sin(t * 6) * 0.5);
      if (it.mesh.userData.stink) it.mesh.userData.stink.position.y = Math.sin(t * 3 + it.spin) * 0.1;
      it.mesh.scale.setScalar(Math.max(0.001, passScale(it.z)));
    }
    const despawnZ = passStart + 4;
    state.obstacles = state.obstacles.filter(ob => {
      if (ob.z > despawnZ) { scene.remove(ob.mesh); disposeObject(ob.mesh); return false; }
      return true;
    });
    state.items = state.items.filter(it => {
      if (it.z > despawnZ || it.taken) { scene.remove(it.mesh); disposeObject(it.mesh); return false; }
      return true;
    });

    // התנגשות במכשולים
    for (const ob of state.obstacles) {
      if (ob.hit || p.invincible > 0) continue;
      if (Math.abs(ob.x - p.x) < ob.w / 2 + 0.3 && Math.abs(ob.z - PLAYER_Z) < ob.d / 2 + 0.25 && p.y < ob.h - 0.1) {
        ob.hit = true;
        p.invincible = 1.1;
        p.hitFlash = 0.35;
        state.copGap -= HIT_PENALTY;
        state.shake = 0.3;
        spawnParticles(p.x, p.y + 1, PLAYER_Z, 14, '#ff5e5e', 4);
        sfx.hit();
      }
    }

    // איסוף פנקייקים
    for (const it of state.items) {
      if (it.taken) continue;
      if (Math.abs(it.x - p.x) < 1.0 && Math.abs(it.z - PLAYER_Z) < 0.7 && Math.abs(it.y - (p.y + 0.95)) < 1.05) {
        it.taken = true;
        if (it.kind === 'golden') {
          state.shield = true;
          spawnParticles(it.x, it.y, it.z, 24, '#ffd700', 4);
          sfx.golden();
        } else if (it.kind === 'rotten') {
          state.fart = true;
          spawnParticles(it.x, it.y, it.z, 16, '#9acd32', 3);
          sfx.rotten();
        } else {
          state.pancakes++;
          state.copGap = Math.min(COP_MAX_GAP, state.copGap + PANCAKE_BONUS);
          spawnParticles(it.x, it.y, it.z, 10, '#ffd166', 3);
          sfx.pancake();
        }
      }
    }

    // השוטר מתקרב לאט, ומהר יותר ככל שהזמן עובר
    const closing = Math.min(0.04 + state.time * 0.0025, 0.4);
    state.copGap -= closing * dt;
    if (state.copGap <= COP_CATCH_GAP) {
      if (state.shield) {
        // המגן מתנפץ, השוטר נזרק אחורה והילד ממשיך לרוץ
        state.shield = false;
        state.copGap = SHIELD_PUSH;
        state.cop.vy = 14; state.cop.onGround = false;
        p.invincible = 1.5;
        state.shake = 0.5;
        spawnParticles(p.x, p.y + 1, PLAYER_Z, 40, '#66ccff', 7);
        sfx.shield();
      } else {
        endGame();
      }
    }
    state.fartFx = Math.max(0, state.fartFx - dt);

    scrollScenery(dz);
    updateParticles(dt, dz);
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

  const vignette = document.getElementById('vignette');
  const flash = document.getElementById('flash');

  function updateHud() {
    document.getElementById('hud-pancakes').textContent = state.pancakes;
    document.getElementById('hud-distance').textContent = Math.floor(state.distance);
    const danger = 1 - clamp((state.copGap - COP_CATCH_GAP) / (COP_MAX_GAP - COP_CATCH_GAP), 0, 1);
    document.getElementById('hud-cop').style.width = (danger * 100).toFixed(0) + '%';
    document.getElementById('hud-shield').classList.toggle('hidden', !state.shield);
    document.getElementById('hud-fart').classList.toggle('hidden', !state.fart);
  }

  // ============================================================
  //  רינדור
  // ============================================================
  function render(t) {
    const p = state.player;
    const playing = state.mode === 'playing';
    const runT = state.mode === 'gameover' ? 0 : t;

    // דמויות
    animateCharacter(playerChar, runT, { airborne: !p.onGround, y: p.y });
    playerChar.group.position.x = p.x;
    playerChar.group.rotation.z = (p.lane * LANE_W - p.x) * 0.25;   // הטיה קלה במעבר נתיב
    playerChar.group.visible = !playing || p.invincible <= 0 || Math.floor(t * 20) % 2 === 0;

    const copZ = PLAYER_Z + state.copGap;
    copChar.group.position.set(state.cop.x, copChar.group.position.y, copZ);
    animateCharacter(copChar, runT, { armsForward: true, airborne: !state.cop.onGround, y: state.cop.y });

    shieldBubble.visible = state.shield;
    shieldBubble.position.set(p.x, p.y + 1.0, PLAYER_Z);
    shieldBubble.scale.setScalar(1 + Math.sin(t * 6) * 0.04);
    fartCloud.visible = state.fartFx > 0;
    if (state.fartFx > 0) {
      const k = 1 - state.fartFx / 0.8;
      fartCloud.position.set(p.x, 0.9 + k * 0.8, PLAYER_Z + 1.2 + k * 3);
      fartCloud.scale.setScalar(0.6 + k * 3.2);
      fartCloud.material.opacity = 0.55 * (1 - k);
    }

    const close = playing && state.copGap < 3.6;
    stopBubble.visible = close && Math.floor(t * 3) % 2 === 0;
    stopBubble.position.set(state.cop.x + 0.9, state.cop.y + 3.1, copZ);

    // המצלמה נסוגה לפני השחקן. תנודה קלה לפי המהירות נותנת תחושת תנועה.
    camera.position.copy(camBase);
    if (playing) {
      camera.position.y += Math.sin(t * 2.2) * 0.06;
      camera.position.x += Math.sin(t * 1.3) * 0.08;
    }
    if (state.shake > 0) {
      camera.position.x += rand(-1, 1) * state.shake * 0.35;
      camera.position.y += rand(-1, 1) * state.shake * 0.35;
    }
    camera.lookAt(camLook);

    // אפקטים
    vignette.style.opacity = close ? (1 - (state.copGap - COP_CATCH_GAP) / (3.6 - COP_CATCH_GAP)) * 0.9 : 0;
    flash.style.opacity = p.hitFlash * 0.6;

    renderer.render(scene, camera);
  }

  // ---------- תצוגות מקדימות בתפריט ----------
  const previews = [];
  document.querySelectorAll('#chars .char').forEach(btn => {
    const key = btn.dataset.char;
    const pc = btn.querySelector('canvas');
    const r = new THREE.WebGLRenderer({ canvas: pc, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(110, 120, false);
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xcfe9ff, 0x555555, 1.0));
    const d = new THREE.DirectionalLight(0xffffff, 0.8); d.position.set(3, 6, 4); s.add(d);
    const ch = buildCharacter(key);
    s.add(ch.group);
    const cam = new THREE.PerspectiveCamera(40, 110 / 120, 0.1, 20);
    cam.position.set(0, 1.5, 4.2); cam.lookAt(0, 1.05, 0);
    previews.push({ r, s, cam, ch });
    btn.addEventListener('click', () => {
      setPlayerCharacter(key);
      document.querySelectorAll('#chars .char').forEach(b => b.classList.toggle('selected', b === btn));
    });
  });

  function renderPreviews(t) {
    for (const pv of previews) {
      animateCharacter(pv.ch, t, {});
      pv.ch.group.rotation.y = Math.sin(t * 0.8) * 0.6;
      pv.r.render(pv.s, pv.cam);
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
    update(dt, elapsed);
    render(elapsed);
    if (state.mode === 'menu') renderPreviews(elapsed);
    requestAnimationFrame(frame);
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ============================================================
  //  ממשק וקלט
  // ============================================================
  const $ = id => document.getElementById(id);
  const screens = { menu: $('menu'), hud: $('hud'), gameover: $('gameover') };

  function startGame() {
    ensureAudio();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    reset();
    // ממלאים את הכביש מראש כדי שלא יהיו 13 שניות ריקות בהתחלה
    for (let z = -32; z > SPAWN_Z; z -= rand(11, 18)) spawnWave(z);
    state.spawnDist = 6;
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

  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (state.mode === 'playing') jump();
      else if (state.mode === 'menu') startGame();
      else if (state.mode === 'gameover' && !screens.gameover.classList.contains('hidden')) startGame();
    }
    if (e.code === 'KeyF' || e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); fart(); }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); moveLane(-1); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); moveLane(1); }
    if (e.code === 'Escape' && state.mode !== 'menu') toMenu();
  });

  // מגע/עכבר: החלקה הצידה = מעבר נתיב, נגיעה קצרה = קפיצה, לחיצה כפולה = פלוץ (אם יש)
  let pointerStart = null, lastTap = 0;
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    ensureAudio();
    pointerStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  canvas.addEventListener('pointerup', e => {
    if (!pointerStart || state.mode !== 'playing') { pointerStart = null; return; }
    const dx = e.clientX - pointerStart.x, dy = e.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) { moveLane(dx > 0 ? 1 : -1); return; }
    const now = performance.now();
    if (now - lastTap < 320 && fart()) { lastTap = 0; return; }   // לחיצה כפולה = פלוץ
    lastTap = now;
    jump();
  });

  reset();
  requestAnimationFrame(frame);

  // חשיפה לדיבוג בקונסול
  window.RoadRun = { state, jump, moveLane, fart, spawnSpecial, startGame, toMenu, PLAYER_Z, LANE_W, roadTex, scene, camera, renderer };
})();
