/* fpga.js - implementation for the virtual FPGA: technology mapping of the gate netlist from
   synth.js to 4-input lookup tables, packing, placement, routing, timing, the bitstream, and an
   emulator that runs the bitstream alone. */
(function (G) {
'use strict';

/* ---------- technology mapping: cover the AND graph with 4-input lookup tables (LUTs).
   Every AND node gets up to CUTS "cuts": sets of at most 4 nodes that its value depends on
   alone. One cut per needed node becomes a LUT. The first pass looks for the fewest levels
   of LUTs; the second keeps that depth and looks for fewer LUTs ("area flow"). */
const K = 4, CUTS = 10;
const PAT = [0xAAAA, 0xCCCC, 0xF0F0, 0xFF00];

function techMap(net) {
    const N = net.aig.nodes, n = N.length;
    const isAnd = id => N[id].k === 'a';
    const roots = [];
    for (const o of net.outputs) roots.push(o.lit);
    for (const f of net.ffs) { roots.push(f.d); if (f.ar !== null) roots.push(f.ar); }
    // fanout estimates, and the nodes that matter
    const refs = new Float64Array(n), live = new Uint8Array(n);
    for (const l of roots) refs[l >> 1]++;
    const st = roots.map(l => l >> 1);
    while (st.length) {
        const id = st.pop();
        if (live[id]) continue;
        live[id] = 1;
        if (isAnd(id)) { st.push(N[id].a >> 1, N[id].b >> 1); refs[N[id].a >> 1]++; refs[N[id].b >> 1]++; }
    }
    const cuts = new Array(n), best = new Array(n), depth = new Float64Array(n), af = new Float64Array(n);
    const merge = (x, y) => {
        const out = [];
        let i = 0, j = 0;
        while (i < x.length || j < y.length) {
            let v;
            if (j >= y.length || (i < x.length && x[i] < y[j])) v = x[i++];
            else if (i >= x.length || y[j] < x[i]) v = y[j++];
            else { v = x[i]; i++; j++; }
            out.push(v);
            if (out.length > K) return null;
        }
        return out;
    };
    const leafCuts = id => (isAnd(id) ? cuts[id].map(c => c.leaves).concat([[id]]) : [[id]]);
    const subset = (a, b) => a.length <= b.length && a.every(v => b.includes(v));
    function pass(req) {
        for (let id = 1; id < n; id++) {
            if (!isAnd(id) || !live[id]) continue;
            const seen = new Set(), list = [];
            for (const x of leafCuts(N[id].a >> 1)) for (const y of leafCuts(N[id].b >> 1)) {
                const u = merge(x, y);
                if (!u) continue;
                const key = u.join(',');
                if (seen.has(key)) continue;
                seen.add(key);
                let d = 0, a = 1;
                for (const l of u) if (isAnd(l)) { d = Math.max(d, depth[l]); a += af[l]; }
                list.push({ leaves: u, depth: d + 1, af: a / Math.max(1, refs[id]) });
            }
            const kept = list.filter(c => !list.some(o => o !== c && o.leaves.length < c.leaves.length && subset(o.leaves, c.leaves)));
            const byDepth = (p, q) => p.depth - q.depth || p.af - q.af || p.leaves.length - q.leaves.length;
            const byArea = (p, q) => p.af - q.af || p.depth - q.depth || p.leaves.length - q.leaves.length;
            let order = kept.slice().sort(byDepth);
            if (req) {
                const ok = kept.filter(c => c.depth <= req[id]).sort(byArea);
                if (ok.length) order = ok.concat(order.filter(c => !ok.includes(c)));
            }
            cuts[id] = order.slice(0, CUTS);
            best[id] = cuts[id][0];
            depth[id] = best[id].depth;
            af[id] = best[id].af;
        }
    }
    // the nodes that get a LUT, with polarity: a LUT feeding other LUTs is always positive
    const lutRoot = l => {
        const id = l >> 1;
        return isAnd(id) || id === 0 || (l & 1);
    };
    function cover() {
        const pos = new Uint8Array(n), neg = new Uint8Array(n), todo = [];
        const want = (id, pol) => {
            const a = pol ? neg : pos;
            if (!a[id]) { a[id] = 1; todo.push(id); }
        };
        for (const o of net.outputs) if (lutRoot(o.lit)) want(o.lit >> 1, o.lit & 1);
        for (const f of net.ffs) {
            want(f.d >> 1, f.d & 1);
            if (f.ar !== null && isAnd(f.ar >> 1)) want(f.ar >> 1, 0);
        }
        while (todo.length) {
            const id = todo.pop();
            if (isAnd(id)) for (const l of best[id].leaves) if (isAnd(l)) want(l, 0);
        }
        return { pos, neg };
    }
    pass(null);
    // required levels from the fastest cover, then fewer LUTs within them
    let cv = cover();
    let D = 0;
    for (const l of roots) if (isAnd(l >> 1)) D = Math.max(D, depth[l >> 1]);
    const req = new Float64Array(n).fill(Infinity);
    for (const l of roots) if (isAnd(l >> 1)) req[l >> 1] = D;
    for (let id = n - 1; id > 0; id--) {
        if (!(cv.pos[id] || cv.neg[id]) || !isAnd(id)) continue;
        for (const l of best[id].leaves) if (isAnd(l)) req[l] = Math.min(req[l], req[id] - 1);
    }
    pass(req);
    cv = cover();

    // the LUTs: truth tables from the cone between each node and its cut
    const truth = (root, leaves) => {
        const val = new Map([[0, 0]]);
        leaves.forEach((l, i) => val.set(l, PAT[i]));
        const ev = id => {
            let v = val.get(id);
            if (v !== undefined) return v;
            const nd = N[id];
            const a = ev(nd.a >> 1) ^ (nd.a & 1 ? 0xFFFF : 0), b = ev(nd.b >> 1) ^ (nd.b & 1 ? 0xFFFF : 0);
            v = a & b;
            val.set(id, v);
            return v;
        };
        return ev(root);
    };
    const luts = [], lutOf = new Map();
    const src = id => (N[id].k2 === 'pin' ? { k: 'pin', pin: N[id].pin, idx: N[id].idx } : { k: 'ff', i: N[id].ff });
    const mk = (id, pol) => {
        const key = 2 * id + pol;
        if (lutOf.has(key)) return lutOf.get(key);
        let leaves, init;
        if (isAnd(id)) { leaves = best[id].leaves; init = truth(id, leaves); }
        else if (id === 0) { leaves = []; init = 0; }
        else { leaves = [id]; init = PAT[0]; }
        if (pol) init ^= 0xFFFF;
        const i = luts.length;
        luts.push({ node: id, pol, leaves, init, ins: null });
        lutOf.set(key, i);
        return i;
    };
    for (let id = 1; id < n; id++) { if (cv.pos[id]) mk(id, 0); if (cv.neg[id]) mk(id, 1); }
    const outs = net.outputs.map(o => ({ pin: o.pin, idx: o.idx, name: o.name, src: lutRoot(o.lit) ? { k: 'lut', i: mk(o.lit >> 1, o.lit & 1) } : src(o.lit >> 1) }));
    // flip-flops: each sits next to the LUT that computes its input; a LUT feeds one flip-flop at most
    const ffOf = [];
    const ffs = net.ffs.map((f, k) => {
        let li = mk(f.d >> 1, f.d & 1);
        if (ffOf[li] !== undefined) {
            const c = luts[li];
            li = luts.length;
            luts.push({ node: c.node, pol: c.pol, leaves: c.leaves, init: c.init, ins: null, copy: true });
        }
        ffOf[li] = k;
        let sr = null, srInv = 0;
        if (f.ar !== null) {
            const id = f.ar >> 1;
            if (isAnd(id)) { sr = { k: 'lut', i: mk(id, 0) }; srInv = f.ar & 1; }
            else if (id === 0) sr = { k: 'lut', i: mk(0, f.ar & 1) };
            else { sr = src(id); srInv = f.ar & 1; }
        }
        return { name: f.name, sig: f.sig, d: li, init: f.init, sr, srInv, srv: f.arv };
    });
    for (const l of luts) l.ins = l.leaves.map(id => (isAnd(id) ? { k: 'lut', i: lutOf.get(2 * id) } : src(id)));
    // levels of LUTs on the longest path (from inputs or flip-flops)
    const lv = new Array(luts.length).fill(-1);
    const level = i => {
        if (lv[i] >= 0) return lv[i];
        lv[i] = 0;
        let m = 0;
        for (const s of luts[i].ins) if (s.k === 'lut') m = Math.max(m, level(s.i));
        lv[i] = m + 1;
        return lv[i];
    };
    let levels = 0;
    for (let i = 0; i < luts.length; i++) levels = Math.max(levels, level(i));
    return { luts: luts.map(l => ({ init: l.init, ins: l.ins, node: l.node, pol: l.pol })), ffs, outs, levels, clock: net.clock };
}

/* ---------- a LUT netlist, simulated one clock cycle at a time. The emulator builds the same
   kind of netlist from a bitstream, so both use this. */
function lutSim(m) {
    const nl = m.luts.length, nf = m.ffs.length;
    // value slots: 0 constant 0, 1 constant 1, then inputs, flip-flops and LUT outputs
    const pins = new Map();
    const pinSlot = (pin, idx) => { const k = `${pin}:${idx}`; if (!pins.has(k)) pins.set(k, { pin, idx, slot: -1 }); return pins.get(k); };
    for (const l of m.luts) for (const s of l.ins) if (s.k === 'pin') pinSlot(s.pin, s.idx);
    for (const f of m.ffs) if (f.sr && f.sr.k === 'pin') pinSlot(f.sr.pin, f.sr.idx);
    for (const o of m.outs) if (o.src.k === 'pin') pinSlot(o.src.pin, o.src.idx);
    let k = 2;
    for (const p of pins.values()) p.slot = k++;
    const F0 = k, L0 = F0 + nf, V = new Uint8Array(L0 + nl);
    V[1] = 1;
    const slot = s => (s.k === 'lut' ? L0 + s.i : s.k === 'ff' ? F0 + s.i : s.k === 'pin' ? pins.get(`${s.pin}:${s.idx}`).slot : (s.v ? 1 : 0));
    // the LUTs in an order where every LUT comes after the LUTs it reads
    const order = [], state = new Uint8Array(nl);
    for (let i = 0; i < nl; i++) {
        if (state[i]) continue;
        const stack = [[i, 0]];
        while (stack.length) {
            const top = stack[stack.length - 1], j = top[0];
            if (top[1] === 0) {
                if (state[j] === 2) { stack.pop(); continue; }
                if (state[j] === 1) throw new Error('the LUTs form a loop without a flip-flop');
                state[j] = 1;
            }
            const ins = m.luts[j].ins;
            let pushed = false;
            while (top[1] < ins.length) {
                const s = ins[top[1]++];
                if (s.k === 'lut' && state[s.i] !== 2) {
                    if (state[s.i] === 1) throw new Error('the LUTs form a loop without a flip-flop');
                    stack.push([s.i, 0]);
                    pushed = true;
                    break;
                }
            }
            if (!pushed && top[1] >= ins.length) { state[j] = 2; order.push(j); stack.pop(); }
        }
    }
    const ord = Int32Array.from(order);
    const IN = new Int32Array(4 * nl).fill(0), INIT = new Uint16Array(nl);
    m.luts.forEach((l, i) => { INIT[i] = l.init; l.ins.forEach((s, j) => { IN[4 * i + j] = slot(s); }); });
    const FD = Int32Array.from(m.ffs.map(f => L0 + f.d));
    const SR = Int32Array.from(m.ffs.map(f => (f.sr ? slot(f.sr) : -1)));
    const SRI = Uint8Array.from(m.ffs.map(f => f.srInv || 0)), SRV = Uint8Array.from(m.ffs.map(f => f.srv || 0));
    const outs = m.outs.map(o => ({ pin: o.pin, idx: o.idx, slot: slot(o.src) }));
    const pinList = [...pins.values()];
    const evalAll = () => {
        for (let q = 0; q < ord.length; q++) {
            const i = ord[q], b = 4 * i;
            V[L0 + i] = (INIT[i] >> (V[IN[b]] | (V[IN[b + 1]] << 1) | (V[IN[b + 2]] << 2) | (V[IN[b + 3]] << 3))) & 1;
        }
    };
    const async = () => {
        for (let it = 0; it < 4; it++) {
            let ch = false;
            for (let f = 0; f < nf; f++) if (SR[f] >= 0 && (V[SR[f]] ^ SRI[f]) && V[F0 + f] !== SRV[f]) { V[F0 + f] = SRV[f]; ch = true; }
            if (!ch) return;
            evalAll();
        }
    };
    const nextQ = new Uint8Array(nf);
    let dirty = false;
    const sim = {
        luts: nl, ffs: nf,
        reset() { m.ffs.forEach((f, i) => { V[F0 + i] = f.init; }); evalAll(); async(); },
        set(pin, v) { for (const p of pinList) if (p.pin === pin) V[p.slot] = p.idx === null ? (Array.isArray(v) ? v[0] : v) : (v[p.idx] || 0); dirty = true; },
        settle() { evalAll(); async(); dirty = false; },
        edge() {
            if (dirty) sim.settle();
            for (let f = 0; f < nf; f++) nextQ[f] = SR[f] >= 0 && (V[SR[f]] ^ SRI[f]) ? SRV[f] : V[FD[f]];
            for (let f = 0; f < nf; f++) V[F0 + f] = nextQ[f];
            evalAll();
            async();
        },
        out(pin, idx) { for (const o of outs) if (o.pin === pin && o.idx === idx) return V[o.slot]; return 0; },
        // direct access for a fast board: the value slots of pins
        V,
        inSlot(pin, idx) { const p = pins.get(`${pin}:${idx}`); return p ? p.slot : -1; },
        outSlot(pin, idx) { for (const o of outs) if (o.pin === pin && o.idx === idx) return o.slot; return 0; },
        touch() { dirty = true; }
    };
    sim.reset();
    return sim;
}

/* ---------- the device. VF-1 is a grid of W x H logic tiles, each with one LUT and one
   flip-flop, inside a ring of I/O tiles that hold the board's pins. Between the tiles run
   routing channels of T wires; each wire spans one tile. At every corner a switch box can join
   wire t of the channels that meet there, and every tile pin can reach every wire around it. */
const ARCH = { name: 'VF-1', W: 24, H: 24, T: 12 };
// delays in ns: through a LUT, from the clock to a flip-flop output, set-up time, one wire with
// its switch, a connection box into a tile input, and the input and output pads
const DELAY = { lut: 0.45, clkq: 0.35, setup: 0.15, wire: 0.35, ipin: 0.15, padIn: 0.6, padOut: 0.8 };
// tile pins: 0-3 the LUT inputs, 4 the set/reset input of the flip-flop, 5 the LUT output O, 6 the flip-flop output Q
const TP = 7, PIN_NAMES = ['I0', 'I1', 'I2', 'I3', 'SR', 'O', 'Q'];
// switch-box sides: 0 left, 1 right, 2 bottom, 3 top; the six pairs a switch can join
const PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

// the board's pins on the I/O ring, at the same places on every VF-1
function padList(W, H) {
    const pads = [], add = (x, y, pin, idx, dir) => pads.push({ x, y, pin, idx, dir });
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    // bottom: the switches and the LEDs, sw(0) and led(0) on the right as on the board
    for (let i = 15; i >= 0; i--) { const x = cx - 8 + (15 - i) + 1; add(x, 0, 'sw', i, 'in'); add(x, 0, 'led', i, 'out'); }
    // top: the display
    [['an', 3], ['an', 2], ['an', 1], ['an', 0], ['dp', null], ['seg', 6], ['seg', 5], ['seg', 4], ['seg', 3], ['seg', 2], ['seg', 1], ['seg', 0]]
        .forEach(([pin, idx], k) => add(cx - 6 + k + 1, H + 1, pin, idx, 'out'));
    // right: the buttons, up at the top
    [['btn', 1], ['btn', 2], ['btn', 0], ['btn', 3], ['btn', 4]].forEach(([pin, idx], k) => add(W + 1, cy + 2 - k, pin, idx, 'in'));
    // left: the serial port
    add(0, cy + 1, 'rx', null, 'in');
    add(0, cy, 'tx', null, 'out');
    return pads;
}

// the routing graph: one node per wire and per pin, an edge per switch that can join two of them
function buildArch(A) {
    const W = A.W, H = A.H, T = A.T;
    const pads = padList(W, H);
    const NXW = W * (H + 1) * T, NYW = (W + 1) * H * T, NW = NXW + NYW;
    const PIN0 = NW, PAD0 = PIN0 + W * H * TP, NN = PAD0 + pads.length;
    const chanx = (x, y, t) => (y * W + x - 1) * T + t;              // above tile row y, x 1..W, y 0..H
    const chany = (x, y, t) => NXW + (x * H + y - 1) * T + t;        // right of tile column x, x 0..W, y 1..H
    const tpin = (x, y, p) => PIN0 + ((y - 1) * W + x - 1) * TP + p;
    // node kinds: 0 horizontal wire, 1 vertical wire, 2 tile input, 3 tile output, 4 input pad, 5 output pad
    const kind = new Uint8Array(NN), nx = new Float32Array(NN), ny = new Float32Array(NN), trk = new Int16Array(NN);
    for (let y = 0; y <= H; y++) for (let x = 1; x <= W; x++) for (let t = 0; t < T; t++) { const i = chanx(x, y, t); nx[i] = x; ny[i] = y + 0.5; trk[i] = t; }
    for (let x = 0; x <= W; x++) for (let y = 1; y <= H; y++) for (let t = 0; t < T; t++) { const i = chany(x, y, t); kind[i] = 1; nx[i] = x + 0.5; ny[i] = y; trk[i] = t; }
    for (let y = 1; y <= H; y++) for (let x = 1; x <= W; x++) for (let p = 0; p < TP; p++) { const i = tpin(x, y, p); kind[i] = p < 5 ? 2 : 3; nx[i] = x; ny[i] = y; trk[i] = p; }
    pads.forEach((p, k) => { const i = PAD0 + k; kind[i] = p.dir === 'in' ? 4 : 5; nx[i] = p.x; ny[i] = p.y; trk[i] = k; });
    // the wires around tile (x, y): side 0 top, 1 right, 2 bottom, 3 left
    const sideWire = (x, y, s, t) => (s === 0 ? chanx(x, y, t) : s === 1 ? chany(x, y, t) : s === 2 ? chanx(x, y - 1, t) : chany(x - 1, y, t));
    const padWire = (p, t) => (p.y === 0 ? chanx(p.x, 0, t) : p.y === H + 1 ? chanx(p.x, H, t) : p.x === 0 ? chany(0, p.y, t) : chany(W, p.y, t));
    // the wire on side s of the switch box at corner (x, y), or -1 at the edge
    const sbWire = (x, y, s, t) => (s === 0 ? (x >= 1 ? chanx(x, y, t) : -1) : s === 1 ? (x < W ? chanx(x + 1, y, t) : -1)
        : s === 2 ? (y >= 1 ? chany(x, y, t) : -1) : (y < H ? chany(x, y + 1, t) : -1));
    const E = [];
    for (let y = 1; y <= H; y++) for (let x = 1; x <= W; x++) for (let s = 0; s < 4; s++) for (let t = 0; t < T; t++) {
        const w = sideWire(x, y, s, t);
        E.push(tpin(x, y, 5), w, tpin(x, y, 6), w);
        for (let p = 0; p < 5; p++) E.push(w, tpin(x, y, p));
    }
    for (let x = 0; x <= W; x++) for (let y = 0; y <= H; y++) for (let t = 0; t < T; t++) for (const [a, b] of PAIRS) {
        const wa = sbWire(x, y, a, t), wb = sbWire(x, y, b, t);
        if (wa >= 0 && wb >= 0) E.push(wa, wb, wb, wa);
    }
    pads.forEach((p, k) => { for (let t = 0; t < T; t++) { const w = padWire(p, t); if (p.dir === 'in') E.push(PAD0 + k, w); else E.push(w, PAD0 + k); } });
    const ne = E.length / 2, off = new Int32Array(NN + 1), to = new Int32Array(ne);
    for (let i = 0; i < ne; i++) off[E[2 * i] + 1]++;
    for (let i = 0; i < NN; i++) off[i + 1] += off[i];
    const fill = off.slice(0, NN);
    for (let i = 0; i < ne; i++) to[fill[E[2 * i]]++] = E[2 * i + 1];
    const wireInfo = i => {
        if (i < NXW) { const t = i % T, c = (i - t) / T; return { dir: 'x', x: c % W + 1, y: Math.floor(c / W), t }; }
        const j = i - NXW, t = j % T, c = (j - t) / T;
        return { dir: 'y', x: Math.floor(c / H), y: c % H + 1, t };
    };
    const pinInfo = i => { const j = i - PIN0, p = j % TP, c = (j - p) / TP; return { x: c % W + 1, y: Math.floor(c / W) + 1, p }; };
    const sideOf = (x, y, w) => { for (let s = 0; s < 4; s++) if (sideWire(x, y, s, trk[w]) === w) return s; return -1; };
    // the corner two wires share, and which switch of it joins them
    const corners = w => { const i = wireInfo(w); return i.dir === 'x' ? [[i.x - 1, i.y, 1], [i.x, i.y, 0]] : [[i.x, i.y - 1, 3], [i.x, i.y, 2]]; };
    const switchOf = (wa, wb) => {
        for (const [x1, y1, s1] of corners(wa)) for (const [x2, y2, s2] of corners(wb)) {
            if (x1 !== x2 || y1 !== y2) continue;
            const lo = Math.min(s1, s2), hi = Math.max(s1, s2);
            return { x: x1, y: y1, t: trk[wa], k: PAIRS.findIndex(p => p[0] === lo && p[1] === hi) };
        }
        return null;
    };
    return { name: A.name || 'VF-1', W, H, T, pads, NXW, NYW, NW, PIN0, PAD0, NN, chanx, chany, tpin, kind, nx, ny, trk, off, to, edges: ne, sideWire, padWire, sbWire, wireInfo, pinInfo, sideOf, switchOf };
}
const archCache = new Map();
function getArch(A) {
    A = A || ARCH;
    const k = `${A.W}x${A.H}x${A.T}`;
    if (!archCache.has(k)) archCache.set(k, buildArch(A));
    return archCache.get(k);
}

/* ---------- packing: one basic logic element (BLE) per LUT, with the flip-flop that the LUT
   feeds; the connections between BLEs and pads become nets */
function pack(map, arch) {
    const padIn = new Map(), padOut = new Map();
    arch.pads.forEach((p, k) => (p.dir === 'in' ? padIn : padOut).set(`${p.pin}:${p.idx}`, k));
    const padOf = (m, s) => {
        const k = m.get(`${s.pin}:${s.idx}`);
        if (k === undefined) throw new Error(`the board has no pin ${s.pin}${s.idx === null ? '' : `(${s.idx})`}`);
        return k;
    };
    const bles = map.luts.map((l, i) => ({ i, init: l.init, ins: l.ins, ff: null, name: null }));
    map.ffs.forEach((f, k) => { bles[f.d].ff = { k, name: f.name, init: f.init, sr: f.sr, srInv: f.srInv, srv: f.srv }; bles[f.d].name = f.name; });
    for (const o of map.outs) if (o.src.k === 'lut' && !bles[o.src.i].name) bles[o.src.i].name = o.name;
    const nets = [], byKey = new Map();
    const netOf = s => {
        const key = s.k === 'lut' ? `O${s.i}` : s.k === 'ff' ? `Q${map.ffs[s.i].d}` : `P${padOf(padIn, s)}`;
        let n = byKey.get(key);
        if (!n) {
            const src = s.k === 'lut' ? { b: s.i, pin: 5 } : s.k === 'ff' ? { b: map.ffs[s.i].d, pin: 6 } : { pad: padOf(padIn, s) };
            const name = s.k === 'lut' ? (bles[s.i].ff && bles[s.i].name ? `${bles[s.i].name} (LUT)` : bles[s.i].name || `LUT ${s.i}`)
                : s.k === 'ff' ? map.ffs[s.i].name : `${s.pin}${s.idx === null ? '' : `(${s.idx})`}`;
            n = { src, sinks: [], name };
            byKey.set(key, n);
            nets.push(n);
        }
        return n;
    };
    bles.forEach((b, i) => {
        b.ins.forEach((s, j) => netOf(s).sinks.push({ b: i, pin: j }));
        if (b.ff && b.ff.sr) netOf(b.ff.sr).sinks.push({ b: i, pin: 4 });
    });
    for (const o of map.outs) netOf(o.src).sinks.push({ pad: padOf(padOut, o) });
    bles.forEach((b, i) => { if (!b.name) b.name = `LUT ${i}`; });
    return { bles, nets };
}

/* ---------- placement by simulated annealing: random swaps of BLEs, kept when the total
   wiring estimate (half the perimeter of each net's bounding box) gets shorter, and sometimes
   when it gets longer, less and less often as the "temperature" falls */
function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function* placeGen(arch, cl, seed) {
    const W = arch.W, H = arch.H, nb = cl.bles.length, nt = W * H;
    if (nb > nt) throw new Error(`the design needs ${nb} logic tiles, but ${arch.name} has ${nt}`);
    const rnd = rng(seed || 1);
    const loc = new Int32Array(nb), occ = new Int32Array(nt).fill(-1);
    const perm = Array.from({ length: nt }, (_, i) => i);
    for (let i = nt - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let b = 0; b < nb; b++) { loc[b] = perm[b]; occ[perm[b]] = b; }
    // each net as its terminals: a BLE (>= 0) or a pad (-1 - pad)
    const nets = cl.nets.map(n => [...new Set([n.src, ...n.sinks].map(t => (t.b !== undefined ? t.b : -1 - t.pad)))]);
    const netsOf = Array.from({ length: nb }, () => []);
    nets.forEach((ts, k) => { for (const t of ts) if (t >= 0) netsOf[t].push(k); });
    const qn = nets.map(ts => (ts.length <= 3 ? 1 : 1 + 0.4 * Math.log(ts.length / 3)));
    const netCost = k => {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const t of nets[k]) {
            let x, y;
            if (t >= 0) { x = loc[t] % W + 1; y = (loc[t] - x + 1) / W + 1; }
            else { const p = arch.pads[-1 - t]; x = p.x; y = p.y; }
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        return (x1 - x0 + y1 - y0) * qn[k];
    };
    const cost = new Float64Array(nets.length), newc = new Float64Array(nets.length), mark = new Int32Array(nets.length);
    let total = 0, moveId = 0;
    for (let k = 0; k < nets.length; k++) { cost[k] = netCost(k); total += cost[k]; }
    const tryMove = (b, tx, ty, temp) => {
        const t1 = loc[b], t2 = (ty - 1) * W + tx - 1;
        if (t1 === t2) return 0;
        const b2 = occ[t2];
        loc[b] = t2; occ[t2] = b; occ[t1] = b2; if (b2 >= 0) loc[b2] = t1;
        moveId++;
        let delta = 0;
        const list = [];
        for (const k of netsOf[b]) if (mark[k] !== moveId) { mark[k] = moveId; list.push(k); }
        if (b2 >= 0) for (const k of netsOf[b2]) if (mark[k] !== moveId) { mark[k] = moveId; list.push(k); }
        for (const k of list) { newc[k] = netCost(k); delta += newc[k] - cost[k]; }
        if (delta <= 0 || rnd() < Math.exp(-delta / temp)) { for (const k of list) cost[k] = newc[k]; total += delta; return delta === 0 ? 0.5 : 1; }
        loc[b] = t1; occ[t1] = b; occ[t2] = b2; if (b2 >= 0) loc[b2] = t2;
        return 0;
    };
    const randMove = (rlim, temp) => {
        const b = Math.floor(rnd() * nb), x = loc[b] % W + 1, y = Math.floor(loc[b] / W) + 1, r = Math.max(1, Math.round(rlim));
        const tx = Math.min(W, Math.max(1, x + Math.floor(rnd() * (2 * r + 1)) - r)), ty = Math.min(H, Math.max(1, y + Math.floor(rnd() * (2 * r + 1)) - r));
        return tryMove(b, tx, ty, temp);
    };
    if (!nb) return { loc, cost: total, steps: 0 };
    // the first temperature: 20 times the spread of the cost changes of random moves
    const deltas = [];
    for (let i = 0; i < Math.min(nb * 4, 400); i++) { const c0 = total; randMove(Math.max(W, H), Infinity); deltas.push(total - c0); }
    const mean = deltas.reduce((a, d) => a + d, 0) / deltas.length;
    let temp = 20 * Math.sqrt(deltas.reduce((a, d) => a + (d - mean) * (d - mean), 0) / deltas.length) || 1;
    let rlim = Math.max(W, H), steps = 0;
    const inner = Math.max(200, Math.round(4 * Math.pow(nb, 4 / 3)));
    for (;;) {
        let acc = 0;
        for (let m = 0; m < inner; m++) if (randMove(rlim, temp)) acc++;
        const rate = acc / inner;
        steps++;
        yield { phase: 'place', step: steps, temp, cost: total, rate };
        if (temp < 0.002 * total / Math.max(1, nets.length) || steps > 400) break;
        temp *= rate > 0.96 ? 0.5 : rate > 0.8 ? 0.9 : rate > 0.15 ? 0.95 : 0.8;
        rlim = Math.min(Math.max(W, H), Math.max(1, rlim * (0.56 + rate)));
    }
    for (let m = 0; m < inner; m++) randMove(1, 1e-9);
    let check = 0;
    for (let k = 0; k < nets.length; k++) check += netCost(k);
    return { loc, cost: check, steps };
}

/* ---------- routing with PathFinder: every net is routed on its own, cheapest path first;
   wires that two nets share get dearer every round until no wire is shared */
function* routeGen(arch, cl, loc, opts) {
    opts = opts || {};
    const W = arch.W, NN = arch.NN, kind = arch.kind, off = arch.off, to = arch.to, nx = arch.nx, ny = arch.ny;
    const node = t => (t.b !== undefined ? arch.tpin(loc[t.b] % W + 1, Math.floor(loc[t.b] / W) + 1, t.pin) : arch.PAD0 + t.pad);
    const nets = cl.nets.map((n, i) => ({ i, src: node(n.src), sinks: n.sinks.map(node), tree: null, parent: null }));
    const occ = new Int32Array(NN), hist = new Float32Array(NN), base = new Float32Array(NN);
    for (let i = 0; i < NN; i++) base[i] = kind[i] <= 1 ? 1 : 0.95;
    const g = new Float64Array(NN), prev = new Int32Array(NN), seen = new Int32Array(NN), closed = new Int32Array(NN), inTree = new Int32Array(NN);
    let stamp = 0, treeStamp = 0, presFac = 0.5;
    // a binary heap of (priority, node)
    let hk = new Float64Array(1024), hv = new Int32Array(1024), hn = 0;
    const push = (k, v) => {
        if (hn === hk.length) { const k2 = new Float64Array(hn * 2), v2 = new Int32Array(hn * 2); k2.set(hk); v2.set(hv); hk = k2; hv = v2; }
        let i = hn++;
        while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; }
        hk[i] = k; hv[i] = v;
    };
    const pop = () => {
        const v = hv[0], k = hk[--hn], last = hv[hn];
        let i = 0;
        for (;;) {
            let c = 2 * i + 1;
            if (c >= hn) break;
            if (c + 1 < hn && hk[c + 1] < hk[c]) c++;
            if (hk[c] >= k) break;
            hk[i] = hk[c]; hv[i] = hv[c]; i = c;
        }
        hk[i] = k; hv[i] = last;
        return v;
    };
    const routeNet = net => {
        treeStamp++;
        // hops: wires from the source; branching off far along the tree costs a little, which keeps paths short
        const tree = [net.src], parent = new Map([[net.src, -1]]), hops = new Map([[net.src, 0]]);
        inTree[net.src] = treeStamp;
        const sinks = net.sinks.slice().sort((a, b) => (Math.abs(nx[a] - nx[net.src]) + Math.abs(ny[a] - ny[net.src])) - (Math.abs(nx[b] - nx[net.src]) + Math.abs(ny[b] - ny[net.src])));
        for (const sink of sinks) {
            if (inTree[sink] === treeStamp) continue;
            stamp++;
            hn = 0;
            const tx = nx[sink], ty = ny[sink];
            for (const v of tree) { g[v] = 0.3 * hops.get(v); prev[v] = -1; seen[v] = stamp; push(g[v] + Math.abs(nx[v] - tx) + Math.abs(ny[v] - ty), v); }
            let found = false;
            while (hn) {
                const u = pop();
                if (u === sink) { found = true; break; }
                if (closed[u] === stamp) continue;
                closed[u] = stamp;
                const gu = g[u];
                for (let e = off[u]; e < off[u + 1]; e++) {
                    const v = to[e], kv = kind[v];
                    if ((kv === 2 || kv === 5) && v !== sink) continue;          // another input: a dead end
                    const c = gu + base[v] * (1 + hist[v]) * (1 + presFac * occ[v]);
                    if (seen[v] !== stamp || c < g[v]) {
                        seen[v] = stamp; g[v] = c; prev[v] = u;
                        push(c + Math.abs(nx[v] - tx) + Math.abs(ny[v] - ty), v);
                    }
                }
            }
            if (!found) throw new Error('a connection cannot be routed at all');
            const path = [];
            for (let v = sink; inTree[v] !== treeStamp; v = prev[v]) { inTree[v] = treeStamp; tree.push(v); parent.set(v, prev[v]); path.push(v); }
            for (let k = path.length - 1; k >= 0; k--) hops.set(path[k], hops.get(parent.get(path[k])) + (kind[path[k]] <= 1 ? 1 : 0));
        }
        net.tree = tree;
        net.parent = parent;
    };
    const order = nets.slice().sort((a, b) => b.sinks.length - a.sinks.length);
    let it = 0, over = 0;
    const maxIt = opts.maxIt || 40;
    for (it = 1; it <= maxIt; it++) {
        for (const net of order) {
            if (net.tree) for (const v of net.tree) occ[v]--;
            routeNet(net);
            for (const v of net.tree) occ[v]++;
        }
        over = 0;
        for (let i = 0; i < NN; i++) if (occ[i] > 1) { over++; hist[i] += 0.3 * (occ[i] - 1); }
        yield { phase: 'route', iter: it, over };
        if (!over) break;
        presFac *= 1.6;
    }
    if (over) throw new Error(`the design could not be routed: after ${maxIt} rounds ${over} wires are still wanted by two nets. Fewer connections, or a smaller design, will fit.`);
    let wires = 0;
    for (const net of nets) for (const v of net.tree) if (kind[v] <= 1) wires++;
    return { nets, iters: it, wires };
}

/* ---------- timing: the delay of every routed connection, then the longest paths. A path starts
   at a flip-flop (clock to output) or an input pad and ends at a flip-flop (set-up) or an output pad. */
function timing(arch, cl, loc, routed) {
    const kind = arch.kind;
    const nodeDelay = v => (kind[v] <= 1 ? DELAY.wire : kind[v] === 2 ? DELAY.ipin : 0);
    // the route delay from the source of each net to each of its sinks
    const conn = new Map();     // `${b}:${pin}` or `pad:${k}` -> { net, delay, path }
    routed.nets.forEach((rn, ni) => {
        const memo = new Map([[rn.src, 0]]);
        const delayOf = v => {
            if (memo.has(v)) return memo.get(v);
            const chain = [];
            let u = v;
            while (!memo.has(u)) { chain.push(u); u = rn.parent.get(u); }
            let d = memo.get(u);
            for (let i = chain.length - 1; i >= 0; i--) { d += nodeDelay(chain[i]); memo.set(chain[i], d); }
            return d;
        };
        const n = cl.nets[ni];
        n.sinks.forEach((s, k) => {
            const v = rn.sinks[k];
            conn.set(s.b !== undefined ? `${s.b}:${s.pin}` : `pad:${s.pad}`, { net: ni, delay: delayOf(v) });
        });
    });
    const bles = cl.bles, nb = bles.length;
    const srcKey = n => (n.src.b !== undefined ? `${n.src.pin === 5 ? 'O' : 'Q'}${n.src.b}` : `P${n.src.pad}`);
    const netSrc = cl.nets.map(srcKey);
    // arrival times at LUT outputs, once with flip-flops launching (pads never) and once the other way round
    const analyse = fromPads => {
        const arr = new Float64Array(nb).fill(NaN), via = new Array(nb);
        const at = key => {
            if (key[0] === 'P') return fromPads ? { t: DELAY.padIn, from: null } : null;
            const b = +key.slice(1);
            if (key[0] === 'Q') return fromPads ? null : { t: DELAY.clkq, from: null };
            return lutAt(b);
        };
        const lutAt = b => {
            if (!Number.isNaN(arr[b])) return arr[b] < 0 ? null : { t: arr[b] };
            let best = -1, from = null;
            bles[b].ins.forEach((s, j) => {
                const c = conn.get(`${b}:${j}`);
                const a = at(netSrc[c.net]);
                if (a && a.t + c.delay > best) { best = a.t + c.delay; from = { pin: j, net: c.net, route: c.delay }; }
            });
            if (best < 0 && bles[b].ins.length) { arr[b] = -1; return null; }
            arr[b] = Math.max(0, best) + DELAY.lut;
            via[b] = from;
            return { t: arr[b] };
        };
        const ends = [];
        bles.forEach((b, i) => { if (b.ff) { const a = lutAt(i); if (a) ends.push({ kind: 'ff', b: i, t: a.t + DELAY.setup }); } });
        cl.nets.forEach((n, ni) => n.sinks.forEach(s => {
            if (s.pad === undefined) return;
            const a = at(netSrc[ni]), c = conn.get(`pad:${s.pad}`);
            if (a) ends.push({ kind: 'pad', pad: s.pad, net: ni, t: a.t + c.delay + DELAY.padOut });
        }));
        ends.sort((p, q) => q.t - p.t);
        return { arr, via, ends };
    };
    const reg = analyse(false), io = analyse(true);
    // the steps of a path, back from where it ends
    const trace = (A, end) => {
        const steps = [];
        let key;
        if (end.kind === 'ff') { steps.push({ what: 'setup', b: end.b, d: DELAY.setup }); key = `O${end.b}`; }
        else { steps.push({ what: 'pad out', pad: end.pad, d: DELAY.padOut }); const c = conn.get(`pad:${end.pad}`); steps.push({ what: 'route', net: end.net, d: c.delay }); key = netSrc[end.net]; }
        for (let guard = 0; guard < 10000; guard++) {
            if (key[0] === 'P') { steps.push({ what: 'pad in', pad: +key.slice(1), d: DELAY.padIn }); break; }
            const b = +key.slice(1);
            if (key[0] === 'Q') { steps.push({ what: 'clock to Q', b, d: DELAY.clkq }); break; }
            steps.push({ what: 'LUT', b, d: DELAY.lut });
            const v = A.via[b];
            if (!v) break;
            steps.push({ what: 'route', net: v.net, d: v.route, pin: v.pin, b });
            key = netSrc[v.net];
        }
        return steps.reverse();
    };
    const regWorst = reg.ends.find(e => e.kind === 'ff');
    const period = regWorst ? regWorst.t : 0;
    return {
        period,
        fmax: period ? 1000 / period : null,
        regPath: regWorst ? trace(reg, regWorst) : null,
        outPath: reg.ends.find(e => e.kind === 'pad') ? trace(reg, reg.ends.find(e => e.kind === 'pad')) : null,
        inPath: io.ends.length ? trace(io, io.ends[0]) : null,
        inWorst: io.ends.length ? io.ends[0].t : 0,
        outWorst: reg.ends.find(e => e.kind === 'pad') ? reg.ends.find(e => e.kind === 'pad').t : 0
    };
}

/* ---------- the bitstream. Bits are packed most significant first:
   header  "VF1", version 1, W, H, T, 0
   tiles   for y = 1..H, x = 1..W: LUT INIT (16), flip-flop INIT, set/reset enable, invert and
           value (4), the input multiplexers I0 I1 I2 I3 SR (each MB bits: 0 = open, 1 + side * T
           + wire), the wires that O drives (4T) and the wires that Q drives (4T)
   switches for every corner x = 0..W, y = 0..H and wire t: 6 bits, one per pair of sides
   pads    in order: an input pad, the wires it drives (T); an output pad, its multiplexer (PB)
   check   CRC-32 of everything before it (4 bytes) */
const MAGIC = [86, 70, 49];
function crc32(bytes, n) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < n; i++) { c ^= bytes[i]; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; }
    return (c ^ 0xFFFFFFFF) >>> 0;
}
const fields = arch => ({ MB: Math.ceil(Math.log2(4 * arch.T + 1)), PB: Math.ceil(Math.log2(arch.T + 1)) });
function bitstream(arch, cl, loc, routed) {
    const { W, H, T, pads, kind, trk } = arch, { MB, PB } = fields(arch);
    const nt = W * H;
    const tiles = Array.from({ length: nt }, () => ({ init: 0, ffInit: 0, srEn: 0, srInv: 0, srv: 0, mux: [0, 0, 0, 0, 0], oeO: new Uint8Array(4 * T), oeQ: new Uint8Array(4 * T) }));
    const sw = new Uint8Array((W + 1) * (H + 1) * T * 6), padOE = pads.map(() => new Uint8Array(T)), padMux = pads.map(() => 0);
    cl.bles.forEach((b, i) => {
        const c = tiles[loc[i]];
        c.init = b.init;
        if (b.ff) { c.ffInit = b.ff.init; c.srEn = b.ff.sr ? 1 : 0; c.srInv = b.ff.srInv; c.srv = b.ff.srv; }
    });
    for (const rn of routed.nets) for (const [v, u] of rn.parent) {
        if (u < 0) continue;
        const ku = kind[u], kv = kind[v];
        if (ku === 3) { const p = arch.pinInfo(u), s = arch.sideOf(p.x, p.y, v); (p.p === 5 ? tiles[(p.y - 1) * W + p.x - 1].oeO : tiles[(p.y - 1) * W + p.x - 1].oeQ)[s * T + trk[v]] = 1; }
        else if (ku === 4) padOE[u - arch.PAD0][trk[v]] = 1;
        else if (kv <= 1) { const s = arch.switchOf(u, v); sw[((s.x * (H + 1) + s.y) * T + s.t) * 6 + s.k] = 1; }
        else if (kv === 2) { const p = arch.pinInfo(v), s = arch.sideOf(p.x, p.y, u); tiles[(p.y - 1) * W + p.x - 1].mux[p.p] = 1 + s * T + trk[u]; }
        else if (kv === 5) padMux[v - arch.PAD0] = 1 + trk[u];
    }
    // write the bits
    const total = 8 * 8 + nt * (16 + 4 + 5 * MB + 8 * T) + (W + 1) * (H + 1) * T * 6 + pads.reduce((a, p) => a + (p.dir === 'in' ? T : PB), 0) + 32;
    const bytes = new Uint8Array(Math.ceil(total / 8));
    let pos = 0;
    const put = (v, n) => { for (let i = n - 1; i >= 0; i--) { if ((v >>> i) & 1) bytes[pos >> 3] |= 0x80 >> (pos & 7); pos++; } };
    MAGIC.forEach(b => put(b, 8));
    put(1, 8); put(W, 8); put(H, 8); put(T, 8); put(0, 8);
    for (let y = 1; y <= H; y++) for (let x = 1; x <= W; x++) {
        const c = tiles[(y - 1) * W + x - 1];
        put(c.init, 16); put(c.ffInit, 1); put(c.srEn, 1); put(c.srInv, 1); put(c.srv, 1);
        for (const m of c.mux) put(m, MB);
        for (const b of c.oeO) put(b, 1);
        for (const b of c.oeQ) put(b, 1);
    }
    for (const b of sw) put(b, 1);
    pads.forEach((p, k) => { if (p.dir === 'in') for (const b of padOE[k]) put(b, 1); else put(padMux[k], PB); });
    while (pos & 7) pos++;
    const n = pos >> 3, crc = crc32(bytes, n);
    put(crc >>> 16, 16); put(crc & 0xFFFF, 16);
    let ones = 0;
    for (let i = 0; i < n; i++) { let v = bytes[i]; while (v) { ones += v & 1; v >>= 1; } }
    return { bytes: bytes.slice(0, pos >> 3), bits: pos, ones };
}

