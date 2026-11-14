/* problems.js - the VHDL problem sets: text, interface, reference solution and
   test model of every problem. Text markup: ~~~ code blocks, {inline code},
   **bold**, lines starting with "- " are lists. */
(function (G) {
'use strict';
const bit = (v, i) => (v >> BigInt(i)) & 1n;
const M = w => (1n << BigInt(w)) - 1n;
const NOT = (v, w) => v ^ M(w);
const rev = (v, w) => { let r = 0n; for (let i = 0; i < w; i++) r = (r << 1n) | bit(v, i); return r; };
const pop = v => { let n = 0n; while (v) { n += v & 1n; v >>= 1n; } return n; };
const B = x => (x ? 1n : 0n);
const H = 'library ieee;\nuse ieee.std_logic_1164.all;\n';
const HN = H + 'use ieee.numeric_std.all;\n';

/* ---------------------------------------------------------- provided units */
const LIB = {
    mod_a: `${H}
entity mod_a is
  port (
    in1, in2 : in  std_logic;
    out1     : out std_logic
  );
end entity;

architecture rtl of mod_a is
begin
  out1 <= in1 and not in2;
end architecture;
`,
    mod_b: `${H}
entity mod_b is
  port (
    out1, out2         : out std_logic;
    in1, in2, in3, in4 : in  std_logic
  );
end entity;

architecture rtl of mod_b is
begin
  out1 <= (in1 and not in2) or (in3 and in4);
  out2 <= in1 xor (in2 or (in3 and not in4));
end architecture;
`,
    mod_c: `${H}
entity mod_c is
  port (
    in3      : in  std_logic;
    out2     : out std_logic;
    in1      : in  std_logic;
    out1     : out std_logic;
    in4, in2 : in  std_logic
  );
end entity;

architecture rtl of mod_c is
begin
  out1 <= (in1 and not in2) or (in3 and in4);
  out2 <= in1 xor (in2 or (in3 and not in4));
end architecture;
`,
    my_dff: `${H}
entity my_dff is
  port (clk, d : in std_logic; q : out std_logic);
end entity;

architecture rtl of my_dff is
begin
  process(clk)
  begin
    if rising_edge(clk) then
      q <= d;
    end if;
  end process;
end architecture;
`,
    my_dff8: `${H}
entity my_dff8 is
  port (
    clk : in  std_logic;
    d   : in  std_logic_vector(7 downto 0);
    q   : out std_logic_vector(7 downto 0)
  );
end entity;

architecture rtl of my_dff8 is
begin
  process(clk)
  begin
    if rising_edge(clk) then
      q <= d;
    end if;
  end process;
end architecture;
`,
    add16: `${HN}
entity add16 is
  port (
    a, b : in  std_logic_vector(15 downto 0);
    cin  : in  std_logic;
    sum  : out std_logic_vector(15 downto 0);
    cout : out std_logic
  );
end entity;

architecture rtl of add16 is
  signal s : unsigned(16 downto 0);
begin
  s    <= ('0' & unsigned(a)) + unsigned(b) + cin;
  sum  <= std_logic_vector(s(15 downto 0));
  cout <= s(16);
end architecture;
`,
    add16_fa: `${H}
entity add16 is
  port (
    a, b : in  std_logic_vector(15 downto 0);
    cin  : in  std_logic;
    sum  : out std_logic_vector(15 downto 0);
    cout : out std_logic
  );
end entity;

architecture rtl of add16 is
  component add1 is
    port (a, b, cin : in std_logic; sum, cout : out std_logic);
  end component;
  signal c : std_logic_vector(16 downto 0);
begin
  c(0) <= cin;
  bits: for i in 0 to 15 generate
    u: add1 port map (a => a(i), b => b(i), cin => c(i), sum => sum(i), cout => c(i + 1));
  end generate;
  cout <= c(16);
end architecture;
`,
    bcd_fadd: `${HN}
entity bcd_fadd is
  port (
    a, b : in  std_logic_vector(3 downto 0);
    cin  : in  std_logic;
    cout : out std_logic;
    sum  : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of bcd_fadd is
begin
  process(all)
    variable s : unsigned(4 downto 0);
  begin
    s := ('0' & unsigned(a)) + unsigned(b) + cin;
    if s > 9 then
      s    := s + 6;
      cout <= '1';
    else
      cout <= '0';
    end if;
    sum <= std_logic_vector(s(3 downto 0));
  end process;
end architecture;
`
};

const SECTIONS = [
    { id: 'start', title: 'Getting started' },
    { id: 'basics', title: 'Basics' },
    { id: 'vectors', title: 'Vectors' },
    { id: 'hier', title: 'Entities and instances' },
    { id: 'proc', title: 'Processes' },
    { id: 'more', title: 'More VHDL features' },
    { id: 'numeric', title: 'Numbers, types and functions' }
];

const P = [];
const add = p => P.push(p);
const comb = (model, extra) => Object.assign({ model }, extra || {});

/* ================================================================ start */
add({
    id: 'step_one', sec: 'start', title: 'Getting started',
    body: `Each problem describes a small circuit. You write its VHDL, press **Check** (or Ctrl+Enter), and the checker simulates your design here in your browser against a reference, with many test inputs. When every output matches, the problem is solved.

A VHDL design has two parts. The **entity** is the outside: the ports, with their direction and type. It is given, and you should leave it as it is. The **architecture** is the inside, and that is what you write. The two lines at the top make the type {std_logic} available; nearly every design starts with them:

~~~
library ieee;
use ieee.std_logic_1164.all;
~~~

A {std_logic} is one wire. Its two everyday values are written {'0'} and {'1'}, with single quotes.

Build a circuit with no inputs and one output, {one}, that is always high. The statement goes between {begin} and {end architecture}:

~~~
one <= '1';
~~~

{<=} is a **signal assignment**: it connects the output to the constant {'1'}.`,
    ports: [['one', 'out', 1]],
    sol: "one <= '1';",
    test: comb(() => ({ one: 1n }))
});
add({
    id: 'zero', sec: 'start', title: 'Output zero',
    body: `Now the opposite: drive the output {zero} low.

Names in VHDL ignore case: {Zero}, {ZERO} and {zero} are the same port. Character literals do not: the values of {std_logic} other than {'0'} and {'1'} are upper-case letters, as the next section shows.`,
    ports: [['zero', 'out', 1]],
    sol: "zero <= '0';",
    test: comb(() => ({ zero: 0n }))
});

/* =============================================================== basics */
add({
    id: 'wire', sec: 'basics', title: 'Simple wire',
    body: `Create a design with one input and one output that behaves like a wire.

The Verilog version of this exercise calls the ports {in} and {out}. In VHDL these are **reserved words**, like {and}, {or}, {not}, {signal} and about a hundred others, so here the ports are {a} and {y}.

Unlike an assignment in a programming language, {y <= a;} does not run once. It is a **concurrent** statement: {y} follows {a} for as long as the circuit exists. When {a} changes, {y} changes with it, like a wire.`,
    ports: [['a', 'in', 1], ['y', 'out', 1]],
    sol: 'y <= a;',
    test: comb(i => ({ y: i.a }))
});
add({
    id: 'wire4', sec: 'basics', title: 'Four wires',
    body: `Connect the inputs to the outputs like this:

- {a} to {w}
- {b} to {x}
- {b} to {y}
- {c} to {z}

Statements outside a process are all **concurrent**. The order you write them in does not matter: all four are active all the time, like four wires soldered at once.`,
    ports: [['a', 'in', 1], ['b', 'in', 1], ['c', 'in', 1], ['w', 'out', 1], ['x', 'out', 1], ['y', 'out', 1], ['z', 'out', 1]],
    sol: 'w <= a;\nx <= b;\ny <= b;\nz <= c;',
    test: comb(i => ({ w: i.a, x: i.b, y: i.b, z: i.c }))
});
add({
    id: 'notgate', sec: 'basics', title: 'Inverter',
    body: `Build a NOT gate: {y} is the inverse of {a}.

VHDL writes the logic operators as words: {not}, {and}, {or}, {nand}, {nor}, {xor} and {xnor}. Symbols such as {~} or {!} do not exist.`,
    ports: [['a', 'in', 1], ['y', 'out', 1]],
    sol: 'y <= not a;',
    test: comb(i => ({ y: 1n - i.a }))
});
add({
    id: 'andgate', sec: 'basics', title: 'AND gate',
    body: `Build an AND gate with the inputs {a} and {b}.

The operators handle every value of {std_logic}, not just {'0'} and {'1'}. {'0' and 'X'} is {'0'}, because one low input is enough for an AND gate, while {'1' and 'X'} is {'X'}: the result really is unknown.`,
    ports: [['a', 'in', 1], ['b', 'in', 1], ['y', 'out', 1]],
    sol: 'y <= a and b;',
    test: comb(i => ({ y: i.a & i.b }))
});
add({
    id: 'norgate', sec: 'basics', title: 'NOR gate',
    body: `Build a NOR gate. VHDL has a {nor} operator, so {a nor b} works, and so does {not (a or b)}.

The parentheses in the second form matter: {not} binds tighter than any other logic operator, so {not a or b} means {(not a) or b}.`,
    ports: [['a', 'in', 1], ['b', 'in', 1], ['y', 'out', 1]],
    sol: 'y <= a nor b;',
    test: comb(i => ({ y: 1n - (i.a | i.b) }))
});
add({
    id: 'xnorgate', sec: 'basics', title: 'XNOR gate',
    body: `Build an XNOR gate: {y} is {'1'} when {a} and {b} are equal.`,
    ports: [['a', 'in', 1], ['b', 'in', 1], ['y', 'out', 1]],
    sol: 'y <= a xnor b;',
    test: comb(i => ({ y: 1n - (i.a ^ i.b) }))
});
add({
    id: 'wire_decl', sec: 'basics', title: 'Declaring signals',
    body: `Inside an architecture you can declare wires of your own, called **signals**. They go between {is} and {begin}:

~~~
architecture rtl of top_module is
  signal ab, cd : std_logic;
begin
  ab <= a and b;
  ...
~~~

Build this circuit: {y} is {(a and b) or (c and d)}, and {y_n} is its inverse. Use internal signals for the two AND gates.

VHDL-2008 lets an architecture read its own output ports, so {y_n <= not y;} works. Older VHDL forbids it, and an internal signal is the classic way around that.`,
    ports: [['a', 'in', 1], ['b', 'in', 1], ['c', 'in', 1], ['d', 'in', 1], ['y', 'out', 1], ['y_n', 'out', 1]],
    solDecls: 'signal ab, cd, y_i : std_logic;',
    sol: 'ab  <= a and b;\ncd  <= c and d;\ny_i <= ab or cd;\ny   <= y_i;\ny_n <= not y_i;',
    test: comb(i => { const y = (i.a & i.b) | (i.c & i.d); return { y, y_n: 1n - y }; })
});
add({
    id: 'chip7458', sec: 'basics', title: '7458 chip',
    body: `The 7458 chip holds four AND gates and two OR gates. Build it from these equations:

- {p1y = (p1a and p1b and p1c) or (p1d and p1e and p1f)}
- {p2y = (p2a and p2b) or (p2c and p2d)}

VHDL is strict about one thing here. You may chain the **same** operator, {a and b and c}, but mixing different ones needs parentheses: {a and b or c} is an error. VHDL gives {and} and {or} the same precedence on purpose, so that you always say what you mean.`,
    ports: [['p1a', 'in', 1], ['p1b', 'in', 1], ['p1c', 'in', 1], ['p1d', 'in', 1], ['p1e', 'in', 1], ['p1f', 'in', 1],
        ['p2a', 'in', 1], ['p2b', 'in', 1], ['p2c', 'in', 1], ['p2d', 'in', 1], ['p1y', 'out', 1], ['p2y', 'out', 1]],
    sol: 'p1y <= (p1a and p1b and p1c) or (p1d and p1e and p1f);\np2y <= (p2a and p2b) or (p2c and p2d);',
    test: comb(i => ({ p1y: (i.p1a & i.p1b & i.p1c) | (i.p1d & i.p1e & i.p1f), p2y: (i.p2a & i.p2b) | (i.p2c & i.p2d) }))
});
add({
    id: 'tristate', sec: 'basics', title: 'Nine values: a tri-state buffer',
    body: `A {std_logic} has nine values, not two:

- {'0'} and {'1'}: driven low and high
- {'Z'}: high impedance, nothing drives the wire
- {'U'}: uninitialized, the value of every signal before anything drives it
- {'X'}: unknown, for example two drivers fighting
- {'W'}, {'L'}, {'H'}: weak unknown, weak low and weak high, as from pull resistors
- {'-'}: don't care

Build a tri-state buffer: while {en} is {'1'}, {y} follows {a}; otherwise {y} is {'Z'}, and the buffer lets go of the wire. The letters are upper case: {'z'} is just a character, not a value of {std_logic}.

A conditional assignment picks between two values in one statement:

~~~
y <= value_when_true when condition else value_otherwise;
~~~

A condition compares: {en = '1'}.`,
    ports: [['a', 'in', 1], ['en', 'in', 1], ['y', 'out', 1]],
    sol: "y <= a when en = '1' else 'Z';",
    test: comb(i => ({ y: i.en ? i.a : 'Z' }))
});
add({
    id: 'resolved', sec: 'basics', title: 'Two drivers on one wire',
    body: `What happens when two statements drive the same signal? For {std_logic} it is allowed, because {std_logic} is a **resolved** type: a resolution function combines the drivers into one value. {'Z'} gives way to any other value, two equal values agree, and {'0'} against {'1'} gives {'X'}.

Two tri-state buffers share the wire {y}. The first drives {a} while {en_a} is {'1'}, the second drives {b} while {en_b} is {'1'}. Write them as two separate assignments to {y}, and let VHDL resolve them.

The checker normally warns about a signal with two drivers, because in most designs it is a mistake. Here it is the point.`,
    ports: [['a', 'in', 1], ['b', 'in', 1], ['en_a', 'in', 1], ['en_b', 'in', 1], ['y', 'out', 1]],
    allowMulti: true,
    sol: "y <= a when en_a = '1' else 'Z';\ny <= b when en_b = '1' else 'Z';",
    test: comb(i => { const d = []; if (i.en_a) d.push(i.a); if (i.en_b) d.push(i.b); return { y: !d.length ? 'Z' : d.every(x => x === d[0]) ? d[0] : 'X' }; })
});

/* ============================================================== vectors */
add({
    id: 'vector0', sec: 'vectors', title: 'Vectors',
    body: `A **vector** is a bundle of wires with one name. {std_logic_vector(2 downto 0)} has three elements, numbered 2, 1 and 0 from left to right; {vec(0)} is the rightmost one.

Build a circuit with the 3-bit input {vec} that outputs the same vector on {outv}, and also splits it into the single bits {o2}, {o1} and {o0}.

A whole vector is assigned in one statement, {outv <= vec;}, and an element is picked with round brackets: {vec(2)}. Square brackets are Verilog.`,
    ports: [['vec', 'in', 3], ['outv', 'out', 3], ['o2', 'out', 1], ['o1', 'out', 1], ['o0', 'out', 1]],
    sol: 'outv <= vec;\no2 <= vec(2);\no1 <= vec(1);\no0 <= vec(0);',
    test: comb(i => ({ outv: i.vec, o2: bit(i.vec, 2), o1: bit(i.vec, 1), o0: bit(i.vec, 0) }))
});
add({
    id: 'vector1', sec: 'vectors', title: 'Vectors in more detail',
    body: `A range can count down, {(7 downto 0)}, or up, {(0 to 7)}. Most designs use {downto}, so that the leftmost element is the most significant bit.

A **slice** takes neighbouring elements, {din(15 downto 8)}, and runs in the same direction as its vector.

An assignment copies element by element **from left to right**, and the widths must match exactly. VHDL never pads or cuts for you: assigning 16 bits to an 8-bit signal is an error, not a silent truncation.

Split the 16-bit input {din} into its upper byte {out_hi} and its lower byte {out_lo}.`,
    ports: [['din', 'in', 16], ['out_hi', 'out', 8], ['out_lo', 'out', 8]],
    sol: 'out_hi <= din(15 downto 8);\nout_lo <= din(7 downto 0);',
    test: comb(i => ({ out_hi: i.din >> 8n, out_lo: i.din & 255n }))
});
add({
    id: 'vector2', sec: 'vectors', title: 'Byte swap',
    body: `A 32-bit word can be stored with its four bytes in either order (big-endian or little-endian). Reverse the byte order of {din}:

~~~
dout(31 downto 24) = din(7 downto 0)
dout(23 downto 16) = din(15 downto 8)
dout(15 downto 8)  = din(23 downto 16)
dout(7 downto 0)   = din(31 downto 24)
~~~

Four slice assignments do it. So does one assignment with the concatenation operator {&}, which joins vectors left to right and is explained a few problems later.`,
    ports: [['din', 'in', 32], ['dout', 'out', 32]],
    sol: 'dout <= din(7 downto 0) & din(15 downto 8) & din(23 downto 16) & din(31 downto 24);',
    test: comb(i => { let r = 0n; for (let k = 0; k < 4; k++) r = (r << 8n) | ((i.din >> BigInt(8 * k)) & 255n); return { dout: r }; })
});
add({
    id: 'downto_to', sec: 'vectors', title: 'downto and to',
    body: `Here {a} is declared {std_logic_vector(0 to 7)}: its leftmost element is {a(0)}. {y} is declared {std_logic_vector(7 downto 0)}: its leftmost element is {y(7)}.

Because an assignment copies from left to right, {y <= a;} connects {y(7)} to {a(0)}, {y(6)} to {a(1)}, and so on. The positions count, not the index numbers.

Make every element keep its number instead: {y(i)} must equal {a(i)} for each {i} from 0 to 7. Eight single assignments do it, and so does a loop:

~~~
process(all)
begin
  for i in 0 to 7 loop
    ...
  end loop;
end process;
~~~`,
    ports: [['a', 'in', 8, 'to'], ['y', 'out', 8]],
    sol: 'process(all)\nbegin\n  for i in 0 to 7 loop\n    y(i) <= a(i);\n  end loop;\nend process;',
    test: comb(i => ({ y: rev(i.a, 8) }))
});
add({
    id: 'vectorgates', sec: 'vectors', title: 'Bitwise and logical',
    body: `{a or b} on two vectors is **bitwise**: bit {i} of the result is {a(i) or b(i)}, and the result is a vector of the same width.

Verilog also has a "logical" OR that treats a whole vector as true when any bit is set. VHDL has no such operator for vectors. You say what you mean with a comparison, which gives a {boolean}, and a conditional assignment turns that into a bit:

~~~
flag <= '1' when v /= "000" else '0';
~~~

Build a circuit with two 3-bit inputs:

- {out_or_bitwise}: the bitwise OR of {a} and {b}
- {out_or_logical}: {'1'} when either input is not all zeros
- {out_not}: the inverse of {b} in the upper half and the inverse of {a} in the lower half, {out_not(5 downto 3) = not b} and {out_not(2 downto 0) = not a}`,
    ports: [['a', 'in', 3], ['b', 'in', 3], ['out_or_bitwise', 'out', 3], ['out_or_logical', 'out', 1], ['out_not', 'out', 6]],
    sol: `out_or_bitwise <= a or b;\nout_or_logical <= '1' when a /= "000" or b /= "000" else '0';\nout_not        <= not b & not a;`,
    test: comb(i => ({ out_or_bitwise: i.a | i.b, out_or_logical: B(i.a | i.b), out_not: (NOT(i.b, 3) << 3n) | NOT(i.a, 3) }))
});
add({
    id: 'gates4', sec: 'vectors', title: 'Four-input gates',
    body: `Build three 4-input gates on the bits of {x}:

- {out_and}: all four bits ANDed
- {out_or}: all four ORed
- {out_xor}: all four XORed

Chaining one operator is fine: {x(3) and x(2) and x(1) and x(0)}. VHDL-2008 also has **reduction** operators, which apply a gate to every bit of a vector: {and x}, {or x}, {xor x}.`,
    ports: [['x', 'in', 4], ['out_and', 'out', 1], ['out_or', 'out', 1], ['out_xor', 'out', 1]],
    sol: 'out_and <= and x;\nout_or  <= or x;\nout_xor <= xor x;',
    test: comb(i => ({ out_and: B(i.x === 15n), out_or: B(i.x), out_xor: pop(i.x) & 1n }))
});
add({
    id: 'vector3', sec: 'vectors', title: 'Concatenation',
    body: `The concatenation operator {&} joins vectors and single bits into a longer vector, left part first:

~~~
y <= a & "01";    -- the bits of a, then two more bits
~~~

The width of the result is the sum of the widths, and it must match the target exactly.

Join the six 5-bit inputs {a}, {b}, {c}, {d}, {e}, {f} and two {'1'} bits at the end, 32 bits in all, and split the result into the four 8-bit outputs {w}, {x}, {y}, {z}, with {w} taking the leftmost eight bits.`,
    ports: [['a', 'in', 5], ['b', 'in', 5], ['c', 'in', 5], ['d', 'in', 5], ['e', 'in', 5], ['f', 'in', 5], ['w', 'out', 8], ['x', 'out', 8], ['y', 'out', 8], ['z', 'out', 8]],
    solDecls: 'signal all_bits : std_logic_vector(31 downto 0);',
    sol: 'all_bits <= a & b & c & d & e & f & "11";\nw <= all_bits(31 downto 24);\nx <= all_bits(23 downto 16);\ny <= all_bits(15 downto 8);\nz <= all_bits(7 downto 0);',
    test: comb(i => { const v = (i.a << 27n) | (i.b << 22n) | (i.c << 17n) | (i.d << 12n) | (i.e << 7n) | (i.f << 2n) | 3n; return { w: v >> 24n, x: (v >> 16n) & 255n, y: (v >> 8n) & 255n, z: v & 255n }; })
});
add({
    id: 'vectorr', sec: 'vectors', title: 'Reversing a vector',
    body: `Reverse the bit order of the 8-bit input: {y(7)} gets {a(0)}, {y(6)} gets {a(1)}, and so on.

{y <= a(0 to 7);} does not work: a slice must run in the same direction as its vector, and {a} is declared {downto}. Joining the single bits with {&} works, and so does a {for} loop in a process.`,
    ports: [['a', 'in', 8], ['y', 'out', 8]],
    sol: 'y <= a(0) & a(1) & a(2) & a(3) & a(4) & a(5) & a(6) & a(7);',
    test: comb(i => ({ y: rev(i.a, 8) }))
});
add({
    id: 'vector4', sec: 'vectors', title: 'Sign extension',
    body: `To widen a signed number without changing its value, copy its sign bit into all the new upper bits. That is **sign extension**: {10000001} (-127) becomes {1111111110000001} in 16 bits.

Extend the 8-bit {a} to the 32-bit {y}. VHDL has no replication operator; an aggregate builds the repeated bits:

~~~
(31 downto 8 => a(7))    -- 24 copies of the sign bit
~~~

Joined with {&}, that makes the whole word. A later problem shows {resize}, which does the same for the type {signed}.`,
    ports: [['a', 'in', 8], ['y', 'out', 32]],
    sol: 'y <= (31 downto 8 => a(7)) & a;',
    test: comb(i => ({ y: i.a & 128n ? i.a | 0xFFFFFF00n : i.a }))
});
add({
    id: 'vector5', sec: 'vectors', title: 'Every pair of five bits',
    body: `Given the five 1-bit inputs {a}, {b}, {c}, {d}, {e}, compute all 25 pairwise comparisons into the 25-bit output {y}. A comparison is {'1'} when the two bits are equal, which is an XNOR. In order:

~~~
y(24) = a xnor a    y(23) = a xnor b   ...   y(20) = a xnor e
y(19) = b xnor a    ...
y(0)  = e xnor e
~~~

Join the inputs into one vector, {a & b & c & d & e}, and loop over both indices in a process, or write the five groups out with aggregates and {&}.`,
    ports: [['a', 'in', 1], ['b', 'in', 1], ['c', 'in', 1], ['d', 'in', 1], ['e', 'in', 1], ['y', 'out', 25]],
    sol: `process(all)
  variable v : std_logic_vector(4 downto 0);
begin
  v := a & b & c & d & e;
  for i in 0 to 4 loop
    for j in 0 to 4 loop
      y(24 - (5 * i + j)) <= v(4 - i) xnor v(4 - j);
    end loop;
  end loop;
end process;`,
    test: comb(i => { const x = [i.a, i.b, i.c, i.d, i.e]; let y = 0n; for (let p = 0; p < 5; p++) for (let q = 0; q < 5; q++) y = (y << 1n) | B(x[p] === x[q]); return { y }; })
});
add({
    id: 'aggregates', sec: 'vectors', title: 'Aggregates and others',
    body: `An **aggregate** builds a vector by naming its elements. The most common one fills every element:

~~~
zero16 <= (others => '0');
~~~

{others} means "every element not named yet", so it also finishes a partial list: {(0 => '1', others => '0')} sets only bit 0. The width comes from the target, so {(others => '0')} fits a vector of any size.

Drive three 16-bit outputs:

- {ones}: all bits {'1'}
- {msb}: only bit 15 set
- {low}: the 4-bit input {n} in bits 3 down to 0, every other bit {'0'}

For {low}, join twelve zeros and {n} with {&}, or assign {(others => '0')} first in a process and overwrite the lowest four bits afterwards.`,
    ports: [['n', 'in', 4], ['ones', 'out', 16], ['msb', 'out', 16], ['low', 'out', 16]],
    sol: "ones <= (others => '1');\nmsb  <= (15 => '1', others => '0');\nlow  <= (15 downto 4 => '0') & n;",
    test: comb(i => ({ ones: 0xFFFFn, msb: 0x8000n, low: i.n }))
});

/* ================================================================= hier */
add({
    id: 'module', sec: 'hier', title: 'Instantiating an entity',
    body: `Designs are built from smaller designs. This problem provides the entity {mod_a}:

~~~
entity mod_a is
  port (
    in1, in2 : in  std_logic;
    out1     : out std_logic
  );
end entity;
~~~

Use it inside {top_module}: connect {a} to {in1}, {b} to {in2} and {out1} to {y}. An instance needs a label and a **port map**. The shortest way names the entity directly:

~~~
u1: entity work.mod_a
  port map (in1 => a, in2 => b, out1 => y);
~~~

The classic way first declares a **component** with the same ports in the architecture, then instantiates it by name, {u1: mod_a port map (...);}. Either is fine. {work} is the library your design units go into.`,
    lib: ['mod_a'],
    ports: [['a', 'in', 1], ['b', 'in', 1], ['y', 'out', 1]],
    sol: 'u1: entity work.mod_a port map (in1 => a, in2 => b, out1 => y);',
    test: comb(i => ({ y: i.a & (1n - i.b) }))
});
add({
    id: 'module_pos', sec: 'hier', title: 'Connecting ports by position',
    body: `The provided entity {mod_b} has six ports, outputs first:

~~~
entity mod_b is
  port (
    out1, out2         : out std_logic;
    in1, in2, in3, in4 : in  std_logic
  );
end entity;
~~~

Instantiate it and connect {out1}, {out2}, {a}, {b}, {c}, {d} **by position**: without names, in the order of the declaration.

~~~
u1: entity work.mod_b port map (first, second, ...);
~~~

Positional maps are short but fragile: if somebody reorders the ports of {mod_b}, your design quietly connects the wrong wires.`,
    lib: ['mod_b'],
    ports: [['a', 'in', 1], ['b', 'in', 1], ['c', 'in', 1], ['d', 'in', 1], ['out1', 'out', 1], ['out2', 'out', 1]],
    sol: 'u1: entity work.mod_b port map (out1, out2, a, b, c, d);',
    test: comb(i => ({ out1: (i.a & (1n - i.b)) | (i.c & i.d), out2: i.a ^ (i.b | (i.c & (1n - i.d))) }))
});
add({
    id: 'module_name', sec: 'hier', title: 'Connecting ports by name',
    body: `The entity {mod_c} has the same ports as {mod_b}, declared in a different order:

~~~
entity mod_c is
  port (
    in3      : in  std_logic;
    out2     : out std_logic;
    in1      : in  std_logic;
    out1     : out std_logic;
    in4, in2 : in  std_logic
  );
end entity;
~~~

Connect {a} to {in1}, {b} to {in2}, {c} to {in3}, {d} to {in4}, and the outputs to {out1} and {out2}, **by name**: {port map (in1 => a, ...)}. With names, the order of the associations does not matter.`,
    lib: ['mod_c'],
    ports: [['a', 'in', 1], ['b', 'in', 1], ['c', 'in', 1], ['d', 'in', 1], ['out1', 'out', 1], ['out2', 'out', 1]],
    sol: 'u1: entity work.mod_c port map (in1 => a, in2 => b, in3 => c, in4 => d, out1 => out1, out2 => out2);',
    test: comb(i => ({ out1: (i.a & (1n - i.b)) | (i.c & i.d), out2: i.a ^ (i.b | (i.c & (1n - i.d))) }))
});
add({
    id: 'module_shift', sec: 'hier', title: 'Three registers in a row',
    body: `The entity {my_dff} is a D flip-flop: at each rising edge of {clk}, {q} takes the value of {d}.

~~~
entity my_dff is
  port (clk, d : in std_logic; q : out std_logic);
end entity;
~~~

Chain three of them into a shift register: {d} goes into the first, each {q} feeds the next {d}, and the last {q} is the output {q} of {top_module}. Declare two signals for the wires between the flip-flops, and give all three the same {clk}.

The checker clocks your design. Until three clock edges have passed, the output still shows the {'U'} of the empty flip-flops, and those cycles are not checked.`,
    lib: ['my_dff'],
    ports: [['clk', 'in', 1], ['d', 'in', 1], ['q', 'out', 1]],
    solDecls: 'signal q1, q2 : std_logic;',
    sol: 'u1: entity work.my_dff port map (clk => clk, d => d,  q => q1);\nu2: entity work.my_dff port map (clk => clk, d => q1, q => q2);\nu3: entity work.my_dff port map (clk => clk, d => q2, q => q);',
    test: {
        clk: 'clk', cycles: 80,
        init: () => [null, null, null],
        gen: R => ({ d: R.bit() }),
        out: s => ({ q: s[2] }),
        next: (s, i) => [i.d, s[0], s[1]]
    }
});
add({
    id: 'module_shift8', sec: 'hier', title: 'Instances and vectors',
    body: `{my_dff8} is an 8-bit register: {d} and {q} are {std_logic_vector(7 downto 0)}.

Chain three of them, as in the previous problem, and add a 4-to-1 multiplexer that picks the output with the 2-bit input {sel}:

- {sel = "00"}: {d} itself, no delay
- {sel = "01"}: after the first register
- {sel = "10"}: after the second
- {sel = "11"}: after the third

A {with ... select} assignment, or a {case} in a process, makes the multiplexer.`,
    lib: ['my_dff8'],
    ports: [['clk', 'in', 1], ['d', 'in', 8], ['sel', 'in', 2], ['q', 'out', 8]],
    solDecls: 'signal q1, q2, q3 : std_logic_vector(7 downto 0);',
    sol: `u1: entity work.my_dff8 port map (clk => clk, d => d,  q => q1);
u2: entity work.my_dff8 port map (clk => clk, d => q1, q => q2);
u3: entity work.my_dff8 port map (clk => clk, d => q2, q => q3);

with sel select
  q <= d  when "00",
       q1 when "01",
       q2 when "10",
       q3 when others;`,
    test: {
        clk: 'clk', cycles: 120,
        init: () => [null, null, null],
        gen: R => ({ d: R.bits(8), sel: R.bits(2) }),
        out: (s, i) => ({ q: i.sel === 0n ? i.d : s[Number(i.sel) - 1] }),
        next: (s, i) => [i.d, s[0], s[1]]
    }
});
add({
    id: 'module_add', sec: 'hier', title: 'An adder from two halves',
    body: `The provided entity {add16} adds two 16-bit numbers and a carry:

~~~
entity add16 is
  port (
    a, b : in  std_logic_vector(15 downto 0);
    cin  : in  std_logic;
    sum  : out std_logic_vector(15 downto 0);
    cout : out std_logic
  );
end entity;
~~~

Build a 32-bit adder from two of them. The lower one adds the lower halves with a carry-in of {'0'}; its carry-out is the carry-in of the upper one. The last carry-out is not needed: leave it {open} in the port map.

A constant such as {'0'} can go straight into a port map, and so can a slice: {a => a(15 downto 0)}.`,
    lib: ['add16'],
    ports: [['a', 'in', 32], ['b', 'in', 32], ['sum', 'out', 32]],
    solDecls: 'signal c : std_logic;',
    sol: `lo: entity work.add16
  port map (a => a(15 downto 0), b => b(15 downto 0), cin => '0', sum => sum(15 downto 0), cout => c);
hi: entity work.add16
  port map (a => a(31 downto 16), b => b(31 downto 16), cin => c, sum => sum(31 downto 16), cout => open);`,
    test: comb(i => ({ sum: (i.a + i.b) & M(32) }))
});
add({
    id: 'module_fadd', sec: 'hier', title: 'An adder with your own full adder',
    body: `This time the provided {add16} needs a part from you: it is built from 16 instances of a 1-bit full adder, {add1}, which you write.

~~~
entity add1 is
  port (a, b, cin : in std_logic; sum, cout : out std_logic);
end entity;
~~~

A full adder: {sum = a xor b xor cin}, and {cout} is {'1'} when at least two of the three inputs are {'1'}. Then build the 32-bit adder of the previous problem in {top_module}.

This file holds two entities. The {library} and {use} lines apply only to the **next** design unit, so {add1} and {top_module} each need their own copy; the template already has both.`,
    lib: ['add16_fa'],
    ports: [['a', 'in', 32], ['b', 'in', 32], ['sum', 'out', 32]],
    template: `${H}
entity add1 is
  port (a, b, cin : in std_logic; sum, cout : out std_logic);
end entity;

architecture rtl of add1 is
begin

  -- Write the full adder here

end architecture;

${H}
entity top_module is
  port (
    a   : in  std_logic_vector(31 downto 0);
    b   : in  std_logic_vector(31 downto 0);
    sum : out std_logic_vector(31 downto 0)
  );
end entity;

architecture rtl of top_module is
begin

  -- Write the 32-bit adder here

end architecture;
`,
    solution: `${H}
entity add1 is
  port (a, b, cin : in std_logic; sum, cout : out std_logic);
end entity;

architecture rtl of add1 is
begin
  sum  <= a xor b xor cin;
  cout <= (a and b) or (a and cin) or (b and cin);
end architecture;

${H}
entity top_module is
  port (
    a   : in  std_logic_vector(31 downto 0);
    b   : in  std_logic_vector(31 downto 0);
    sum : out std_logic_vector(31 downto 0)
  );
end entity;

architecture rtl of top_module is
  signal c : std_logic;
begin
  lo: entity work.add16
    port map (a => a(15 downto 0), b => b(15 downto 0), cin => '0', sum => sum(15 downto 0), cout => c);
  hi: entity work.add16
    port map (a => a(31 downto 16), b => b(31 downto 16), cin => c, sum => sum(31 downto 16), cout => open);
end architecture;
`,
    test: comb(i => ({ sum: (i.a + i.b) & M(32) }))
});
add({
    id: 'module_cseladd', sec: 'hier', title: 'Carry-select adder',
    body: `A ripple-carry adder is slow: the upper half waits for the carry of the lower half. A **carry-select adder** computes the upper half twice at the same time, once for a carry-in of {'0'} and once for {'1'}, and picks the right result with a multiplexer as soon as the lower carry is known.

Build a 32-bit carry-select adder from three instances of {add16} (the same entity as two problems ago) and a 16-bit 2-to-1 multiplexer.`,
    lib: ['add16'],
    ports: [['a', 'in', 32], ['b', 'in', 32], ['sum', 'out', 32]],
    solDecls: 'signal c : std_logic;\nsignal s0, s1 : std_logic_vector(15 downto 0);',
    sol: `lo: entity work.add16 port map (a(15 downto 0), b(15 downto 0), '0', sum(15 downto 0), c);
h0: entity work.add16 port map (a(31 downto 16), b(31 downto 16), '0', s0, open);
h1: entity work.add16 port map (a(31 downto 16), b(31 downto 16), '1', s1, open);
sum(31 downto 16) <= s1 when c = '1' else s0;`,
    test: comb(i => ({ sum: (i.a + i.b) & M(32) }))
});
add({
    id: 'module_addsub', sec: 'hier', title: 'Adder-subtractor',
    body: `An adder becomes a subtractor with two changes, because in two's complement {a - b = a + (not b) + 1}: invert {b}, and set the carry-in to 1.

Build a 32-bit adder-subtractor from two {add16} instances. When {sub} is {'0'} it computes {a + b}; when {sub} is {'1'} it computes {a - b}. XOR each bit of {b} with {sub} to invert it only when needed, and connect {sub} to the carry-in of the lower adder.

VHDL-2008 can XOR a vector with a single bit: {b xor sub} applies {sub} to every element.`,
    lib: ['add16'],
    ports: [['a', 'in', 32], ['b', 'in', 32], ['sub', 'in', 1], ['sum', 'out', 32]],
    solDecls: 'signal bx : std_logic_vector(31 downto 0);\nsignal c : std_logic;',
    sol: `bx <= b xor sub;
lo: entity work.add16 port map (a(15 downto 0), bx(15 downto 0), sub, sum(15 downto 0), c);
hi: entity work.add16 port map (a(31 downto 16), bx(31 downto 16), c, sum(31 downto 16), open);`,
    test: comb(i => ({ sum: (i.sub ? i.a - i.b : i.a + i.b) & M(32) }))
});
add({
    id: 'generics', sec: 'hier', title: 'Generics',
    body: `A **generic** is a constant that each instance chooses. It makes one entity work for any width:

~~~
entity parity_n is
  generic (N : positive := 8);
  port (
    x : in  std_logic_vector(N - 1 downto 0);
    p : out std_logic
  );
end entity;
~~~

Write the architecture of {parity_n}: {p} is the XOR of all {N} bits of {x}, so {'1'} for an odd number of ones. Then use it twice in {top_module}, with {N => 8} for {x8} and {N => 12} for {x12}:

~~~
u8: entity work.parity_n generic map (N => 8) port map (x => x8, p => p8);
~~~

Inside {parity_n}, the reduction {xor x} or a loop over {x'range} works for any {N}.`,
    ports: [['x8', 'in', 8], ['x12', 'in', 12], ['p8', 'out', 1], ['p12', 'out', 1]],
    template: `${H}
entity parity_n is
  generic (N : positive := 8);
  port (
    x : in  std_logic_vector(N - 1 downto 0);
    p : out std_logic
  );
end entity;

architecture rtl of parity_n is
begin

  -- p is the XOR of all bits of x

end architecture;

${H}
entity top_module is
  port (
    x8  : in  std_logic_vector(7 downto 0);
    x12 : in  std_logic_vector(11 downto 0);
    p8  : out std_logic;
    p12 : out std_logic
  );
end entity;

architecture rtl of top_module is
begin

  -- Two instances of parity_n

end architecture;
`,
    solution: `${H}
entity parity_n is
  generic (N : positive := 8);
  port (
    x : in  std_logic_vector(N - 1 downto 0);
    p : out std_logic
  );
end entity;

architecture rtl of parity_n is
begin
  p <= xor x;
end architecture;

${H}
entity top_module is
  port (
    x8  : in  std_logic_vector(7 downto 0);
    x12 : in  std_logic_vector(11 downto 0);
    p8  : out std_logic;
    p12 : out std_logic
  );
end entity;

architecture rtl of top_module is
begin
  u8:  entity work.parity_n generic map (N => 8)  port map (x => x8,  p => p8);
  u12: entity work.parity_n generic map (N => 12) port map (x => x12, p => p12);
end architecture;
`,
    test: comb(i => ({ p8: pop(i.x8) & 1n, p12: pop(i.x12) & 1n }))
});

/* ================================================================= proc */
add({
    id: 'alwaysblock1', sec: 'proc', title: 'Combinational process',
    body: `A **process** holds statements that run one after another, like code, and runs again whenever a signal it reads changes. {process(all)} (VHDL-2008) means "every signal read inside", which is what combinational logic wants:

~~~
process(all)
begin
  y <= a and b;
end process;
~~~

Build an AND gate twice: once as a concurrent assignment on {out_assign}, and once inside a process on {out_process}. Both describe exactly the same hardware.

Inside a process the statements run in order, but a signal does not take its new value until the process has finished, and the last assignment to it wins.`,
    ports: [['a', 'in', 1], ['b', 'in', 1], ['out_assign', 'out', 1], ['out_process', 'out', 1]],
    sol: 'out_assign <= a and b;\n\nprocess(all)\nbegin\n  out_process <= a and b;\nend process;',
    test: comb(i => ({ out_assign: i.a & i.b, out_process: i.a & i.b }))
});
add({
    id: 'alwaysblock2', sec: 'proc', title: 'Clocked process',
    body: `A process that reacts only to the clock builds **registers**:

~~~
process(clk)
begin
  if rising_edge(clk) then
    q <= d;
  end if;
end process;
~~~

{rising_edge(clk)} is true at the moment {clk} goes from {'0'} to {'1'}. Every signal assigned in that branch becomes a flip-flop.

Build an XOR gate three ways:

- {out_assign}: a concurrent assignment
- {out_comb}: a combinational process
- {out_reg}: a clocked process, so the XOR is registered and appears one clock later

Verilog distinguishes blocking and non-blocking assignments here. VHDL does not need to: a signal always takes its new value after the process has run, and the variables met later always change at once.`,
    ports: [['clk', 'in', 1], ['a', 'in', 1], ['b', 'in', 1], ['out_assign', 'out', 1], ['out_comb', 'out', 1], ['out_reg', 'out', 1]],
    sol: `out_assign <= a xor b;

process(all)
begin
  out_comb <= a xor b;
end process;

process(clk)
begin
  if rising_edge(clk) then
    out_reg <= a xor b;
  end if;
end process;`,
    test: {
        clk: 'clk', cycles: 80,
        init: () => null,
        gen: R => ({ a: R.bit(), b: R.bit() }),
        out: (s, i) => ({ out_assign: i.a ^ i.b, out_comb: i.a ^ i.b, out_reg: s }),
        next: (s, i) => i.a ^ i.b
    }
});
add({
    id: 'always_if', sec: 'proc', title: 'if statement',
    body: `Inside a process, {if} chooses between statements:

~~~
if cond then
  ...
elsif other_cond then
  ...
else
  ...
end if;
~~~

Note the spelling {elsif}, and that every {if} ends with {end if;}. A condition is a {boolean}: compare a {std_logic} with a value, {sel = '1'}.

Build a 2-to-1 multiplexer that picks {b} when both {sel_b1} and {sel_b2} are {'1'}, and {a} otherwise. Make it twice: {out_assign} with a conditional assignment ({when ... else}), {out_process} with an {if} in a process.`,
    ports: [['a', 'in', 1], ['b', 'in', 1], ['sel_b1', 'in', 1], ['sel_b2', 'in', 1], ['out_assign', 'out', 1], ['out_process', 'out', 1]],
    sol: `out_assign <= b when sel_b1 = '1' and sel_b2 = '1' else a;

process(all)
begin
  if sel_b1 = '1' and sel_b2 = '1' then
    out_process <= b;
  else
    out_process <= a;
  end if;
end process;`,
    test: comb(i => { const y = i.sel_b1 & i.sel_b2 ? i.b : i.a; return { out_assign: y, out_process: y }; })
});
add({
    id: 'always_if2', sec: 'proc', title: 'if without else: a latch',
    body: `A combinational process must give each of its outputs a value **every** time it runs. If some path through the process does not assign a signal, the signal keeps its old value, and keeping a value takes memory: synthesis builds a **latch**. A latch in a design like this is almost always a bug.

This code has that bug twice. Fix it: the computer must shut off only while it is overheated, and you keep driving only while you have not arrived and the tank is not empty.

The checker warns about latches, and its test vectors catch the old values a latch keeps.`,
    ports: [['cpu_overheated', 'in', 1], ['arrived', 'in', 1], ['gas_tank_empty', 'in', 1], ['shut_off_computer', 'out', 1], ['keep_driving', 'out', 1]],
    template: `${H}
entity top_module is
  port (
    cpu_overheated    : in  std_logic;
    arrived           : in  std_logic;
    gas_tank_empty    : in  std_logic;
    shut_off_computer : out std_logic;
    keep_driving      : out std_logic
  );
end entity;

architecture rtl of top_module is
begin

  process(all)
  begin
    if cpu_overheated = '1' then
      shut_off_computer <= '1';
    end if;
  end process;

  process(all)
  begin
    if arrived = '0' then
      keep_driving <= not gas_tank_empty;
    end if;
  end process;

end architecture;
`,
    sol: `process(all)
begin
  if cpu_overheated = '1' then
    shut_off_computer <= '1';
  else
    shut_off_computer <= '0';
  end if;
end process;

process(all)
begin
  if arrived = '0' then
    keep_driving <= not gas_tank_empty;
  else
    keep_driving <= '0';
  end if;
end process;`,
    test: comb(i => ({ shut_off_computer: i.cpu_overheated, keep_driving: (1n - i.arrived) & (1n - i.gas_tank_empty) }), { random: 60 })
});
add({
    id: 'always_case', sec: 'proc', title: 'case statement',
    body: `A {case} statement picks one branch by the value of an expression:

~~~
case sel is
  when "000"  => y <= data0;
  when "001"  => y <= data1;
  ...
  when others => y <= "0000";
end case;
~~~

The choices must cover every possible value. A {std_logic} has nine values, so a 3-bit {std_logic_vector} has 729 of them, not 8; {when others} takes care of the rest.

Build a 6-to-1 multiplexer: {sel} from 0 to 5 picks one of the 4-bit inputs {data0} to {data5}, and for 6 and 7 the output is {"0000"}.`,
    ports: [['sel', 'in', 3], ['data0', 'in', 4], ['data1', 'in', 4], ['data2', 'in', 4], ['data3', 'in', 4], ['data4', 'in', 4], ['data5', 'in', 4], ['y', 'out', 4]],
    sol: `process(all)
begin
  case sel is
    when "000"  => y <= data0;
    when "001"  => y <= data1;
    when "010"  => y <= data2;
    when "011"  => y <= data3;
    when "100"  => y <= data4;
    when "101"  => y <= data5;
    when others => y <= "0000";
  end case;
end process;`,
    test: comb(i => { const d = [i.data0, i.data1, i.data2, i.data3, i.data4, i.data5]; return { y: i.sel < 6n ? d[Number(i.sel)] : 0n }; })
});
add({
    id: 'always_case2', sec: 'proc', title: 'Priority encoder',
    body: `A **priority encoder** outputs the position of the first {'1'} in its input. Here "first" means the lowest bit: for {x = "1010"} the answer is 1, because bit 1 is the lowest bit that is set. When no bit is set, the output is 0.

Build a 4-bit priority encoder, with a {case} statement or with an {if ... elsif} chain, which checks the bits in order of priority.`,
    ports: [['x', 'in', 4], ['pos', 'out', 2]],
    sol: `process(all)
begin
  if x(0) = '1' then
    pos <= "00";
  elsif x(1) = '1' then
    pos <= "01";
  elsif x(2) = '1' then
    pos <= "10";
  elsif x(3) = '1' then
    pos <= "11";
  else
    pos <= "00";
  end if;
end process;`,
    test: comb(i => { for (let k = 0; k < 4; k++) if (bit(i.x, k)) return { pos: BigInt(k) }; return { pos: 0n }; })
});
add({
    id: 'always_casez', sec: 'proc', title: 'Priority encoder with case?',
    body: `For 8 bits a full {case} table would need 256 lines. VHDL-2008's **matching case**, {case?}, accepts {'-'} (don't care) in its choices:

~~~
case? x is
  when "-------1" => pos <= "000";
  when "------10" => pos <= "001";
  ...
  when others     => pos <= "000";
end case?;
~~~

A value matches a choice when every bit that is not {'-'} agrees. Build the 8-bit version of the previous priority encoder this way: {pos} is the index of the lowest {'1'}, or 0 when there is none.`,
    ports: [['x', 'in', 8], ['pos', 'out', 3]],
    sol: `process(all)
begin
  case? x is
    when "-------1" => pos <= "000";
    when "------10" => pos <= "001";
    when "-----100" => pos <= "010";
    when "----1000" => pos <= "011";
    when "---10000" => pos <= "100";
    when "--100000" => pos <= "101";
    when "-1000000" => pos <= "110";
    when "10000000" => pos <= "111";
    when others     => pos <= "000";
  end case?;
end process;`,
    test: comb(i => { for (let k = 0; k < 8; k++) if (bit(i.x, k)) return { pos: BigInt(k) }; return { pos: 0n }; })
});
add({
    id: 'always_nolatches', sec: 'proc', title: 'Avoiding latches',
    body: `A PS/2 keyboard sends a 16-bit scancode for each key. Decode the four arrow keys:

- {x"E06B"}: {left}
- {x"E072"}: {down}
- {x"E074"}: {right}
- {x"E075"}: {up}

For an arrow key exactly one output is {'1'}; for any other code all four are {'0'}. To avoid latches without repeating every output in every branch, give the outputs default values at the top of the process; a later assignment overrides them:

~~~
process(all)
begin
  left <= '0'; down <= '0'; right <= '0'; up <= '0';
  case scancode is
    ...
~~~`,
    ports: [['scancode', 'in', 16], ['left', 'out', 1], ['down', 'out', 1], ['right', 'out', 1], ['up', 'out', 1]],
    sol: `process(all)
begin
  left <= '0'; down <= '0'; right <= '0'; up <= '0';
  case scancode is
    when x"E06B" => left  <= '1';
    when x"E072" => down  <= '1';
    when x"E074" => right <= '1';
    when x"E075" => up    <= '1';
    when others  => null;
  end case;
end process;`,
    test: comb(i => ({ left: B(i.scancode === 0xE06Bn), down: B(i.scancode === 0xE072n), right: B(i.scancode === 0xE074n), up: B(i.scancode === 0xE075n) }),
        { gen: R => ({ scancode: R.chance(0.5) ? [0xE06Bn, 0xE072n, 0xE074n, 0xE075n, 0xE070n, 0xE06An][R.int(6)] : R.bits(16) }), random: 200 })
});
add({
    id: 'signals_vs_variables', sec: 'proc', title: 'Signals and variables',
    body: `Signals and variables both hold values, but they change at different times:

- a **signal** assignment, {a <= b;}, takes effect only after the process finishes, so the rest of the process still sees the old value;
- a **variable** assignment, {v := b;}, takes effect at once. Variables live inside one process.

That makes swapping two registers easy with signals:

~~~
ra <= rb;
rb <= ra;    -- still reads the old ra
~~~

Build two 8-bit registers {ra} and {rb} clocked by {clk}. At a rising edge: if {load} is {'1'}, load {a} into {ra} and {b} into {rb}; otherwise, if {swap} is {'1'}, exchange their contents; otherwise keep them. With variables instead, the second assignment would see the new value, and both registers would end up equal.`,
    ports: [['clk', 'in', 1], ['load', 'in', 1], ['swap', 'in', 1], ['a', 'in', 8], ['b', 'in', 8], ['ra', 'out', 8], ['rb', 'out', 8]],
    sol: `process(clk)
begin
  if rising_edge(clk) then
    if load = '1' then
      ra <= a;
      rb <= b;
    elsif swap = '1' then
      ra <= rb;
      rb <= ra;
    end if;
  end if;
end process;`,
    test: {
        clk: 'clk', cycles: 100,
        init: () => ({ ra: null, rb: null }),
        gen: (R, k) => ({ load: k === 0 ? 1n : B(R.chance(0.15)), swap: B(R.chance(0.5)), a: R.bits(8), b: R.bits(8) }),
        out: s => ({ ra: s.ra, rb: s.rb }),
        next: (s, i) => (i.load ? { ra: i.a, rb: i.b } : i.swap ? { ra: s.rb, rb: s.ra } : s)
    }
});
add({
    id: 'resets', sec: 'proc', title: 'Synchronous and asynchronous reset',
    body: `A reset puts a register into a known state. VHDL writes the two common kinds differently. An **asynchronous** reset acts at once, without waiting for the clock, so it comes first and is in the sensitivity list:

~~~
process(clk, areset)
begin
  if areset = '1' then
    q <= (others => '0');
  elsif rising_edge(clk) then
    q <= d;
  end if;
end process;
~~~

A **synchronous** reset is an ordinary condition inside the {rising_edge} branch: it acts only at a clock edge, and the process needs only {clk} in its list.

Build two 8-bit registers that both load {d} at each rising edge: {q_async} with the asynchronous reset {areset}, and {q_sync} with the synchronous reset {reset}. Both reset to zero.`,
    ports: [['clk', 'in', 1], ['areset', 'in', 1], ['reset', 'in', 1], ['d', 'in', 8], ['q_async', 'out', 8], ['q_sync', 'out', 8]],
    sol: `process(clk, areset)
begin
  if areset = '1' then
    q_async <= (others => '0');
  elsif rising_edge(clk) then
    q_async <= d;
  end if;
end process;

process(clk)
begin
  if rising_edge(clk) then
    if reset = '1' then
      q_sync <= (others => '0');
    else
      q_sync <= d;
    end if;
  end if;
end process;`,
    test: {
        clk: 'clk', cycles: 120,
        init: () => ({ qa: null, qs: null }),
        gen: (R, k) => ({ areset: k === 0 ? 1n : B(R.chance(0.1)), reset: k === 0 ? 1n : B(R.chance(0.1)), d: R.bits(8) }),
        out: (s, i) => ({ q_async: i.areset ? 0n : s.qa, q_sync: s.qs }),
        next: (s, i) => ({ qa: i.areset ? 0n : i.d, qs: i.reset ? 0n : i.d })
    }
});

/* ================================================================= more */
add({
    id: 'conditional', sec: 'more', title: 'Conditional assignment: the minimum',
    body: `A conditional assignment can chain as many conditions as needed; the first true one wins:

~~~
y <= a when cond_a else
     b when cond_b else
     c;
~~~

Find the smallest of the four unsigned 8-bit numbers {a}, {b}, {c} and {d}. Compare them as numbers with the type {unsigned} from {ieee.numeric_std}: {unsigned(a) < unsigned(b)}. Two intermediate results, the smaller of {a} and {b} and the smaller of {c} and {d}, keep the expressions short.

For two {std_logic_vector}s of the same width, {<} happens to give the same answer, but only by accident: it compares them like words in a dictionary, so {"10" < "011"} is false. Say "number" with {unsigned}.`,
    numeric: true,
    ports: [['a', 'in', 8], ['b', 'in', 8], ['c', 'in', 8], ['d', 'in', 8], ['smallest', 'out', 8]],
    solDecls: 'signal m1, m2 : std_logic_vector(7 downto 0);',
    sol: `m1 <= a when unsigned(a) < unsigned(b) else b;
m2 <= c when unsigned(c) < unsigned(d) else d;
smallest <= m1 when unsigned(m1) < unsigned(m2) else m2;`,
    test: comb(i => ({ smallest: [i.a, i.b, i.c, i.d].reduce((x, y) => (y < x ? y : x)) }))
});
const SEG = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F, 0x77, 0x7C, 0x39, 0x5E, 0x79, 0x71];
add({
    id: 'selected', sec: 'more', title: 'Selected assignment: a 7-segment decoder',
    body: `{with ... select} is the concurrent form of a {case} statement:

~~~
with sel select
  y <= "0001" when "00",
       "0010" when "01",
       "0000" when others;
~~~

Decode a hexadecimal digit for a 7-segment display. {seg} is {gfedcba}: {seg(0)} is segment a at the top, then clockwise b, c, d, e, f, and {seg(6)} is g in the middle. A {'1'} lights a segment. The ten digits and A to F:

~~~
0: 0111111   1: 0000110   2: 1011011   3: 1001111
4: 1100110   5: 1101101   6: 1111101   7: 0000111
8: 1111111   9: 1101111   A: 1110111   b: 1111100
C: 0111001   d: 1011110   E: 1111001   F: 1110001
~~~`,
    ports: [['hex', 'in', 4], ['seg', 'out', 7]],
    sol: 'with hex select\n  seg <= ' + SEG.map((s, k) => `"${s.toString(2).padStart(7, '0')}" when "${k.toString(2).padStart(4, '0')}"`).join(',\n         ') + ',\n         "0000000" when others;',
    test: comb(i => ({ seg: BigInt(SEG[Number(i.hex)]) }))
});
add({
    id: 'reduction', sec: 'more', title: 'Reduction: a parity bit',
    body: `A **parity bit** detects a single flipped bit in a byte. With even parity it is chosen so that the byte and the parity bit together hold an even number of ones, which makes it simply the XOR of all eight bits.

Compute the even parity bit of {x}. VHDL-2008's reduction operator does it in one step, {xor x}; older VHDL would chain eight XORs or loop.`,
    ports: [['x', 'in', 8], ['parity', 'out', 1]],
    sol: 'parity <= xor x;',
    test: comb(i => ({ parity: pop(i.x) & 1n }))
});
add({
    id: 'gates100', sec: 'more', title: 'Even wider gates',
    body: `Build {out_and}, {out_or} and {out_xor} over all 100 bits of {x}. Reduction operators do not care about the width; a loop over {x'range} works just as well.`,
    ports: [['x', 'in', 100], ['out_and', 'out', 1], ['out_or', 'out', 1], ['out_xor', 'out', 1]],
    sol: 'out_and <= and x;\nout_or  <= or x;\nout_xor <= xor x;',
    test: comb(i => ({ out_and: B(i.x === M(100)), out_or: B(i.x), out_xor: pop(i.x) & 1n }),
        { gen: R => { const k = R.int(4); const x = k === 0 ? M(100) ^ (1n << BigInt(R.int(100))) : k === 1 ? 1n << BigInt(R.int(100)) : R.bits(100); return { x }; }, random: 200 })
});
add({
    id: 'vector100r', sec: 'more', title: 'Loop: reversing 100 bits',
    body: `Reverse the 100-bit input: {y(99)} gets {x(0)}, {y(98)} gets {x(1)}, and so on. A {for} loop in a process repeats a statement for every index:

~~~
for i in x'range loop
  ...
end loop;
~~~

{x'range} is an **attribute**: the range of {x}, here {99 downto 0}. Using it instead of fixed numbers keeps the loop right if the width ever changes.

A loop in a process does not take time to run: synthesis unrolls it into 100 wires.`,
    ports: [['x', 'in', 100], ['y', 'out', 100]],
    sol: 'process(all)\nbegin\n  for i in x\'range loop\n    y(i) <= x(99 - i);\n  end loop;\nend process;',
    test: comb(i => ({ y: rev(i.x, 100) }))
});
add({
    id: 'popcount255', sec: 'more', title: 'Loop: population count',
    body: `Count the {'1'} bits of the 255-bit input; the count fits in 8 bits.

A **variable** makes a natural counter: declared in the process, it changes immediately, so a loop can add to it.

~~~
process(all)
  variable count : unsigned(7 downto 0);
begin
  count := (others => '0');
  for i in x'range loop
    ...
  end loop;
  y <= std_logic_vector(count);
end process;
~~~

{unsigned}, from {ieee.numeric_std}, is a vector that means a number, so {count + 1} works; at the end {std_logic_vector(...)} converts it back for the port.`,
    numeric: true,
    ports: [['x', 'in', 255], ['y', 'out', 8]],
    sol: `process(all)
  variable count : unsigned(7 downto 0);
begin
  count := (others => '0');
  for i in x'range loop
    if x(i) = '1' then
      count := count + 1;
    end if;
  end loop;
  y <= std_logic_vector(count);
end process;`,
    test: comb(i => ({ y: pop(i.x) }), { gen: R => { const p = R.int(5) / 4; let x = 0n; for (let k = 0; k < 255; k++) if (R.chance(p)) x |= 1n << BigInt(k); return { x }; }, random: 120 })
});
add({
    id: 'adder100i', sec: 'more', title: 'for ... generate: a 100-bit adder',
    body: `{for ... generate} copies concurrent statements, and instances, once per index:

~~~
gen: for i in 0 to 99 generate
  ...
end generate;
~~~

Build a 100-bit ripple-carry adder from 100 full adders. Add {a}, {b} and {cin}, and output {sum} and every carry: {cout(i)} is the carry out of bit {i}, so {cout(99)} is the final carry.

Inside the generate, {i} is a constant, so {c(i)} and {c(i + 1)} pick neighbouring carries. A carry vector one bit longer than the inputs, with {c(0) <= cin;}, saves treating bit 0 differently.`,
    ports: [['a', 'in', 100], ['b', 'in', 100], ['cin', 'in', 1], ['cout', 'out', 100], ['sum', 'out', 100]],
    solDecls: 'signal c : std_logic_vector(100 downto 0);',
    sol: `c(0) <= cin;
gen: for i in 0 to 99 generate
  sum(i)   <= a(i) xor b(i) xor c(i);
  c(i + 1) <= (a(i) and b(i)) or (c(i) and (a(i) xor b(i)));
end generate;
cout <= c(100 downto 1);`,
    test: comb(i => {
        let c = i.cin, s = 0n, co = 0n;
        for (let k = 0; k < 100; k++) {
            const x = bit(i.a, k), y = bit(i.b, k);
            s |= (x ^ y ^ c) << BigInt(k);
            c = (x & y) | (c & (x ^ y));
            co |= c << BigInt(k);
        }
        return { sum: s, cout: co };
    }, { random: 150 })
});
const bcdDigits = R => { let v = 0n; for (let k = 0; k < 100; k++) v = (v << 4n) | BigInt(R.int(10)); return v; };
add({
    id: 'bcdadd100', sec: 'more', title: 'Generate with instances: a BCD adder',
    body: `**BCD**, binary-coded decimal, stores one decimal digit in each group of 4 bits. The provided entity {bcd_fadd} adds two BCD digits and a carry:

~~~
entity bcd_fadd is
  port (
    a, b : in  std_logic_vector(3 downto 0);
    cin  : in  std_logic;
    cout : out std_logic;
    sum  : out std_logic_vector(3 downto 0)
  );
end entity;
~~~

Build a 100-digit BCD adder: {a} and {b} hold 100 digits each (400 bits), digit {i} in bits {4*i + 3 downto 4*i}. Generate 100 instances and chain their carries; {cout} is the carry out of the last digit.

Expressions of the generate index are constants, so slices like {a(4*i + 3 downto 4*i)} are allowed in the port map.`,
    lib: ['bcd_fadd'],
    ports: [['a', 'in', 400], ['b', 'in', 400], ['cin', 'in', 1], ['cout', 'out', 1], ['sum', 'out', 400]],
    solDecls: 'signal c : std_logic_vector(100 downto 0);',
    sol: `c(0) <= cin;
gen: for i in 0 to 99 generate
  u: entity work.bcd_fadd
    port map (a => a(4 * i + 3 downto 4 * i), b => b(4 * i + 3 downto 4 * i), cin => c(i),
              cout => c(i + 1), sum => sum(4 * i + 3 downto 4 * i));
end generate;
cout <= c(100);`,
    test: comb(i => {
        let c = i.cin, s = 0n;
        for (let k = 0; k < 100; k++) {
            let d = ((i.a >> BigInt(4 * k)) & 15n) + ((i.b >> BigInt(4 * k)) & 15n) + c;
            if (d > 9n) { d += 6n; c = 1n; } else c = 0n;
            s |= (d & 15n) << BigInt(4 * k);
        }
        return { sum: s, cout: c };
    }, { gen: R => ({ a: bcdDigits(R), b: bcdDigits(R), cin: R.bit() }), random: 60, corners: false })
});

/* ============================================================== numeric */
add({
    id: 'numeric_std', sec: 'numeric', title: 'unsigned and signed',
    body: `A {std_logic_vector} is only a row of bits with no numeric meaning, so VHDL refuses {a + b} on it. The package {ieee.numeric_std} adds two types that do have one: {unsigned}, and {signed} in two's complement. Converting between them and {std_logic_vector} costs nothing; the bits stay the same:

~~~
unsigned(v)            -- read the bits as an unsigned number
std_logic_vector(u)    -- and back
~~~

For the two 8-bit inputs, produce:

- {sum_u}: the 9-bit sum {a + b} of unsigned numbers, carry included. Widen an operand first, {resize(unsigned(a), 9)} or {'0' & unsigned(a)}: the result of {+} is only as wide as its widest operand.
- {lt_u}: {'1'} when {a < b} as unsigned numbers
- {lt_s}: {'1'} when {a < b} as signed numbers

The same bits can compare differently: {"11111111"} is 255 as unsigned but -1 as signed.`,
    numeric: true,
    ports: [['a', 'in', 8], ['b', 'in', 8], ['sum_u', 'out', 9], ['lt_u', 'out', 1], ['lt_s', 'out', 1]],
    sol: `sum_u <= std_logic_vector(resize(unsigned(a), 9) + unsigned(b));
lt_u  <= '1' when unsigned(a) < unsigned(b) else '0';
lt_s  <= '1' when signed(a) < signed(b) else '0';`,
    test: comb(i => { const s = v => (v & 128n ? v - 256n : v); return { sum_u: i.a + i.b, lt_u: B(i.a < i.b), lt_s: B(s(i.a) < s(i.b)) }; })
});
add({
    id: 'counter', sec: 'numeric', title: 'A counter',
    body: `Build a 4-bit counter {q}. At each rising edge of {clk}: if {reset} is {'1'}, the counter becomes 0 (a synchronous reset); otherwise, if {en} is {'1'}, it counts up by one, wrapping from 15 to 0; otherwise it holds.

Keep the count in an internal {unsigned(3 downto 0)} signal, so that {count + 1} is defined, and convert it for the output: {q <= std_logic_vector(count);}. An {unsigned} addition wraps around by itself.`,
    numeric: true,
    ports: [['clk', 'in', 1], ['reset', 'in', 1], ['en', 'in', 1], ['q', 'out', 4]],
    solDecls: 'signal count : unsigned(3 downto 0);',
    sol: `process(clk)
begin
  if rising_edge(clk) then
    if reset = '1' then
      count <= (others => '0');
    elsif en = '1' then
      count <= count + 1;
    end if;
  end if;
end process;

q <= std_logic_vector(count);`,
    test: {
        clk: 'clk', cycles: 120,
        init: () => null,
        gen: (R, k) => ({ reset: k === 0 ? 1n : B(R.chance(0.05)), en: B(R.chance(0.75)) }),
        out: s => ({ q: s }),
        next: (s, i) => (i.reset ? 0n : s === null ? null : i.en ? (s + 1n) & 15n : s)
    }
});
add({
    id: 'decoder', sec: 'numeric', title: 'to_integer: a decoder',
    body: `An **integer** in VHDL is a number, not bits. {to_integer(unsigned(v))} turns a vector into one, and an integer can **index** a vector.

Build a 4-to-16 decoder: exactly one bit of {y} is {'1'}, the one whose index is the value of {sel}. In a process, first give all bits {'0'} with an aggregate, then set the selected bit; the later assignment wins for that one bit.`,
    numeric: true,
    ports: [['sel', 'in', 4], ['y', 'out', 16]],
    sol: "process(all)\nbegin\n  y <= (others => '0');\n  y(to_integer(unsigned(sel))) <= '1';\nend process;",
    test: comb(i => ({ y: 1n << i.sel }))
});
add({
    id: 'functions', sec: 'numeric', title: 'Functions: Gray code',
    body: `In the **Gray code**, consecutive numbers differ in exactly one bit, which makes it safe for counters that cross between clock domains. Binary to Gray takes one line: {g = b xor (b shifted right by one)}. Gray to binary is a running XOR from the top bit down: {b(7) = g(7)}, then {b(i) = b(i+1) xor g(i)}.

Write two **functions** in the declarative part of the architecture, between {is} and {begin}, and use them:

~~~
function to_gray(b : std_logic_vector) return std_logic_vector is
begin
  return ...;
end function;
~~~

- {gray}: the Gray code of {x}
- {bin}: the binary value of {x} read as a Gray code

A parameter declared without a range takes the range of whatever it is called with; inside the function, {b'range}, {b'high} and {b'low} describe it. A variable in the function can use that range too: {variable r : std_logic_vector(b'range);}.`,
    ports: [['x', 'in', 8], ['gray', 'out', 8], ['bin', 'out', 8]],
    solDecls: `function to_gray(b : std_logic_vector) return std_logic_vector is
begin
  return b xor ('0' & b(b'high downto b'low + 1));
end function;

function from_gray(g : std_logic_vector) return std_logic_vector is
  variable r : std_logic_vector(g'range);
begin
  r(g'high) := g(g'high);
  for i in g'high - 1 downto g'low loop
    r(i) := r(i + 1) xor g(i);
  end loop;
  return r;
end function;`,
    sol: 'gray <= to_gray(x);\nbin  <= from_gray(x);',
    test: comb(i => { let b = 0n, run = 0n; for (let k = 7; k >= 0; k--) { run ^= bit(i.x, k); b |= run << BigInt(k); } return { gray: i.x ^ (i.x >> 1n), bin: b }; })
});
add({
    id: 'attributes', sec: 'numeric', title: 'Attributes: counting leading zeros',
    body: `**Attributes** ask a type or a signal about itself: {x'length} is its width, {x'high} and {x'low} its index bounds, {x'range} the whole range. They let code follow the width of a vector instead of repeating numbers.

Count the leading zeros of the 16-bit input: how many {'0'} bits come before the first {'1'}, starting at the most significant bit. For {x"0000"} the answer is 16, so the output {lz} has 5 bits.

Loop from {x'high} down to {x'low} in a process, count with a variable, and leave the loop at the first {'1'} with {exit when x(i) = '1';}.`,
    numeric: true,
    ports: [['x', 'in', 16], ['lz', 'out', 5]],
    sol: `process(all)
  variable n : natural range 0 to 16;
begin
  n := 0;
  for i in x'high downto x'low loop
    exit when x(i) = '1';
    n := n + 1;
  end loop;
  lz <= std_logic_vector(to_unsigned(n, 5));
end process;`,
    test: comb(i => { let n = 0n; for (let k = 15; k >= 0 && !bit(i.x, k); k--) n++; return { lz: n }; },
        { gen: R => ({ x: R.bits(16) >> BigInt(R.int(17)) }), random: 200 })
});
add({
    id: 'enum_fsm', sec: 'numeric', title: 'Enumerated types: a traffic light',
    body: `An **enumerated type** lists names for the values of a signal, which is the natural way to write the states of a state machine:

~~~
type light_t is (red, green, yellow);
signal state : light_t;
~~~

Build a traffic light. At each rising edge of {clk}: {reset} (synchronous) sets the state to {red}; otherwise, when {advance} is {'1'}, the light moves on, red to green, green to yellow, yellow to red. The outputs {r}, {g} and {yl} light the current colour, one at a time.

Use a clocked process with a {case} on the state, and derive the outputs from the state with concurrent assignments. A {case} that names all three states needs no {when others}. Unlike a {std_logic}, an enumerated signal never starts as {'U'}: before any assignment it holds its first value, here {red}.`,
    ports: [['clk', 'in', 1], ['reset', 'in', 1], ['advance', 'in', 1], ['r', 'out', 1], ['g', 'out', 1], ['yl', 'out', 1]],
    solDecls: 'type light_t is (red, green, yellow);\nsignal state : light_t;',
    sol: `process(clk)
begin
  if rising_edge(clk) then
    if reset = '1' then
      state <= red;
    elsif advance = '1' then
      case state is
        when red    => state <= green;
        when green  => state <= yellow;
        when yellow => state <= red;
      end case;
    end if;
  end if;
end process;

r  <= '1' when state = red    else '0';
g  <= '1' when state = green  else '0';
yl <= '1' when state = yellow else '0';`,
    test: {
        clk: 'clk', cycles: 100,
        init: () => 0,
        gen: (R, k) => ({ reset: k === 0 || R.chance(0.05) ? 1n : 0n, advance: B(R.chance(0.6)) }),
        out: s => ({ r: B(s === 0), g: B(s === 1), yl: B(s === 2) }),
        next: (s, i) => (i.reset ? 0 : i.advance ? (s + 1) % 3 : s)
    }
});

G.VHDLProblems = { LIB, SECTIONS, PROBLEMS: P };
})(typeof window !== 'undefined' ? window : globalThis);
