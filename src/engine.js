/* Sudoku engine: solver, generator and human-style logical grader. */
var SudokuEngine = (function () {
  "use strict";
  var POP = new Uint8Array(512), DIGS = [];
  for (var m = 0; m < 512; m++) {
    var list = [];
    for (var d = 1; d <= 9; d++) if (m & (1 << (d - 1))) list.push(d);
    DIGS[m] = list; POP[m] = list.length;
  }
  function bit(d) { return 1 << (d - 1); }

  var R = [], C = [], B = [], UNITS = [], PEERS = [], CELL_UNITS = [];
  for (var i = 0; i < 81; i++) {
    R[i] = (i / 9) | 0; C[i] = i % 9; B[i] = ((R[i] / 3) | 0) * 3 + ((C[i] / 3) | 0);
  }
  for (var u = 0; u < 27; u++) UNITS.push([]);
  for (i = 0; i < 81; i++) {
    UNITS[R[i]].push(i); UNITS[9 + C[i]].push(i); UNITS[18 + B[i]].push(i);
    CELL_UNITS[i] = [R[i], 9 + C[i], 18 + B[i]];
  }
  var SEES = [];
  for (i = 0; i < 81; i++) {
    var p = [], row = new Uint8Array(81);
    for (var j = 0; j < 81; j++) {
      if (i !== j && (R[i] === R[j] || C[i] === C[j] || B[i] === B[j])) { p.push(j); row[j] = 1; }
    }
    PEERS[i] = p; SEES[i] = row;
  }
  function sees(a, b) { return SEES[a][b] === 1; }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- Backtracking solver (counts solutions up to a limit) ---------- */
  function solve(grid, limit, randomize) {
    limit = limit || 2;
    var g = grid.slice(), rows = new Int32Array(9), cols = new Int32Array(9), boxes = new Int32Array(9);
    for (var i = 0; i < 81; i++) {
      if (g[i]) {
        var m = bit(g[i]);
        if ((rows[R[i]] | cols[C[i]] | boxes[B[i]]) & m) return { count: 0, solution: null };
        rows[R[i]] |= m; cols[C[i]] |= m; boxes[B[i]] |= m;
      }
    }
    var count = 0, sol = null, nodes = 0;
    function rec() {
      if (++nodes > 2000000) return;
      var best = -1, bestMask = 0, bestN = 10;
      for (var i = 0; i < 81; i++) {
        if (g[i]) continue;
        var mask = ~(rows[R[i]] | cols[C[i]] | boxes[B[i]]) & 511, n = POP[mask];
        if (n === 0) return;
        if (n < bestN) { best = i; bestMask = mask; bestN = n; if (n === 1) break; }
      }
      if (best < 0) { count++; if (!sol) sol = g.slice(); return; }
      var ds = DIGS[bestMask];
      if (randomize) ds = shuffle(ds.slice());
      var r = R[best], c = C[best], b = B[best];
      for (var k = 0; k < ds.length; k++) {
        var mm = bit(ds[k]);
        g[best] = ds[k]; rows[r] |= mm; cols[c] |= mm; boxes[b] |= mm;
        rec();
        g[best] = 0; rows[r] &= ~mm; cols[c] &= ~mm; boxes[b] &= ~mm;
        if (count >= limit) return;
      }
    }
    rec();
    return { count: count, solution: sol };
  }

  function randomFull() {
    var g = new Array(81).fill(0);
    return solve(g, 1, true).solution;
  }

  /* ---------- Logical solver ---------- */
  var TECH = {
    fullHouse:   { name: "Full house",      w: 1.0 },
    hiddenSingle:{ name: "Hidden single",   w: 1.0 },
    nakedSingle: { name: "Naked single",    w: 1.2 },
    pointing:    { name: "Pointing",        w: 2.0 },
    claiming:    { name: "Box/line reduction", w: 2.0 },
    nakedPair:   { name: "Naked pair",      w: 2.2 },
    hiddenPair:  { name: "Hidden pair",     w: 3.0 },
    nakedTriple: { name: "Naked triple",    w: 3.0 },
    hiddenTriple:{ name: "Hidden triple",   w: 3.4 },
    xWing:       { name: "X-wing",          w: 3.4 },
    nakedQuad:   { name: "Naked quad",      w: 3.8 },
    hiddenQuad:  { name: "Hidden quad",     w: 4.0 },
    skyscraper:  { name: "Skyscraper",      w: 4.2 },
    kite:        { name: "2-string kite",   w: 4.2 },
    turbot:      { name: "Turbot fish",     w: 4.3 },
    xyWing:      { name: "XY-wing",         w: 4.4 },
    swordfish:   { name: "Swordfish",       w: 4.6 },
    xyzWing:     { name: "XYZ-wing",        w: 4.6 },
    wWing:       { name: "W-wing",          w: 4.8 },
    jellyfish:   { name: "Jellyfish",       w: 5.2 }
  };

  function cn(i) { return "r" + (R[i] + 1) + "c" + (C[i] + 1); }
  function cns(arr) { return arr.map(cn).join(", "); }
  function un(u) { return u < 9 ? "row " + (u + 1) : u < 18 ? "column " + (u - 8) : "box " + (u - 17); }
  function ds(mask) { return DIGS[mask].join("/"); }

  function combos(arr, k, cb) {
    var n = arr.length, idx = [];
    function rec(start, depth) {
      if (depth === k) return cb(idx.map(function (x) { return arr[x]; }));
      for (var i = start; i <= n - (k - depth); i++) {
        idx[depth] = i;
        var r = rec(i + 1, depth + 1);
        if (r) return r;
      }
      return null;
    }
    return rec(0, 0);
  }

  function State(grid) {
    this.v = grid.slice();
    this.c = new Int32Array(81);
    for (var i = 0; i < 81; i++) {
      if (this.v[i]) continue;
      var m = 511, P = PEERS[i];
      for (var k = 0; k < 20; k++) if (this.v[P[k]]) m &= ~bit(this.v[P[k]]);
      this.c[i] = m;
    }
  }
  State.prototype.place = function (i, d) {
    this.v[i] = d; this.c[i] = 0;
    var P = PEERS[i], m = ~bit(d);
    for (var k = 0; k < 20; k++) this.c[P[k]] &= m;
  };
  State.prototype.apply = function (s) {
    if (s.place) this.place(s.place[0], s.place[1]);
    if (s.elim) for (var k = 0; k < s.elim.length; k++) this.c[s.elim[k][0]] &= ~s.elim[k][1];
  };
  State.prototype.solved = function () { for (var i = 0; i < 81; i++) if (!this.v[i]) return false; return true; };
  State.prototype.broken = function () {
    for (var i = 0; i < 81; i++) if (!this.v[i] && !this.c[i]) return true;
    for (var u = 0; u < 27; u++) {
      var have = 0, U = UNITS[u];
      for (var k = 0; k < 9; k++) have |= this.v[U[k]] ? bit(this.v[U[k]]) : this.c[U[k]];
      if (have !== 511) return true;
    }
    return false;
  };
  State.prototype.cellsWith = function (U, d) {
    var b = bit(d), out = [];
    for (var k = 0; k < U.length; k++) if (this.c[U[k]] & b) out.push(U[k]);
    return out;
  };

  /* Each finder returns a step {t, place?, elim?, cells, text} or null.
     When ACCEPT is set, steps it rejects are skipped and the search continues. */
  var ACCEPT = null;
  function emit(st) { return (!ACCEPT || ACCEPT(st)) ? st : null; }
  function fullHouse(s) {
    for (var u = 0; u < 27; u++) {
      var U = UNITS[u], empty = -1, n = 0;
      for (var k = 0; k < 9; k++) if (!s.v[U[k]]) { empty = U[k]; n++; }
      if (n === 1 && POP[s.c[empty]] === 1) {
        var d = DIGS[s.c[empty]][0];
        { var _e = emit({ t: "fullHouse", place: [empty, d], cells: [empty], unit: u,
          text: cn(empty) + " is the last empty cell in " + un(u) + ", so it is " + d + "." }); if (_e) return _e; }
      }
    }
    return null;
  }
  function hiddenSingle(s) {
    var order = [18,19,20,21,22,23,24,25,26,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17];
    for (var oi = 0; oi < 27; oi++) {
      var u = order[oi], U = UNITS[u];
      for (var d = 1; d <= 9; d++) {
        var cs = s.cellsWith(U, d);
        if (cs.length === 1) { var _e = emit({ t: "hiddenSingle", place: [cs[0], d], cells: [cs[0]], unit: u,
          text: "The only place for " + d + " in " + un(u) + " is " + cn(cs[0]) + "." }); if (_e) return _e; }
      }
    }
    return null;
  }
  function nakedSingle(s) {
    for (var i = 0; i < 81; i++) if (!s.v[i] && POP[s.c[i]] === 1) {
      var d = DIGS[s.c[i]][0];
      { var _e = emit({ t: "nakedSingle", place: [i, d], cells: [i],
        text: cn(i) + " sees every digit except " + d + ", so it must be " + d + "." }); if (_e) return _e; }
    }
    return null;
  }
  function intersections(s) {
    for (var b = 18; b < 27; b++) {
      for (var d = 1; d <= 9; d++) {
        var cs = s.cellsWith(UNITS[b], d);
        if (cs.length < 2) continue;
        var line = -1;
        if (cs.every(function (x) { return R[x] === R[cs[0]]; })) line = R[cs[0]];
        else if (cs.every(function (x) { return C[x] === C[cs[0]]; })) line = 9 + C[cs[0]];
        if (line < 0) continue;
        var el = [];
        UNITS[line].forEach(function (x) { if (B[x] !== b - 18 && (s.c[x] & bit(d))) el.push([x, bit(d)]); });
        if (el.length) { var _e = emit({ t: "pointing", elim: el, cells: cs, digit: d,
          text: "In " + un(b) + ", " + d + " can only go in " + un(line) + " (" + cns(cs) + "). Remove " + d + " from the rest of " + un(line) + "." }); if (_e) return _e; }
      }
    }
    for (var u = 0; u < 18; u++) {
      for (d = 1; d <= 9; d++) {
        var cs2 = s.cellsWith(UNITS[u], d);
        if (cs2.length < 2) continue;
        var bx = B[cs2[0]];
        if (!cs2.every(function (x) { return B[x] === bx; })) continue;
        var el2 = [];
        UNITS[18 + bx].forEach(function (x) {
          var inLine = u < 9 ? R[x] === u : C[x] === u - 9;
          if (!inLine && (s.c[x] & bit(d))) el2.push([x, bit(d)]);
        });
        if (el2.length) { var _e = emit({ t: "claiming", elim: el2, cells: cs2, digit: d,
          text: "In " + un(u) + ", " + d + " can only go in " + un(18 + bx) + " (" + cns(cs2) + "). Remove " + d + " from the rest of " + un(18 + bx) + "." }); if (_e) return _e; }
      }
    }
    return null;
  }
  function nakedSubset(k, key) {
    var label = { 2: "pair", 3: "triple", 4: "quad" }[k];
    return function (s) {
      for (var u = 0; u < 27; u++) {
        var U = UNITS[u], cand = [];
        for (var x = 0; x < 9; x++) { var i = U[x]; if (!s.v[i] && POP[s.c[i]] >= 2 && POP[s.c[i]] <= k) cand.push(i); }
        if (cand.length < k) continue;
        var res = combos(cand, k, function (set) {
          var un_ = 0; set.forEach(function (i) { un_ |= s.c[i]; });
          if (POP[un_] !== k) return null;
          var el = [];
          U.forEach(function (i) { if (set.indexOf(i) < 0 && (s.c[i] & un_)) el.push([i, s.c[i] & un_]); });
          if (!el.length) return null;
          { var _e = emit({ t: key, elim: el, cells: set,
            text: "Naked " + label + " " + ds(un_) + " in " + cns(set) + ". Those digits can go nowhere else in " + un(u) + "." }); if (_e) return _e; }
        });
        if (res) return res;
      }
      return null;
    };
  }
  function hiddenSubset(k, key) {
    var label = { 2: "pair", 3: "triple", 4: "quad" }[k];
    return function (s) {
      for (var u = 0; u < 27; u++) {
        var U = UNITS[u], digits = [], pos = {};
        for (var d = 1; d <= 9; d++) {
          var cs = s.cellsWith(U, d);
          if (cs.length >= 2 && cs.length <= k) { digits.push(d); pos[d] = cs; }
        }
        if (digits.length < k) continue;
        var res = combos(digits, k, function (set) {
          var cells = [], dm = 0;
          set.forEach(function (d) { dm |= bit(d); pos[d].forEach(function (i) { if (cells.indexOf(i) < 0) cells.push(i); }); });
          if (cells.length !== k) return null;
          var el = [];
          cells.forEach(function (i) { if (s.c[i] & ~dm) el.push([i, s.c[i] & ~dm]); });
          if (!el.length) return null;
          { var _e = emit({ t: key, elim: el, cells: cells,
            text: "Hidden " + label + ": in " + un(u) + ", " + ds(dm) + " only fit in " + cns(cells) + ". Remove all other candidates from those cells." }); if (_e) return _e; }
        });
        if (res) return res;
      }
      return null;
    };
  }
  function fish(k, key) {
    var label = { 2: "X-wing", 3: "Swordfish", 4: "Jellyfish" }[k];
    return function (s) {
      for (var d = 1; d <= 9; d++) {
        var b = bit(d);
        for (var orient = 0; orient < 2; orient++) {
          var base = [], cover = {};
          for (var l = 0; l < 9; l++) {
            var U = UNITS[orient * 9 + l], m = 0, n = 0;
            for (var x = 0; x < 9; x++) if (s.c[U[x]] & b) { m |= 1 << x; n++; }
            if (n >= 2 && n <= k) { base.push(l); cover[l] = m; }
          }
          if (base.length < k) continue;
          var res = combos(base, k, function (set) {
            var cm = 0; set.forEach(function (l) { cm |= cover[l]; });
            if (POP[cm] !== k) return null;
            var el = [], cells = [];
            for (var x = 0; x < 9; x++) {
              if (!(cm & (1 << x))) continue;
              var U2 = UNITS[(1 - orient) * 9 + x];
              U2.forEach(function (i) {
                var li = orient === 0 ? R[i] : C[i];
                if (set.indexOf(li) >= 0) { if (s.c[i] & b) cells.push(i); }
                else if (s.c[i] & b) el.push([i, b]);
              });
            }
            if (!el.length) return null;
            var lines = set.map(function (l) { return l + 1; }).join(", ");
            var covers = DIGS[cm].join(", ");
            { var _e = emit({ t: key, elim: el, cells: cells, digit: d,
              text: label + " on " + d + ": in " + (orient === 0 ? "rows " : "columns ") + lines + ", " + d + " is confined to " + (orient === 0 ? "columns " : "rows ") + covers + ". Remove " + d + " from the rest of those " + (orient === 0 ? "columns" : "rows") + "." }); if (_e) return _e; }
          });
          if (res) return res;
        }
      }
      return null;
    };
  }
  function commonPeers(s, list, mask, exclude) {
    var out = [];
    for (var i = 0; i < 81; i++) {
      if (s.v[i] || !(s.c[i] & mask) || exclude.indexOf(i) >= 0) continue;
      var ok = true;
      for (var k = 0; k < list.length; k++) if (!sees(i, list[k])) { ok = false; break; }
      if (ok) out.push([i, mask]);
    }
    return out;
  }
  function strongLinks(s, d) {
    var b = bit(d), links = [];
    for (var u = 0; u < 27; u++) {
      var cs = s.cellsWith(UNITS[u], d);
      if (cs.length === 2) links.push({ a: cs[0], b: cs[1], u: u });
    }
    return links;
  }
  function turbot(s) {
    for (var d = 1; d <= 9; d++) {
      var links = strongLinks(s, d), b = bit(d);
      for (var p = 0; p < links.length; p++) for (var q = p + 1; q < links.length; q++) {
        var L1 = links[p], L2 = links[q];
        var ends1 = [[L1.a, L1.b], [L1.b, L1.a]], ends2 = [[L2.a, L2.b], [L2.b, L2.a]];
        for (var e1 = 0; e1 < 2; e1++) for (var e2 = 0; e2 < 2; e2++) {
          var x1 = ends1[e1][0], x2 = ends1[e1][1], y1 = ends2[e2][0], y2 = ends2[e2][1];
          var uniq = [x1, x2, y1, y2].filter(function (v, i, a) { return a.indexOf(v) === i; });
          if (uniq.length !== 4) continue;
          if (!sees(x2, y2)) continue;
          var el = commonPeers(s, [x1, y1], b, [x1, y1]);
          if (!el.length) continue;
          var t1 = L1.u < 9 ? 0 : L1.u < 18 ? 1 : 2, t2 = L2.u < 9 ? 0 : L2.u < 18 ? 1 : 2;
          var t = (t1 === t2 && t1 < 2) ? "skyscraper" : (t1 < 2 && t2 < 2) ? "kite" : "turbot";
          { var _e = emit({ t: t, elim: el, cells: [x1, x2, y1, y2], digit: d,
            text: TECH[t].name + " on " + d + ": in " + un(L1.u) + " it must be " + cn(x1) + " or " + cn(x2) + ", and in " + un(L2.u) + " it must be " + cn(y1) + " or " + cn(y2) + ". " + cn(x2) + " and " + cn(y2) + " see each other, so one of " + cn(x1) + " or " + cn(y1) + " is " + d + ". Remove " + d + " from cells that see both." }); if (_e) return _e; }
        }
      }
    }
    return null;
  }
  function xyWing(s) {
    var biv = [];
    for (var i = 0; i < 81; i++) if (!s.v[i] && POP[s.c[i]] === 2) biv.push(i);
    for (var pi = 0; pi < biv.length; pi++) {
      var p = biv[pi], pm = s.c[p];
      var wings = biv.filter(function (w) { return w !== p && sees(w, p) && POP[s.c[w] & pm] === 1; });
      for (var a = 0; a < wings.length; a++) for (var bb = a + 1; bb < wings.length; bb++) {
        var A = wings[a], Bc = wings[bb];
        var za = s.c[A] & ~pm, zb = s.c[Bc] & ~pm;
        if (za !== zb) continue;
        if ((s.c[A] & pm) === (s.c[Bc] & pm)) continue;
        var el = commonPeers(s, [A, Bc], za, [p, A, Bc]);
        if (!el.length) continue;
        var z = DIGS[za][0];
        { var _e = emit({ t: "xyWing", elim: el, cells: [p, A, Bc], digit: z,
          text: "XY-wing: pivot " + cn(p) + " (" + ds(pm) + ") with wings " + cn(A) + " (" + ds(s.c[A]) + ") and " + cn(Bc) + " (" + ds(s.c[Bc]) + "). One wing must be " + z + ", so remove " + z + " from cells that see both wings." }); if (_e) return _e; }
      }
    }
    return null;
  }
  function xyzWing(s) {
    var biv = [];
    for (var i = 0; i < 81; i++) if (!s.v[i] && POP[s.c[i]] === 2) biv.push(i);
    for (i = 0; i < 81; i++) {
      if (s.v[i] || POP[s.c[i]] !== 3) continue;
      var pm = s.c[i];
      var wings = biv.filter(function (w) { return sees(w, i) && (s.c[w] & ~pm) === 0; });
      for (var a = 0; a < wings.length; a++) for (var b = a + 1; b < wings.length; b++) {
        var A = wings[a], Bc = wings[b];
        if (s.c[A] === s.c[Bc] || (s.c[A] | s.c[Bc]) !== pm) continue;
        var z = s.c[A] & s.c[Bc];
        if (POP[z] !== 1) continue;
        var el = commonPeers(s, [i, A, Bc], z, [i, A, Bc]);
        if (!el.length) continue;
        var zd = DIGS[z][0];
        { var _e = emit({ t: "xyzWing", elim: el, cells: [i, A, Bc], digit: zd,
          text: "XYZ-wing: " + cn(i) + " (" + ds(pm) + ") with " + cn(A) + " (" + ds(s.c[A]) + ") and " + cn(Bc) + " (" + ds(s.c[Bc]) + "). One of the three is " + zd + ", so remove " + zd + " from cells that see all three." }); if (_e) return _e; }
      }
    }
    return null;
  }
  function wWing(s) {
    var biv = [];
    for (var i = 0; i < 81; i++) if (!s.v[i] && POP[s.c[i]] === 2) biv.push(i);
    for (var a = 0; a < biv.length; a++) for (var b = a + 1; b < biv.length; b++) {
      var A = biv[a], Bc = biv[b];
      if (s.c[A] !== s.c[Bc] || sees(A, Bc)) continue;
      var pair = DIGS[s.c[A]];
      for (var k = 0; k < 2; k++) {
        var x = pair[k], y = pair[1 - k];
        var links = strongLinks(s, x);
        for (var l = 0; l < links.length; l++) {
          var L = links[l];
          if ([L.a, L.b].indexOf(A) >= 0 || [L.a, L.b].indexOf(Bc) >= 0) continue;
          var ok = (sees(L.a, A) && sees(L.b, Bc)) || (sees(L.a, Bc) && sees(L.b, A));
          if (!ok) continue;
          var el = commonPeers(s, [A, Bc], bit(y), [A, Bc]);
          if (!el.length) continue;
          { var _e = emit({ t: "wWing", elim: el, cells: [A, Bc, L.a, L.b], digit: y,
            text: "W-wing: " + cn(A) + " and " + cn(Bc) + " are both " + ds(s.c[A]) + ", linked through the " + x + "s in " + un(L.u) + ". One of them must be " + y + ", so remove " + y + " from cells that see both." }); if (_e) return _e; }
        }
      }
    }
    return null;
  }

  var FINDERS = [
    fullHouse, hiddenSingle, nakedSingle, intersections,
    nakedSubset(2, "nakedPair"), hiddenSubset(2, "hiddenPair"), nakedSubset(3, "nakedTriple"),
    hiddenSubset(3, "hiddenTriple"), fish(2, "xWing"), nakedSubset(4, "nakedQuad"), hiddenSubset(4, "hiddenQuad"),
    turbot, xyWing, fish(3, "swordfish"), xyzWing, wWing, fish(4, "jellyfish")
  ];

  function nextStep(s) {
    for (var f = 0; f < FINDERS.length; f++) { var st = FINDERS[f](s); if (st) return st; }
    return null;
  }

  var LEVELS = ["easy", "medium", "hard", "expert"];
  function rate(grid) {
    var s = new State(grid), steps = 0, maxW = 0, score = 0, used = {}, adv = 0;
    while (!s.solved()) {
      if (s.broken()) return { ok: false };
      var st = nextStep(s);
      if (!st) return { ok: false, stuck: true, maxW: maxW };
      var w = TECH[st.t].w;
      if (w > maxW) maxW = w;
      if (w >= 2) adv++;
      score += w; steps++;
      used[st.t] = (used[st.t] || 0) + 1;
      s.apply(st);
    }
    var level = maxW <= 1.2 ? "easy" : maxW <= 2.2 ? "medium" : maxW <= 4.0 ? "hard" : "expert";
    return { ok: true, level: level, maxW: maxW, score: Math.round(score), adv: adv, used: used };
  }

  function clues(g) { var n = 0; for (var i = 0; i < 81; i++) if (g[i]) n++; return n; }

  function makePuzzle(minClues) {
    var sol = randomFull(), g = sol.slice();
    var order = shuffle(Array.from({ length: 41 }, function (_, i) { return i; }));
    for (var k = 0; k < order.length; k++) {
      var a = order[k], b = 80 - a;
      var n = clues(g);
      if (n - (a === b ? 1 : 2) < minClues) continue;
      var va = g[a], vb = g[b];
      g[a] = 0; g[b] = 0;
      if (solve(g, 2).count !== 1) { g[a] = va; g[b] = vb; }
    }
    return { puzzle: g, solution: sol };
  }

  /* Accept a puzzle only if its grade matches the requested level. */
  function accepts(level, r, n) {
    if (!r.ok || r.level !== level) return false;
    if (level === "easy") return n >= 32;
    if (level === "medium") return r.adv >= 2 && n <= 31;
    if (level === "hard") return r.maxW >= 3.0 && r.adv >= 5;
    return r.adv >= 4;
  }

  function generate(level, maxTries) {
    maxTries = maxTries || 5000;
    var minClues = level === "easy" ? 34 : level === "medium" ? 26 : 17;
    for (var t = 1; t <= maxTries; t++) {
      var p = makePuzzle(minClues), r = rate(p.puzzle), n = clues(p.puzzle);
      if (accepts(level, r, n)) {
        return { puzzle: p.puzzle.join(""), solution: p.solution.join(""), level: level,
          score: r.score, clues: n, used: r.used, tries: t };
      }
    }
    return null;
  }

  /* restrict[i]: the player's center marks for cell i (0 = none), used as its candidate list.
     noted[i]: every digit the player has written in cell i (center or corner).
     Prefers the easiest step the player can act on: a placement, or an elimination
     of a digit they have actually written. Falls back to any step (visible: false). */
  function hint(grid, restrict, noted) {
    var s = new State(grid), i, st;
    if (restrict) for (i = 0; i < 81; i++) if (!s.v[i] && restrict[i]) s.c[i] &= restrict[i];
    if (s.broken()) return null;
    if (noted) {
      ACCEPT = function (x) {
        if (x.place) return true;
        for (var k = 0; k < x.elim.length; k++) if (noted[x.elim[k][0]] & x.elim[k][1]) return true;
        return false;
      };
      try { st = nextStep(s); } finally { ACCEPT = null; }
      if (st) {
        st.visible = true;
        if (st.elim) st.elim = st.elim.map(function (e) { return [e[0], e[1] & noted[e[0]]]; }).filter(function (e) { return e[1]; });
        return st;
      }
    }
    st = nextStep(s);
    if (st) st.visible = false;
    return st;
  }

  return {
    solve: solve, rate: rate, generate: generate, makePuzzle: makePuzzle, hint: hint,
    TECH: TECH, LEVELS: LEVELS, DIGS: DIGS, POP: POP, PEERS: PEERS, UNITS: UNITS,
    R: R, C: C, B: B, cn: cn, clues: clues, accepts: accepts,
    _State: State, _nextStep: nextStep
  };
})();
if (typeof module !== "undefined") module.exports = SudokuEngine;