/* ---------- the emulator: it reads the configuration bits back and finds what they connect,
   with no knowledge of the design they came from. Wires joined by switches form one net;
   each net must have exactly one driver. The result is a LUT netlist for lutSim. */
function readBitstream(bytes) {
    let pos = 0;
    const get = n => { let v = 0; for (let i = 0; i < n; i++) { v = v * 2 + ((bytes[pos >> 3] >> (7 - (pos & 7))) & 1); pos++; } return v; };
    if (bytes.length < 12 || MAGIC.some(b => get(8) !== b)) throw new Error('this is not a VF-1 bitstream');
    const version = get(8), W = get(8), H = get(8), T = get(8);
    get(8);
    if (version !== 1) throw new Error(`bitstream version ${version} is not supported`);
    const n = bytes.length - 4;
    const crc = ((bytes[n] << 24) | (bytes[n + 1] << 16) | (bytes[n + 2] << 8) | bytes[n + 3]) >>> 0;
    if (crc !== crc32(bytes, n)) throw new Error('the bitstream is damaged: its CRC does not match');
    const arch = getArch({ name: 'VF-1', W, H, T }), { MB, PB } = fields(arch), pads = arch.pads;
    const tiles = [];
    for (let y = 1; y <= H; y++) for (let x = 1; x <= W; x++) {
        const c = { x, y, init: get(16), ffInit: get(1), srEn: get(1), srInv: get(1), srv: get(1), mux: [] };
        for (let k = 0; k < 5; k++) c.mux.push(get(MB));
        c.oeO = []; c.oeQ = [];
        for (let k = 0; k < 4 * T; k++) if (get(1)) c.oeO.push(k);
        for (let k = 0; k < 4 * T; k++) if (get(1)) c.oeQ.push(k);
        tiles.push(c);
    }
    // nets: wires joined by switches
    const parent = new Int32Array(arch.NW).map((_, i) => i);
    const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    let switches = 0;
    for (let x = 0; x <= W; x++) for (let y = 0; y <= H; y++) for (let t = 0; t < T; t++) for (let k = 0; k < 6; k++) {
        if (!get(1)) continue;
        const wa = arch.sbWire(x, y, PAIRS[k][0], t), wb = arch.sbWire(x, y, PAIRS[k][1], t);
        if (wa < 0 || wb < 0) throw new Error(`the switch box at (${x}, ${y}) joins a wire that does not exist`);
        parent[find(wa)] = find(wb);
        switches++;
    }
    const padCfg = pads.map(p => {
        if (p.dir === 'in') { const oe = []; for (let t = 0; t < T; t++) if (get(1)) oe.push(t); return oe; }
        return get(PB);
    });
    // who drives each net
    const driver = new Map();
    const drive = (w, d) => {
        const r = find(w), o = driver.get(r);
        if (o && (o.k !== d.k || o.i !== d.i)) throw new Error(`two outputs drive the same wire: the bitstream would short-circuit the chip (near ${arch.wireInfo(w).x}, ${arch.wireInfo(w).y})`);
        driver.set(r, d);
    };
    const active = [];
    tiles.forEach((c, i) => {
        const T4 = T;
        c.oeO.forEach(k => drive(arch.sideWire(c.x, c.y, Math.floor(k / T4), k % T4), { k: 'O', i }));
        c.oeQ.forEach(k => drive(arch.sideWire(c.x, c.y, Math.floor(k / T4), k % T4), { k: 'Q', i }));
        if (c.oeO.length || c.oeQ.length) active.push(i);
    });
    pads.forEach((p, k) => { if (p.dir === 'in') padCfg[k].forEach(t => drive(arch.padWire(p, t), { k: 'P', i: k })); });
    const lutOf = new Map(active.map((t, j) => [t, j]));
    const ffTiles = active.filter(t => tiles[t].oeQ.length);
    const ffOf = new Map(ffTiles.map((t, j) => [t, j]));
    let floating = 0;
    const srcOf = w => {
        const d = driver.get(find(w));
        if (!d) { floating++; return { k: 'const', v: 0 }; }
        if (d.k === 'O') return { k: 'lut', i: lutOf.get(d.i) };
        if (d.k === 'Q') return { k: 'ff', i: ffOf.get(d.i) };
        const p = pads[d.i];
        return { k: 'pin', pin: p.pin, idx: p.idx };
    };
    const muxSrc = (c, m) => (m ? srcOf(arch.sideWire(c.x, c.y, Math.floor((m - 1) / T), (m - 1) % T)) : { k: 'const', v: 0 });
    const luts = active.map(t => { const c = tiles[t]; return { init: c.init, ins: c.mux.slice(0, 4).map(m => muxSrc(c, m)), tile: t }; });
    const ffs = ffTiles.map(t => { const c = tiles[t]; return { d: lutOf.get(t), init: c.ffInit, sr: c.srEn ? muxSrc(c, c.mux[4]) : null, srInv: c.srInv, srv: c.srv, tile: t }; });
    const outs = [];
    pads.forEach((p, k) => { if (p.dir === 'out' && padCfg[k]) outs.push({ pin: p.pin, idx: p.idx, src: srcOf(arch.padWire(p, padCfg[k] - 1)) }); });
    return { arch, luts, ffs, outs, switches, floating, W, H, T };
}

