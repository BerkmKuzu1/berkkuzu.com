/* problems.js - the VHDL problem sets: text, interface, reference solution and
   test model of every problem. The circuits are textbook classics, written as
   new problems. Text markup: ~~~ code blocks, {inline code}, **bold**, lines
   starting with "- " are lists. */
(function (G) {
'use strict';
const bit = (v, i) => (v >> BigInt(i)) & 1n;
const pop = v => { let n = 0n; while (v) { n += v & 1n; v >>= 1n; } return n; };
const B = x => (x ? 1n : 0n);
const maj = (a, b, c) => (a & b) | (a & c) | (b & c);
const H = 'library ieee;\nuse ieee.std_logic_1164.all;\n';
const HN = H + 'use ieee.numeric_std.all;\n';

/* ---------------------------------------------------------- provided units */
const LIB = {
    half_adder: `${H}
entity half_adder is
  port (a, b : in std_logic; s, c : out std_logic);
end entity;

architecture rtl of half_adder is
begin
  s <= a xor b;
  c <= a and b;
end architecture;
`,
    mux2: `${H}
entity mux2 is
  port (
    a, b : in  std_logic_vector(3 downto 0);
    sel  : in  std_logic;
    y    : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of mux2 is
begin
  y <= a when sel = '0' else b;
end architecture;
`,
    cmp4: `${HN}
entity cmp4 is
  port (
    a, b       : in  std_logic_vector(3 downto 0);
    gt, eq, lt : out std_logic
  );
end entity;

architecture rtl of cmp4 is
begin
  gt <= '1' when unsigned(a) > unsigned(b) else '0';
  eq <= '1' when a = b else '0';
  lt <= '1' when unsigned(a) < unsigned(b) else '0';
end architecture;
`,
    dff_en: `${H}
entity dff_en is
  port (clk, en, d : in std_logic; q : out std_logic);
end entity;

architecture rtl of dff_en is
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if en = '1' then
        q <= d;
      end if;
    end if;
  end process;
end architecture;
`,
    fa: `${H}
entity fa is
  port (a, b, cin : in std_logic; s, cout : out std_logic);
end entity;

architecture rtl of fa is
begin
  s    <= a xor b xor cin;
  cout <= (a and b) or (cin and (a xor b));
end architecture;
`
};

const SECTIONS = [
    { id: 'start', title: 'Getting started' },
    { id: 'gates', title: 'Gates and equations' },
    { id: 'vectors', title: 'Vectors' },
    { id: 'hier', title: 'Entities and instances' },
    { id: 'comb', title: 'Combinational processes' },
    { id: 'clocked', title: 'Clocked logic' },
    { id: 'fsm', title: 'State machines' },
    { id: 'more', title: 'More VHDL features' },
    { id: 'numeric', title: 'Numbers, types and functions' }
];

const P = [];
const add = p => P.push(p);
const comb = (model, extra) => Object.assign({ model }, extra || {});

/* ================================================================ start */
add({
    id: 'led_switch', sec: 'start', title: 'A switch and an LED',
    body: `Each problem describes a small circuit. You write its VHDL, press **Check** (or Ctrl+Enter), and the checker simulates your design here in your browser against a reference, with many test inputs. When every output matches, the problem is solved. A reference solution appears once you have solved a problem, or after three checks.

A VHDL design has two parts. The **entity** is the outside: the ports, with their direction and type. It is given; leave it as it is. The **architecture** is the inside, and that is what you write. The two lines at the top make the type {std_logic} available:

~~~
library ieee;
use ieee.std_logic_1164.all;
~~~

A {std_logic} is one wire; its everyday values are {'0'} and {'1'}, in single quotes.

A development board has slide switches and LEDs. Connect the switch {sw} to the LED {led}, so that the LED is lit while the switch is up. One statement does it, between {begin} and {end architecture}:

~~~
led <= sw;
~~~

{<=} is a **signal assignment**, and it is **concurrent**: it does not run once like a line of a program, it stays true for as long as the circuit exists, like a wire.`,
    ports: [['sw', 'in', 1], ['led', 'out', 1]],
    sol: 'led <= sw;',
    test: comb(i => ({ led: i.sw }))
});
add({
    id: 'active_low', sec: 'start', title: 'An active-low LED',
    body: `On many boards the LEDs are wired so that a {'0'} turns them on: they are **active low**, and such signals often carry an {_n} at the end of their name. Light the LED {led_n} while the button {btn} is pressed, that is while {btn} is {'1'}.

VHDL writes the logic operators as words: {not}, {and}, {or}, {nand}, {nor}, {xor} and {xnor}. Symbols such as {~} or {!} do not exist. Words like these, and {in}, {out}, {signal} and about a hundred more, are **reserved**: they cannot name a port or a signal.`,
    ports: [['btn', 'in', 1], ['led_n', 'out', 1]],
    sol: 'led_n <= not btn;',
    test: comb(i => ({ led_n: 1n - i.btn }))
});

/* ================================================================ gates */
add({
    id: 'majority3', sec: 'gates', title: 'Majority vote',
    body: `Three sensors watch the same thing, and any one of them may fail. Trust the majority: {y} is {'1'} when at least two of {a}, {b} and {c} are {'1'}. As a sum of products:

~~~
y = ab + ac + bc
~~~

VHDL lets you chain the **same** operator, {a and b and c}, but mixing different ones needs parentheses: {a and b or c} is an error. VHDL gives {and} and {or} the same precedence on purpose, so that you always say what you mean.`,
    ports: [['a', 'in', 1], ['b', 'in', 1], ['c', 'in', 1], ['y', 'out', 1]],
    sol: 'y <= (a and b) or (a and c) or (b and c);',
    test: comb(i => ({ y: maj(i.a, i.b, i.c) }))
});
add({
    id: 'xor_sop', sec: 'gates', title: 'XOR from AND, OR and NOT',
    body: `Any logic function can be written as a **sum of products**: one AND term for each input combination that gives a {'1'}, all ORed together. XOR is {'1'} when exactly one input is {'1'}:

~~~
y = a'b + ab'
~~~

Write {y} that way, with {and}, {or} and {not} only, without {xor}. (The checker compares behaviour, not style, so this one is on your honour.)

{not} binds tighter than the other operators, so {not a and b} means {(not a) and b}.`,
    ports: [['a', 'in', 1], ['b', 'in', 1], ['y', 'out', 1]],
    sol: 'y <= (not a and b) or (a and not b);',
    test: comb(i => ({ y: i.a ^ i.b }))
});
add({
    id: 'minterms', sec: 'gates', title: 'From a truth table',
    body: `A truth table says when a function is {'1'}. This one, {f(a, b, c)} with {a} as the most significant input, is {'1'} for exactly four rows:

~~~
a b c | f
0 0 1 | 1
0 1 0 | 1
1 0 1 | 1
1 1 1 | 1
~~~

and {'0'} for the other four. Write {f} as a sum of **minterms**, one product for each row, or simplify it first with a Karnaugh map. Any equivalent expression passes.`,
    ports: [['a', 'in', 1], ['b', 'in', 1], ['c', 'in', 1], ['f', 'out', 1]],
    sol: 'f <= (not b and c) or (a and c) or (not a and b and not c);',
    test: comb(i => ({ f: B([1, 2, 5, 7].includes(Number((i.a << 2n) | (i.b << 1n) | i.c))) }))
});
add({
    id: 'half_adder', sec: 'gates', title: 'Half adder',
    body: `Adding two bits gives a 2-bit result: {0 + 0 = 00}, {0 + 1 = 01}, {1 + 1 = 10}. The low bit is the **sum** {s}, the high bit the **carry** {c}. That is a **half adder**; it is "half" because it has no carry input.

Build it: {s} is {'1'} when exactly one input is {'1'}, {c} when both are.`,
    ports: [['a', 'in', 1], ['b', 'in', 1], ['s', 'out', 1], ['c', 'out', 1]],
    sol: 's <= a xor b;\nc <= a and b;',
    test: comb(i => ({ s: i.a ^ i.b, c: i.a & i.b }))
});
add({
    id: 'full_adder', sec: 'gates', title: 'Full adder',
    body: `A **full adder** adds three bits, {a}, {b} and a carry-in {cin}, into a sum {s} and a carry-out {cout}. Chained, full adders add numbers of any width, one bit position each.

{s} is {'1'} for an odd number of ones, {a xor b xor cin}. {cout} is {'1'} when at least two inputs are {'1'}: the majority vote of an earlier problem.`,
    ports: [['a', 'in', 1], ['b', 'in', 1], ['cin', 'in', 1], ['s', 'out', 1], ['cout', 'out', 1]],
    sol: 's    <= a xor b xor cin;\ncout <= (a and b) or (a and cin) or (b and cin);',
    test: comb(i => ({ s: i.a ^ i.b ^ i.cin, cout: maj(i.a, i.b, i.cin) }))
});
add({
    id: 'compare1', sec: 'gates', title: 'A 1-bit comparator',
    body: `A 1-bit **comparator** has three outputs, and exactly one of them is {'1'}:

- {gt}: {a} is greater than {b}, which for bits means {a} is 1 and {b} is 0
- {eq}: {a} equals {b}
- {lt}: {a} is less than {b}

Chained, such cells compare whole numbers; a later problem builds an 8-bit comparator from 4-bit ones.`,
    ports: [['a', 'in', 1], ['b', 'in', 1], ['gt', 'out', 1], ['eq', 'out', 1], ['lt', 'out', 1]],
    sol: 'gt <= a and not b;\neq <= a xnor b;\nlt <= not a and b;',
    test: comb(i => ({ gt: i.a & (1n - i.b), eq: 1n - (i.a ^ i.b), lt: (1n - i.a) & i.b }))
});
add({
    id: 'car_alarm', sec: 'gates', title: 'Signals inside: a car alarm',
    body: `Inside an architecture you can declare wires of your own, called **signals**. They go between {is} and {begin}:

~~~
architecture rtl of top_module is
  signal intrusion : std_logic;
begin
  ...
~~~

A car alarm has three sensors, {door}, {window} and {motion}, and any of them reports an intrusion. The {siren} sounds only while the alarm is {armed}; the LED {warn_led} shows an intrusion even when the alarm is off, so the owner notices. Compute the intrusion once, in a signal, and use it for both outputs.

VHDL-2008 also lets an architecture read its own output ports, which older VHDL forbids; a signal works in every version.`,
    ports: [['armed', 'in', 1], ['door', 'in', 1], ['window', 'in', 1], ['motion', 'in', 1], ['siren', 'out', 1], ['warn_led', 'out', 1]],
    solDecls: 'signal intrusion : std_logic;',
    sol: 'intrusion <= door or window or motion;\nsiren     <= armed and intrusion;\nwarn_led  <= intrusion;',
    test: comb(i => { const x = i.door | i.window | i.motion; return { siren: i.armed & x, warn_led: x }; })
});
add({
    id: 'tristate', sec: 'gates', title: 'Nine values: a tri-state buffer',
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
    id: 'resolved', sec: 'gates', title: 'Two drivers on one wire',
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
    id: 'bus_split', sec: 'vectors', title: 'Vectors and slices',
    body: `A **vector** is a bundle of wires with one name. {std_logic_vector(7 downto 0)} has eight elements, numbered 7 down to 0 from left to right, so the leftmost one, {data(7)}, is the most significant bit.

An element is picked with round brackets, {data(0)}, and neighbouring elements with a **slice**, {data(7 downto 4)}. A slice runs in the same direction as its vector.

Split the byte {data}: its upper four bits go to {hi} and its lower four to {lo}. Also output the most significant bit as {sign}, which is the sign of a signed number, and the least significant one as {odd}, which tells whether the number is odd.

An assignment copies element by element from left to right, and the widths must match exactly: VHDL never pads or cuts for you.`,
    ports: [['data', 'in', 8], ['hi', 'out', 4], ['lo', 'out', 4], ['sign', 'out', 1], ['odd', 'out', 1]],
    sol: 'hi   <= data(7 downto 4);\nlo   <= data(3 downto 0);\nsign <= data(7);\nodd  <= data(0);',
    test: comb(i => ({ hi: i.data >> 4n, lo: i.data & 15n, sign: bit(i.data, 7), odd: bit(i.data, 0) }))
});
add({
    id: 'nibble_swap', sec: 'vectors', title: 'Concatenation',
    body: `The concatenation operator {&} joins vectors and single bits into a longer vector, left part first. The width of the result is the sum of the widths:

~~~
y <= "00" & a;    -- two zero bits, then the bits of a
~~~

Make two outputs from the byte {data}:

- {swapped}: its two halves exchanged, the lower four bits first
- {wide}: {data} as a 12-bit number, with four {'0'} bits in front`,
    ports: [['data', 'in', 8], ['swapped', 'out', 8], ['wide', 'out', 12]],
    sol: 'swapped <= data(3 downto 0) & data(7 downto 4);\nwide    <= "0000" & data;',
    test: comb(i => ({ swapped: ((i.data & 15n) << 4n) | (i.data >> 4n), wide: i.data }))
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
    test: comb(i => { let r = 0n; for (let k = 0; k < 8; k++) r = (r << 1n) | bit(i.a, k); return { y: r }; })
});
add({
    id: 'bit_masks', sec: 'vectors', title: 'Bitwise operators: masks',
    body: `The logic operators work on vectors **bitwise**: bit {i} of {x and mask} is {x(i) and mask(i)}, and both sides must have the same width. Masks are how software and hardware set, clear and flip chosen bits:

- {set_bits}: {x} with every bit set where {mask} has a {'1'}
- {clear_bits}: {x} with every bit cleared where {mask} has a {'1'}
- {flip_bits}: {x} with every bit inverted where {mask} has a {'1'}

{not} works on a whole vector too: {not mask} inverts all of its bits.`,
    ports: [['x', 'in', 8], ['mask', 'in', 8], ['set_bits', 'out', 8], ['clear_bits', 'out', 8], ['flip_bits', 'out', 8]],
    sol: 'set_bits   <= x or mask;\nclear_bits <= x and not mask;\nflip_bits  <= x xor mask;',
    test: comb(i => ({ set_bits: i.x | i.mask, clear_bits: i.x & (i.mask ^ 255n), flip_bits: i.x ^ i.mask }))
});
add({
    id: 'zero_detect', sec: 'vectors', title: 'Comparing vectors',
    body: `A comparison such as {x = "00000000"} gives a {boolean}, true or false, not a bit. A conditional assignment turns it into one:

~~~
flag <= '1' when x = "00000000" else '0';
~~~

Detect two special values of the byte {x}: {zero} is {'1'} when all its bits are {'0'}, and {ones} when all are {'1'}.

A classic trap: {x = (others => '0')} looks natural, but it is an error. {others} needs to know the width, and an operand of {=} does not tell it. Write the bit string out, or as hexadecimal ({x"00"}), or use the VHDL-2008 reduction {or x}, which is {'0'} only when every bit is {'0'}.`,
    ports: [['x', 'in', 8], ['zero', 'out', 1], ['ones', 'out', 1]],
    sol: `zero <= '1' when x = x"00" else '0';\nones <= '1' when x = x"FF" else '0';`,
    test: comb(i => ({ zero: B(i.x === 0n), ones: B(i.x === 255n) }))
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
add({
    id: 'interleave', sec: 'vectors', title: 'Interleaving bits',
    body: `**Interleaving** merges two vectors bit by bit, as some memory address schemes do. With the 4-bit inputs {a} and {b}, the 8-bit output {y} is:

~~~
y = a(3) b(3) a(2) b(2) a(1) b(1) a(0) b(0)
~~~

so {y(2*i + 1) = a(i)} and {y(2*i) = b(i)}. A {for} loop in a process writes this once for every {i}:

~~~
process(all)
begin
  for i in 0 to 3 loop
    ...
  end loop;
end process;
~~~

The loop does not take any time to run: synthesis unrolls it into eight wires.`,
    ports: [['a', 'in', 4], ['b', 'in', 4], ['y', 'out', 8]],
    sol: 'process(all)\nbegin\n  for i in 0 to 3 loop\n    y(2 * i + 1) <= a(i);\n    y(2 * i)     <= b(i);\n  end loop;\nend process;',
    test: comb(i => { let y = 0n; for (let k = 0; k < 4; k++) y |= (bit(i.a, k) << BigInt(2 * k + 1)) | (bit(i.b, k) << BigInt(2 * k)); return { y }; })
});
add({
    id: 'bit_double', sec: 'vectors', title: 'Doubling every bit',
    body: `Repeat every bit of the 4-bit input {x} twice, as when a picture is stretched to double its width: {x = "1010"} gives {y = "11001100"}.

A **generate** statement copies concurrent statements once for each index, and inside it the index is a constant:

~~~
g: for i in 0 to 3 generate
  y(2*i + 1 downto 2*i) <= ...;
end generate;
~~~

An aggregate fits the 2-bit slice: {(others => x(i))} fills every element of whatever it is assigned to.`,
    ports: [['x', 'in', 4], ['y', 'out', 8]],
    sol: 'g: for i in 0 to 3 generate\n  y(2 * i + 1 downto 2 * i) <= (others => x(i));\nend generate;',
    test: comb(i => { let y = 0n; for (let k = 0; k < 4; k++) y |= bit(i.x, k) * (3n << BigInt(2 * k)); return { y }; })
});

/* ================================================================= hier */
add({
    id: 'fa_from_ha', sec: 'hier', title: 'A full adder from half adders',
    body: `Designs are built from smaller designs. This problem provides a half adder:

~~~
entity half_adder is
  port (a, b : in std_logic; s, c : out std_logic);
end entity;
~~~

Build a full adder from two of them and an OR gate, the textbook way: the first half adder adds {a} and {b}, the second adds that sum and {cin}, and the carry-out is set when either half adder carries.

An instance needs a label and a **port map**. The shortest way names the entity directly:

~~~
ha1: entity work.half_adder
  port map (a => a, b => b, s => s1, c => c1);
~~~

Declare signals for the wires between the parts. {work} is the library your own design units go into. The classic alternative declares a **component** with the same ports and then instantiates it by name.`,
    lib: ['half_adder'],
    ports: [['a', 'in', 1], ['b', 'in', 1], ['cin', 'in', 1], ['s', 'out', 1], ['cout', 'out', 1]],
    solDecls: 'signal s1, c1, c2 : std_logic;',
    sol: 'ha1: entity work.half_adder port map (a => a,  b => b,   s => s1, c => c1);\nha2: entity work.half_adder port map (a => s1, b => cin, s => s,  c => c2);\ncout <= c1 or c2;',
    test: comb(i => ({ s: i.a ^ i.b ^ i.cin, cout: maj(i.a, i.b, i.cin) }))
});
add({
    id: 'mux4_tree', sec: 'hier', title: 'A multiplexer tree',
    body: `The provided {mux2} picks one of two 4-bit inputs: {a} while {sel} is {'0'}, {b} while it is {'1'}.

~~~
entity mux2 is
  port (
    a, b : in  std_logic_vector(3 downto 0);
    sel  : in  std_logic;
    y    : out std_logic_vector(3 downto 0)
  );
end entity;
~~~

Build a 4-to-1 multiplexer as a **tree** of three of them. Two first-level multiplexers choose within the pairs {d0, d1} and {d2, d3} using {sel(0)}, and the third chooses between their results using {sel(1)}, so that {sel = "10"} selects {d2}.

Connect the ports **by name**, {a => d0}: the order then does not matter, and the map reads like a wiring list. A single element of a vector, such as {sel(0)}, can be connected directly.`,
    lib: ['mux2'],
    ports: [['d0', 'in', 4], ['d1', 'in', 4], ['d2', 'in', 4], ['d3', 'in', 4], ['sel', 'in', 2], ['y', 'out', 4]],
    solDecls: 'signal m0, m1 : std_logic_vector(3 downto 0);',
    sol: 'u0: entity work.mux2 port map (a => d0, b => d1, sel => sel(0), y => m0);\nu1: entity work.mux2 port map (a => d2, b => d3, sel => sel(0), y => m1);\nu2: entity work.mux2 port map (a => m0, b => m1, sel => sel(1), y => y);',
    test: comb(i => ({ y: [i.d0, i.d1, i.d2, i.d3][Number(i.sel)] }))
});
add({
    id: 'cmp8_cascade', sec: 'hier', title: 'Cascading comparators',
    body: `The provided {cmp4} compares two unsigned 4-bit numbers:

~~~
entity cmp4 is
  port (
    a, b       : in  std_logic_vector(3 downto 0);
    gt, eq, lt : out std_logic
  );
end entity;
~~~

Build an 8-bit comparator from two of them: compare the upper halves and the lower halves separately. The upper result decides, unless the upper halves are equal:

- {a > b} when the upper half is greater, or the upper halves are equal and the lower half is greater
- {a = b} when both halves are equal
- {a < b} likewise

This time connect the ports **by position**: without names, in the order of the declaration, {port map (a(7 downto 4), b(7 downto 4), gt_h, eq_h, lt_h)}. Positional maps are short but fragile: if someone reorders the ports of {cmp4}, the design quietly connects the wrong wires.`,
    lib: ['cmp4'],
    ports: [['a', 'in', 8], ['b', 'in', 8], ['gt', 'out', 1], ['eq', 'out', 1], ['lt', 'out', 1]],
    solDecls: 'signal gt_h, eq_h, lt_h, gt_l, eq_l, lt_l : std_logic;',
    sol: `hi: entity work.cmp4 port map (a(7 downto 4), b(7 downto 4), gt_h, eq_h, lt_h);
lo: entity work.cmp4 port map (a(3 downto 0), b(3 downto 0), gt_l, eq_l, lt_l);
gt <= gt_h or (eq_h and gt_l);
eq <= eq_h and eq_l;
lt <= lt_h or (eq_h and lt_l);`,
    test: comb(i => ({ gt: B(i.a > i.b), eq: B(i.a === i.b), lt: B(i.a < i.b) }),
        { gen: R => { const a = R.bits(8), k = R.int(4); return { a, b: k === 0 ? a : k === 1 ? (a & 0xF0n) | R.bits(4) : R.bits(8) }; }, random: 300 })
});
add({
    id: 'delay_line', sec: 'hier', title: 'A delay line with enable',
    body: `The provided {dff_en} is a flip-flop with an enable: at a rising edge of {clk} it stores {d}, but only while {en} is {'1'}.

~~~
entity dff_en is
  port (clk, en, d : in std_logic; q : out std_logic);
end entity;
~~~

Chain four of them into a delay line: {d} enters the first, each output feeds the next input, and all four share {clk} and {en}, so the line moves only while {en} is {'1'}. Output the four stages on {taps}, {taps(0)} being the first stage and {taps(3)} the last.

With the wires between the stages in one vector, a {for ... generate} makes all four instances in one statement: stage {i} reads element {i} and writes element {i + 1}.

The checker clocks your design. Until every stage has been written once, {taps} still holds {'U'}, and those cycles are not checked.`,
    lib: ['dff_en'],
    ports: [['clk', 'in', 1], ['en', 'in', 1], ['d', 'in', 1], ['taps', 'out', 4]],
    solDecls: 'signal chain : std_logic_vector(4 downto 0);',
    sol: `chain(0) <= d;
g: for i in 0 to 3 generate
  u: entity work.dff_en port map (clk => clk, en => en, d => chain(i), q => chain(i + 1));
end generate;
taps <= chain(4 downto 1);`,
    test: {
        clk: 'clk', cycles: 120,
        init: () => [null, null, null, null],
        gen: (R, k) => ({ en: k < 4 ? 1n : B(R.chance(0.7)), d: R.bit() }),
        out: s => ({ taps: s.some(x => x === null) ? null : (s[3] << 3n) | (s[2] << 2n) | (s[1] << 1n) | s[0] }),
        next: (s, i) => (i.en ? [i.d, s[0], s[1], s[2]] : s)
    }
});
add({
    id: 'addsub_overflow', sec: 'hier', title: 'Adder-subtractor with overflow',
    body: `In two's complement, {a - b = a + (not b) + 1}: an adder subtracts when it inverts {b} and adds 1 through its carry-in.

Build a 4-bit adder-subtractor from four instances of the provided full adder {fa} ({a}, {b}, {cin} in; {s}, {cout} out), made with a {for ... generate}:

- {sub = '0'} gives {s = a + b}, {sub = '1'} gives {s = a - b}
- XOR each bit of {b} with {sub}, and feed {sub} into the first carry
- {cout} is the last carry-out
- {ovf} flags a **signed overflow**: the result does not fit in four signed bits. That happens exactly when the carry into the last bit differs from the carry out of it.

Inside the generate, {i} is a constant, so {c(i)} and {c(i + 1)} pick neighbouring carries from a carry vector one bit longer than the inputs. VHDL-2008 can XOR a vector with a single bit: {b xor sub}.`,
    lib: ['fa'],
    ports: [['a', 'in', 4], ['b', 'in', 4], ['sub', 'in', 1], ['s', 'out', 4], ['cout', 'out', 1], ['ovf', 'out', 1]],
    solDecls: 'signal bx : std_logic_vector(3 downto 0);\nsignal c  : std_logic_vector(4 downto 0);',
    sol: `bx   <= b xor sub;
c(0) <= sub;
g: for i in 0 to 3 generate
  u: entity work.fa port map (a => a(i), b => bx(i), cin => c(i), s => s(i), cout => c(i + 1));
end generate;
cout <= c(4);
ovf  <= c(3) xor c(4);`,
    test: comb(i => {
        const bx = i.sub ? (i.b ^ 15n) : i.b;
        let c = i.sub, s = 0n, c3 = 0n;
        for (let k = 0; k < 4; k++) {
            const x = bit(i.a, k), y = bit(bx, k);
            s |= (x ^ y ^ c) << BigInt(k);
            if (k === 3) c3 = c;
            c = (x & y) | (c & (x ^ y));
        }
        return { s, cout: c, ovf: c3 ^ c };
    })
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

/* ================================================================= comb */
add({
    id: 'arbiter', sec: 'comb', title: 'if and elsif: a priority arbiter',
    body: `A **process** holds statements that run one after another, like a program, every time one of the signals it reads changes. {process(all)} (VHDL-2008) means "every signal read inside", which is what combinational logic needs. Inside, {if ... elsif ... else} chooses, and the first true condition wins:

~~~
if cond then
  ...
elsif other_cond then
  ...
else
  ...
end if;
~~~

Note the spelling {elsif}, and {end if;} at the end. A condition compares: {req(2) = '1'}.

Three devices share a bus and ask for it on {req}. Grant it to one of them with the one-hot output {grant}: the device with the highest index wins, so {req = "011"} gives {grant = "010"}, and no request gives {"000"}. Also output {busy}, which is {'1'} whenever a device has the bus.`,
    ports: [['req', 'in', 3], ['grant', 'out', 3], ['busy', 'out', 1]],
    sol: `process(all)
begin
  if req(2) = '1' then
    grant <= "100";
  elsif req(1) = '1' then
    grant <= "010";
  elsif req(0) = '1' then
    grant <= "001";
  else
    grant <= "000";
  end if;
end process;

busy <= '1' when req /= "000" else '0';`,
    test: comb(i => ({ grant: bit(i.req, 2) ? 4n : bit(i.req, 1) ? 2n : bit(i.req, 0) ? 1n : 0n, busy: B(i.req) }))
});
add({
    id: 'alu4', sec: 'comb', title: 'case: a small ALU',
    body: `A {case} statement picks one branch by the value of an expression:

~~~
case op is
  when "00"   => ...
  when "01"   => ...
  when others => ...
end case;
~~~

The choices must cover every possible value. A {std_logic} has nine values, not two, so a 2-bit {std_logic_vector} has 81 of them: {when others} covers the ones you do not name.

Build a small 4-bit **ALU** that computes {y} from {a} and {b} as {op} says:

- {"00"}: {a + b}
- {"01"}: {a - b}
- {"10"}: {a and b}
- {"11"}: {a or b}

The sums wrap around in 4 bits. A {std_logic_vector} has no arithmetic, so convert it: {std_logic_vector(unsigned(a) + unsigned(b))}, with {use ieee.numeric_std.all;} at the top (the template has it).`,
    numeric: true,
    ports: [['a', 'in', 4], ['b', 'in', 4], ['op', 'in', 2], ['y', 'out', 4]],
    sol: `process(all)
begin
  case op is
    when "00"   => y <= std_logic_vector(unsigned(a) + unsigned(b));
    when "01"   => y <= std_logic_vector(unsigned(a) - unsigned(b));
    when "10"   => y <= a and b;
    when others => y <= a or b;
  end case;
end process;`,
    test: comb(i => ({ y: [(i.a + i.b) & 15n, (i.a - i.b) & 15n, i.a & i.b, i.a | i.b][Number(i.op)] }))
});
add({
    id: 'latch_fix', sec: 'comb', title: 'Find the latches',
    body: `A combinational process must give each of its outputs a value **every** time it runs. If some path skips an output, the output keeps its old value, and keeping a value takes memory: synthesis builds a **latch**. In logic like this it is almost always a bug.

This thermostat has that bug twice. Fix it so that:

- {heater} is on while the room is too cold ({temp_low})
- {fan} is on while the room is too hot ({temp_high}), but never together with the heater: if both sensors report, which only a broken sensor can cause, the heater wins

The usual cure is a **default value** at the top of the process, which a later assignment overrides. The checker warns about latches, and its test vectors catch the old values a latch keeps.`,
    ports: [['temp_low', 'in', 1], ['temp_high', 'in', 1], ['heater', 'out', 1], ['fan', 'out', 1]],
    template: `${H}
entity top_module is
  port (
    temp_low  : in  std_logic;
    temp_high : in  std_logic;
    heater    : out std_logic;
    fan       : out std_logic
  );
end entity;

architecture rtl of top_module is
begin

  process(all)
  begin
    if temp_low = '1' then
      heater <= '1';
    elsif temp_high = '1' then
      fan <= '1';
    end if;
  end process;

end architecture;
`,
    sol: `process(all)
begin
  heater <= '0';
  fan    <= '0';
  if temp_low = '1' then
    heater <= '1';
  elsif temp_high = '1' then
    fan <= '1';
  end if;
end process;`,
    test: comb(i => ({ heater: i.temp_low, fan: i.temp_high & (1n - i.temp_low) }), { random: 60 })
});
add({
    id: 'opcode_decode', sec: 'comb', title: "case?: an instruction decoder",
    body: `A processor decodes the first bits of every instruction to learn what to do. Here the 4-bit {opcode} names one of four kinds of instruction, and the one-hot output {ctrl} enables the matching part of the processor:

~~~
opcode   instruction   ctrl
1---     jump          1000
01--     branch        0100
001-     load/store    0010
0001     alu           0001
0000     nop           0000
~~~

A {-} means "this bit does not matter". VHDL-2008's **matching case**, {case?}, understands exactly that:

~~~
case? opcode is
  when "1---" => ctrl <= "1000";
  ...
  when others => ctrl <= "0000";
end case?;
~~~

A value matches a choice when every bit that is not {-} agrees. An ordinary {case} would compare the {'-'} characters literally and never match.`,
    ports: [['opcode', 'in', 4], ['ctrl', 'out', 4]],
    sol: `process(all)
begin
  case? opcode is
    when "1---" => ctrl <= "1000";
    when "01--" => ctrl <= "0100";
    when "001-" => ctrl <= "0010";
    when "0001" => ctrl <= "0001";
    when others => ctrl <= "0000";
  end case?;
end process;`,
    test: comb(i => ({ ctrl: i.opcode >= 8n ? 8n : i.opcode >= 4n ? 4n : i.opcode >= 2n ? 2n : i.opcode }))
});
add({
    id: 'checksum', sec: 'comb', title: 'Variables: a checksum',
    body: `Signals change only after a process has finished. For a value that must change along the way, such as a running total, use a **variable**: declared inside the process, assigned with {:=}, and changed at once.

~~~
process(all)
  variable acc : unsigned(7 downto 0);
begin
  acc := (others => '0');
  for i in 0 to 3 loop
    acc := acc + ...;
  end loop;
  sum <= std_logic_vector(acc);
end process;
~~~

Network protocols check their data with simple sums. From the 32-bit {word}, compute two checks over its four bytes:

- {sum}: the bytes added together, modulo 256, so the 8-bit {unsigned} addition simply wraps around
- {xsum}: the bytes XORed together

Byte {i} is {word(8*i + 7 downto 8*i)}; inside the loop, that slice moves along with {i}.`,
    numeric: true,
    ports: [['word', 'in', 32], ['sum', 'out', 8], ['xsum', 'out', 8]],
    sol: `process(all)
  variable acc : unsigned(7 downto 0);
  variable x   : std_logic_vector(7 downto 0);
begin
  acc := (others => '0');
  x   := (others => '0');
  for i in 0 to 3 loop
    acc := acc + unsigned(word(8 * i + 7 downto 8 * i));
    x   := x xor word(8 * i + 7 downto 8 * i);
  end loop;
  sum  <= std_logic_vector(acc);
  xsum <= x;
end process;`,
    test: comb(i => { const b = [0, 1, 2, 3].map(k => (i.word >> BigInt(8 * k)) & 255n); return { sum: (b[0] + b[1] + b[2] + b[3]) & 255n, xsum: b[0] ^ b[1] ^ b[2] ^ b[3] }; })
});

/* ============================================================== clocked */
add({
    id: 'reg_load', sec: 'clocked', title: 'A register with load and clear',
    body: `A process that reacts only to the clock builds **registers**:

~~~
process(clk)
begin
  if rising_edge(clk) then
    ...
  end if;
end process;
~~~

{rising_edge(clk)} is true at the moment {clk} goes from {'0'} to {'1'}. Every signal assigned inside that {if} becomes a flip-flop, so it holds its value between the edges.

Build an 8-bit register {q} with two controls, both acting at the rising edge: {clear} sets it to zero, {load} stores {d}, and with neither the register keeps its value. {clear} wins over {load}.`,
    ports: [['clk', 'in', 1], ['clear', 'in', 1], ['load', 'in', 1], ['d', 'in', 8], ['q', 'out', 8]],
    sol: `process(clk)
begin
  if rising_edge(clk) then
    if clear = '1' then
      q <= (others => '0');
    elsif load = '1' then
      q <= d;
    end if;
  end if;
end process;`,
    test: {
        clk: 'clk', cycles: 120,
        init: () => null,
        gen: (R, k) => ({ clear: k === 0 ? 1n : B(R.chance(0.1)), load: B(R.chance(0.4)), d: R.bits(8) }),
        out: s => ({ q: s }),
        next: (s, i) => (i.clear ? 0n : i.load ? i.d : s)
    }
});
add({
    id: 'signals_vs_variables', sec: 'clocked', title: 'Signals and variables',
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
    id: 'resets', sec: 'clocked', title: 'Synchronous and asynchronous reset',
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
let edgeLevel = 0n;
add({
    id: 'edge_detect', sec: 'clocked', title: 'Edge detector',
    body: `A button or a slow sensor stays {'1'} for many clock cycles, yet often only the moment it changes matters. An **edge detector** keeps the input of the previous clock cycle in a register and compares:

~~~
tick = level now, and not level one cycle ago
~~~

Build it: {tick} is {'1'} during the first clock cycle in which {level} is {'1'} after having been {'0'}. Store {level} in a register at each rising edge of {clk}, and compute {tick} outside the clocked process, from {level} and that register.`,
    ports: [['clk', 'in', 1], ['level', 'in', 1], ['tick', 'out', 1]],
    solDecls: 'signal prev : std_logic;',
    sol: `process(clk)
begin
  if rising_edge(clk) then
    prev <= level;
  end if;
end process;

tick <= level and not prev;`,
    test: {
        clk: 'clk', cycles: 120,
        init: () => null,
        gen: (R, k) => { if (k === 0) edgeLevel = 0n; if (R.chance(0.3)) edgeLevel = 1n - edgeLevel; return { level: edgeLevel }; },
        out: (s, i) => ({ tick: s === null ? (i.level ? null : 0n) : i.level & (1n - s) }),
        next: (s, i) => i.level
    }
});
add({
    id: 'shift_universal', sec: 'clocked', title: 'A universal shift register',
    body: `A **universal shift register** can hold its value, shift either way, or load a new value, as {mode} selects at each rising edge of {clk}:

- {"00"}: hold
- {"01"}: shift left: every bit moves one place up, and {sin} enters at bit 0
- {"10"}: shift right: every bit moves one place down, and {sin} enters at bit 7
- {"11"}: load {d} in parallel

Concatenation writes a shift in one line: {q(6 downto 0) & sin} is the left shift of an 8-bit {q}.

The register is the output {q} itself. Reading an output port inside its own architecture is allowed in VHDL-2008; with older VHDL you would keep an internal signal and copy it to {q}.`,
    ports: [['clk', 'in', 1], ['mode', 'in', 2], ['sin', 'in', 1], ['d', 'in', 8], ['q', 'out', 8]],
    sol: `process(clk)
begin
  if rising_edge(clk) then
    case mode is
      when "01"   => q <= q(6 downto 0) & sin;
      when "10"   => q <= sin & q(7 downto 1);
      when "11"   => q <= d;
      when others => null;
    end case;
  end if;
end process;`,
    test: {
        clk: 'clk', cycles: 140,
        init: () => null,
        gen: (R, k) => ({ mode: k === 0 ? 3n : R.bits(2), sin: R.bit(), d: R.bits(8) }),
        out: s => ({ q: s }),
        next: (s, i) => {
            if (i.mode === 3n) return i.d;
            if (s === null || i.mode === 0n) return s;
            return i.mode === 1n ? ((s << 1n) | i.sin) & 255n : (i.sin << 7n) | (s >> 1n);
        }
    }
});
add({
    id: 'bcd_counter', sec: 'clocked', title: 'A decade counter',
    body: `A **decade counter** counts 0, 1, ..., 9 and starts over: one decimal digit of a clock or a frequency meter. Several of them in a chain count in decimal.

At each rising edge of {clk}: {reset} sets the count to 0; otherwise, while {en} is {'1'}, the count goes up by one, from 9 back to 0. The output {q} is the count, and {carry} is {'1'} while the count is 9 and {en} is {'1'}: exactly when the next digit should count too.

Keep the count in an {unsigned(3 downto 0)} signal, so that {count + 1} is defined. A 4-bit counter wraps at 15 by itself; this one has to be told to wrap at 9.`,
    numeric: true,
    ports: [['clk', 'in', 1], ['reset', 'in', 1], ['en', 'in', 1], ['q', 'out', 4], ['carry', 'out', 1]],
    solDecls: 'signal count : unsigned(3 downto 0);',
    sol: `process(clk)
begin
  if rising_edge(clk) then
    if reset = '1' then
      count <= (others => '0');
    elsif en = '1' then
      if count = 9 then
        count <= (others => '0');
      else
        count <= count + 1;
      end if;
    end if;
  end if;
end process;

q     <= std_logic_vector(count);
carry <= '1' when count = 9 and en = '1' else '0';`,
    test: {
        clk: 'clk', cycles: 140,
        init: () => null,
        gen: (R, k) => ({ reset: k === 0 ? 1n : B(R.chance(0.03)), en: B(R.chance(0.8)) }),
        out: (s, i) => ({ q: s, carry: s === null ? null : B(s === 9n && i.en) }),
        next: (s, i) => (i.reset ? 0n : s === null ? null : i.en ? (s === 9n ? 0n : s + 1n) : s)
    }
});
add({
    id: 'lfsr8', sec: 'clocked', title: 'LFSR: pseudo-random numbers',
    body: `A **linear-feedback shift register** shifts left at every clock edge and feeds back the XOR of a few chosen bits, its **taps**. With the right taps it runs through all 255 non-zero 8-bit values before it repeats, in an order that looks random: a cheap source of test patterns and noise.

Build an 8-bit LFSR {q}. At each rising edge of {clk}: if {load} is {'1'}, store {seed}; otherwise shift left, and let the feedback bit enter at bit 0:

~~~
q <= q(6 downto 0) & (q(7) xor q(5) xor q(4) xor q(3));
~~~

These taps belong to the polynomial x^8 + x^6 + x^5 + x^4 + 1, which gives the full length of 255 states. The all-zero state is a trap, because it would stay zero forever, so the tests never load it.`,
    ports: [['clk', 'in', 1], ['load', 'in', 1], ['seed', 'in', 8], ['q', 'out', 8]],
    sol: `process(clk)
begin
  if rising_edge(clk) then
    if load = '1' then
      q <= seed;
    else
      q <= q(6 downto 0) & (q(7) xor q(5) xor q(4) xor q(3));
    end if;
  end if;
end process;`,
    test: {
        clk: 'clk', cycles: 160,
        init: () => null,
        gen: (R, k) => { const seed = R.bits(8) || 1n; return { load: k === 0 || R.chance(0.04) ? 1n : 0n, seed }; },
        out: s => ({ q: s }),
        next: (s, i) => (i.load ? i.seed : s === null ? null : ((s << 1n) & 255n) | (bit(s, 7) ^ bit(s, 5) ^ bit(s, 4) ^ bit(s, 3)))
    }
});
add({
    id: 'tick_div', sec: 'clocked', title: 'A tick every five clocks',
    body: `Many circuits need a slow, regular pulse, a **tick**: to blink an LED, to sample a button, to pace a display. A counter makes one: count the clock cycles and pulse when the count wraps.

Build a divide-by-5 tick generator. A counter runs 0, 1, 2, 3, 4, 0, ... at each rising edge of {clk}; {reset} (synchronous) sets it to 0; and {tick} is {'1'} while the count is 4, so in exactly one cycle out of five.

An {integer range 0 to 4} signal makes a natural counter here: the range documents the values, synthesis makes it three bits wide, and the simulation stops with an error if the count ever leaves the range.`,
    ports: [['clk', 'in', 1], ['reset', 'in', 1], ['tick', 'out', 1]],
    solDecls: 'signal count : integer range 0 to 4;',
    sol: `process(clk)
begin
  if rising_edge(clk) then
    if reset = '1' or count = 4 then
      count <= 0;
    else
      count <= count + 1;
    end if;
  end if;
end process;

tick <= '1' when count = 4 else '0';`,
    test: {
        clk: 'clk', cycles: 120,
        init: () => null,
        gen: (R, k) => ({ reset: k === 0 ? 1n : B(R.chance(0.03)) }),
        out: s => ({ tick: s === null ? null : B(s === 4) }),
        next: (s, i) => (i.reset ? 0 : s === null ? null : (s + 1) % 5)
    }
});

/* ================================================================== fsm */
add({
    id: 'enum_fsm', sec: 'fsm', title: 'Enumerated types: a traffic light',
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
let seqQueue = [];
add({
    id: 'seq1011', sec: 'fsm', title: 'A sequence detector',
    body: `A **sequence detector** watches a serial bit stream, one bit per clock cycle on {din}, and reports a pattern. Detect {1011}: {found} is {'1'} during the clock cycle that brings the last {1} of the pattern. Matches may overlap: in {1011011} both {1011}s count.

Write it as a state machine. Each state remembers how much of the pattern has arrived so far:

~~~
type state_t is (s0, s1, s10, s101);
~~~

At each rising edge of {clk} the next state depends on the current state and on {din}, and {reset} (synchronous) returns to the start. {found} depends on the state **and** on the present input, {s101} with {din = '1'}, which makes this a **Mealy** machine: its output reacts within the same cycle as the input. Think about where the machine goes after a match: the last {1} already begins the next pattern.`,
    ports: [['clk', 'in', 1], ['reset', 'in', 1], ['din', 'in', 1], ['found', 'out', 1]],
    solDecls: 'type state_t is (s0, s1, s10, s101);\nsignal state : state_t;',
    sol: `process(clk)
begin
  if rising_edge(clk) then
    if reset = '1' then
      state <= s0;
    else
      case state is
        when s0   => if din = '1' then state <= s1;   else state <= s0;  end if;
        when s1   => if din = '1' then state <= s1;   else state <= s10; end if;
        when s10  => if din = '1' then state <= s101; else state <= s0;  end if;
        when s101 => if din = '1' then state <= s1;   else state <= s10; end if;
      end case;
    end if;
  end if;
end process;

found <= '1' when state = s101 and din = '1' else '0';`,
    test: {
        clk: 'clk', cycles: 200,
        init: () => null,
        gen: (R, k) => {
            if (k === 0) seqQueue = [];
            if (!seqQueue.length) seqQueue = R.chance(0.3) ? [...(R.chance(0.5) ? '1011' : '1011011')].map(BigInt) : [R.bit()];
            return { reset: k === 0 ? 1n : B(R.chance(0.02)), din: seqQueue.shift() };
        },
        out: (s, i) => ({ found: s === null ? null : B((s + i.din).endsWith('1011')) }),
        next: (s, i) => (i.reset ? '' : s === null ? null : (s + i.din).slice(-3))
    }
});
add({
    id: 'parity_fsm', sec: 'fsm', title: 'A serial parity checker',
    body: `A **serial parity checker** receives one bit per clock cycle on {din} and tells whether an odd number of {1} bits has arrived since the last {reset}. Two states are enough, even and odd, and every {1} switches between them.

Write it as a **Moore** machine with an enumerated type, {type parity_t is (even, odd);}: the output {is_odd} depends on the state alone, so it changes only at clock edges. {reset} is synchronous and returns to {even}.`,
    ports: [['clk', 'in', 1], ['reset', 'in', 1], ['din', 'in', 1], ['is_odd', 'out', 1]],
    solDecls: 'type parity_t is (even, odd);\nsignal state : parity_t;',
    sol: `process(clk)
begin
  if rising_edge(clk) then
    if reset = '1' then
      state <= even;
    elsif din = '1' then
      if state = even then
        state <= odd;
      else
        state <= even;
      end if;
    end if;
  end if;
end process;

is_odd <= '1' when state = odd else '0';`,
    test: {
        clk: 'clk', cycles: 120,
        init: () => null,
        gen: (R, k) => ({ reset: k === 0 ? 1n : B(R.chance(0.05)), din: R.bit() }),
        out: s => ({ is_odd: s }),
        next: (s, i) => (i.reset ? 0n : s === null ? null : s ^ i.din)
    }
});

/* ================================================================= more */
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
    id: 'thermometer', sec: 'more', title: 'A thermometer code',
    body: `A **thermometer code** turns a number into a column of ones, like the mercury in a thermometer: level 3 lights the lowest three bits. Flash analogue-to-digital converters produce it, and a decoder turns it back into binary.

Convert the 3-bit {level} into the 7-bit {therm}: {"000"} gives {"0000000"}, {"011"} gives {"0000111"}, and {"111"} gives {"1111111"}.

A conditional assignment can list all eight cases, each {when} tried in order:

~~~
therm <= "0000000" when level = "000" else
         "0000001" when level = "001" else
         ...
~~~

A loop that compares every bit index with the level is shorter: bit {i} is {'1'} when {i < to_integer(unsigned(level))}.`,
    numeric: true,
    ports: [['level', 'in', 3], ['therm', 'out', 7]],
    sol: `process(all)
begin
  for i in 0 to 6 loop
    if i < to_integer(unsigned(level)) then
      therm(i) <= '1';
    else
      therm(i) <= '0';
    end if;
  end loop;
end process;`,
    test: comb(i => ({ therm: (1n << i.level) - 1n }))
});
add({
    id: 'hamming74', sec: 'more', title: 'Reduction: a Hamming (7,4) encoder',
    body: `A **Hamming (7,4) code** protects four data bits with three parity bits, so that a receiver can locate and correct any single flipped bit. Each parity bit covers a different subset of the data:

~~~
p(0) = d(0) xor d(1) xor d(3)
p(1) = d(0) xor d(2) xor d(3)
p(2) = d(1) xor d(2) xor d(3)
~~~

The 7-bit codeword mixes them in the classic order, with the parity bits at the power-of-two positions:

~~~
code = d(3) d(2) d(1) p(2) d(0) p(1) p(0)
~~~

Compute {code} from {d}. VHDL-2008's reduction {xor v} XORs all the bits of a vector, and with a mask it picks a subset: {xor (d and "1011")} is {d(3) xor d(1) xor d(0)}.`,
    ports: [['d', 'in', 4], ['code', 'out', 7]],
    sol: `code <= d(3) & d(2) & d(1) & (xor (d and "1110")) & d(0) & (xor (d and "1101")) & (xor (d and "1011"));`,
    test: comb(i => {
        const d = k => bit(i.d, k);
        const p0 = d(0) ^ d(1) ^ d(3), p1 = d(0) ^ d(2) ^ d(3), p2 = d(1) ^ d(2) ^ d(3);
        return { code: (d(3) << 6n) | (d(2) << 5n) | (d(1) << 4n) | (p2 << 3n) | (d(0) << 2n) | (p1 << 1n) | p0 };
    })
});
add({
    id: 'barrel_rotate', sec: 'more', title: 'A barrel shifter',
    body: `A **barrel shifter** rotates a word by any amount in a single clock cycle. The fast way uses one stage per bit of the amount: stage {k} rotates by {2**k} places when {amt(k)} is {'1'} and passes the word on otherwise. Three stages rotate an 8-bit word by 0 to 7.

Rotate {x} right by {amt}: the bits that fall off the right end come back in at the left, so {"00000011"} rotated right by 1 is {"10000001"}.

Keep the words between the stages in an array, and build the stages with a generate:

~~~
type stages_t is array (0 to 3) of std_logic_vector(7 downto 0);
signal st : stages_t;
...
st(0) <= x;
g: for k in 0 to 2 generate
  st(k + 1) <= ... when amt(k) = '1' else st(k);
end generate;
y <= st(3);
~~~

Rotating right by {n} is a concatenation of two slices: the lowest {n} bits move to the top.`,
    ports: [['x', 'in', 8], ['amt', 'in', 3], ['y', 'out', 8]],
    solDecls: 'type stages_t is array (0 to 3) of std_logic_vector(7 downto 0);\nsignal st : stages_t;',
    sol: `st(0) <= x;
g: for k in 0 to 2 generate
  st(k + 1) <= st(k)(2**k - 1 downto 0) & st(k)(7 downto 2**k) when amt(k) = '1' else st(k);
end generate;
y <= st(3);`,
    test: comb(i => { const n = i.amt; return { y: ((i.x >> n) | (i.x << (8n - n))) & 255n }; })
});
add({
    id: 'onehot', sec: 'more', title: 'Loops: is it one-hot?',
    body: `A **one-hot** vector has exactly one bit set. State machines and selectors use them, and a check that finds two bits set has found a bug.

For the 16-bit input {x}:

- {onehot} is {'1'} when exactly one bit is {'1'}
- {none} is {'1'} when no bit is {'1'}

Count the ones in a process, with a variable and a loop over {x'range}. {x'range} is an **attribute**, the index range of {x}, here {15 downto 0}, so the loop follows the width of {x}.`,
    ports: [['x', 'in', 16], ['onehot', 'out', 1], ['none', 'out', 1]],
    sol: `process(all)
  variable n : natural range 0 to 16;
begin
  n := 0;
  for i in x'range loop
    if x(i) = '1' then
      n := n + 1;
    end if;
  end loop;
  if n = 1 then onehot <= '1'; else onehot <= '0'; end if;
  if n = 0 then none <= '1'; else none <= '0'; end if;
end process;`,
    test: comb(i => ({ onehot: B(pop(i.x) === 1n), none: B(i.x === 0n) }),
        { gen: R => { const k = R.int(4), one = () => 1n << BigInt(R.int(16)); return { x: k === 0 ? 0n : k === 1 ? one() : k === 2 ? one() | one() : R.bits(16) }; }, random: 200 })
});
add({
    id: 'double_dabble', sec: 'more', title: 'Binary to BCD: double dabble',
    body: `Displays show decimal digits, so a binary number has to become **BCD**, one 4-bit group per decimal digit: 213 becomes {0010 0001 0011}.

The **double dabble** algorithm does it with shifts and small additions. Start with the BCD digits at zero. Then, eight times, shift the binary number left into the BCD digits, one bit at a time; but before each shift, add 3 to every BCD digit that is 5 or more. Adding 3 before the doubling makes a digit carry into the next one at exactly 10.

~~~
process(all)
  variable v : unsigned(19 downto 0);   -- 12 BCD bits, then the 8 input bits
begin
  v := (others => '0');
  v(7 downto 0) := unsigned(bin);
  for i in 1 to 8 loop
    -- add 3 to each BCD digit that is 5 or more
    ...
    v := shift_left(v, 1);
  end loop;
  bcd <= std_logic_vector(v(19 downto 8));
end process;
~~~

Convert the 8-bit {bin}, 0 to 255, into the 12-bit {bcd}: the hundreds, tens and ones digits, in that order.`,
    numeric: true,
    ports: [['bin', 'in', 8], ['bcd', 'out', 12]],
    sol: `process(all)
  variable v : unsigned(19 downto 0);
begin
  v := (others => '0');
  v(7 downto 0) := unsigned(bin);
  for i in 1 to 8 loop
    if v(11 downto 8) >= 5 then
      v(11 downto 8) := v(11 downto 8) + 3;
    end if;
    if v(15 downto 12) >= 5 then
      v(15 downto 12) := v(15 downto 12) + 3;
    end if;
    if v(19 downto 16) >= 5 then
      v(19 downto 16) := v(19 downto 16) + 3;
    end if;
    v := shift_left(v, 1);
  end loop;
  bcd <= std_logic_vector(v(19 downto 8));
end process;`,
    test: comb(i => { const n = Number(i.bin); return { bcd: (BigInt(Math.floor(n / 100)) << 8n) | (BigInt(Math.floor(n / 10) % 10) << 4n) | BigInt(n % 10) }; })
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
    id: 'sign_magnitude', sec: 'numeric', title: 'Sign-magnitude to two\'s complement',
    body: `In **sign-magnitude** form the top bit is the sign and the other bits are the size of the number, the way people write numbers: {10000011} is -3. Hardware prefers **two's complement**, where -3 is {11111101}. Convert:

- {sm(7)} is the sign and {sm(6 downto 0)} the magnitude
- {tc} is the same value in 8-bit two's complement

Sign-magnitude has two zeros, {00000000} and {10000000} ("minus zero"); both become {00000000}. With {signed} from {ieee.numeric_std}: widen the magnitude with {resize(unsigned(...), 8)}, turn it into {signed}, and negate it with {-} when the sign is set.`,
    numeric: true,
    ports: [['sm', 'in', 8], ['tc', 'out', 8]],
    solDecls: 'signal mag : signed(7 downto 0);',
    sol: `mag <= signed(resize(unsigned(sm(6 downto 0)), 8));
tc  <= std_logic_vector(-mag) when sm(7) = '1' else std_logic_vector(mag);`,
    test: comb(i => { const mag = i.sm & 127n; return { tc: bit(i.sm, 7) ? (-mag) & 255n : mag }; })
});
add({
    id: 'saturate_add', sec: 'numeric', title: 'Saturating addition',
    body: `When a sum does not fit, ordinary binary addition wraps around: in 8-bit signed numbers, 100 + 100 gives -56. Audio and video hardware prefers **saturation**, which clamps the result to the largest or smallest value that fits, so that a loud sound clips instead of flipping its sign.

Add the signed 8-bit numbers {a} and {b} with saturation: {s} is {a + b} when it fits in -128 to 127, and 127 or -128 otherwise. {ovf} is {'1'} when the result had to be clamped.

Compute the sum one bit wider, {resize(signed(a), 9) + resize(signed(b), 9)}, so that it cannot overflow, and then compare it with the limits.`,
    numeric: true,
    ports: [['a', 'in', 8], ['b', 'in', 8], ['s', 'out', 8], ['ovf', 'out', 1]],
    sol: `process(all)
  variable s9 : signed(8 downto 0);
begin
  s9 := resize(signed(a), 9) + resize(signed(b), 9);
  if s9 > 127 then
    s   <= x"7F";
    ovf <= '1';
  elsif s9 < -128 then
    s   <= x"80";
    ovf <= '1';
  else
    s   <= std_logic_vector(s9(7 downto 0));
    ovf <= '0';
  end if;
end process;`,
    test: comb(i => {
        const sg = v => (v & 128n ? v - 256n : v);
        const t = sg(i.a) + sg(i.b);
        if (t > 127n) return { s: 0x7Fn, ovf: 1n };
        if (t < -128n) return { s: 0x80n, ovf: 1n };
        return { s: t & 255n, ovf: 0n };
    })
});
add({
    id: 'mult4', sec: 'numeric', title: 'A 4-by-4 multiplier',
    body: `An unsigned 4-by-4 multiplication gives up to 8 bits: 15 × 15 = 225. Multiply {a} by {b} into {p}.

The {*} of {numeric_std} returns a result as wide as both operands together, so {unsigned(a) * unsigned(b)} is already 8 bits wide. The textbook alternative is **shift and add**: for every bit {i} of {b} that is set, add {a} shifted left by {i} places. A loop with a variable does it, and that is how a small multiplier works inside.`,
    numeric: true,
    ports: [['a', 'in', 4], ['b', 'in', 4], ['p', 'out', 8]],
    sol: 'p <= std_logic_vector(unsigned(a) * unsigned(b));',
    test: comb(i => ({ p: i.a * i.b }))
});
add({
    id: 'abs_diff', sec: 'numeric', title: 'Absolute difference',
    body: `The **absolute difference** |a - b| measures how far apart two values are; video encoders sum it over thousands of pixels to find motion. For unsigned numbers it cannot be computed as {a - b} and then made positive, because an unsigned subtraction never goes negative: it wraps around.

Compare first, then subtract the smaller value from the larger. {d} is |a - b| for the unsigned 8-bit inputs {a} and {b}, and {a_gt_b} is {'1'} when {a} is the larger one.`,
    numeric: true,
    ports: [['a', 'in', 8], ['b', 'in', 8], ['d', 'out', 8], ['a_gt_b', 'out', 1]],
    sol: `process(all)
begin
  if unsigned(a) > unsigned(b) then
    d      <= std_logic_vector(unsigned(a) - unsigned(b));
    a_gt_b <= '1';
  else
    d      <= std_logic_vector(unsigned(b) - unsigned(a));
    a_gt_b <= '0';
  end if;
end process;`,
    test: comb(i => ({ d: i.a > i.b ? i.a - i.b : i.b - i.a, a_gt_b: B(i.a > i.b) }),
        { gen: R => { const a = R.bits(8); return { a, b: R.chance(0.1) ? a : R.bits(8) }; }, random: 300 })
});

G.VHDLProblems = { LIB, SECTIONS, PROBLEMS: P };
})(typeof window !== 'undefined' ? window : globalThis);
