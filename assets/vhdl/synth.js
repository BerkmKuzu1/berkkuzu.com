/* synth.js - synthesis for the virtual FPGA. sim.js analyzes and elaborates the design and
   leaves its findings on the syntax tree; this file walks every process once more, with
   symbolic bits instead of values, and builds the design as an and-inverter graph (AIG) with
   flip-flops. An if or a case becomes multiplexers, a loop is unrolled, a function inlined. */
(function (G) {
'use strict';
const I = G.VHDL._int;
const { isArr, isInt, isEnum, isLogic, isNum, isTime, tlen, leafCount, VError, BOOLEAN, BIT, SIGNED, INTEGER } = I;
function fail(msg, at) { throw new VError(msg, at || 0); }
const NO = 'synthesis does not support ';
const LOGIC_OPS = new Set(['and', 'or', 'xor', 'nand', 'nor', 'xnor']);
const REL_OPS = new Set(['=', '/=', '<', '<=', '>', '>=']);
const SHIFT_OPS = new Set(['sll', 'srl', 'sla', 'sra', 'rol', 'ror']);
const SHAPE_ATTRS = new Set(['length', 'left', 'right', 'high', 'low', 'ascending']);
const SIG_ATTRS = new Set(['event', 'last_value', 'stable', 'active', 'last_event', 'quiet', 'transaction', 'delayed']);
const rlen = r => { const n = r.dir === 'downto' ? r.l - r.r + 1 : r.r - r.l + 1; return n < 0 ? 0 : n; };
const vRange = v => ({ l: v.l, dir: v.dir, r: v.dir === 'downto' ? v.l - v.v.length + 1 : v.l + v.v.length - 1 });
const ones = n => new Array(n).fill(1);
const zeros = n => new Array(n).fill(0);
const isPow2 = v => v > 0 && Number.isInteger(Math.log2(v));

/* ---------- the and-inverter graph. A literal is 2 * node + inverted; 0 is false, 1 is true.
   Nodes are only ever added after their inputs, so the node order is a topological order. */
class AIG {
    constructor() { this.nodes = [{ k: 'c' }]; this.hash = new Map(); }
    input(info) { this.nodes.push(Object.assign({ k: 'i' }, info)); return 2 * (this.nodes.length - 1); }
    and(a, b) {
        if (a === 0 || b === 0 || a === (b ^ 1)) return 0;
        if (a === 1) return b;
        if (b === 1 || a === b) return a;
        if (a > b) { const t = a; a = b; b = t; }
        // one level of simplification: a & (a & x) = a & x, a & (!a & x) = 0, a & !(!a & x) = a, a & !(a & x) = a & !x
        for (const [p, q] of [[a, b], [b, a]]) {
            const nq = this.nodes[q >> 1];
            if (nq.k !== 'a') continue;
            if (!(q & 1)) {
                if (nq.a === p || nq.b === p) return q;
                if (nq.a === (p ^ 1) || nq.b === (p ^ 1)) return 0;
            } else {
                if (nq.a === (p ^ 1) || nq.b === (p ^ 1)) return p;
                if (nq.a === p) return this.and(p, nq.b ^ 1);
                if (nq.b === p) return this.and(p, nq.a ^ 1);
            }
        }
        const key = a * 67108864 + b;
        let r = this.hash.get(key);
        if (r === undefined) {
            if (this.nodes.length > 4000000) fail('this design is too large to build here', 0);
            r = 2 * this.nodes.length;
            this.nodes.push({ k: 'a', a, b });
            this.hash.set(key, r);
        }
        return r;
    }
    or(a, b) { return this.and(a ^ 1, b ^ 1) ^ 1; }
    xor(a, b) {
        if (a < 2) return a ? b ^ 1 : b;
        if (b < 2) return b ? a ^ 1 : a;
        if (a === b) return 0;
        if (a === (b ^ 1)) return 1;
        return this.or(this.and(a, b ^ 1), this.and(a ^ 1, b));
    }
    mux(s, t, e) {
        if (s === 1 || t === e) return t;
        if (s === 0) return e;
        if (t === 1 || t === s) return this.or(s, e);
        if (t === 0 || t === (s ^ 1)) return this.and(s ^ 1, e);
        if (e === 0 || e === s) return this.and(s, t);
        if (e === 1 || e === (s ^ 1)) return this.or(s ^ 1, t);
        return this.or(this.and(s, t), this.and(s ^ 1, e));
    }
}

/* ---------- how values become bits. An array: its elements from left to right. An integer or
   an enumeration: binary, least significant bit first; two's complement when it can be negative. */
const bitlen = x => { let n = 0; while (x >= 1) { n++; x = Math.floor(x / 2); } return n; };
const intWidth = (lo, hi) => (lo < 0 ? 1 + Math.max(bitlen(-lo - 1), bitlen(Math.max(hi, 0))) : Math.max(1, bitlen(hi)));
const isBitT = t => isLogic(t) || (isEnum(t) && (t.base === BIT || t.base === BOOLEAN));
const isMetaL = v => !(v === 2 || v === 3 || v === 6 || v === 7);       // a std_logic other than 0, 1, L and H
function width(t, at) {
    if (isArr(t)) { const n = tlen(t); if (n === null) fail(NO + `a ${t.name} without a size here`, at); return n * width(t.elem, at); }
    if (isInt(t)) return intWidth(t.lo, t.hi);
    if (isBitT(t)) return 1;
    if (isEnum(t)) return Math.max(1, bitlen(t.lits.length - 1));
    if (isTime(t)) fail(NO + 'time values: delays and waits belong in testbenches', at);
    fail(NO + `values of type ${t.name}`, at);
}
const ibit = (v, i) => (v >= 0 ? (i > 53 ? 0 : Math.floor(v / 2 ** i) % 2) : 1 - ibit(-v - 1, i));
// a constant (a value as sim.js holds it) as bits; 'U', 'X', 'Z', 'W' and '-' become 0
function enc(t, v, out) {
    if (isArr(t)) { for (const e of v.v) enc(t.elem, e, out); return out; }
    if (isInt(t)) { const w = intWidth(Math.min(t.lo, v), Math.max(t.hi, v)); for (let i = 0; i < w; i++) out.push(ibit(v, i)); return out; }
    if (isLogic(t)) { out.push(v === 3 || v === 7 ? 1 : 0); return out; }
    if (isBitT(t)) { out.push(v ? 1 : 0); return out; }
    if (isEnum(t)) { const w = width(t, 0); for (let i = 0; i < w; i++) out.push(ibit(v, i)); return out; }
    width(t, 0);
    return out;
}
// constant bits back to a value: [value, next offset]
function dec(t, b, off) {
    if (isArr(t)) {
        const n = tlen(t), v = new Array(n);
        let o = off;
        for (let i = 0; i < n; i++) { const r = dec(t.elem, b, o); v[i] = r[0]; o = r[1]; }
        return [{ l: t.rng.l, dir: t.rng.dir, v }, o];
    }
    if (isLogic(t)) return [b[off] ? 3 : 2, off + 1];
    if (isBitT(t)) return [b[off], off + 1];
    const w = width(t, 0);
    let x = 0;
    for (let i = w - 1; i >= 0; i--) x = x * 2 + b[off + i];
    if (isInt(t) && t.lo < 0 && b[off + w - 1]) x -= 2 ** w;
    return [x, off + w];
}
const sameVal = (a, b) => (typeof a === 'object' && typeof b === 'object' ? a.v.length === b.v.length && a.v.every((e, i) => sameVal(e, b.v[i])) : a === b);

/* values: { c: true, v, t } is a constant (v as sim.js holds it); { b: [literals], t } is built
   from bits. Integers built from bits also carry their range: lo and hi. */
const K = (v, t) => ({ c: true, v, t });

class Synth {
    constructor(D, opts) {
        this.D = D;
        this.opts = opts || {};
        this.g = new AIG();
        this.ph = new Map();          // signal (or variable register) -> one placeholder literal per bit
        this.drv = new Map();         // signal -> per bit: { kind: 'comb', lit } or { kind: 'ff', d, ar, arv, init }
        this.clock = null;
        this.clockAt = 0;
        this.warned = new Set();
    }
    warnOnce(msg, at) { if (!this.warned.has(msg)) { this.warned.add(msg); this.D.warn(msg, at); } }

    /* ---------- signals: until finish() connects them, every bit of a signal is a placeholder */
    layout(sig) {
        if (!sig._lb) {
            // the first bit of every leaf (scalar element) of the signal
            const lb = [0];
            const walk = t => { if (isArr(t)) { const n = tlen(t); for (let i = 0; i < n; i++) walk(t.elem); } else lb.push(lb[lb.length - 1] + width(t, sig.at)); };
            walk(sig.t);
            sig._lb = lb;
        }
        return sig._lb;
    }
    sigBits(sig) {
        let p = this.ph.get(sig);
        if (!p) {
            const n = this.layout(sig)[sig.n];
            p = new Array(n);
            for (let i = 0; i < n; i++) p[i] = this.g.input({ net: sig, bit: i });
            this.ph.set(sig, p);
        }
        return p;
    }
    initBits(sig) { return enc(sig.t, I.unflat(sig.t, sig.init, 0), []); }
    // the name of one bit: v(7) of a vector, m(3)(1) of an array of vectors, n[0] for bit 0 of an integer
    bitName(sig, i) {
        const walk = (t, k) => {
            if (isArr(t) && t.rng) {
                const ew = width(t.elem, sig.at), e = Math.floor(k / ew);
                return `(${t.rng.dir === 'downto' ? t.rng.l - e : t.rng.l + e})${walk(t.elem, k - e * ew)}`;
            }
            return isBitT(t) || width(t, sig.at) === 1 ? '' : `[${k}]`;
        };
        return sig.name + walk(sig.t, i);
    }
    drive(sig, i, d, at) {
        let a = this.drv.get(sig);
        if (!a) { a = []; this.drv.set(sig, a); }
        if (a[i]) fail(`'${this.bitName(sig, i)}' is driven by two processes; in hardware a wire has one driver`, at);
        d.at = at;
        a[i] = d;
    }
    useClock(sig, rising, at) {
        if (!rising) fail(NO + "falling clock edges: this FPGA's flip-flops take the rising edge", at);
        if (this.clock && this.clock !== sig) fail(`the design uses two clocks, '${this.clock.name}' and '${sig.name}', but this FPGA has one clock network: use one clock, and enables`, at);
        if (!this.clock) { this.clock = sig; this.clockAt = at; }
    }

    /* ---------- processes */
    newCx(sc, mode) { return { sc, mode, fr: [], fdef: [], drv: new Map(), g: 1, kills: [], fn: null, depth: 0 }; }
    // the variables and computed constants of a process: their slots, types and first values
    locals(decls, sc, frame) {
        const out = [];
        for (const d of decls) {
            if (d.k !== 'variable' && d.k !== 'constant') continue;
            for (const nm of d.names) {
                const o = sc.find(nm);
                if (!o || o.slot === undefined || (o.cls !== 'var' && o.cls !== 'param')) continue;
                const init = frame[o.slot];
                out.push({ slot: o.slot, cls: o.cls, name: nm, at: d.at, t: this.fixT(o.t, init), init });
            }
        }
        return out;
    }
    fixT(t, v) { return isArr(t) && !t.rng && v && typeof v === 'object' ? I.constrain(t, vRange(v)) : t; }
    process(st, ps, P, path, waits) {
        const shape = this.shape(st, ps, waits);
        if (shape.kind === 'none') return;
        const clk = shape.kind === 'clk';
        if (clk) this.useClock(shape.clk, shape.rising, st.at);
        const cx = this.newCx(ps, clk ? 'clk' : 'comb');
        const label = st.label ? `${path}${st.label}.` : path;
        const vars = this.locals(st.decls, ps, P.frame);
        for (const v of vars) {
            const w = width(v.t, v.at);
            if (v.cls === 'var' && clk) {
                // a variable of a clocked process keeps its value until the next clock edge: a register.
                // When every path assigns it before reading it, nothing reads the register and it is removed.
                v.reg = { name: label + v.name, t: v.t, at: v.at, n: leafCount(v.t), init: I.flat(v.init, []), isVar: true };
                cx.fr[v.slot] = this.asVal(this.sigBits(v.reg), v.t);
                cx.fdef[v.slot] = ones(w);
            } else {
                cx.fr[v.slot] = K(v.init, v.t);
                cx.fdef[v.slot] = v.cls === 'var' ? zeros(w) : ones(w);
            }
        }
        if (!clk) {
            this.seq(st.body, cx);
            for (const [sig, s] of cx.drv) {
                s.asg.forEach((a, i) => {
                    if (a === 0) return;
                    if (a !== 1) fail(`'${this.bitName(sig, i)}' is not assigned on every path through this process, so it would keep its old value: that is a latch, and this FPGA builds logic without latches. Give it a value at the top of the process, or in every branch.`, st.at);
                    this.drive(sig, i, { kind: 'comb', lit: s.next[i] }, st.at);
                });
            }
            return;
        }
        // an asynchronous reset: the bits it sets get a reset input, the others keep their value while it is active
        let rst = null;
        if (shape.arst) {
            const rc = this.newCx(ps, 'clk');
            rc.fr = cx.fr.slice();
            rc.fdef = cx.fdef.slice();
            const cond = this.toBool(this.ev(shape.arst.cond, rc), shape.arst.cond.at);
            this.seq(shape.arst.body, rc);
            if (rc.fr.some((v, i) => v !== cx.fr[i])) fail(NO + 'assigning variables in the reset branch', st.at);
            rst = { cond, drv: rc.drv };
        }
        if (shape.en) this.ifChain([{ cond: shape.en, run: () => this.seq(shape.body, cx) }], cx);
        else this.seq(shape.body, cx);
        const sigs = new Set([...cx.drv.keys(), ...(rst ? rst.drv.keys() : [])]);
        for (const sig of sigs) {
            const q = this.sigBits(sig), s = cx.drv.get(sig), r = rst && rst.drv.get(sig), init = this.initBits(sig);
            for (let i = 0; i < q.length; i++) {
                const assigned = s && s.asg[i] !== 0, reset = r && r.asg[i] !== 0;
                if (!assigned && !reset) continue;
                let d = assigned ? s.next[i] : q[i], ar = null, arv = 0;
                if (reset) {
                    if (r.asg[i] !== 1) fail(`'${this.bitName(sig, i)}' is reset on some paths of the reset branch only`, st.at);
                    if (r.next[i] > 1) fail(`the reset value of '${this.bitName(sig, i)}' must be a constant`, st.at);
                    ar = rst.cond;
                    arv = r.next[i];
                } else if (rst) d = this.g.mux(rst.cond, q[i], d);
                this.drive(sig, i, { kind: 'ff', d, ar, arv, init: init[i], name: this.bitName(sig, i) }, st.at);
            }
        }
        for (const v of vars) {
            if (!v.reg) continue;
            const q = this.sigBits(v.reg), fin = this.fitBits(cx.fr[v.slot], v.t, st.at), init = this.initBits(v.reg);
            for (let i = 0; i < q.length; i++) {
                if (fin[i] === q[i]) continue;          // never changes: it keeps its first value
                const d = rst ? this.g.mux(rst.cond, q[i], fin[i]) : fin[i];
                this.drive(v.reg, i, { kind: 'ff', d, ar: null, arv: 0, init: init[i], name: this.bitName(v.reg, i), isVar: true }, st.at);
            }
        }
    }
    // an expression on an input port of an instance
    portExpr(sig, t, node, sc) {
        const b = this.fitBits(this.ev(node, this.newCx(sc, 'comb')), t, node.at);
        b.forEach((l, i) => this.drive(sig, i, { kind: 'comb', lit: l }, node.at));
    }

    /* ---------- the kind of a process: combinational, or clocked in one of the usual forms */
    shape(st, sc, waits) {
        const body = st.body;
        if (waits) {
            const w = body[0];
            const e = w && w.k === 'wait' && w.until && !w.on && !w.forT && !this.D.hasWait(body.slice(1)) ? this.edgeOf(w.until, sc, true) : null;
            if (!e) fail(NO + "this process: wait statements belong in testbenches. A clocked process starts with 'wait until rising_edge(clk);' or is written process(clk)", st.at);
            return { kind: 'clk', clk: e.sig, rising: e.rising, body: body.slice(1), en: e.en };
        }
        if (!this.hasAssign(body)) return { kind: 'none' };
        if (body.length === 1 && body[0].k === 'if' && !body[0].els) {
            const br = body[0].branches;
            const e0 = this.edgeOf(br[0].cond, sc);
            if (e0 && br.length === 1) return { kind: 'clk', clk: e0.sig, rising: e0.rising, body: br[0].body, en: e0.en };
            if (!e0 && br.length === 2 && !this.hasEdge(br[0].cond)) {
                const e1 = this.edgeOf(br[1].cond, sc);
                if (e1) return { kind: 'clk', clk: e1.sig, rising: e1.rising, body: br[1].body, en: e1.en, arst: { cond: br[0].cond, body: br[0].body } };
            }
        }
        if (this.hasEdgeIn(body)) fail(NO + 'this clocked process. Write it as "if rising_edge(clk) then ... end if;", with an asynchronous reset as "if reset = \'1\' then ... elsif rising_edge(clk) then ... end if;", with nothing else in the process', st.at);
        return { kind: 'comb' };
    }
    hasAssign(list) {
        for (const s of list) {
            if (s.k === 'sasgn' || s.k === 'ssel') return true;
            if (s.k === 'if' && (s.branches.some(b => this.hasAssign(b.body)) || (s.els && this.hasAssign(s.els)))) return true;
            if (s.k === 'case' && s.alts.some(a => this.hasAssign(a.body))) return true;
            if ((s.k === 'for' || s.k === 'while' || s.k === 'loop') && this.hasAssign(s.body)) return true;
        }
        return false;
    }
    // rising_edge(clk), falling_edge(clk), clk'event and clk = '1' (after wait until also clk = '1'), possibly "and" a condition
    edgeOf(n, sc, inWait) {
        if (!n) return null;
        if (n.k === 'paren') return this.edgeOf(n.e, sc, inWait);
        const sigOf = x => { try { const r = this.D.resolve(x, sc); return r.cls === 'sig' && r.off !== undefined && !isArr(r.t) ? r.sig : null; } catch (e) { return null; } };
        if (n.k === 'call' && n.pfx.k === 'name' && (n.pfx.id === 'rising_edge' || n.pfx.id === 'falling_edge') && n.args.length === 1) {
            const s = sigOf(n.args[0].val);
            return s ? { sig: s, rising: n.pfx.id === 'rising_edge', en: null } : null;
        }
        const level = x => (x.k === 'bin' && x.op === '=' && (x.r.k === 'char' || x.l.k === 'char') ? { s: sigOf(x.r.k === 'char' ? x.l : x.r), v: (x.r.k === 'char' ? x.r : x.l).v } : null);
        if (inWait) { const lv = level(n); if (lv && lv.s && (lv.v === '1' || lv.v === '0')) return { sig: lv.s, rising: lv.v === '1', en: null }; }
        if (n.k === 'bin' && n.op === 'and') {
            for (const [a, b] of [[n.l, n.r], [n.r, n.l]]) {
                if (a.k === 'attr' && a.attr === 'event') {
                    const lv = level(b), s = sigOf(a.pfx);
                    if (s && lv && lv.s === s) return { sig: s, rising: lv.v === '1', en: null };
                }
                const e = this.edgeOf(a, sc, false);
                if (e && !this.hasEdge(b)) return { sig: e.sig, rising: e.rising, en: e.en ? { k: 'bin', op: 'and', l: e.en, r: b, at: n.at, _x: { t: BOOLEAN, st: false } } : b };
            }
        }
        return null;
    }
    hasEdge(n) {
        if (!n || typeof n !== 'object') return false;
        if (n.k === 'call' && n.pfx && n.pfx.k === 'name' && (n.pfx.id === 'rising_edge' || n.pfx.id === 'falling_edge')) return true;
        if (n.k === 'attr' && n.attr === 'event') return true;
        for (const k of ['l', 'r', 'e', 'pfx']) if (n[k] && this.hasEdge(n[k])) return true;
        if (n.args) for (const a of n.args) if (this.hasEdge(a.val)) return true;
        return false;
    }
    hasEdgeIn(list) {
        for (const s of list) {
            if (s.k === 'if' && (s.branches.some(b => this.hasEdge(b.cond) || this.hasEdgeIn(b.body)) || (s.els && this.hasEdgeIn(s.els)))) return true;
            if (s.k === 'case' && s.alts.some(a => this.hasEdgeIn(a.body))) return true;
            if ((s.k === 'for' || s.k === 'while' || s.k === 'loop') && this.hasEdgeIn(s.body)) return true;
            if ((s.k === 'sasgn' || s.k === 'vasgn') && (this.hasEdge(s.val) || (s.alts && s.alts.some(a => this.hasEdge(a.cond))))) return true;
        }
        return false;
    }

    /* ---------- statements. Each branch of an if or a case runs on its own copy of the state
       (variables, and the next values of the signals), and the copies are merged with
       multiplexers. Exit, next and return turn later writes off through "kill" conditions. */
    snap(cx) { return { fr: cx.fr.slice(), fdef: cx.fdef.slice(), drv: new Map(cx.drv) }; }
    restore(cx, s) { cx.fr = s.fr.slice(); cx.fdef = s.fdef.slice(); cx.drv = new Map(s.drv); }
    alive(cx) { let a = 1; for (const k of cx.kills) a = this.g.and(a, k.v ^ 1); return a; }
    gEff(cx) { return this.g.and(cx.g, this.alive(cx)); }
    sigInit(sig, mode) {
        const q = this.sigBits(sig);
        // a clocked process keeps the old value where it assigns nothing
        return { next: mode === 'clk' ? q.slice() : zeros(q.length), asg: zeros(q.length) };
    }
    seq(list, cx) { for (const s of list) this.stmt(s, cx); }
    stmt(s, cx) {
        const at = s.at, g = this.g;
        switch (s.k) {
            case 'sasgn': {
                if ((s.val && s.val.k === 'wave') || (s.alts && s.alts.some(a => a.val.k === 'wave'))) this.warnOnce("synthesis ignores 'after': delays exist only in simulation", at);
                if (!s.alts) { if (s.val.k !== 'unaffected') this.assign(s.target, s.val, cx, at, true); return; }
                this.ifChain(s.alts.map(al => ({ cond: al.cond, run: al.val.k === 'unaffected' ? null : () => this.assign(s.target, al.val, cx, at, true) })), cx);
                return;
            }
            case 'ssel': {
                const sel = this.ev(s.sel, cx);
                this.caseRun(sel, s.alts, s.matching, cx, at, al => { if (al.val.k !== 'unaffected') this.assign(s.target, al.val, cx, at, true); });
                return;
            }
            case 'vasgn': this.assign(s.target, s.val, cx, at, false); return;
            case 'if': {
                const list = s.branches.map(b => ({ cond: b.cond, run: () => this.seq(b.body, cx) }));
                if (s.els) list.push({ cond: null, run: () => this.seq(s.els, cx) });
                this.ifChain(list, cx);
                return;
            }
            case 'case': this.caseRun(this.ev(s.expr, cx), s.alts, s.matching, cx, at, al => this.seq(al.body, cx)); return;
            case 'for': {
                if (!s._ls) fail('internal: this loop was not analyzed', at);
                const r = this.loopRange(s, cx, at), slot = s._slot;
                const T = s._rg.t && (isInt(s._rg.t) || isEnum(s._rg.t)) ? s._rg.t : INTEGER;
                const L = { label: s.label, v: 0, loop: true }, N = { v: 0 };
                L.next = N;
                cx.kills.push(L, N);
                const sc0 = cx.sc;
                cx.sc = s._ls;
                const step = r.dir === 'to' ? 1 : -1;
                let n = 0;
                for (let i = r.l; step > 0 ? i <= r.r : i >= r.r; i += step) {
                    if (++n > 4096) fail(NO + 'loops with more than 4096 rounds', at);
                    N.v = 0;
                    cx.fr[slot] = K(i, T);
                    this.seq(s.body, cx);
                    if (g.and(cx.g, L.v ^ 1) === 0) break;       // left for certain
                }
                cx.sc = sc0;
                cx.kills.splice(cx.kills.indexOf(L), 2);
                return;
            }
            case 'while': case 'loop': {
                const L = { label: s.label, v: 0, loop: true }, N = { v: 0 };
                L.next = N;
                cx.kills.push(L, N);
                for (let n = 0; ; n++) {
                    if (n >= 1024) fail(NO + 'this loop: the hardware is built once, so the number of rounds must be known then (at most 1024)', at);
                    N.v = 0;
                    if (s.k === 'while') {
                        const c = this.toBool(this.ev(s.cond, cx), s.cond.at);
                        L.v = g.or(L.v, g.and(this.gEff(cx), c ^ 1));
                    }
                    if (this.gEff(cx) === 0) break;
                    this.seq(s.body, cx);
                }
                cx.kills.splice(cx.kills.indexOf(L), 2);
                return;
            }
            case 'exit': case 'next': {
                const c = s.cond ? this.toBool(this.ev(s.cond, cx), s.cond.at) : 1;
                const loops = cx.kills.filter(k => k.loop);
                const L = s.label ? loops.filter(k => k.label === s.label).pop() : loops[loops.length - 1];
                if (!L) fail(`'${s.k}' outside a loop`, at);
                const k = g.and(this.gEff(cx), c);
                if (s.k === 'exit') L.v = g.or(L.v, k); else L.next.v = g.or(L.next.v, k);
                return;
            }
            case 'return': {
                const F = cx.fn;
                if (!F) fail("'return' outside a function", at);
                let v = this.ev(s.val, cx);
                if (isArr(F.ret) && F.ret.rng) v = this.retype(v, F.ret);
                const ge = this.gEff(cx);
                if (ge === 0) return;
                F.val = F.val ? this.muxVal(ge, v, F.val, at) : v;
                F.kill.v = g.or(F.kill.v, ge);
                return;
            }
            case 'null': case 'assert': case 'report': return;
            case 'wait': fail(NO + 'wait statements here', at);
            case 'pcall': fail(NO + 'procedure calls', at);
        }
        fail(NO + `the statement '${s.k}'`, at);
    }
    loopRange(s, cx, at) {
        const rg = s._rg;
        if (rg.st) return rg.sv;
        if (s.range.k === 'range') {
            const l = this.ev(s.range.l, cx), r = this.ev(s.range.r, cx);
            if (!l.c || !r.c) fail(NO + 'a loop whose bounds are not constants: the hardware is built once, for a fixed number of rounds', at);
            return { l: l.v, dir: s.range.dir, r: r.v };
        }
        try { return rg.f(this.shapeE(cx)); } catch (e) { if (e instanceof VError) throw e; fail(NO + 'this loop range', at); }
    }
    // if c1 then ... elsif c2 then ... else ...: list of { cond (null for else), run }
    ifChain(list, cx) {
        const g = this.g, g0 = cx.g, base = this.snap(cx), arms = [];
        let taken = 0, complete = false;
        for (const it of list) {
            this.restore(cx, base);
            const c = it.cond ? this.toBool(this.ev(it.cond, cx), it.cond.at) : 1;
            const reach = g.and(g0, g.and(taken ^ 1, c));
            if (reach !== 0) {
                cx.g = reach;
                if (it.run) it.run();
                cx.g = g0;
                arms.push({ c, st: this.snap(cx) });
            }
            taken = g.or(taken, c);
            if (taken === 1) { complete = true; break; }
        }
        // when some branch is always taken, the last one is what remains when the others are not
        const rest = complete && arms.length ? arms.pop().st : base;
        this.restore(cx, this.merge(arms, rest, cx.mode));
    }
    caseRun(sel, alts, matching, cx, at, run) {
        const g = this.g, g0 = cx.g, base = this.snap(cx), arms = [];
        const conds = this.caseConds(sel, alts, matching, cx, at);
        alts.forEach((al, k) => {
            const reach = g.and(g0, conds[k]);
            if (reach === 0) return;
            this.restore(cx, base);
            cx.g = reach;
            run(al, k);
            cx.g = g0;
            arms.push({ c: conds[k], st: this.snap(cx) });
        });
        // a case covers every value, so the last alternative is what remains when the others do not match
        const rest = arms.length ? arms.pop().st : base;
        this.restore(cx, this.merge(arms, rest, cx.mode));
    }
    merge(arms, rest, mode) {
        if (!arms.length) return rest;
        const g = this.g, out = { fr: rest.fr.slice(), fdef: rest.fdef.slice(), drv: new Map(rest.drv) };
        let n = rest.fr.length;
        for (const a of arms) n = Math.max(n, a.st.fr.length);
        for (let s = 0; s < n; s++) {
            const r0 = rest.fr[s];
            if (arms.every(a => a.st.fr[s] === r0)) continue;
            let v = r0, d = rest.fdef[s];
            for (let k = arms.length - 1; k >= 0; k--) {
                v = this.muxAny(arms[k].c, arms[k].st.fr[s], v);
                d = this.muxBits(arms[k].c, arms[k].st.fdef[s], d);
            }
            out.fr[s] = v;
            out.fdef[s] = d;
        }
        const sigs = new Set(rest.drv.keys());
        for (const a of arms) for (const k of a.st.drv.keys()) sigs.add(k);
        for (const sig of sigs) {
            const r0 = rest.drv.get(sig);
            if (arms.every(a => a.st.drv.get(sig) === r0)) continue;
            let e = r0 || this.sigInit(sig, mode);
            for (let k = arms.length - 1; k >= 0; k--) {
                const a = arms[k].st.drv.get(sig) || this.sigInit(sig, mode), c = arms[k].c;
                if (a === e) continue;
                const en = e;
                e = { next: a.next.map((l, i) => g.mux(c, l, en.next[i])), asg: a.asg.map((l, i) => g.mux(c, l, en.asg[i])) };
            }
            out.drv.set(sig, e);
        }
        return out;
    }
    // the condition of each alternative of a case
    caseConds(sel, alts, matching, cx, at) {
        const g = this.g, conds = [];
        let any = 0;
        for (const al of alts) {
            let c = 0, others = false;
            for (const ch of al.choices) {
                if (ch.k === 'others') { others = true; continue; }
                if (ch.k === 'range') {
                    const r = this.D.staticRange(ch, cx.sc), si = this.asInt(sel, at);
                    c = g.or(c, g.and(this.cmpInt(si, K(Math.min(r.l, r.r), INTEGER), '>='), this.cmpInt(si, K(Math.max(r.l, r.r), INTEGER), '<=')));
                    continue;
                }
                const x = ch._x;
                if (!x || !x.st) fail('a choice must be a constant', ch.at);
                c = g.or(c, this.matchConst(sel, K(x.sv, x.t), matching, at));
            }
            if (others) c = g.or(c, any ^ 1);
            else if (matching) c = g.and(c, any ^ 1);
            conds.push(c);
            any = g.or(any, c);
        }
        return conds;
    }
    // does the value v equal the constant k? With matching (case?, std_match) a '-' in k matches anything
    matchConst(v, k, matching, at) {
        const g = this.g, t = v.t;
        if (isInt(t)) return this.cmpInt(v, isInt(k.t) ? k : this.asInt(k, at), '=');
        const elems = isArr(k.t) ? k.v.v : [k.v], et = isArr(k.t) ? k.t.elem : k.t;
        const vb = this.bits(v, t), ew = width(et, at);
        if (elems.length * ew !== vb.length) return 0;
        let r = 1;
        for (let i = 0; i < elems.length && r !== 0; i++) {
            const e = elems[i];
            if (isLogic(et)) {
                if (e === 8 && matching) continue;
                if (isMetaL(e)) return 0;
            }
            const eb = enc(et, e, []);
            for (let j = 0; j < ew; j++) r = g.and(r, eb[j] ? vb[i * ew + j] : vb[i * ew + j] ^ 1);
        }
        return r;
    }

    /* ---------- assignments and names */
    assign(target, node, cx, at, isSig) {
        const ref = this.ref(target, cx);
        if (ref.kind !== (isSig ? 'sig' : 'slot')) fail(`internal: '${target.raw || 'this'}' cannot be assigned here`, at);
        this.write(ref, this.ev(node, cx), cx, 1, at);
    }
    write(ref, v, cx, cond, at) {
        const g = this.g, ge = g.and(this.alive(cx), cond);
        if (ge === 0) return;
        if (ref.dyn) { for (const e of ref.dyn) this.write(e.ref, v, cx, g.and(cond, e.cond), at); return; }
        const nb = this.fitBits(v, ref.t, at);
        if (ref.kind === 'sig') {
            const s = cx.drv.get(ref.sig) || this.sigInit(ref.sig, cx.mode);
            const next = s.next.slice(), asg = s.asg.slice();
            for (let i = 0; i < nb.length; i++) { const k = ref.off + i; next[k] = g.mux(ge, nb[i], next[k]); asg[k] = g.or(asg[k], ge); }
            cx.drv.set(ref.sig, { next, asg });
            return;
        }
        const slot = ref.slot, T = ref.vt;
        const ob = this.fitBits(cx.fr[slot], T, at).slice();
        for (let i = 0; i < nb.length; i++) ob[ref.off + i] = g.mux(ge, nb[i], ob[ref.off + i]);
        cx.fr[slot] = this.asVal(ob, T);
        const d = (cx.fdef[slot] || zeros(ob.length)).slice();
        for (let i = 0; i < nb.length; i++) d[ref.off + i] = g.or(d[ref.off + i], ge);
        cx.fdef[slot] = d;
    }
    // what a name refers to: { kind: 'sig', sig, off, t } (off in bits), { kind: 'slot', slot, off, t, vt },
    // or { kind: 'val', v }; with an index known only in hardware, { kind, dyn: [{ cond, ref }], t }
    ref(n, cx) {
        switch (n.k) {
            case 'paren': return this.ref(n.e, cx);
            case 'name': case 'sel': return this.refOf(this.D.resolve(n, cx.sc), n, cx);
            case 'call': {
                const b = this.basePfx(n), r = this.D.resolve(b, cx.sc);
                if ((r.cls === 'func' || r.cls === 'type') && n.pfx === b) return { kind: 'val', v: this.evCall(n, cx) };
                return this.subRef(this.ref(n.pfx, cx), n.args, cx, n.at);
            }
        }
        return { kind: 'val', v: this.ev(n, cx) };
    }
    basePfx(n) { while (n.k === 'call') n = n.pfx; return n; }
    refOf(r, n, cx) {
        switch (r.cls) {
            case 'sig':
                if (r.off === undefined) fail(NO + 'this signal name', n.at);
                return { kind: 'sig', sig: r.sig, off: this.layout(r.sig)[r.off], t: r.t };
            case 'var': case 'param': case 'loopvar': {
                const cur = cx.fr[r.slot];
                if (cur === undefined) fail(`internal: '${n.raw}' has no value here`, n.at);
                let t = r.t;
                if (isArr(t) && !t.rng) t = cur.c ? this.fixT(t, cur.v) : cur.t;
                return { kind: 'slot', slot: r.slot, off: 0, t, vt: t, cls: r.cls, name: n.raw };
            }
            case 'const': return { kind: 'val', v: K(r.v, r.t) };
            case 'enumlit': return { kind: 'val', v: this.enumVal(n, r) };
            case 'func': return { kind: 'val', v: this.evCall(n, cx) };
        }
        fail(NO + `'${n.raw}' here`, n.at);
    }
    enumVal(n, r) {
        if (n._x && n._x.st) return K(n._x.sv, n._x.t);
        if (r.list.length === 1) return K(r.list[0].pos, r.list[0].t);
        fail(`the type of '${n.raw}' is not clear here`, n.at);
    }
    arrT(base, at) {
        const t = base.kind === 'val' ? base.v.t : base.t;
        if (!isArr(t)) fail('this is not an array and cannot be indexed', at);
        if (t.rng) return t;
        if (base.kind === 'val' && base.v.c) return this.fixT(t, base.v.v);
        fail(NO + 'an array whose size is not known here', at);
    }
    rangeVal(rs, cx, at) {
        if (rs.k === 'range') {
            const l = this.ev(rs.l, cx), r = this.ev(rs.r, cx);
            if (!l.c || !r.c) fail(NO + 'slices whose bounds are not constants', at);
            return { l: l.v, dir: rs.dir, r: r.v };
        }
        const q = this.D.rangeOf(rs, cx.sc);
        if (q.st) return q.sv;
        try { return q.f(this.shapeE(cx)); } catch (e) { if (e instanceof VError) throw e; fail(NO + 'this slice', at); }
    }
    // an element or a slice of what base refers to
    subRef(base, args, cx, at) {
        if (args.length !== 1) fail(NO + 'this index', at);
        const a = args[0].val, T = this.arrT(base, at), r = T.rng, ew = width(T.elem, at), n = tlen(T);
        const pos = i => (r.dir === 'downto' ? r.l - i : i - r.l);
        const rs = this.D.sliceRange(a, cx.sc);
        if (rs) {
            const sr = this.rangeVal(rs, cx, at), len = rlen(sr), st = I.constrain(T, sr);
            if (len === 0) return this.part(base, 0, 0, st);
            if (sr.dir !== r.dir) fail(`the slice ${sr.l} ${sr.dir} ${sr.r} must go in the direction of ${r.l} ${r.dir} ${r.r}`, at);
            const p0 = pos(sr.l), p1 = pos(sr.r);
            if (p0 < 0 || p1 >= n) fail(`the slice ${sr.l} ${sr.dir} ${sr.r} goes outside ${r.l} ${r.dir} ${r.r}`, at);
            return this.part(base, p0 * ew, len * ew, st);
        }
        const ix = this.ev(a, cx);
        if (ix.c) {
            const p = pos(ix.v);
            if (p < 0 || p >= n) fail(`index ${ix.v} is outside ${r.l} ${r.dir} ${r.r}`, at);
            return this.part(base, p * ew, ew, T.elem);
        }
        // an index known only in hardware: every element, with the condition that picks it
        const xi = this.asInt(ix, at), dyn = [];
        for (let p = 0; p < n; p++) {
            const cond = this.cmpInt(xi, K(r.dir === 'downto' ? r.l - p : r.l + p, INTEGER), '=');
            if (cond !== 0) dyn.push({ cond, ref: this.part(base, p * ew, ew, T.elem) });
        }
        if (base.kind === 'val') return { kind: 'val', v: this.muxList(dyn.map(e => ({ c: e.cond, v: e.ref.v })), T.elem, at) };
        return { kind: base.kind, dyn, t: T.elem };
    }
    part(base, off, w, t) {
        if (base.dyn) return { kind: base.kind, dyn: base.dyn.map(e => ({ cond: e.cond, ref: this.part(e.ref, off, w, t) })), t };
        if (base.kind === 'val') return { kind: 'val', v: this.asVal(this.bits(base.v, base.v.t).slice(off, off + w), t) };
        return Object.assign({}, base, { off: base.off + off, t });
    }
    readRef(ref, cx, at) {
        if (ref.kind === 'val') return ref.v;
        if (ref.dyn) return this.muxList(ref.dyn.map(e => ({ c: e.cond, v: this.readRef(e.ref, cx, at) })), ref.t, at);
        const w = width(ref.t, at);
        if (ref.kind === 'sig') return this.asVal(this.sigBits(ref.sig).slice(ref.off, ref.off + w), ref.t);
        const cur = cx.fr[ref.slot];
        if (ref.cls === 'var' && cx.mode === 'comb') {
            const d = cx.fdef[ref.slot];
            for (let i = ref.off; i < ref.off + w; i++) {
                if (!d || d[i] !== 1) fail(`the variable '${ref.name}' is read before it is assigned on every path, so it would have to remember its value from the last run of the process: that needs a latch. Assign it first, or use a signal.`, at);
            }
        }
        if (ref.off === 0 && w === width(ref.vt, at)) return cur;
        return this.asVal(this.fitBits(cur, ref.vt, at).slice(ref.off, ref.off + w), ref.t);
    }

    /* ---------- values and bits */
    bits(x, t) {
        const T = t || x.t;
        if (!x.c) return x.b;
        if (isInt(T)) return this.ibits(x, width(T, 0));
        return enc(T, x.v, []);
    }
    // an integer as w bits, least significant first, sign-extended when it can be negative
    ibits(x, w) {
        const out = new Array(w);
        if (x.c) { for (let i = 0; i < w; i++) out[i] = ibit(x.v, i); return out; }
        const b = x.b, s = x.lo !== undefined && x.lo < 0;
        for (let i = 0; i < w; i++) out[i] = i < b.length ? b[i] : (s ? b[b.length - 1] : 0);
        return out;
    }
    fitBits(v, t, at) {
        if (isInt(t)) return this.ibits(v, width(t, at));
        const b = this.bits(v, t), w = width(t, at);
        if (b.length !== w) fail(`internal: ${w} bits expected, ${b.length} given`, at);
        return b;
    }
    range(x) {
        if (x.c) return { lo: x.v, hi: x.v };
        if (x.lo !== undefined) return { lo: x.lo, hi: x.hi };
        return { lo: 0, hi: 2 ** x.b.length - 1 };
    }
    mkInt(b, lo, hi, t) {
        const w = intWidth(lo, hi);
        if (b.length > w) b = b.slice(0, w);
        else if (b.length < w) b = this.ibits({ b, lo }, w);
        if (w <= 52 && b.every(l => l < 2)) {
            let v = 0;
            for (let i = w - 1; i >= 0; i--) v = v * 2 + b[i];
            if (lo < 0 && b[w - 1]) v -= 2 ** w;
            return K(v, t || INTEGER);
        }
        return { b, lo, hi, t: t || INTEGER };
    }
    asVal(b, t) {
        if (isInt(t)) return this.mkInt(b, t.lo, t.hi, t);
        if ((!isArr(t) || t.rng) && b.every(l => l < 2)) return K(dec(t, b, 0)[0], t);
        return { b, t };
    }
    vecBits(x, t) { return this.bits(x, t).slice().reverse(); }
    lenOf(v) { return v.c ? v.v.v.length : (v.t.rng ? tlen(v.t) : v.b.length / width(v.t.elem, 0)); }
    toBool(x, at) {
        if (x.c) return isLogic(x.t) ? (x.v === 3 || x.v === 7 ? 1 : 0) : (x.v ? 1 : 0);
        if (x.b.length !== 1) fail('internal: a condition of more than one bit', at);
        return x.b[0];
    }
    fromBit(l, t) { return l < 2 ? K(isLogic(t) ? (l ? 3 : 2) : l, t) : { b: [l], t }; }
    withRange(t, len) { return t.rng && tlen(t) === len ? t : I.constrain(t, { l: len - 1, dir: 'downto', r: 0 }); }
    // the same bits as another type (a type conversion, or a parameter with its own range)
    retype(v, T) {
        if (!T) return v;
        if (isArr(T)) {
            let t = T;
            if (!T.rng) { const r = v.c ? vRange(v.v) : v.t && v.t.rng; if (r) t = I.constrain(T, r); }
            if (v.c) return K(t.rng ? { l: t.rng.l, dir: t.rng.dir, v: v.v.v } : v.v, t);
            return { b: v.b, t };
        }
        if (isInt(T)) return v.c ? K(v.v, T) : Object.assign({}, v, { t: T });
        return v.c ? K(v.v, T) : { b: v.b, t: T };
    }
    muxVal(s, a, b, at) {
        if (s === 1 || a === b) return a;
        if (s === 0) return b;
        if (a.c && b.c && sameVal(a.v, b.v)) return a;
        const g = this.g;
        if ((isInt(a.t) || a.lo !== undefined) && (isInt(b.t) || b.lo !== undefined)) {
            const ra = this.range(a), rb = this.range(b);
            const lo = Math.min(ra.lo, rb.lo), hi = Math.max(ra.hi, rb.hi), w = intWidth(lo, hi);
            const x = this.ibits(a, w), y = this.ibits(b, w);
            return this.mkInt(x.map((l, i) => g.mux(s, l, y[i])), lo, hi, isInt(a.t) ? a.t : INTEGER);
        }
        const T = a.t && (!isArr(a.t) || a.t.rng) ? a.t : b.t;
        const x = this.bits(a, T), y = this.bits(b, T);
        if (x.length !== y.length) fail(NO + 'choosing between values of different sizes here', at);
        return this.asVal(x.map((l, i) => g.mux(s, l, y[i])), T);
    }
    muxAny(c, a, b) {
        if (a === undefined) return b;
        if (b === undefined) return a;
        return this.muxVal(c, a, b, 0);
    }
    muxBits(c, x, y) {
        if (x === y || !y) return x;
        if (!x) return y;
        return x.map((l, i) => this.g.mux(c, l, y[i]));
    }
    // one of several values, picked by conditions of which at most one holds
    muxList(list, t, at) {
        const g = this.g;
        if (!list.length) return this.asVal(zeros(width(t, at)), t);
        let acc = null;
        for (const e of list) {
            const b = this.fitBits(e.v, t, at);
            acc = acc ? acc.map((l, i) => g.or(l, g.and(e.c, b[i]))) : b.map(l => g.and(e.c, l));
        }
        return this.asVal(acc, t);
    }
    eqBits(x, y) {
        let r = 1;
        for (let i = 0; i < x.length && r !== 0; i++) r = this.g.and(r, this.g.xor(x[i], y[i]) ^ 1);
        return r;
    }
    // a value that depends only on constants: let sim.js compute it
    concrete(n, cx) {
        let ok = true;
        const visit = m => {
            if (!ok || !m || typeof m !== 'object') return;
            if (m._x && m._x.st) return;
            switch (m.k) {
                case 'name': case 'sel': {
                    let r;
                    try { r = this.D.resolve(m, cx.sc); } catch (e) { ok = false; return; }
                    if (r.cls === 'sig') ok = false;
                    else if ((r.cls === 'var' || r.cls === 'param' || r.cls === 'loopvar') && !(cx.fr[r.slot] && cx.fr[r.slot].c)) ok = false;
                    return;
                }
                case 'attr': if (SIG_ATTRS.has(m.attr)) { ok = false; return; } visit(m.pfx); visit(m.arg); return;
                case 'agg': m.items.forEach(it => { visit(it.val); (it.choices || []).forEach(visit); }); return;
                case 'call': visit(m.pfx); m.args.forEach(a => visit(a.val)); return;
                case 'wave': m.els.forEach(e => visit(e.val)); return;
                case 'qual': visit(m.e); return;
                default: for (const k of ['e', 'l', 'r', 'pfx']) if (m[k]) visit(m[k]);
            }
        };
        visit(n);
        return ok;
    }
    closureK(x, cx, at) {
        const fr = cx.fr.map(v => (v && v.c ? v.v : undefined));
        let v;
        try { v = x.f({ fr, P: null, depth: 0 }); } catch (e) { if (e instanceof VError) throw e; fail(NO + 'this expression', at); }
        return K(v, this.fixT(x.t, v));
    }
    // a frame in which every array has its size, for attributes such as 'length and 'range
    shapeE(cx) {
        const stand = v => {
            if (!v) return undefined;
            if (v.c) return v.v;
            if (isArr(v.t) && v.t.rng) return { l: v.t.rng.l, dir: v.t.rng.dir, v: new Array(tlen(v.t)).fill(2) };
            return 0;
        };
        return { fr: cx.fr.map(stand), P: null, depth: 0 };
    }

    /* ---------- expressions */
    ev(n, cx) {
        const x = n._x;
        if (x && x.st) return K(x.sv, x.t);
        switch (n.k) {
            case 'paren': return this.ev(n.e, cx);
            case 'name': case 'sel': case 'call': return this.evName(n, cx);
            case 'attr': return this.evAttr(n, cx);
            case 'qual': return this.retype(this.ev(n.e, cx), x ? x.t : null);
            case 'bin': return this.evBin(n, cx);
            case 'un': return this.evUn(n, cx);
            case 'agg': return this.evAgg(n, cx);
            case 'wave': return this.ev(n.els[0].val, cx);
        }
        fail(NO + 'this expression', n.at);
    }
    evName(n, cx) {
        if (n.k === 'call') {
            const b = this.basePfx(n), r = this.D.resolve(b, cx.sc);
            if ((r.cls === 'func' || r.cls === 'type') && n.pfx === b) return this.evCall(n, cx);
        } else {
            const r = this.D.resolve(n, cx.sc);
            if (r.cls === 'func') return this.evCall(n, cx);
            if (r.cls === 'enumlit') return this.enumVal(n, r);
        }
        return this.readRef(this.ref(n, cx), cx, n.at);
    }
    evAttr(n, cx) {
        const a = n.attr, x = n._x, at = n.at;
        if (SIG_ATTRS.has(a)) fail(NO + `'${a} here: a clock edge is written once, in "if rising_edge(clk) then"`, at);
        if (SHAPE_ATTRS.has(a) && x && x.f) {
            let v;
            try { v = x.f(this.shapeE(cx)); } catch (e) { if (e instanceof VError) throw e; fail(NO + `this '${a}`, at); }
            return K(v, x.t);
        }
        const pr = this.D.resolve(n.pfx, cx.sc);
        if (pr.cls === 'type') {
            const T = pr.t;
            if (a === 'pos') return this.posOf(this.ev(n.arg, cx), T, at);
            if (a === 'val') return this.valOf(this.ev(n.arg, cx), T, at);
            if (a === 'succ' || a === 'pred') {
                const q = this.arithInt(a === 'succ' ? '+' : '-', this.posOf(this.ev(n.arg, cx), T, at), K(1, INTEGER), at);
                return isInt(T) ? q : this.valOf(q, T, at);
            }
        }
        if (x && x.f && this.concrete(n, cx)) return this.closureK(x, cx, at);
        fail(NO + `the attribute '${a} here`, at);
    }
    posOf(v, T, at) {
        if (isInt(T)) return v;
        if (v.c) return K(v.v, INTEGER);
        if (isLogic(T)) return this.mkInt([v.b[0], 1], 2, 3, INTEGER);       // the positions of '0' and '1' are 2 and 3
        if (!isEnum(T)) fail(NO + `'pos of ${T.name}`, at);
        return this.mkInt(v.b.slice(), 0, isBitT(T) ? 1 : T.lits.length - 1, INTEGER);
    }
    valOf(v, T, at) {
        if (isInt(T)) return v;
        if (v.c) return K(v.v, T);
        if (isLogic(T)) return { b: [this.ibits(v, 1)[0]], t: T };
        return { b: this.ibits(v, width(T, at)), t: T };
    }
    evCall(n, cx) {
        const x = n._x;
        if (!x) fail(NO + 'this call', n.at);
        if (x.conv) return this.retype(this.ev(n.args[0].val, cx), x.t);
        if (x.builtin) return this.builtin(x.builtin, x.bargs, x, n, cx);
        if (x.ucall) return this.inline(x, n, cx);
        if (x.f && this.concrete(n, cx)) return this.closureK(x, cx, n.at);
        fail(NO + 'this call', n.at);
    }
    builtin(name, args, x, n, cx) {
        const at = n.at, t = x.t;
        const arg = i => this.ev(args[i].val, cx);
        switch (name) {
            case 'rising_edge': case 'falling_edge': fail(NO + `${name} here: a clocked process is written "if rising_edge(clk) then ... end if;"`, at);
            case 'to_integer': {
                const v = arg(0), L = this.vecBits(v, v.t), w = L.length, sg = v.t.base === SIGNED;
                if (!w) return K(0, t);
                return this.mkInt(L, sg ? -(2 ** (w - 1)) : 0, sg ? 2 ** (w - 1) - 1 : 2 ** w - 1, t);
            }
            case 'to_unsigned': case 'to_signed': case 'to_slv': case 'to_stdlogicvector': case 'to_std_logic_vector': {
                const w = arg(1);
                if (!w.c) fail(NO + `${name} with a width that is not a constant`, at);
                return this.asVal(this.ibits(arg(0), w.v).reverse(), this.withRange(t, w.v));
            }
            case 'resize': {
                const v = arg(0), w = arg(1);
                if (!w.c) fail(NO + 'resize with a width that is not a constant', at);
                const L = this.vecBits(v, v.t), sg = v.t.base === SIGNED, W = w.v, out = [];
                for (let i = 0; i < W; i++) out.push(i < L.length ? L[i] : (sg && L.length ? L[L.length - 1] : 0));
                if (sg && W > 0 && W < L.length) out[W - 1] = L[L.length - 1];      // a signed value keeps its sign
                return this.asVal(out.reverse(), this.withRange(t.rng ? t : v.t.base, W));
            }
            case 'shift_left': case 'shift_right': case 'rotate_left': case 'rotate_right': {
                const v = arg(0);
                return this.asVal(this.shift(this.bits(v, v.t), arg(1), name, v.t.base === SIGNED, at), v.t);
            }
            case 'to_x01': return arg(0);
            case 'std_match': {
                let a = arg(0), b = arg(1);
                if (b.c && !a.c) [a, b] = [b, a];
                return this.fromBit(a.c ? this.matchConst(b, a, true, at) : this.eqBits(this.bits(a, a.t), this.bits(b, b.t)), BOOLEAN);
            }
            case 'minimum': case 'maximum': {
                const a = arg(0), b = arg(1), lt = this.cmpInt(a, b, '<');
                return name === 'minimum' ? this.muxVal(lt, a, b, at) : this.muxVal(lt, b, a, at);
            }
        }
        if (x.f && this.concrete(n, cx)) return this.closureK(x, cx, at);
        fail(NO + `${name} here`, at);
    }
    // shifts and rotations of a vector (bits from left to right) by a constant or by a value
    shift(b, k, name, sg, at) {
        const L = b.length, g = this.g;
        const one = (bits, s) => bits.map((_, i) => {
            switch (name) {
                case 'shift_left': case 'sll': return i + s < L ? bits[i + s] : 0;
                case 'sla': return i + s < L ? bits[i + s] : (sg ? 0 : bits[L - 1]);
                case 'shift_right': case 'srl': return i - s >= 0 ? bits[i - s] : (sg && name === 'shift_right' ? bits[0] : 0);
                case 'sra': return i - s >= 0 ? bits[i - s] : bits[0];
                case 'rotate_left': case 'rol': return bits[(i + s) % L];
                default: return bits[(((i - s) % L) + L) % L];
            }
        });
        if (!L) return b;
        if (k.c) {
            if (k.v >= 0) return one(b, k.v);
            const back = { sll: 'srl', srl: 'sll', sla: 'sra', sra: 'sla', rol: 'ror', ror: 'rol' }[name];
            if (!back) fail(NO + 'negative shift amounts', at);
            return this.shift(b, K(-k.v, INTEGER), back, sg, at);
        }
        if (k.lo < 0) fail(NO + 'shift amounts that can be negative', at);
        // a barrel shifter: one stage for each bit of the amount
        let cur = b;
        k.b.forEach((s, j) => { const sh = one(cur, 2 ** j); cur = cur.map((l, i) => g.mux(s, sh[i], l)); });
        return cur;
    }
    // a function call is built in place: its parameters become the values of the arguments
    inline(x, n, cx) {
        const { fd, nodes, scopes } = x.ucall, at = n.at, depth = cx.depth + 1;
        if (depth > 40) fail(NO + 'functions that call themselves this deeply', at);
        const body = fd.compiled, decl = fd.decl;
        if (!body || !body.scope) fail('internal: the function was not analyzed', at);
        const fr = [], fdef = [];
        this.D.paramList(decl).forEach((p, i) => {
            const v = this.ev(nodes[i], Object.assign({}, cx, { sc: scopes[i] }));
            const pt = this.D.subtype(p.st, fd.scope, { dyn: true });
            fr[i] = isArr(pt) && pt.rng ? this.retype(v, pt) : v;
        });
        const fx = { sc: body.scope, mode: 'fn', fr, fdef, drv: new Map(), g: 1, kills: [], fn: null, depth };
        for (const d of decl.decls) {
            if (d.k !== 'variable' && d.k !== 'constant') continue;
            for (const nm of d.names) {
                const o = body.scope.find(nm);
                if (!o || o.slot === undefined) continue;
                let T = o.t;
                if (isArr(T) && !T.rng && T.rngF) T = I.constrain(T, T.rngF(this.shapeE(fx)));
                const v = d.init ? this.ev(d.init, fx) : K(I.defVal(T, d.at), T);
                fr[o.slot] = isArr(T) && T.rng ? this.retype(v, T) : v;
            }
        }
        const F = { val: null, kill: { v: 0 }, ret: this.D.typeMark(decl.ret, fd.scope) };
        fx.fn = F;
        fx.kills.push(F.kill);
        this.seq(decl.body, fx);
        if (!F.val) fail(`'${decl.name}' ends without returning a value`, at);
        return F.val;
    }

    /* ---------- operators */
    evUn(n, cx) {
        const op = n.op, at = n.at, x = n._x || {}, v = this.ev(n.e, cx), t = v.t, g = this.g;
        if (op === 'not') return this.asVal(this.bits(v, t).map(l => l ^ 1), t);
        if (LOGIC_OPS.has(op)) {
            // a reduction: and v, or v, xor v, ...
            const base = op === 'nand' ? 'and' : op === 'nor' ? 'or' : op === 'xnor' ? 'xor' : op;
            let r = base === 'and' ? 1 : 0;
            for (const l of this.bits(v, t)) r = base === 'and' ? g.and(r, l) : base === 'or' ? g.or(r, l) : g.xor(r, l);
            return this.fromBit(base === op ? r : r ^ 1, x.t || t.elem);
        }
        if (op === '+') return v;
        if (isInt(t)) {
            const r = this.range(v);
            if (op === 'abs' && r.lo >= 0) return v;
            const w = intWidth(Math.min(r.lo, -r.hi), Math.max(r.hi, -r.lo)), b = this.ibits(v, w);
            const neg = this.addBits(b.map(l => l ^ 1), b.map((_, i) => (i ? 0 : 1)), 0).s;
            if (op === '-') return this.mkInt(neg, -r.hi, -r.lo, INTEGER);
            return this.mkInt(b.map((l, i) => g.mux(b[w - 1], neg[i], l)), 0, Math.max(-r.lo, r.hi), INTEGER);
        }
        if (isNum(t) && t.base === SIGNED) {
            const L = this.vecBits(v, t), neg = this.addBits(L.map(l => l ^ 1), L.map((_, i) => (i ? 0 : 1)), 0).s;
            const r = op === '-' ? neg : L.map((l, i) => g.mux(L[L.length - 1], neg[i], l));
            return this.asVal(r.reverse(), t);
        }
        fail(NO + `'${op}' here`, at);
    }
    evBin(n, cx) {
        const op = n.op, at = n.at, x = n._x || {}, t = x.t;
        const a = this.ev(n.l, cx), b = this.ev(n.r, cx);
        if (LOGIC_OPS.has(op)) return this.logic(op, a, b, t, at);
        if (REL_OPS.has(op)) return this.fromBit(this.compare(op, a, b, at), BOOLEAN);
        if (op === '&') return this.concat(a, b, t, at);
        if (['+', '-', '*', '/', 'mod', 'rem', '**'].includes(op)) {
            if (isInt(a.t) && isInt(b.t)) return this.arithInt(op, a, b, at);
            return this.arithVec(op, a, b, t, at);
        }
        if (SHIFT_OPS.has(op)) return this.asVal(this.shift(this.bits(a, a.t), b, op, a.t.base === SIGNED, at), a.t);
        fail(NO + `the operator '${op}'`, at);
    }
    logic(op, a, b, t, at) {
        const g = this.g;
        const f = op === 'and' ? (p, q) => g.and(p, q) : op === 'or' ? (p, q) => g.or(p, q) : op === 'xor' ? (p, q) => g.xor(p, q)
            : op === 'nand' ? (p, q) => g.and(p, q) ^ 1 : op === 'nor' ? (p, q) => g.or(p, q) ^ 1 : (p, q) => g.xor(p, q) ^ 1;
        const va = isArr(a.t), vb = isArr(b.t), xa = this.bits(a, a.t), xb = this.bits(b, b.t);
        let out;
        if (va === vb) {
            if (xa.length !== xb.length) fail(`the two sides of '${op}' have different widths`, at);
            out = xa.map((l, i) => f(l, xb[i]));
        } else if (va) out = xa.map(l => f(l, xb[0]));
        else out = xb.map(l => f(xa[0], l));
        if (!va && !vb) return this.asVal(out, t || a.t);
        const at2 = va ? a.t : b.t;
        return this.asVal(out, t && isArr(t) && t.rng && tlen(t) === out.length ? t : (at2.rng && tlen(at2) === out.length ? at2 : this.withRange(at2, out.length)));
    }
    compare(op, a, b, at) {
        const ta = a.t, tb = b.t, numeric = t => isInt(t) || isNum(t);
        if (numeric(ta) && numeric(tb)) return this.cmpInt(this.asInt(a, at), this.asInt(b, at), op);
        if (op === '=' || op === '/=') {
            let e;
            // a constant with 'U', 'X', 'Z' or '-' never equals the zeros and ones of hardware
            if ((a.c && this.hasMeta(a.v, ta)) || (b.c && this.hasMeta(b.v, tb))) e = 0;
            else {
                const x = this.bits(a, ta), y = this.bits(b, tb);
                e = x.length === y.length ? this.eqBits(x, y) : 0;
            }
            return op === '=' ? e : e ^ 1;
        }
        if (isEnum(ta) && isEnum(tb)) return this.cmpInt(this.asInt(a, at), this.asInt(b, at), op);
        if (isArr(ta) && isArr(tb) && isBitT(ta.elem)) {
            const x = this.bits(a, ta), y = this.bits(b, tb);
            if (x.length !== y.length) fail(NO + 'ordering vectors of different sizes here; compare them as numbers, with unsigned(...)', at);
            const u = v => this.mkInt(v.slice().reverse(), 0, 2 ** v.length - 1, INTEGER);
            return this.cmpInt(u(x), u(y), op);
        }
        fail(NO + `'${op}' on these values`, at);
    }
    hasMeta(v, t) {
        if (isArr(t)) return v.v.some(e => this.hasMeta(e, t.elem));
        return isLogic(t) && isMetaL(v);
    }
    asInt(v, at) {
        const t = v.t;
        if (isInt(t)) return v;
        if (isArr(t)) {
            const L = this.vecBits(v, t), w = L.length, sg = t.base === SIGNED;
            if (!w) return K(0, INTEGER);
            return this.mkInt(L, sg ? -(2 ** (w - 1)) : 0, sg ? 2 ** (w - 1) - 1 : 2 ** w - 1, INTEGER);
        }
        if (isEnum(t)) return this.posOf(v, t, at);
        fail(NO + `using a ${t.name} as a number`, at);
    }
    // comparison of two integers, constant or built from bits, using what their ranges tell
    cmpInt(a, b, op) {
        if (op === '>') return this.cmpInt(b, a, '<');
        if (op === '>=') return this.cmpInt(b, a, '<=');
        if (op === '/=') return this.cmpInt(a, b, '=') ^ 1;
        if (op === '<=') return this.cmpInt(b, a, '<') ^ 1;
        if (a.c && b.c) return (op === '=' ? a.v === b.v : a.v < b.v) ? 1 : 0;
        const ra = this.range(a), rb = this.range(b);
        if (op === '=') { if (ra.hi < rb.lo || rb.hi < ra.lo) return 0; }
        else { if (ra.hi < rb.lo) return 1; if (ra.lo >= rb.hi) return 0; }
        const lo = Math.min(ra.lo, rb.lo), hi = Math.max(ra.hi, rb.hi);
        const w = intWidth(lo, hi) + (lo < 0 ? 0 : 1);
        const x = this.ibits(a, w), y = this.ibits(b, w);
        if (op === '=') return this.eqBits(x, y);
        // a < b: the sign of a - b, computed one bit wider
        return this.addBits(x.concat([x[w - 1]]), y.concat([y[w - 1]]).map(l => l ^ 1), 1).s[w];
    }
    // ripple-carry addition of two bit lists of the same length (least significant first)
    addBits(x, y, cin) {
        const g = this.g, s = new Array(x.length);
        let c = cin;
        for (let i = 0; i < x.length; i++) {
            const p = g.xor(x[i], y[i]);
            s[i] = g.xor(p, c);
            c = g.or(g.and(x[i], y[i]), g.and(c, p));
        }
        return { s, c };
    }
    mulBits(x, y, w) {
        const g = this.g;
        let acc = zeros(w);
        for (let j = 0; j < w && j < y.length; j++) {
            if (y[j] === 0) continue;
            const row = zeros(w);
            for (let i = 0; i + j < w && i < x.length; i++) row[i + j] = g.and(x[i], y[j]);
            acc = this.addBits(acc, row, 0).s;
        }
        return acc;
    }
    arithInt(op, a, b, at) {
        if (a.c && b.c) {
            const p = a.v, q = b.v;
            if ((op === '/' || op === 'mod' || op === 'rem') && q === 0) fail('division by zero', at);
            const v = op === '+' ? p + q : op === '-' ? p - q : op === '*' ? p * q : op === '/' ? Math.trunc(p / q) : op === 'rem' ? p - q * Math.trunc(p / q) : op === 'mod' ? p - q * Math.floor(p / q) : Math.pow(p, q);
            return K(v, INTEGER);
        }
        const ra = this.range(a), rb = this.range(b);
        let lo, hi;
        if (op === '+') { lo = ra.lo + rb.lo; hi = ra.hi + rb.hi; }
        else if (op === '-') { lo = ra.lo - rb.hi; hi = ra.hi - rb.lo; }
        else if (op === '*') { const p = [ra.lo * rb.lo, ra.lo * rb.hi, ra.hi * rb.lo, ra.hi * rb.hi]; lo = Math.min(...p); hi = Math.max(...p); }
        else if (b.c && isPow2(b.v) && op !== '**' && (op === 'mod' || ra.lo >= 0)) {
            // by a power of two: the bits shift, or the low bits remain
            const k = Math.round(Math.log2(b.v)), bits = this.ibits(a, Math.max(intWidth(ra.lo, ra.hi), k + 1));
            if (op === '/') return this.mkInt(bits.slice(k).concat([0]), Math.floor(ra.lo / b.v), Math.floor(ra.hi / b.v), INTEGER);
            return this.mkInt(bits.slice(0, k).concat([0]), 0, ra.lo >= 0 ? Math.min(ra.hi, b.v - 1) : b.v - 1, INTEGER);
        } else fail(NO + `'${op}' here: divide only by a constant power of two`, at);
        if (Math.max(Math.abs(lo), Math.abs(hi)) > 2 ** 48) fail(NO + 'integers this large', at);
        const w = intWidth(lo, hi), x = this.ibits(a, w), y = this.ibits(b, w);
        const s = op === '+' ? this.addBits(x, y, 0).s : op === '-' ? this.addBits(x, y.map(l => l ^ 1), 1).s : this.mulBits(x, y, w);
        return this.mkInt(s, lo, hi, INTEGER);
    }
    // unsigned and signed arithmetic as numeric_std defines it: the result is as wide as the wider operand
    arithVec(op, a, b, t, at) {
        const ta = a.t, tb = b.t, vecA = isArr(ta), vecB = isArr(tb);
        if (!vecA && !vecB) fail(NO + `'${op}' on these values`, at);
        const T = vecA ? ta : tb, sg = T.base === SIGNED;
        const la = vecA ? this.lenOf(a) : 0, lb = vecB ? this.lenOf(b) : 0;
        const prep = (v, tv, len) => {
            if (isArr(tv)) { const x = this.vecBits(v, tv); return Array.from({ length: len }, (_, i) => (i < x.length ? x[i] : (sg ? x[x.length - 1] : 0))); }
            if (isEnum(tv)) { const l = this.bits(v, tv)[0]; return Array.from({ length: len }, (_, i) => (i ? 0 : l)); }
            return this.ibits(v, len);
        };
        const out = (bits, W) => this.asVal(bits.reverse(), t && isArr(t) && t.rng && tlen(t) === W ? t : I.constrain(t && isArr(t) ? t : T, { l: W - 1, dir: 'downto', r: 0 }));
        if (op === '+' || op === '-') {
            const L = vecA && vecB ? Math.max(la, lb) : (vecA ? la : lb);
            const x = prep(a, ta, L), y = prep(b, tb, L);
            return out(op === '+' ? this.addBits(x, y, 0).s : this.addBits(x, y.map(l => l ^ 1), 1).s, L);
        }
        if (op === '*') {
            const W = vecA && vecB ? la + lb : 2 * (vecA ? la : lb);
            return out(this.mulBits(prep(a, ta, W), prep(b, tb, W), W), W);
        }
        if ((op === '/' || op === 'mod' || op === 'rem') && vecA && !vecB && !sg && b.c && isPow2(b.v)) {
            const k = Math.round(Math.log2(b.v)), x = prep(a, ta, la);
            const r = op === '/' ? x.slice(k).concat(zeros(la)) : x.slice(0, k).concat(zeros(la));
            return out(r.slice(0, la), la);
        }
        fail(NO + `'${op}' on these values; divide only an unsigned value, by a constant power of two`, at);
    }
    concat(a, b, t, at) {
        if (!t || !isArr(t)) fail("internal: no type for '&'", at);
        const part = v => (isArr(v.t) && v.t.base === t.base ? this.bits(v, v.t) : this.fitBits(v, t.elem, at));
        const all = part(a).concat(part(b));
        const len = all.length / width(t.elem, at), lo = t.idx && t.idx.lo > 0 ? t.idx.lo : 0;
        return this.asVal(all, t.rng && tlen(t) === len ? t : I.constrain(t, { l: lo, dir: 'to', r: lo + len - 1 }));
    }
    evAgg(n, cx) {
        const x = n._x;
        if (!x || !x.t || !isArr(x.t) || !x.t.rng) fail(NO + 'this aggregate: its size is not known here', n.at);
        const T = x.t, r = T.rng, len = tlen(T);
        const pos = i => (r.dir === 'downto' ? r.l - i : i - r.l);
        const slots = new Array(len).fill(null);
        let k = 0;
        for (const it of n.items) {
            if (!it.choices) { if (k < len) slots[k++] = it.val; continue; }
            for (const ch of it.choices) {
                if (ch.k === 'others') { for (let q = 0; q < len; q++) if (!slots[q]) slots[q] = it.val; continue; }
                if (ch.k === 'range') {
                    const sr = this.D.staticRange(ch, cx.sc), st = sr.dir === 'to' ? 1 : -1;
                    for (let i = sr.l; st > 0 ? i <= sr.r : i >= sr.r; i += st) slots[pos(i)] = it.val;
                    continue;
                }
                const c = this.ev(ch, cx);
                if (!c.c) fail('an aggregate choice must be a constant', ch.at);
                slots[pos(c.v)] = it.val;
            }
        }
        const out = [], cache = new Map();
        for (let i = 0; i < len; i++) {
            const node = slots[i];
            if (!node) fail('this aggregate leaves elements without a value', n.at);
            let eb = cache.get(node);
            if (!eb) { eb = this.fitBits(this.ev(node, cx), T.elem, n.at); cache.set(node, eb); }
            for (const l of eb) out.push(l);
        }
        return this.asVal(out, T);
    }

    /* ---------- the end: every placeholder gets its driver, and the graph is built again from the
       outputs and the flip-flops, with the placeholders replaced by what drives them */
    finish() {
        const D = this.D, g = this.g, N = new AIG();
        const tops = new Map(D.topPorts.map(p => [p.sig, p]));
        if (this.clock && !(tops.has(this.clock) && tops.get(this.clock).mode === 'in')) {
            fail(`the clock '${this.clock.name}' must be an input port of the top entity: the FPGA's clock network is driven by the board's clock. To make something slower, keep the clock and use an enable that is '1' once every N cycles.`, this.clockAt);
        }
        for (const p of D.topPorts) if (p.mode !== 'in') this.sigBits(p.sig);
        const bind = new Map(), ffs = [];
        for (const [sig, ph] of this.ph) {
            const top = tops.get(sig), drv = this.drv.get(sig) || [], init = this.initBits(sig);
            ph.forEach((lit, i) => {
                const node = lit >> 1;
                if (top && top.mode === 'in') {
                    if (sig === this.clock) { bind.set(node, { clock: true }); return; }
                    const idx = this.pinIndex(top, i);
                    bind.set(node, { lit: N.input({ k2: 'pin', pin: top.name, idx, name: this.bitName(sig, i) }), fixed: true });
                    return;
                }
                const d = drv[i];
                if (!d) { bind.set(node, { lit: init[i], fixed: true }); return; }
                if (d.kind === 'ff') {
                    const q = N.input({ k2: 'ff', ff: ffs.length, name: d.name });
                    ffs.push({ name: d.name, sig: sig.name, isVar: !!d.isVar, q, d0: d.d, ar0: d.ar, arv: d.arv, init: d.init, at: d.at });
                    bind.set(node, { lit: q, fixed: true });
                    return;
                }
                bind.set(node, { lit: d.lit, name: this.bitName(sig, i), at: d.at });
            });
        }
        // an old literal in the new graph, found without recursion (the graph can be deep)
        const map = new Map([[0, 0]]);
        const conv = root => {
            const stack = [root >> 1], open = new Set();
            while (stack.length) {
                const id = stack[stack.length - 1];
                if (map.has(id)) { stack.pop(); continue; }
                const nd = g.nodes[id];
                if (nd.k === 'i') {
                    const b = bind.get(id);
                    if (!b) { map.set(id, 0); stack.pop(); continue; }
                    if (b.clock) fail(`the clock '${this.clock.name}' is used as data; in the FPGA it only reaches the clock inputs of the flip-flops`, this.clockAt);
                    if (b.fixed) { map.set(id, b.lit); stack.pop(); continue; }
                    const sub = b.lit >> 1;
                    if (map.has(sub)) { map.set(id, map.get(sub) ^ (b.lit & 1)); open.delete(id); stack.pop(); continue; }
                    if (open.has(id)) fail(`a combinational loop runs through '${b.name}': its value depends on itself with no flip-flop in between`, b.at);
                    open.add(id);
                    stack.push(sub);
                    continue;
                }
                const ka = nd.a >> 1, kb = nd.b >> 1;
                if (!map.has(ka)) { stack.push(ka); continue; }
                if (!map.has(kb)) { stack.push(kb); continue; }
                map.set(id, N.and(map.get(ka) ^ (nd.a & 1), map.get(kb) ^ (nd.b & 1)));
                stack.pop();
            }
            return map.get(root >> 1) ^ (root & 1);
        };
        const outputs = [];
        for (const p of D.topPorts) {
            if (p.mode === 'in') continue;
            this.sigBits(p.sig).forEach((lit, i) => outputs.push({ pin: p.name, idx: this.pinIndex(p, i), name: this.bitName(p.sig, i), lit: conv(lit) }));
        }
        for (const f of ffs) { f.d = conv(f.d0); f.ar = f.ar0 === null || f.ar0 === undefined ? null : conv(f.ar0); }
        // keep what an output needs, through any number of flip-flops
        const live = new Uint8Array(N.nodes.length), used = new Set(), todo = outputs.map(o => o.lit >> 1);
        while (todo.length) {
            const id = todo.pop();
            if (live[id]) continue;
            live[id] = 1;
            const nd = N.nodes[id];
            if (nd.k === 'a') todo.push(nd.a >> 1, nd.b >> 1);
            else if (nd.k === 'i' && nd.k2 === 'ff' && !used.has(nd.ff)) {
                used.add(nd.ff);
                todo.push(ffs[nd.ff].d >> 1);
                if (ffs[nd.ff].ar !== null) todo.push(ffs[nd.ff].ar >> 1);
            }
        }
        const gone = ffs.filter((f, k) => !used.has(k) && !f.isVar);
        if (gone.length) {
            const names = [...new Set(gone.map(f => f.sig))];
            D.warn(`${gone.length} flip-flop${gone.length === 1 ? '' : 's'} (${names.slice(0, 4).join(', ')}${names.length > 4 ? ', ...' : ''}) feed nothing that reaches an output, so ${gone.length === 1 ? 'it was' : 'they were'} removed`, 0);
        }
        const kept = [], renum = new Map();
        ffs.forEach((f, k) => { if (used.has(k)) { renum.set(k, kept.length); kept.push({ name: f.name, sig: f.sig, q: f.q, d: f.d, ar: f.ar, arv: f.arv, init: f.init }); } });
        for (const nd of N.nodes) if (nd.k === 'i' && nd.k2 === 'ff') nd.ff = renum.has(nd.ff) ? renum.get(nd.ff) : -1;
        const inputs = [];
        N.nodes.forEach((nd, id) => { if (nd.k === 'i' && nd.k2 === 'pin' && live[id]) inputs.push({ pin: nd.pin, idx: nd.idx, name: nd.name, lit: 2 * id }); });
        return { aig: N, inputs, outputs, ffs: kept, clock: this.clock ? this.clock.name : null };
    }
    pinIndex(p, i) {
        const t = p.t;
        if (isArr(t) && t.rng) return t.rng.dir === 'downto' ? t.rng.l - i : t.rng.l + i;
        return null;
    }
}

G.VHDLSynth = { create: (D, opts) => new Synth(D, opts), AIG, width, intWidth };
})(typeof window !== 'undefined' ? window : globalThis);