/* ---------- the whole flow, one step at a time (a generator, so a page can show progress) */
function* implementGen(net, opts) {
    opts = opts || {};
    const arch = getArch(opts.arch);
    const t0 = Date.now();
    yield { phase: 'map', msg: 'Mapping the gates to 4-input LUTs' };
    const map = techMap(net);
    const cl = pack(map, arch);
    const usedPads = new Set();
    cl.nets.forEach(n => { if (n.src.pad !== undefined) usedPads.add(n.src.pad); n.sinks.forEach(s => { if (s.pad !== undefined) usedPads.add(s.pad); }); });
    yield { phase: 'pack', msg: `${map.luts.length} LUTs and ${map.ffs.length} flip-flops in ${cl.bles.length} logic elements, ${cl.nets.length} nets` };
    const pl = yield* placeGen(arch, cl, opts.seed || 1);
    yield { phase: 'placed', msg: `placed: wiring estimate ${Math.round(pl.cost)}` };
    const rt = yield* routeGen(arch, cl, pl.loc, opts);
    yield { phase: 'routed', msg: `routed in ${rt.iters} rounds, ${rt.wires} wire segments` };
    const tm = timing(arch, cl, pl.loc, rt);
    const bs = bitstream(arch, cl, pl.loc, rt);
    return { arch, map, cl, loc: pl.loc, place: pl, route: rt, timing: tm, bits: bs, pads: [...usedPads].sort((a, b) => a - b), ms: Date.now() - t0 };
}
function implement(net, opts) {
    const g = implementGen(net, opts);
    for (;;) { const r = g.next(); if (r.done) return r.value; if (opts && opts.onStep) opts.onStep(r.value); }
}

