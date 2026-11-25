/* Kleiner Zwilling · gemeinsames 3D-Modell
   Welt in mm: X = rechts (aus Sicht der Spielenden), Y = hoch, Z = zu den Spielenden hin.
   Roboterwerte aus „Roboter Achsen.txt“ (Gliedlängen, Servo-Grenzen). Schätzwerte sind markiert. */
(function () {
  'use strict';
  var D = Math.PI / 180;

  var C = {
    L1: 115, L2: 135, L3: 165,
    HS: 60,            // Schätzwert: Schulterachse über Plattform-Oberkante
    PLAT_H: 150,       // Plattformhöhe (fest)
    BLOCK: 30,         // Schätzwert: Klötzchen-Kante
    SCALE: 2,          // Zwilling 1 : 2
    PED_H: 75,         // Sockel des Zwillings = halbe Plattform
    GAP_OPEN: 62,      // Schätzwert: Greiferöffnung (gemessen auf Greifhöhe)
    GAP_MIN: 9,        // Zange ganz zu: Spitzen berühren sich
    JAW_X: 16,         // Drehpunkt der Backen seitlich der Mitte
    JAW_Z: -108,       // Drehpunkt der Backen im Werkzeug (Werkzeug-z zeigt nach unten = negativ)
    JAW_D: 38,         // Greifhöhe: Abstand Drehpunkt bis Kontaktstelle
    HANDLE_DROP: 87,   // Griff: Lager bis Griffunterkante
    H_MAX: 18          // höchste Griffhöhe über Sockel (= Greifer 3,6 cm über Plattform, mehr schafft der senkrechte Greifer nicht)
  };
  var LIM = { a1: [-109.69, 123.22], a2: [-100.90, 101.25], a3: [-92.11, 88.07], a4: [-100.90, 101.25], a5: [-164.18, 162.77] };

  // Aufbau (Plattformmaße und Abstände sind Schätzwerte; Prinzip ist festgelegt)
  var LAY = {
    platMine: { x0: -200, x1: 200, z0: 90, z1: 340 },
    platOpp: { x0: -200, x1: 200, z0: -340, z1: -90 },
    robotMine: { x: -110, z: 145, face: 0 },
    robotOpp: { x: 110, z: -145, face: Math.PI },
    stack: { x: 0, z: 0, r: 60 },
    twin: { x: -110, z: 480 },
    depotMine: [[0, 150], [60, 150], [0, 210], [60, 210]],
    depotOpp: [[0, -150], [-60, -150], [0, -210], [-60, -210]]
  };
  // Spiegel: Der Zwilling schaut zu den Spielenden, der Roboter von ihnen weg.
  // Links/rechts bleibt gleich, vorne/hinten ist getauscht, alles halb so groß.
  function toTwin(x, z) { return { x: LAY.twin.x + (x - LAY.robotMine.x) / 2, z: LAY.twin.z - (z - LAY.robotMine.z) / 2 }; }
  // Sockel des Zwillings: Plattform relativ zur Roboterachse, gespiegelt und halbiert
  (function () {
    var a = toTwin(LAY.platMine.x0, LAY.platMine.z1), b = toTwin(LAY.platMine.x1, LAY.platMine.z0);
    LAY.ped = { x0: a.x, x1: b.x, z0: a.z, z1: b.z };
  })();

  var LIGHT = { free: 0xf3f1ea, lock: 0xff8a1f, held: 0x2fc27a };

  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var norm = function (v) { while (v > 180) v -= 360; while (v < -180) v += 360; return v; };
  function inRect(r, x, z, m) { return x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m; }

  // ---------- Kinematik: Greifer zeigt immer senkrecht nach unten ----------
  // R = Abstand zur Drehachse, Z = Werkzeugspitze über Plattform-Oberkante
  function ik(R, Z) {
    var xw = R, zw = Z + C.L3 - C.HS;
    var c = (xw * xw + zw * zw - C.L1 * C.L1 - C.L2 * C.L2) / (2 * C.L1 * C.L2);
    if (c < -1 || c > 1) return null;
    var tries = [-1, 1];
    for (var k = 0; k < 2; k++) {
      var d = tries[k] * Math.acos(c);
      var a = Math.atan2(zw, xw) - Math.atan2(C.L2 * Math.sin(d), C.L1 + C.L2 * Math.cos(d));
      var fore = a + d;
      var th1 = norm(90 - a / D), s3 = norm(-fore / D - th1), s4 = norm(fore / D + 90);
      if (th1 < LIM.a2[0] || th1 > LIM.a2[1] || s3 < LIM.a3[0] || s3 > LIM.a3[1] || s4 < LIM.a4[0] || s4 > LIM.a4[1]) continue;
      if (C.HS + C.L1 * Math.sin(a) < 8) continue; // Ellbogen über der Plattform
      return { a: a, fore: fore, a2: th1, a3: s3, a4: s4 };
    }
    return null;
  }

  // ---------- Materialien ----------
  function mats() {
    var M = THREE.MeshStandardMaterial;
    return {
      robot: new M({ color: 0x1b1b1c, roughness: 0.52, metalness: 0.12 }),
      servo: new M({ color: 0x0c0c0d, roughness: 0.34, metalness: 0.2 }),
      detail: new M({ color: 0x333336, roughness: 0.45, metalness: 0.3 }),
      tip: new M({ color: 0x2a2a2c, roughness: 0.7 }),
      wood: new M({ color: 0xd9c4a2, roughness: 0.86 }),
      woodEdge: new M({ color: 0xc8b08a, roughness: 0.9 }),
      table: new M({ color: 0xf0efeb, roughness: 0.95 }),
      alu: new M({ color: 0xc9ccd0, roughness: 0.32, metalness: 0.65 }),
      aluDark: new M({ color: 0x8d9298, roughness: 0.38, metalness: 0.6 }),
      twinBody: new M({ color: 0xeeece7, roughness: 0.55 }),
      rubber: new M({ color: 0x1e1e1f, roughness: 0.85 }),
      button: new M({ color: 0xdedcd6, roughness: 0.45 }),
      blockMine: new M({ color: 0xe9894a, roughness: 0.62 }),
      blockOpp: new M({ color: 0x7f97a8, roughness: 0.62 }),
      edge: new THREE.LineBasicMaterial({ color: 0x4d4d52, transparent: true, opacity: 0.55 }),
      edgeLight: new THREE.LineBasicMaterial({ color: 0x9a9184, transparent: true, opacity: 0.45 })
    };
  }

  function mesh(geo, mat, edgeMat) {
    var m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    if (edgeMat) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), edgeMat));
    return m;
  }
  function box(w, h, d, mat, edgeMat) { return mesh(new THREE.BoxGeometry(w, h, d), mat, edgeMat); }
  function cyl(r1, r2, h, mat, seg, edgeMat) { return mesh(new THREE.CylinderGeometry(r1, r2, h, seg || 32), mat, edgeMat); }
  function lin(c, hex) { c.setHex(hex); c.convertSRGBToLinear(); return c; }
  function linMat(m) { if (m.color) m.color.convertSRGBToLinear(); if (m.emissive) m.emissive.convertSRGBToLinear(); return m; }
  function glowMat(color) { return linMat(new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 1.1, roughness: 0.3 })); }

  function textSprite(text, opts) {
    opts = opts || {};
    var c = document.createElement('canvas'), s = 4, fs = (opts.size || 13) * s;
    var ctx = c.getContext('2d');
    ctx.font = '500 ' + fs + 'px "Segoe UI", -apple-system, sans-serif';
    var w = Math.ceil(ctx.measureText(text).width) + 16 * s, h = fs + 14 * s;
    c.width = w; c.height = h;
    ctx.font = '500 ' + fs + 'px "Segoe UI", -apple-system, sans-serif';
    ctx.fillStyle = opts.color || '#6f6f6f'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, h / 2);
    var tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    var k = (opts.scale || 0.42) / s;
    sp.scale.set(w * k, h * k, 1);
    return sp;
  }

  // ---------- Roboterarm (schwarz, nach Foto vereinfacht) ----------
  function buildRobot(M) {
    var root = new THREE.Group();
    var foot = box(78, 34, 78, M.robot, M.edge); foot.position.y = 17; root.add(foot);
    var yaw = new THREE.Group(); yaw.position.y = 34; root.add(yaw);
    var turret = cyl(36, 36, 10, M.servo, 40); turret.position.y = 5; yaw.add(turret);
    var light = new THREE.Mesh(new THREE.TorusGeometry(33, 1.6, 8, 64), glowMat(LIGHT.free));
    light.rotation.x = Math.PI / 2; light.position.y = 10.5; yaw.add(light);
    var sBase = box(48, 18, 44, M.robot, M.edge); sBase.position.y = 19; yaw.add(sBase);
    [-1, 1].forEach(function (s) { var p = box(6, 44, 40, M.robot, M.edge); p.position.set(s * 27, 28, 0); yaw.add(p); });

    var shoulder = new THREE.Group(); shoulder.position.y = C.HS - 34; yaw.add(shoulder);
    var sAx = cyl(17, 17, 46, M.servo, 32); sAx.rotation.z = Math.PI / 2; shoulder.add(sAx);
    var upper = box(36, 24, C.L1 - 20, M.robot, M.edge); upper.position.z = -C.L1 / 2; shoulder.add(upper);
    addDots(upper, M, 36 / 2 + 0.5, C.L1 - 40);

    var elbow = new THREE.Group(); elbow.position.z = -C.L1; shoulder.add(elbow);
    var eAx = cyl(15, 15, 42, M.servo, 32); eAx.rotation.z = Math.PI / 2; elbow.add(eAx);
    var fore = box(30, 22, C.L2 - 18, M.robot, M.edge); fore.position.z = -C.L2 / 2; elbow.add(fore);
    addDots(fore, M, 30 / 2 + 0.5, C.L2 - 50);

    var wrist = new THREE.Group(); wrist.position.z = -C.L2; elbow.add(wrist);
    var wAx = cyl(14, 14, 38, M.servo, 32); wAx.rotation.z = Math.PI / 2; wrist.add(wAx);
    var tool = new THREE.Group(); wrist.add(tool);
    var housing = box(34, 28, 62, M.robot, M.edge); housing.position.z = -44; tool.add(housing);
    var rServo = cyl(16, 16, 20, M.servo, 32); rServo.rotation.x = Math.PI / 2; rServo.position.z = -85; tool.add(rServo);
    var palm = box(56, 22, 16, M.robot, M.edge); palm.position.z = -103; tool.add(palm);
    var gServo = box(22, 26, 30, M.servo); gServo.position.set(18, -18, -100); tool.add(gServo);
    // Zange: zwei Backen drehen um je einen Bolzen und greifen wie eine Zange
    var fixed = jaw(M, 1), moving = jaw(M, -1);
    tool.add(fixed); tool.add(moving);
    var tLight = new THREE.Mesh(new THREE.TorusGeometry(17.5, 1.2, 8, 48), glowMat(LIGHT.free));
    tLight.position.z = -76; tool.add(tLight);

    function setQ(psi, k, rot, gap) {
      yaw.rotation.y = -psi * D;
      shoulder.rotation.x = k.a;
      elbow.rotation.x = k.fore - k.a;
      wrist.rotation.x = -Math.PI / 2 - k.fore;
      tool.rotation.z = rot * D;
      var b = jawAngle(gap);
      fixed.rotation.y = -b; moving.rotation.y = b;
    }
    function setLight(col) { [light, tLight].forEach(function (o) { lin(o.material.color, col); lin(o.material.emissive, col); }); }
    return { root: root, tool: tool, yaw: yaw, setQ: setQ, setLight: setLight, parts: { foot: foot, housing: housing, palm: palm, fixed: fixed, moving: moving, upper: upper } };
  }
  function addDots(link, M, x, len) {
    // Schraubenbild wie am Foto: kleine Punkte an den Seiten
    [-1, 1].forEach(function (s) {
      for (var i = 0; i < 3; i++) {
        var d = cyl(2.6, 2.6, 1.2, M.detail, 14);
        d.rotation.z = Math.PI / 2; d.position.set(s * x, (i - 1) * 6, -len / 2 + i * (len / 2)); d.castShadow = false;
        link.add(d);
      }
    });
  }
  // Backenform (u = nach außen, v = nach unten ab Drehpunkt), Innenkante liegt auf u = 0
  var JAW_SHAPE = [[-2, 7], [14, 7], [15, -10], [9, -36], [3.5, -54], [-1.5, -56.5], [-1.5, -50], [0, -42], [0, -4]];
  // Kugeln für die Berührung: [u, v, r]
  var JAW_BALLS = [[7, 8, 7], [6, 20, 6], [5, 32, 4.9], [3.2, 44, 3.2], [1, 53, 2.4]];
  function jawAngle(gap) { return Math.asin(clamp((gap / 2 - C.JAW_X) / C.JAW_D, -0.95, 0.95)); }
  function jaw(M, side) {
    var g = new THREE.Group(); g.position.set(side * C.JAW_X, 0, C.JAW_Z);
    var T = 13;
    function part(pts, depth, mat, edge) {
      var geo = new THREE.ExtrudeGeometry(shapeOf(pts.map(function (p) { return [p[0] * side, p[1]]; })), { depth: depth, bevelEnabled: false });
      geo.translate(0, 0, -depth / 2);
      var m = mesh(geo, mat, edge); m.rotation.x = Math.PI / 2; // Form-y → Werkzeug-z
      g.add(m); return m;
    }
    part(JAW_SHAPE, T, M.robot, M.edge);
    // Gummikappe an der Spitze, wie am Foto
    part([[-1.6, -46], [5.7, -46], [3.6, -54.2], [-1.6, -56.7]], T + 1, M.tip);
    // Zahnrad am Drehpunkt
    var gear = cyl(9, 9, T + 2, M.servo, 18); g.add(gear);
    return g;
  }
  function shapeOf(pts) { var s = new THREE.Shape(); pts.forEach(function (p, i) { if (i) s.lineTo(p[0], p[1]); else s.moveTo(p[0], p[1]); }); return s; }

  // ---------- Kleiner Zwilling ----------
  function buildTwin(M) {
    var root = new THREE.Group(); root.position.set(LAY.twin.x, C.PED_H, LAY.twin.z);
    var rot = new THREE.Group(); root.add(rot);
    var plate = cyl(30, 32, 10, M.aluDark, 48, M.edgeLight); plate.position.y = 5; rot.add(plate);

    // Form A · Säule mit Schiebearm
    var A = new THREE.Group(); rot.add(A);
    var col = cyl(9, 9, 180, M.alu, 32); col.position.y = 100; A.add(col);
    var colCap = cyl(11, 11, 6, M.aluDark, 32); colCap.position.y = 192; A.add(colCap);
    var sleeve = new THREE.Group(); A.add(sleeve);
    var sl = cyl(15, 15, 30, M.twinBody, 32, M.edgeLight); sleeve.add(sl);
    var knob = cyl(4, 4, 10, M.aluDark, 12); knob.rotation.z = Math.PI / 2; knob.position.x = 19; sleeve.add(knob);
    var outerA = box(16, 16, 58, M.twinBody, M.edgeLight); outerA.position.z = 21; sleeve.add(outerA);
    var cw = box(26, 24, 22, M.aluDark, M.edgeLight); cw.position.z = 58; sleeve.add(cw);
    var innerA = box(11, 11, 1, M.alu); sleeve.add(innerA);

    // Form B · Schreibtischlampe mit Auszug
    var B = new THREE.Group(); rot.add(B);
    var post = cyl(10, 11, 60, M.alu, 32); post.position.y = 40; B.add(post);
    var joint = cyl(14, 14, 34, M.twinBody, 32, M.edgeLight); joint.rotation.z = Math.PI / 2; joint.position.y = 70; B.add(joint);
    var tilt = new THREE.Group(); tilt.position.y = 70; B.add(tilt);
    var outerB = box(16, 16, 1, M.twinBody, null); tilt.add(outerB);
    var innerB = box(11, 11, 1, M.alu); tilt.add(innerB);

    // Griff am Ende des Arms
    var end = new THREE.Group(); rot.add(end);
    var bearing = new THREE.Mesh(new THREE.TorusGeometry(19.5, 3.4, 12, 48), M.aluDark); bearing.rotation.x = Math.PI / 2; bearing.castShadow = true; end.add(bearing);
    var handle = new THREE.Group(); end.add(handle);
    var core = cyl(13, 13, 78, M.servo, 24); core.position.y = -45; handle.add(core);
    var shA = mesh(new THREE.CylinderGeometry(16, 15, 76, 32, 1, false, 0, Math.PI), M.rubber);
    var shB = mesh(new THREE.CylinderGeometry(16, 15, 76, 32, 1, false, Math.PI, Math.PI), M.rubber);
    shA.position.y = shB.position.y = -45; handle.add(shA); handle.add(shB);
    var bottom = cyl(13, 15, 4, M.aluDark, 32); bottom.position.y = -85; handle.add(bottom);
    var topCap = cyl(16, 16, 9, M.rubber, 32); topCap.position.y = -2.5; handle.add(topCap);
    var ring = cyl(16.8, 16.8, 3, glowMat(LIGHT.free), 48); ring.position.y = 3.5; handle.add(ring);
    var topDisc = cyl(16, 16, 3, M.rubber, 48); topDisc.position.y = 6.5; handle.add(topDisc);
    var btn = cyl(8.5, 8.5, 4, M.button, 32); btn.position.y = 10; handle.add(btn);
    var mark = box(2, 0.6, 9, M.detail); mark.position.set(0, -6.5, 16.2); mark.rotation.x = Math.PI / 2; handle.add(mark); // Markierung zeigt die Drehung

    // phi = 0: Arm zeigt zu den Spielenden (Spiegel des Roboters, der von ihnen weg zeigt)
    function set(form, phi, e, h, handleYaw, squeeze, pressed) {
      rot.rotation.y = Math.PI + phi * D;
      var armY = h + C.HANDLE_DROP;
      A.visible = form === 'saeule'; B.visible = form === 'lampe';
      end.position.set(0, armY, -e);
      if (A.visible) {
        sleeve.position.y = armY;
        var len = Math.max(2, e - 19.5 - 2);
        innerA.scale.z = len; innerA.position.z = -2 - len / 2;
      } else {
        var dx = e - 19.5, dy = armY - 70, L = Math.hypot(dx, dy);
        tilt.rotation.x = Math.atan2(dy, dx);
        var o = Math.min(42, L - 4);
        outerB.scale.z = o; outerB.position.z = -4 - o / 2;
        var il = Math.max(1, L - 4);
        innerB.scale.z = il; innerB.position.z = -4 - il / 2;
      }
      handle.rotation.y = handleYaw * D - rot.rotation.y; // handleYaw = Drehung in der Welt
      var g = 1.6 * (1 - squeeze);
      shA.position.x = g; shB.position.x = -g;
      btn.position.y = pressed ? 8.6 : 10;
    }
    function setLight(col) { lin(ring.material.color, col); lin(ring.material.emissive, col); }
    return { root: root, set: set, setLight: setLight, handle: handle, button: btn, end: end, parts: { ring: ring, btn: btn, shell: shA, bottom: bottom, column: col, post: post, bearing: bearing, sleeve: sleeve, joint: joint } };
  }

  function twinOk(form, phi, e, h) {
    if (phi < LIM.a1[0] || phi > LIM.a1[1] || e < 30 || e > 125 || h < -75 || h > C.H_MAX) return false;
    var x = LAY.twin.x + e * Math.sin(phi * D), z = LAY.twin.z + e * Math.cos(phi * D);
    if (h < 2 && inRect(LAY.ped, x, z, 17)) return false;
    if (form === 'lampe' && Math.hypot(e - 19.5, h + C.HANDLE_DROP - 70) < 40) return false;
    return true;
  }

  // ---------- Welt ----------
  function create(opts) {
    opts = opts || {};
    var M = mats();
    Object.keys(M).forEach(function (k) { linMat(M[k]); });
    var scene = new THREE.Scene();
    var bg = lin(new THREE.Color(), opts.background || 0xe9e8e4);
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, 1900, 4200);

    var hemi = new THREE.HemisphereLight(0xffffff, 0xd9d4ca, 0.72); scene.add(hemi);
    var key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(-420, 950, 620); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 4; key.shadow.bias = -0.0004;
    var sc = key.shadow.camera; sc.left = -720; sc.right = 720; sc.top = 760; sc.bottom = -760; sc.near = 100; sc.far = 2600;
    scene.add(key);
    var fill = new THREE.DirectionalLight(0xfff3e6, 0.38); fill.position.set(700, 380, -520); scene.add(fill);
    var rim = new THREE.DirectionalLight(0xdfe8ff, 0.3); rim.position.set(0, 300, -900); scene.add(rim);

    var env = new THREE.Group(); scene.add(env);
    var table = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), M.table);
    table.rotation.x = -Math.PI / 2; table.receiveShadow = true; scene.add(table);
    var grid = new THREE.GridHelper(2400, 48, 0xd2d0ca, 0xdedcd6); grid.position.y = 0.3; grid.material.transparent = true; grid.material.opacity = 0.7; scene.add(grid);

    function platform(r, hgt) {
      var g = new THREE.Group();
      var w = r.x1 - r.x0, d = r.z1 - r.z0;
      var top = box(w, hgt, d, M.wood, M.edgeLight); top.position.set((r.x0 + r.x1) / 2, hgt / 2, (r.z0 + r.z1) / 2); g.add(top);
      return g;
    }
    env.add(platform(LAY.platMine, C.PLAT_H));
    env.add(platform(LAY.platOpp, C.PLAT_H));
    var pedestal = platform(LAY.ped, C.PED_H); scene.add(pedestal);

    // Stapelzone + Abbild auf dem Tisch vor dem Zwilling
    function ringMark(x, z, r, y, col, op) {
      var m = new THREE.Mesh(new THREE.RingGeometry(r - 1.6, r, 96), linMat(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op })));
      m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); return m;
    }
    env.add(ringMark(LAY.stack.x, LAY.stack.z, LAY.stack.r, 0.6, 0xed7e2a, 0.75));
    var stackFill = new THREE.Mesh(new THREE.CircleGeometry(LAY.stack.r, 96), new THREE.MeshBasicMaterial({ color: 0xed7e2a, transparent: true, opacity: 0.07 }));
    stackFill.rotation.x = -Math.PI / 2; stackFill.position.set(0, 0.5, 0); env.add(stackFill);
    var ts = toTwin(LAY.stack.x, LAY.stack.z);
    scene.add(ringMark(ts.x, ts.z, LAY.stack.r / 2, 0.6, 0xed7e2a, 0.5));
    // Depot-Abbild auf dem Sockel
    LAY.depotMine.forEach(function (p) {
      var q = toTwin(p[0], p[1]), x = q.x, z = q.z;
      var sq = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(C.BLOCK / 2, C.BLOCK / 2)), new THREE.LineBasicMaterial({ color: 0xa88f68 }));
      sq.rotation.x = -Math.PI / 2; sq.position.set(x, C.PED_H + 0.4, z); scene.add(sq);
    });

    // Maßangaben (dezent)
    var dims = new THREE.Group(); scene.add(dims);
    function vDim(x, z, h, label) {
      var mat = new THREE.LineBasicMaterial({ color: 0x8c8c8c });
      var pts = [new THREE.Vector3(x, 0, z), new THREE.Vector3(x, h, z), new THREE.Vector3(x - 6, 0, z), new THREE.Vector3(x + 6, 0, z), new THREE.Vector3(x - 6, h, z), new THREE.Vector3(x + 6, h, z)];
      dims.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([pts[0], pts[1], pts[2], pts[3], pts[4], pts[5]]), mat));
      var s = textSprite(label, { size: 12 }); s.position.set(x - 34, h / 2, z); dims.add(s);
    }
    vDim(LAY.platMine.x0 - 26, LAY.platMine.z0, C.PLAT_H, '15 cm');
    vDim(LAY.ped.x0 - 22, LAY.ped.z0, C.PED_H, '7,5 cm');
    var lblStack = textSprite('Stapelzone', { size: 12, color: '#b4601f' }); lblStack.position.set(0, 6, LAY.stack.r + 22); env.add(lblStack);
    var lblTwin = textSprite('Zwilling 1 : 2', { size: 12 }); lblTwin.position.set(LAY.ped.x1 + 60, 30, LAY.ped.z1 - 20); dims.add(lblTwin);

    // Roboter
    var robot = buildRobot(M);
    robot.root.position.set(LAY.robotMine.x, C.PLAT_H, LAY.robotMine.z); env.add(robot.root);
    var opp = buildRobot(M);
    opp.root.position.set(LAY.robotOpp.x, C.PLAT_H, LAY.robotOpp.z); opp.root.rotation.y = Math.PI; env.add(opp.root);
    var oppK = ik(140, 10); opp.setQ(48, oppK, 0, 40);

    var twin = buildTwin(M); scene.add(twin.root);

    // Klötzchen
    var blocks = [];
    function addBlock(x, z, mat, mine) {
      var m = box(C.BLOCK, C.BLOCK, C.BLOCK, mat, M.edgeLight);
      var b = { mesh: m, mine: mine, home: [x, z], fall: null };
      env.add(m); blocks.push(b); return b;
    }
    LAY.depotMine.forEach(function (p) { addBlock(p[0], p[1], M.blockMine, true); });
    LAY.depotOpp.forEach(function (p) { addBlock(p[0], p[1], M.blockOpp, false); });
    function resetBlocks() {
      blocks.forEach(function (b) {
        if (b.mesh.parent !== env) env.attach(b.mesh);
        b.mesh.position.set(b.home[0], C.PLAT_H + C.BLOCK / 2, b.home[1]); b.mesh.rotation.set(0, 0, 0); b.fall = null;
      });
    }
    resetBlocks();

    // ---------- Zustand ----------
    var S = {
      form: 'saeule',
      phi: 0, e: 75, h: 8,          // Zwilling: Drehung °, Auszug mm, Höhe Griffunterkante über Sockel mm
      twist: 0,                     // gesperrt: Drehung des Griffs in der Welt °
      lock: false, held: null, heldGap: 0, grip: 0, gripCmd: null, squeeze: 0,
      rotBase: 0, rot: 0,
      cur: null, k: null, limit: false, hint: ''
    };

    // Spiegel: gleiche Seite (x), Richtung zu den Spielenden ↔ von ihnen weg
    function robotTarget() {
      return { psi: S.phi, R: S.e * C.SCALE, Z: S.h * C.SCALE };
    }
    function tipWorld(base, psi, R, Z) {
      var dx = Math.sin(psi * D), dz = -Math.cos(psi * D);
      if (base.face) { dx = -dx; dz = -dz; }
      return { x: base.x + R * dx, y: C.PLAT_H + Z, z: base.z + R * dz };
    }

    // ---------- Feste Körper: Zange und Klötzchen dürfen sich nicht durchdringen ----------
    function gapOf(g) { return C.GAP_OPEN - g * (C.GAP_OPEN - C.GAP_MIN); }
    function gOf(gp) { return (C.GAP_OPEN - gp) / (C.GAP_OPEN - C.GAP_MIN); }
    // Werkzeug-Koordinaten → Welt, für eine Haltung (Greifer senkrecht, Drehung ty um die Hochachse)
    function toolFrame(tip, tyDeg) {
      var c = Math.cos(tyDeg * D), s = Math.sin(tyDeg * D);
      return function (lx, ly, lz) { return { x: tip.x + lx * c - ly * s, y: tip.y + lz + C.L3, z: tip.z - lx * s - ly * c }; };
    }
    function tyOf(psi, rot) { return -psi + rot; }
    function ballsFor(gp) {
      var b = jawAngle(gp), cb = Math.cos(b), sb = Math.sin(b), out = [];
      [1, -1].forEach(function (side) {
        JAW_BALLS.forEach(function (q) {
          out.push([side * (C.JAW_X + q[0] * cb + q[1] * sb), 0, C.JAW_Z + q[0] * sb - q[1] * cb, q[2]]);
        });
      });
      [-20, -10, 0, 10, 20].forEach(function (x) { out.push([x, 0, -102, 9]); });
      out.push([18, -18, -103, 12]);
      return out;
    }
    function solidBlocks(skip) {
      return blocks.filter(function (b) { return b !== skip && b.mesh.parent === env && b.fall === null; });
    }
    function ballHitsBlock(p, r, b) {
      var bp = b.mesh.position, a = b.mesh.rotation.y, c = Math.cos(a), s = Math.sin(a), hb = C.BLOCK / 2;
      var dx = p.x - bp.x, dy = p.y - bp.y, dz = p.z - bp.z;
      var lx = dx * c - dz * s, lz = dx * s + dz * c;
      var qx = Math.max(0, Math.abs(lx) - hb), qy = Math.max(0, Math.abs(dy) - hb), qz = Math.max(0, Math.abs(lz) - hb);
      return qx * qx + qy * qy + qz * qz < (r - 0.4) * (r - 0.4);
    }
    function squaresOverlap(ax, az, aa, bx, bz, ba) {
      var hb = C.BLOCK / 2 - 0.3, dx = bx - ax, dz = bz - az, axes = [aa, aa + Math.PI / 2, ba, ba + Math.PI / 2];
      for (var i = 0; i < 4; i++) {
        var nx = Math.cos(axes[i]), nz = -Math.sin(axes[i]);
        var ra = hb * (Math.abs(Math.cos(axes[i] - aa)) + Math.abs(Math.sin(axes[i] - aa)));
        var rb = hb * (Math.abs(Math.cos(axes[i] - ba)) + Math.abs(Math.sin(axes[i] - ba)));
        if (Math.abs(dx * nx + dz * nz) >= ra + rb) return false;
      }
      return true;
    }
    // Würde die Zange (mit Klotz) in dieser Haltung etwas durchdringen?
    function gripperHits(psi, R, Z, rot, gp) {
      var tip = tipWorld(LAY.robotMine, psi, R, Z), ty = tyOf(psi, rot), W = toolFrame(tip, ty);
      var others = solidBlocks(S.held), balls = ballsFor(gp);
      for (var i = 0; i < balls.length; i++) {
        var q = balls[i], p = W(q[0], q[1], q[2]);
        for (var j = 0; j < others.length; j++) if (ballHitsBlock(p, q[3], others[j])) return true;
      }
      if (S.held) {
        var hc = W(0, 0, S.held.lz);
        for (var k = 0; k < others.length; k++) {
          var o = others[k].mesh;
          if (Math.abs(hc.y - o.position.y) < C.BLOCK - 0.6 && squaresOverlap(hc.x, hc.z, ty * D, o.position.x, o.position.z, o.rotation.y)) return true;
        }
      }
      return false;
    }

    function robotOk(p, rot, gp) {
      if (p.psi < LIM.a1[0] || p.psi > LIM.a1[1]) return null;
      var k = ik(p.R, p.Z); if (!k) return null;
      var t = tipWorld(LAY.robotMine, p.psi, p.R, p.Z);
      if (t.y < C.PLAT_H - 2 && (inRect(LAY.platMine, t.x, t.z, 18) || inRect(LAY.platOpp, t.x, t.z, 18))) return null;
      if (t.y < 0) return null;
      if (gripperHits(p.psi, p.R, p.Z, rot === undefined ? S.rot : rot, gp === undefined ? gap() : gp)) return null;
      return k;
    }

    function setTwin(phi, e, h) {
      if (S.lock) return false;
      if (!twinOk(S.form, phi, e, h)) return false;
      S.phi = phi; S.e = e; S.h = h; return true;
    }
    // Ziehen in Richtung eines Wunschpunkts: so weit wie möglich
    function moveTwinToward(phi, e, h) {
      if (S.lock) return;
      if (setTwin(phi, e, h)) return;
      var p0 = [S.phi, S.e, S.h], lo = 0, hi = 1;
      for (var i = 0; i < 10; i++) {
        var m = (lo + hi) / 2;
        if (twinOk(S.form, p0[0] + (phi - p0[0]) * m, p0[1] + (e - p0[1]) * m, p0[2] + (h - p0[2]) * m)) lo = m; else hi = m;
      }
      if (lo > 0) setTwin(p0[0] + (phi - p0[0]) * lo, p0[1] + (e - p0[1]) * lo, p0[2] + (h - p0[2]) * lo);
      // an der Grenze entlanggleiten
      setTwin(phi, S.e, S.h); setTwin(S.phi, e, S.h); setTwin(S.phi, S.e, h);
    }

    function setLock(v) {
      v = !!v;
      if (v === S.lock) return;
      S.lock = v;
      if (v) { S.twist = 0; S.rotBase = S.rot; }
    }
    function lightColor() { return S.held ? LIGHT.held : (S.lock ? LIGHT.lock : LIGHT.free); }

    function stepRobot(dt, snap) {
      var t = robotTarget();
      if (!S.cur) {
        var k0 = robotOk(t);
        if (k0) { S.cur = { psi: t.psi, R: t.R, Z: t.Z }; S.k = k0; }
        else { S.cur = { psi: 0, R: 140, Z: 0 }; S.k = ik(140, 0); }
      }
      var f = snap ? 1 : Math.min(1, dt * 7);
      var c = S.cur, n = { psi: c.psi + (t.psi - c.psi) * f, R: c.R + (t.R - c.R) * f, Z: c.Z + (t.Z - c.Z) * f };
      // Steckt die Zange schon fest (z. B. nach dem Absetzen), darf sie sich nur heraus- bzw. hochbewegen
      var stuck = !snap && S.k && gripperHits(c.psi, c.R, c.Z, S.rot, gap());
      var ok = function (p) {
        if (!stuck) return robotOk(p);
        var kk = robotOk(p) || (p.Z > c.Z + 0.01 && Math.abs(p.psi - c.psi) < 0.01 && Math.abs(p.R - c.R) < 0.01 ? ik(p.R, p.Z) : null);
        return kk;
      };
      var k = snap ? (robotOk(n) || ik(n.R, n.Z)) : ok(n);
      if (!k && !snap) {
        // nur ein Stück weit: bis kurz vor die Berührung
        var lo = 0, hi = 1;
        for (var j = 0; j < 10; j++) { var m = (lo + hi) / 2; if (ok({ psi: c.psi + (n.psi - c.psi) * m, R: c.R + (n.R - c.R) * m, Z: c.Z + (n.Z - c.Z) * m })) lo = m; else hi = m; }
        if (lo > 0.02) { n = { psi: c.psi + (n.psi - c.psi) * lo, R: c.R + (n.R - c.R) * lo, Z: c.Z + (n.Z - c.Z) * lo }; k = ok(n); }
      }
      if (!k) {
        // an der Grenze entlanggleiten (nur echte Bewegungen)
        var cands = [{ psi: n.psi, R: c.R, Z: c.Z }, { psi: c.psi, R: n.R, Z: c.Z }, { psi: c.psi, R: c.R, Z: n.Z }, { psi: n.psi, R: n.R, Z: c.Z }, { psi: c.psi, R: n.R, Z: n.Z }, { psi: n.psi, R: c.R, Z: n.Z }];
        for (var i = 0; i < cands.length && !k; i++) {
          var q = cands[i];
          if (Math.abs(q.psi - c.psi) + Math.abs(q.R - c.R) + Math.abs(q.Z - c.Z) < 1e-4) continue;
          k = ok(q); if (k) n = q;
        }
      }
      if (k) { S.cur = n; S.k = k; }
      S.limit = Math.hypot(t.R - S.cur.R, t.Z - S.cur.Z) > 6 || Math.abs(t.psi - S.cur.psi) > 3;
      // Spiegel: Griff im Uhrzeigersinn → Greifer gegen den Uhrzeigersinn
      var rotT = S.lock ? clamp(S.rotBase - S.twist, LIM.a5[0], LIM.a5[1]) : S.rot;
      var nr = snap ? rotT : S.rot + (rotT - S.rot) * Math.min(1, dt * 8);
      if (S.lock) nr = clamp(nr, LIM.a5[0], LIM.a5[1]);
      if (snap || !gripperHits(S.cur.psi, S.cur.R, S.cur.Z, nr, gap()) || gripperHits(S.cur.psi, S.cur.R, S.cur.Z, S.rot, gap())) S.rot = nr;
    }

    function gap() { return gapOf(S.grip); }

    function stepGrip(dt) {
      var g = S.grip, speed = 1.3;
      S.hint = '';
      if (S.gripCmd === 'close') g = Math.min(1, g + dt * speed);
      else if (S.gripCmd === 'open') g = Math.max(0, g - dt * speed);
      S.squeeze += ((S.gripCmd === 'close' ? 1 : 0) - S.squeeze) * Math.min(1, dt * 12);
      var newGap = gapOf(g), c = S.cur;
      if (S.held) {
        if (newGap < S.heldGap) { newGap = S.heldGap; g = gOf(newGap); }
        if (newGap > S.heldGap + 3) release();
      } else if (newGap < gap() && gripperHits(c.psi, c.R, c.Z, S.rot, newGap)) {
        // Backen stoßen an: bis zur Berührung schließen, nicht weiter
        var lo = gap(), hi = newGap;
        for (var i = 0; i < 10; i++) { var m = (lo + hi) / 2; if (gripperHits(c.psi, c.R, c.Z, S.rot, m)) hi = m; else lo = m; }
        newGap = lo; g = gOf(newGap);
        var cand = candidate();
        if (cand && cand.aligned) grab(cand.block, cand.lz, newGap);
        else if (cand) S.hint = 'Klotz steht schräg · Arm sperren und Griff drehen';
        else S.hint = 'Die Zange stößt an einen Klotz';
      } else if (newGap > gap() && gripperHits(c.psi, c.R, c.Z, S.rot, newGap) && !gripperHits(c.psi, c.R, c.Z, S.rot, gap())) {
        g = S.grip; S.hint = 'Kein Platz zum Öffnen';
      }
      S.grip = g;
    }

    var tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
    function toolYaw() {
      robot.tool.updateWorldMatrix(true, false);
      var e = robot.tool.matrixWorld.elements;
      return Math.atan2(-e[2], e[0]);
    }
    function candidate() {
      robot.tool.updateWorldMatrix(true, false);
      var ty = toolYaw(), best = null;
      blocks.forEach(function (b) {
        if (b.mesh.parent !== env || b.fall !== null) return;
        b.mesh.getWorldPosition(tmpV);
        var l = robot.tool.worldToLocal(tmpV.clone());
        if (Math.abs(l.z + 150) > 17 || Math.abs(l.y) > 13 || Math.abs(l.x) > 12) return;
        var d = norm((b.mesh.rotation.y - ty) / D);
        d = ((d % 90) + 90) % 90; if (d > 45) d -= 90;
        var aligned = Math.abs(d) < 14;
        var score = Math.abs(l.x) + Math.abs(l.y);
        if (!best || score < best.score) best = { block: b, lz: l.z, aligned: aligned, score: score };
      });
      return best;
    }
    function grab(b, lz, gp) {
      // Klotz rückt zwischen den Backen in die Mitte und dreht sich gerade (kleine Korrektur, wie bei einer echten Zange)
      robot.tool.attach(b.mesh);
      b.lz = clamp(lz, -150, -136);
      b.mesh.position.set(0, 0, b.lz);
      b.mesh.rotation.set(Math.PI / 2, 0, 0);
      S.held = b; S.heldGap = Math.max(C.BLOCK + 1, gp || C.BLOCK + 1);
      if (S.lock) setLock(false); // Klotz gegriffen → Arm wieder frei
    }
    function supportBelow(b, x, z, bottom) {
      var top = 0;
      if (inRect(LAY.platMine, x, z, 0) || inRect(LAY.platOpp, x, z, 0)) top = C.PLAT_H;
      blocks.forEach(function (o) {
        if (o === b || o.mesh.parent !== env) return;
        var p = o.fall ? { x: o.mesh.position.x, y: o.fall, z: o.mesh.position.z } : o.mesh.position;
        var t = p.y + C.BLOCK / 2;
        if (Math.abs(p.x - x) < C.BLOCK * 0.9 && Math.abs(p.z - z) < C.BLOCK * 0.9 && t <= bottom + 6 && t > top) top = t;
      });
      return top;
    }
    function release() {
      var b = S.held; if (!b) return;
      var yaw = toolYaw();
      env.attach(b.mesh);
      var p = b.mesh.position;
      b.mesh.rotation.set(0, yaw, 0);
      var top = supportBelow(b, p.x, p.z, p.y - C.BLOCK / 2);
      b.fall = top + C.BLOCK / 2;
      S.held = null;
      if (S.lock) setLock(false); // abgesetzt → Arm wieder frei
    }
    function stepBlocks(dt) {
      blocks.forEach(function (b) {
        if (b.fall === null) return;
        b.mesh.position.y = Math.max(b.fall, b.mesh.position.y - dt * 900);
        if (b.mesh.position.y <= b.fall + 0.01) { b.mesh.position.y = b.fall; b.fall = null; }
      });
    }

    function render() {
      var form = S.form;
      // Griff: frei = bleibt zur Hand ausgerichtet, gesperrt = Drehen wirkt
      twin.set(form, S.phi, S.e, S.h, S.lock ? S.twist : 0, S.squeeze, S.lock);
      var col = lightColor();
      twin.setLight(col); robot.setLight(col);
      robot.setQ(S.cur.psi, S.k, S.rot, gap());
    }

    function update(dt, snap) {
      dt = Math.min(0.05, dt || 0);
      stepRobot(dt, snap);
      render();
      if (!snap) { stepGrip(dt); stepBlocks(dt); }
      render();
    }

    function axes() {
      var k = S.k;
      return { a1: S.cur.psi, a2: k.a2, a3: k.a3, a4: k.a4, a5: S.rot, gap: gap(), R: S.cur.R, Z: S.cur.Z };
    }

    function setForm(f) {
      if (f === S.form) return;
      var old = S.form; S.form = f;
      if (!twinOk(f, S.phi, S.e, S.h)) {
        // nächste gültige Haltung suchen
        for (var dh = 0; dh <= 120; dh += 4) { if (twinOk(f, S.phi, S.e, S.h + dh)) { S.h += dh; return; } if (twinOk(f, S.phi, S.e + dh, S.h)) { S.e += dh; return; } }
        S.form = old;
      }
    }

    // Hilfen für feste Ansichten
    function twinPoseForTip(x, y, z) {
      var dx = x - LAY.robotMine.x, dz = z - LAY.robotMine.z;
      var R = Math.hypot(dx, dz), psi = Math.atan2(dx, -dz) / D;
      return { phi: psi, e: R / C.SCALE, h: (y - C.PLAT_H) / C.SCALE };
    }
    function pose(p) {
      if (p.form) S.form = p.form;
      if (p.phi !== undefined) { S.phi = p.phi; S.e = p.e; S.h = p.h; }
      if (p.rot !== undefined) S.rot = S.rotBase = p.rot;
      S.lock = !!p.lock; S.twist = p.twist || 0;
      S.grip = p.grip || 0; S.squeeze = p.squeeze || 0; S.gripCmd = null;
      if (p.rot !== undefined && S.lock) S.rotBase = p.rot + S.twist;
      S.cur = null;
      update(0, true);
    }
    function holdBlock(i) {
      var b = blocks[i];
      robot.tool.updateWorldMatrix(true, false);
      robot.tool.attach(b.mesh);
      b.lz = -150; b.mesh.position.set(0, 0, -150); b.mesh.rotation.set(Math.PI / 2, 0, 0);
      S.held = b; S.heldGap = C.BLOCK + 1; S.grip = gOf(S.heldGap); render();
    }
    function toolYawDeg() { return toolYaw() / D; }
    function placeBlock(i, x, y, z, yaw) {
      var b = blocks[i]; if (b.mesh.parent !== env) env.attach(b.mesh);
      if (S.held === b) S.held = null;
      b.mesh.position.set(x, y, z); b.mesh.rotation.set(0, yaw || 0, 0); b.fall = null;
    }
    function anchor(obj, x, y, z) { obj.updateWorldMatrix(true, false); return obj.localToWorld(new THREE.Vector3(x || 0, y || 0, z || 0)); }
    function anchors() {
      return {
        thumb: anchor(twin.parts.btn, 0, 2, 0), lightRing: anchor(twin.parts.ring, 0, 0, 16.8), shell: anchor(twin.parts.shell, 16, -8, 0),
        handleBottom: anchor(twin.parts.bottom), handleMid: anchor(twin.parts.shell, 0, 0, 0), bearing: anchor(twin.parts.bearing),
        column: anchor(twin.parts.column, 0, 50, 0), sleeve: anchor(twin.parts.sleeve, 15, 0, 0), joint: anchor(twin.parts.joint),
        post: anchor(twin.parts.post, 0, 0, 0),
        twinBase: new THREE.Vector3(LAY.twin.x, C.PED_H, LAY.twin.z),
        robotBase: anchor(robot.parts.foot, 0, 0, 0), robotUpper: anchor(robot.parts.upper), gripper: anchor(robot.parts.palm, 0, 0, -40),
        oppBase: anchor(opp.parts.upper),
        depot: new THREE.Vector3(30, C.PLAT_H + C.BLOCK, 180), stack: new THREE.Vector3(0, 0, 0)
      };
    }
    function setTheme(dark) {
      var b = dark ? 0x141414 : (opts.background || 0xe9e8e4);
      lin(scene.background, b); lin(scene.fog.color, b);
      lin(M.table.color, dark ? 0x1d1d1e : 0xf0efeb);
      grid.material.opacity = dark ? 0.18 : 0.7;
      hemi.intensity = dark ? 0.55 : 0.72;
      lin(M.edge.color, dark ? 0x6a6a70 : 0x4d4d52);
    }

    update(0, true);

    return {
      scene: scene, S: S, C: C, LAY: LAY, LIGHT: LIGHT, robot: robot, opp: opp, twin: twin, blocks: blocks, env: env, dims: dims, pedestal: pedestal, grid: grid,
      update: update, moveTwinToward: moveTwinToward, setLock: setLock, setForm: setForm, toolYawDeg: toolYawDeg, toTwin: toTwin,
      _dbg: { toolFrame: toolFrame, tyOf: tyOf, tipWorld: tipWorld, gripperHits: gripperHits, ballsFor: ballsFor },
      resetBlocks: function () { if (S.held) { env.attach(S.held.mesh); S.held = null; } resetBlocks(); },
      axes: axes, twinPoseForTip: twinPoseForTip, pose: pose, holdBlock: holdBlock, placeBlock: placeBlock, anchors: anchors,
      setTheme: setTheme, lightColor: lightColor, ik: ik
    };
  }

  window.Zwilling = { create: create, C: C, LAY: LAY, LIGHT: LIGHT, ik: ik };
})();