/* ---------- a board core that runs a bitstream: the same interface as a design compiled by
   sim.js (reset, driver, reader, step), so the board cannot tell the two apart */
function fabricCore(bytes, ports) {
    const nl = readBitstream(bytes), sim = lutSim(nl);
    const width = {};
    for (const p of ports) width[p.name] = p;
    let clk = 0, rose = false;
    const core = {
        nl,
        reset() { sim.reset(); clk = 0; rose = false; },
        driver(name) {
            if (name === 'clk') return lv => { const v = lv[0] === 3 || lv[0] === 7 ? 1 : 0; if (v && !clk) rose = true; clk = v; };
            // leaf i of a vector (from the left) is bit w - 1 - i
            const p = width[name], w = p ? p.width : 1, V = sim.V;
            const slots = Int32Array.from({ length: w }, (_, i) => sim.inSlot(name, p && p.vector ? w - 1 - i : null));
            return lv => {
                for (let i = 0; i < w; i++) if (slots[i] >= 0) V[slots[i]] = lv[i] === 3 || lv[i] === 7 ? 1 : 0;
                sim.touch();
            };
        },
        reader(name) {
            const p = width[name], w = p ? p.width : 1, V = sim.V, buf = new Array(w);
            const slots = Int32Array.from({ length: w }, (_, i) => sim.outSlot(name, p && p.vector ? w - 1 - i : null));
            return () => { for (let i = 0; i < w; i++) buf[i] = V[slots[i]] ? 3 : 2; return buf; };
        },
        step() { if (rose) { rose = false; sim.edge(); } else sim.settle(); },
        messages() { return []; }
    };
    return core;
}

G.VHDLFpga = { ARCH, DELAY, PIN_NAMES, PAIRS, techMap, lutSim, getArch, pack, placeGen, routeGen, timing, bitstream, readBitstream, implementGen, implement, fabricCore, crc32 };
})(typeof window !== 'undefined' ? window : globalThis);
