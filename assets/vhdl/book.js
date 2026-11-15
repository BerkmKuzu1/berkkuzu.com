/* book.js - the reading pages of the VHDL book: one or more pages at the start
   of every chapter, with runnable examples. Same markup as problems.js, plus
   "## " headings, "> " notes, "!> " warnings, "| " tables, "1. " lists,
   [links](https://...) and "~~~try name" for a runnable example from TRY. */
(function (G) {
'use strict';
const H = 'library ieee;\nuse ieee.std_logic_1164.all;\n';
const HN = H + 'use ieee.numeric_std.all;\n';
const LESSONS = [], TRY = {};
const page = (sec, id, title, body) => LESSONS.push({ sec, id, title, body });
const ex = (name, spec) => { TRY[name] = spec; };
const all2 = (a, b) => ['00', '01', '10', '11'].map(v => `${a}=${v[0]} ${b}=${v[1]}`);

const BLURBS = {
    start: 'What VHDL is, how this book works, and the two parts of every design: the entity and the architecture.',
    gates: 'The nine values of std_logic, the logic operators, signals inside an architecture, and how the simulator orders events.',
    vectors: 'Buses as std_logic_vector: indexes, slices, literals, aggregates, and the operators that work on whole vectors.',
    hier: 'Building designs from smaller designs: instances, port maps, components, generics and generate.',
    comb: 'Sequential statements in a process: if, case, loops and variables, and how to keep combinational logic free of latches.',
    clocked: 'Flip-flops and registers, resets and enables, counters and shift registers, and inputs from outside the clock domain.',
    fsm: 'Finite state machines: states, transitions and outputs, Moore and Mealy, and the usual ways to write them.',
    more: 'Conditional and selected assignments, loops that unroll into hardware, and arrays of signals.',
    numeric: 'The unsigned and signed types of numeric_std, conversions, the width of results, overflow and fixed point.',
    types: 'Your own types and subtypes, attributes, functions, and packages that share them between designs.',
    mem: 'ROMs and RAMs as arrays, synchronous and asynchronous reads, register files and FIFOs.',
    rtl: 'Datapaths with a controller: FSMD design, start/done handshakes, algorithms that take many cycles, and a UART.',
    tb: 'Testbenches: clocks and stimulus, wait and after, assertions that check results, and exercises that ask you to catch bugs.',
    next: 'A virtual FPGA board for your designs, simulators for your own computer, and the books to read next.'
};

/* ======================================================= 1 Getting started */
page('start', 'about', 'About this book', `VHDL is a language for describing digital circuits. You write down what a circuit is made of and how it behaves, and tools take it from there: a **simulator** computes what the circuit does, so that you can watch its signals before it exists, and a **synthesis** tool turns the description into the gates and flip-flops of an FPGA or a chip.

The name stands for VHSIC Hardware Description Language, where VHSIC (Very High Speed Integrated Circuit) was a US research program of the 1980s. VHDL became the IEEE standard 1076 in 1987 and has been revised several times since. This book uses **VHDL-2008**, the version that current simulators and synthesis tools support, and notes where it differs from older code you may meet.

## Hardware, not a program

VHDL looks like a programming language, with types, operators, if statements and loops, but most of it describes hardware, and hardware works in parallel. Every gate of a circuit works all the time, at the same time as every other gate. A line of VHDL such as {y <= a and b;} is not an instruction that runs once: it is an AND gate, and {y} follows {a} and {b} for as long as the circuit exists. Keeping that picture in mind is most of what learning VHDL means.

## How the book works

Each chapter starts with pages to read, marked {§} in the list of contents. Their examples run right on the page: the box below an example is a small simulator. Change the code, press **Run**, and the waveform shows the inputs in blue and the outputs in orange, one column per step. Try it here: change {and} to {or}, or to {xor}, and run it again.

~~~try first_look

Then come the exercises. Each one describes a circuit; you write its VHDL in the editor and press **Check**. The checker compiles your code, applies many test inputs (every combination when there are few input bits, hundreds of random ones when there are many) and compares every output with a reference design. When something differs, it shows the first mismatches and a waveform around them. Once you have solved an exercise, or after three checks, it also offers a reference solution to compare with yours.

Everything runs in your browser: nothing is uploaded, and your code and progress are kept in this browser only.

> The checker is a VHDL-2008 simulator written for this book. It knows the VHDL that the chapters use, from synthesizable designs to testbenches, and every example and reference solution has also been run in GHDL, an open-source VHDL simulator, with the same inputs. Chapter 13 shows how to write testbenches of your own, and chapter 14 how to run them on your computer.`);
ex('first_look', {
    code: `${H}
entity first_look is
  port (
    a, b : in  std_logic;
    y    : out std_logic
  );
end entity;

architecture rtl of first_look is
begin
  y <= a and b;
end architecture;
`,
    steps: all2('a', 'b')
});

page('start', 'entities', 'Entities and architectures', `Every VHDL design has two parts. The **entity** describes the outside of the circuit: its name and its ports, the wires that connect it to the world. The **architecture** describes the inside. Here is a complete design, a circuit with three outputs:

~~~
library ieee;
use ieee.std_logic_1164.all;

entity gates is
  port (
    a, b              : in  std_logic;
    y_and, y_or, y_n  : out std_logic
  );
end entity;

architecture rtl of gates is
begin
  y_and <= a and b;
  y_or  <= a or b;
  y_n   <= not a;
end architecture;
~~~

## Line by line

- {library ieee;} and {use ieee.std_logic_1164.all;} make the type {std_logic} visible. It lives in the package {std_logic_1164} of the library {ieee}. These lines apply to the design unit that follows them, so a file with two entities repeats them before each.
- The **entity** {gates} lists its ports. Each port has a name, a **mode** ({in} or {out}; also {inout} for a wire that goes both ways) and a type. Ports of the same mode and type can share a line, separated by commas. The port declarations are separated by semicolons, so the last one has none.
- The **architecture** {rtl} belongs to the entity {gates}. Declarations would go between {is} and {begin}; the description goes between {begin} and {end}. The name {rtl}, for register-transfer level, is a habit, not a rule.
- {y_and <= a and b;} is a **concurrent signal assignment**. It runs whenever {a} or {b} changes and keeps {y_and} equal to their AND.

Since each assignment is a piece of hardware, their order does not matter. Swap the three lines in the example below and run it: the waveform stays the same.

~~~try gates3

## Names and comments

Names (identifiers) consist of letters, digits and underscores. They start with a letter, and they may not end with an underscore or contain two in a row. VHDL does not tell upper and lower case apart: {Y_AND} and {y_and} are the same name, and so are {BEGIN} and {begin}. A comment starts with {--} and runs to the end of the line.

!> Two classic beginner errors: a semicolon after the last port declaration, and a port named after a reserved word, such as {in}, {out}, {signal} or {select}. The checker points at both.

## Entity and architecture

Why two parts? The entity is the contract: anyone who wants to use the circuit needs only its ports. An entity can even have several architectures, for example a simple one for simulation and a fast one for synthesis, and a design picks one when it uses the entity. In the exercises the entity is always given, as {top_module}, and you write its architecture.`);
ex('gates3', {
    code: `${H}
entity gates is
  port (
    a, b              : in  std_logic;
    y_and, y_or, y_n  : out std_logic
  );
end entity;

architecture rtl of gates is
begin
  y_and <= a and b;
  y_or  <= a or b;
  y_n   <= not a;
end architecture;
`,
    steps: all2('a', 'b')
});

/* ==================================================== 2 Logic and signals */
page('gates', 'std-logic', 'std_logic and its nine values', `A wire in a real circuit is not always a clean 0 or 1. It may not be driven at all, two outputs may drive it against each other, or the circuit may just have been switched on. The type {std_logic} has a value for each of these cases:

| Value | Meaning |
|---|---|
| {'U'} | uninitialized: nothing has been assigned yet |
| {'X'} | unknown, for example two drivers in conflict |
| {'0'}, {'1'} | driven low, driven high |
| {'Z'} | high impedance: nothing drives the wire |
| {'W'} | weak unknown |
| {'L'}, {'H'} | weak low, weak high, as from a pull-down or pull-up resistor |
| {'-'} | don't care, for synthesis |

The letters are upper case and written in single quotes: {'Z'} is a value of {std_logic}, {'z'} is not.

## Where 'U' and 'X' come from

Every {std_logic} signal starts as {'U'}, and it stays {'U'} until something assigns it. An output that a design forgets to drive stays {'U'} forever, which is why the checker shows {'U'} for outputs that your code never assigns.

The logic operators handle the unknown values sensibly. {'0' and 'X'} is {'0'}, because an AND with a zero input is zero whatever the other input is. {'1' and 'X'} is {'X'}, because the result depends on the unknown input. Run the example and look at each step: the inputs include {'X'}, {'U'} and {'Z'}.

~~~try unknowns

## Resolution: several drivers on one wire

{std_logic} is a **resolved** type: when several statements drive the same signal, a resolution function combines their values into one. A strong value beats a weak one, {'Z'} gives way to everything, two equal values agree, and {'0'} against {'1'} gives {'X'}.

That is how buses work. In the next example, two devices share a line that a resistor pulls up, as on an I2C bus: each device either pulls the line low or lets go of it ({'Z'}), and the pull-up drives a weak {'H'}. Nobody pulls: the line is {'H'}, a weak 1. Anybody pulls: it is {'0'}.

~~~try wired_and

> Without resolution, two drivers on one signal are an error. That is the case for {std_ulogic}, the unresolved type that {std_logic} is built on, and for the type {bit}, which has only {'0'} and {'1'}. Most designs use {std_logic} everywhere and rely on the simulator to flag a signal with two drivers by mistake: the checker warns about it.`);
ex('unknowns', {
    code: `${H}
entity unknowns is
  port (
    a, b               : in  std_logic;
    y_and, y_or, y_not : out std_logic
  );
end entity;

architecture rtl of unknowns is
begin
  y_and <= a and b;
  y_or  <= a or b;
  y_not <= not a;
end architecture;
`,
    steps: ['a=0 b=X', 'a=1 b=X', 'a=1 b=U', 'a=0 b=U', 'a=Z b=1', 'a=1 b=1']
});
ex('wired_and', {
    allowMulti: true,
    code: `${H}
entity wired_and is
  port (
    pull1, pull2 : in  std_logic;
    line         : out std_logic
  );
end entity;

architecture rtl of wired_and is
begin
  line <= '0' when pull1 = '1' else 'Z';   -- device 1
  line <= '0' when pull2 = '1' else 'Z';   -- device 2
  line <= 'H';                             -- the pull-up resistor
end architecture;
`,
    steps: all2('pull1', 'pull2')
});

page('gates', 'operators', 'Operators and concurrent statements', `The logic operators of VHDL are words:

| Operator | Result |
|---|---|
| {not a} | inverse |
| {a and b}, {a or b} | AND, OR |
| {a nand b}, {a nor b} | inverted AND, inverted OR |
| {a xor b}, {a xnor b} | exclusive OR, its inverse |

## Precedence

{not} binds tighter than the others: {not a and b} means {(not a) and b}. The binary logic operators, however, all have the **same** precedence, and VHDL refuses to guess: a chain of the same operator, {a and b and c}, is fine, but {a and b or c} is an error. Write {(a and b) or c}. {nand} and {nor} cannot be chained at all, since {(a nand b) nand c} is not {a nand (b nand c)}.

The comparison operators {=}, {/=} (not equal), {<}, {<=}, {>} and {>=} bind tighter than the logic operators, so {a = '1' and b = '0'} needs no parentheses. {<=} means both "less or equal" and "assign"; the place where it appears decides which.

## Booleans and std_logic

A comparison does not give a {std_logic}: it gives a {boolean}, {true} or {false}, and VHDL keeps the two types apart. {y <= a = b;} is an error. A **conditional signal assignment** turns a condition into a value:

~~~
y <= '1' when a = b else '0';
~~~

It can chain several conditions, tried in order: {y <= a when s = "00" else b when s = "01" else c;}.

## Signals inside an architecture

Wires inside a design are **signals**, declared between {is} and {begin}. Ports are signals too, seen from outside. The example builds a 2-to-1 multiplexer from gates, with two internal signals for the two paths:

~~~try mux_gates

## Why the order does not matter

Every concurrent statement is a small process that waits for its inputs to change. When an input changes, the simulator runs every statement that reads it; their new outputs take effect a moment later, called a **delta cycle**, which takes no simulated time. Then the statements that read those outputs run, and so on, until nothing changes any more. The textual order of the statements never enters the picture.

!> A loop through logic, such as {y <= not y;}, never settles: each delta cycle flips {y} again. The checker stops such a design with an error. In real hardware it would be an oscillator, or a latch that you did not intend.`);
ex('mux_gates', {
    code: `${H}
entity mux_gates is
  port (
    a, b, s : in  std_logic;
    y       : out std_logic
  );
end entity;

architecture rtl of mux_gates is
  signal path_a, path_b : std_logic;
begin
  path_a <= a and not s;     -- a gets through while s = '0'
  path_b <= b and s;         -- b gets through while s = '1'
  y      <= path_a or path_b;
end architecture;
`,
    steps: ['a=1 b=0 s=0', 'a=0 b=0 s=0', 'a=0 b=1 s=0', 'a=0 b=1 s=1', 'a=1 b=1 s=1', 'a=1 b=0 s=1', 'a=1 b=0 s=0']
});

/* ============================================================ 3 Vectors */
page('vectors', 'vectors', 'Vectors, slices and literals', `A bus of eight wires is a **vector**: an array of {std_logic}.

~~~
signal data : std_logic_vector(7 downto 0);
~~~

{data} has eight elements, numbered 7 down to 0 from left to right. For numbers, the leftmost element is the most significant bit, which is why vectors are almost always declared {downto}. A vector can also be declared {(0 to 7)}; then its leftmost element is {data(0)}.

## Elements and slices

{data(3)} is one element, a {std_logic}. {data(7 downto 4)} is a **slice**, the upper four elements, a vector of its own. A slice of a {downto} vector must use {downto} too.

An assignment between vectors copies element by element, **from left to right**, and the widths must match exactly. VHDL never pads or cuts a vector silently: assigning 8 bits to a 9-bit target is an error.

## Literals

| Literal | Value |
|---|---|
| {"1010"} | four elements, one per character |
| {b"1010_0101"} | binary; underscores only help reading |
| {x"A5"} | hexadecimal, four bits per digit: {"10100101"} |
| {o"17"} | octal, three bits per digit: {"001111"} |
| {12x"A5"} | VHDL-2008: 12 bits wide, padded with zeros: {"000010100101"} |
| {8d"200"} | VHDL-2008: the decimal number 200 in 8 bits |

## Concatenation and aggregates

{&} joins vectors and single bits: {"00" & data} is ten bits wide, {data(6 downto 0) & data(7)} rotates {data} left by one place.

An **aggregate** builds a vector from its elements. {(others => '0')} sets every element, whatever the width; {(7 => '1', others => '0')} sets one element and the rest; a range such as {(7 downto 4 => '1', others => '0')} sets a group. Aggregates take their width from where they are assigned.

~~~try bus_ops

> Run the example and read the outputs against the input: {rot} is the rotation, {low2} repeats the lower nibble twice, and {tag} glues a constant to two bits of the input.`);
ex('bus_ops', {
    code: `${H}
entity bus_ops is
  port (
    d    : in  std_logic_vector(7 downto 0);
    rot  : out std_logic_vector(7 downto 0);
    low2 : out std_logic_vector(7 downto 0);
    tag  : out std_logic_vector(7 downto 0)
  );
end entity;

architecture rtl of bus_ops is
begin
  rot  <= d(6 downto 0) & d(7);          -- rotate left by one
  low2 <= d(3 downto 0) & d(3 downto 0); -- the lower nibble, twice
  tag  <= x"A" & "01" & d(1 downto 0);   -- 4 + 2 + 2 bits
end architecture;
`,
    steps: ['d=10000001', 'd=00010010', 'd=11110000', 'd=01011010', 'd=11111111']
});

page('vectors', 'vector-ops', 'Operators on vectors', `The logic operators work on whole vectors, element by element: bit {i} of {a and b} is {a(i) and b(i)}, and both operands must have the same length. VHDL-2008 also lets one operand be a single bit: {d and en} ANDs every element of {d} with {en}, which masks the whole vector.

## Reduction operators

VHDL-2008 can also apply a logic operator to all elements of one vector, giving a single bit:

| Expression | Meaning |
|---|---|
| {and d} | {'1'} when every bit of {d} is {'1'} |
| {or d} | {'1'} when any bit is {'1'}; {'0'} only for all zeros |
| {xor d} | {'1'} for an odd number of ones: the parity |

~~~try reduce

## Shifts

For {std_logic_vector}, VHDL-2008 defines the shift operators {sll} and {srl} (shift left or right, filling with {'0'}) and the rotations {rol} and {ror}: {d sll 2} shifts {d} two places left. For numbers, the functions {shift_left} and {shift_right} of chapter 9 are clearer, because they also handle signed values.

## Comparing vectors

{=} and {/=} compare element by element. Two traps hide here:

- Vectors of **different lengths** are simply not equal: {"0011" = "011"} is {false}, without an error or a warning in most tools.
- {<} and {>} on {std_logic_vector} compare like words in a dictionary, element by element from the left, not as numbers. {"0111" < "1000"} is true, as for numbers, but {"100" < "0111"} is false, because {'1'} beats {'0'} in the first position, although 4 is less than 7. To compare numbers, use the types of chapter 9.

!> {d = (others => '0')} looks like the natural way to test for zero, but it is an error: as an operand of {=}, the aggregate has no width to fill. Write the value out, {d = x"00"}, or use the reduction {or d = '0'}.`);
ex('reduce', {
    code: `${H}
entity reduce is
  port (
    d          : in  std_logic_vector(3 downto 0);
    en         : in  std_logic;
    all1, any1 : out std_logic;
    parity     : out std_logic;
    masked     : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of reduce is
begin
  all1   <= and d;
  any1   <= or d;
  parity <= xor d;
  masked <= d and en;
end architecture;
`,
    steps: ['d=0000 en=1', 'd=0100 en=1', 'd=0110 en=1', 'd=1111 en=1', 'd=1111 en=0', 'd=1011 en=0']
});

/* ================================================ 4 Entities and instances */
page('hier', 'instances', 'Instances and port maps', `A large design is built like a circuit board: from parts that are designed and tested on their own. In VHDL a part is an entity, and using it inside another architecture creates an **instance** of it.

~~~
u1: entity work.full_adder
  port map (a => x(0), b => y(0), cin => '0', s => sum(0), cout => c1);
~~~

- {u1} is the instance **label**, required and unique in the architecture.
- {work.full_adder} names the entity. {work} is the library that your own design units are compiled into.
- The **port map** connects each port of the instance (the formal, on the left of {=>}) to a signal of the surrounding architecture (the actual, on the right).

The example builds a 2-bit adder from two full adders. The carry between them needs a signal of its own, {c1}. Both entities are in the same text; the simulator uses the last one as the top.

~~~try adder2

## Named and positional association

{a => x(0)} is **named** association: the order does not matter, and the map documents itself. **Positional** association leaves out the names and follows the order of the port declaration: {port map (x(0), y(0), '0', sum(0), c1)}. It is shorter, but if someone reorders the ports of the entity, it silently connects the wrong wires. Prefer names.

## Rules for the actuals

- An output must connect to a signal (or an element or slice of one), never to an expression.
- An input can take a constant such as {'0'}, and VHDL-2008 also allows an expression, such as {cin => a and b}.
- An output that you do not need connects to {open}: {cout => open}.

## Components

Older code declares a **component** first, a copy of the entity's port list in the architecture, and instantiates it without the word {entity}:

~~~
architecture rtl of adder2 is
  component full_adder is
    port (a, b, cin : in std_logic; s, cout : out std_logic);
  end component;
  ...
begin
  u1: full_adder port map (...);
~~~

The component is bound to the entity of the same name when the design is elaborated. Components are still needed for parts whose VHDL you do not have, such as vendor primitives; for your own entities, direct entity instantiation is shorter and checked earlier.`);
ex('adder2', {
    code: `${H}
entity full_adder is
  port (a, b, cin : in std_logic; s, cout : out std_logic);
end entity;

architecture rtl of full_adder is
begin
  s    <= a xor b xor cin;
  cout <= (a and b) or (cin and (a xor b));
end architecture;

${H}
entity adder2 is
  port (
    x, y : in  std_logic_vector(1 downto 0);
    sum  : out std_logic_vector(2 downto 0)
  );
end entity;

architecture rtl of adder2 is
  signal c1 : std_logic;
begin
  u0: entity work.full_adder
    port map (a => x(0), b => y(0), cin => '0', s => sum(0), cout => c1);
  u1: entity work.full_adder
    port map (a => x(1), b => y(1), cin => c1, s => sum(1), cout => sum(2));
end architecture;
`,
    steps: ['x=00 y=00', 'x=01 y=01', 'x=10 y=01', 'x=11 y=01', 'x=11 y=11', 'x=10 y=10']
});

page('hier', 'generics-generate', 'Generics and generate', `A **generic** is a constant that every instance sets for itself. It turns a fixed design into a family: an adder of any width, a counter with any limit, a filter with any coefficients.

~~~
entity adder_n is
  generic (N : positive := 8);
  port (
    x, y : in  std_logic_vector(N - 1 downto 0);
    sum  : out std_logic_vector(N downto 0)
  );
end entity;
~~~

The instance chooses with a **generic map**, {generic map (N => 4)}, written before the port map. Without one, the default after {:=} applies.

## for ... generate

A **generate** statement copies concurrent statements, instances included, once for each value of an index. Inside it, the index is a constant, so it can pick the wires of each copy:

~~~
g: for i in 0 to N - 1 generate
  u: entity work.full_adder
    port map (a => x(i), b => y(i), cin => c(i), s => sum(i), cout => c(i + 1));
end generate;
~~~

The label ({g}) is required. The carries live in a vector {c} one element longer than the operands, so that copy {i} reads {c(i)} and writes {c(i + 1)}. Here is the whole adder, used with {N = 4}:

~~~try adder_n

The same description builds an adder of any width: an instance with {generic map (N => 16)} and 16-bit operands would be a 16-bit adder, with sixteen full adders in its generate.

## if ... generate

{if ... generate} includes statements only when a constant condition holds, for example an output register that a generic switches on or off. VHDL-2008 adds {elsif} and {else} branches:

~~~
g_reg: if REGISTERED generate
  ...
else generate
  ...
end generate;
~~~

> Generics and generate are evaluated before the simulation starts, during **elaboration**: they decide what hardware exists, not what it does. A loop inside a process, in the next chapter, is different: it is part of the behavior.`);
ex('adder_n', {
    code: `${H}
entity full_adder is
  port (a, b, cin : in std_logic; s, cout : out std_logic);
end entity;

architecture rtl of full_adder is
begin
  s    <= a xor b xor cin;
  cout <= (a and b) or (cin and (a xor b));
end architecture;

${H}
entity adder_n is
  generic (N : positive := 8);
  port (
    x, y : in  std_logic_vector(N - 1 downto 0);
    sum  : out std_logic_vector(N downto 0)
  );
end entity;

architecture rtl of adder_n is
  signal c : std_logic_vector(N downto 0);
begin
  c(0) <= '0';
  g: for i in 0 to N - 1 generate
    u: entity work.full_adder
      port map (a => x(i), b => y(i), cin => c(i), s => sum(i), cout => c(i + 1));
  end generate;
  sum(N) <= c(N);
end architecture;

${H}
entity top is
  port (
    x, y : in  std_logic_vector(3 downto 0);
    sum  : out std_logic_vector(4 downto 0)
  );
end entity;

architecture rtl of top is
begin
  u: entity work.adder_n generic map (N => 4) port map (x => x, y => y, sum => sum);
end architecture;
`,
    steps: ['x=0001 y=0001', 'x=0111 y=0001', 'x=1000 y=1000', 'x=1111 y=0001', 'x=1111 y=1111', 'x=0101 y=1010']
});

/* ============================================= 5 Combinational processes */
page('comb', 'processes', 'Processes and sequential statements', `Concurrent statements describe hardware one piece at a time. A **process** describes a piece of hardware with a small program: statements that run one after another, from top to bottom, as in software.

~~~
process(all)
begin
  -- sequential statements
end process;
~~~

The list in parentheses is the **sensitivity list**. The process runs once when the simulation starts, and again whenever a signal in the list changes. {process(all)}, new in VHDL-2008, means every signal the process reads, which is the right list for combinational logic. Older code names them: {process(a, b, sel)}.

Signal assignments inside a process do not change the signal at once. They are collected while the process runs and take effect together when it stops. A process that assigns the same signal twice therefore keeps only the last assignment, which makes a useful pattern possible: give every output a default value first, and override it where needed.

## if

~~~
if sel = "00" then
  y <= a;
elsif sel = "01" then
  y <= b;
else
  y <= c;
end if;
~~~

The conditions are tried in order and the first true one wins, so an if chain describes **priority**. Note the spelling {elsif}.

## case

~~~
case sel is
  when "00"        => y <= a;
  when "01" | "10" => y <= b;
  when others      => y <= c;
end case;
~~~

A case statement selects by value. Its choices must cover every possible value of the expression exactly once, and since a {std_logic_vector} can also hold {'U'}, {'X'} and the other values, {when others} is practically always needed. The choices cannot overlap, so a case has no priority: it describes a plain multiplexer. The VHDL-2008 form {case?} treats {'-'} in the choices as "don't care".

## Loops

~~~
for i in 0 to 7 loop ... end loop;
for i in d'range loop ... end loop;     -- every index of d
~~~

A loop in synthesizable code has fixed bounds, and it takes no time: synthesis **unrolls** it, building one copy of the body for each value of the index. {exit} leaves a loop early, {next} skips to the next round. A {while} loop exists too, but synthesis tools accept it only when they can work out its bounds.

## Variables

A **variable** is declared between {process} and {begin} and assigned with {:=}. Unlike a signal, it changes at once, so the next statement already sees the new value. Variables are handy for intermediate results inside a process; they cannot be seen outside it.

The example puts it all together: a priority encoder that reports the highest active request. Its loop runs over all four requests, and because a later assignment overrides an earlier one, the highest index wins.

~~~try prio_enc`);
ex('prio_enc', {
    code: `${HN}
entity prio_enc is
  port (
    req   : in  std_logic_vector(3 downto 0);
    idx   : out std_logic_vector(1 downto 0);
    valid : out std_logic
  );
end entity;

architecture rtl of prio_enc is
begin
  process(all)
  begin
    idx   <= "00";                  -- defaults
    valid <= '0';
    for i in 0 to 3 loop
      if req(i) = '1' then          -- a higher i overrides a lower one
        idx   <= std_logic_vector(to_unsigned(i, 2));
        valid <= '1';
      end if;
    end loop;
  end process;
end architecture;
`,
    steps: ['req=0000', 'req=0001', 'req=0011', 'req=0110', 'req=0100', 'req=1000', 'req=1011']
});

page('comb', 'latches', 'Latches and other traps', `A process that describes combinational logic must give every output a value **every time it runs**. If some path through the process skips an output, the output has to keep its old value, and keeping a value takes memory. Synthesis then builds a **latch**: a storage element that is transparent while a condition holds and holds its value otherwise. Latches are hard to analyze for timing, and in FPGA designs they are almost always a bug.

~~~try latch_demo

In the waveform, {q} follows {d} while {en} is {'1'} and freezes when {en} drops to {'0'}: the process does not assign {q} then. The checker warns about it below the waveform.

## The cure: defaults

Assign every output at the top of the process. A later assignment overrides the default where needed, and no path is left without a value:

~~~
process(all)
begin
  q <= '0';            -- the default
  if en = '1' then
    q <= d;
  end if;
end process;
~~~

The same applies to every branch of every {if} and {case}: {when others => null;} in a combinational case statement is a latch whenever an output is not assigned before it.

## An incomplete sensitivity list

With an explicit list, a forgotten signal does not stop synthesis: the hardware reacts to all its inputs anyway. The simulation, however, runs the process only for the listed signals, so the simulated circuit and the real one disagree. {process(all)} avoids the problem; the checker warns when a list is incomplete.

## Reading a signal you just assigned

Inside a process, a signal keeps its old value until the process stops. In

~~~
tmp <= a and b;
y   <= tmp or c;       -- still the old tmp
~~~

the second line reads the **old** {tmp}. The process then runs a second time, because {tmp} changed, and the result is right again, but only with {process(all)}, and at the cost of an extra pass. For intermediate values inside a process, use a variable: {v := a and b; y <= v or c;}.

!> A combinational loop, an output that feeds back into its own inputs without a register, is another trap. It never settles in simulation, and in hardware it may oscillate.`);
ex('latch_demo', {
    code: `${H}
entity latch_demo is
  port (
    d, en : in  std_logic;
    q     : out std_logic
  );
end entity;

architecture rtl of latch_demo is
begin
  process(all)
  begin
    if en = '1' then
      q <= d;
    end if;          -- no else: q keeps its value while en = '0'
  end process;
end architecture;
`,
    steps: ['d=1 en=1', 'd=0 en=1', 'd=1 en=1', 'd=1 en=0', 'd=0 en=0', 'd=1 en=0', 'd=0 en=1', 'd=1 en=0']
});

/* ================================================== 6 Sequential logic */
page('clocked', 'registers', 'Flip-flops and registers', `Combinational logic computes its outputs from its present inputs alone. **Sequential logic** also remembers: its outputs depend on what happened before, and the memory sits in flip-flops. (Do not confuse it with the sequential statements of a process: a process can describe either kind.)

Almost every digital design is **synchronous**: one clock signal drives all registers, and at each rising edge of the clock every register stores the value at its input. Between two edges, the combinational logic computes the next values from the current ones. As long as that logic settles within one clock period, the circuit does exactly what its description says, and checking that it does is the job of the timing analysis that every FPGA and chip flow runs.

## The D flip-flop

~~~
process(clk)
begin
  if rising_edge(clk) then
    q <= d;
  end if;
end process;
~~~

{rising_edge(clk)} is true at the moment {clk} goes from {'0'} to {'1'}. Older code writes {clk'event and clk = '1'}, which means nearly the same. {falling_edge} exists too, but a design normally uses one edge throughout.

Every signal that is assigned inside the {rising_edge} branch becomes a **register**, one flip-flop per bit. Reading such a signal gives its current value, the one from before the edge. That is why {count <= count + 1;} works and {a <= b; b <= a;} swaps two registers.

## Enables

A condition inside the clocked branch gives a register with an **enable**: {if en = '1' then q <= d; end if;}. When the condition is false, {q} is not assigned and keeps its value. In a clocked process that is not a latch: holding the value is exactly what a register does.

## Resets

A **synchronous** reset is an ordinary condition inside the clocked branch and acts at a clock edge. An **asynchronous** reset acts at once: it comes before {rising_edge} and belongs in the sensitivity list.

~~~
process(clk, areset)                       process(clk)
begin                                      begin
  if areset = '1' then                       if rising_edge(clk) then
    q <= '0';                                  if reset = '1' then
  elsif rising_edge(clk) then                    q <= '0';
    q <= d;                                    else
  end if;                                        q <= d;
end process;                                   end if;
                                             end if;
                                           end process;
~~~

Which one to use depends on the technology and on the team's rules: chip designs often use asynchronous resets, FPGA guides often recommend synchronous ones, and many datapath registers need no reset at all. FPGA registers also get a value when the device is configured; {signal q : std_logic := '0';} describes it, and simulators start from it instead of {'U'}.

## A counter

The example counts the clock edges while {en} is {'1'}. Its first column shows {'U'}: no edge has come yet, so the counter has no value. The type {unsigned}, which can add, comes from the package {numeric_std} of chapter 9.

~~~try counter_en`);
ex('counter_en', {
    clk: 'clk',
    code: `${HN}
entity counter_en is
  port (
    clk, reset, en : in  std_logic;
    q              : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of counter_en is
  signal count : unsigned(3 downto 0);
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if reset = '1' then
        count <= (others => '0');
      elsif en = '1' then
        count <= count + 1;
      end if;
    end if;
  end process;

  q <= std_logic_vector(count);
end architecture;
`,
    steps: ['reset=1 en=0', 'reset=0 en=1', 'en=1', 'en=1', 'en=0', 'en=0', 'en=1', 'en=1', 'reset=1', 'reset=0 en=1', 'en=1', 'en=1']
});

page('clocked', 'counters', 'Counters, shift registers and clock enables', `Counters and shift registers are the workhorses of sequential logic.

## Counters

An {unsigned} counter wraps around by itself: a 4-bit counter goes from 15 to 0. A counter with another limit compares and starts over:

~~~
if count = 9 then
  count <= (others => '0');
else
  count <= count + 1;
end if;
~~~

Counters measure time: at 100 MHz, a counter that wraps every 100 million cycles marks one second.

## Clock enables instead of new clocks

A tempting way to make a slow clock is to use a counter bit as the clock of other registers. Don't. A clock made by logic arrives later than the real one, it can glitch, and the timing tools cannot check the paths between the two clocks properly. Keep a single clock, and make a one-cycle pulse, a **tick**, that enables the registers that should run slower. They still use the fast clock, but change only when the tick is {'1'}.

## Shift registers

A shift register moves its bits by one place at each edge. Concatenation writes it in one line:

~~~
reg <= reg(2 downto 0) & din;      -- shift left, din enters at bit 0
~~~

It turns a serial input into parallel bits, delays a signal by a number of cycles, or, with feedback from a few of its bits, generates pseudo-random numbers (the LFSR exercise).

The example combines the two ideas: a counter makes a tick every third clock cycle, and the shift register moves only on a tick. The signals start with initial values, {:= 0} and {:= "0000"}, so the waveform has no {'U'}.

~~~try tick_shift

## Detecting an edge

To act on the moment a signal changes, keep its value from the previous cycle in a register and compare: {level and not prev} is {'1'} for one cycle after {level} rises. Edge detectors, counters and shift registers return in almost every exercise from here on.`);
ex('tick_shift', {
    clk: 'clk',
    code: `${H}
entity tick_shift is
  port (
    clk, din : in  std_logic;
    tick     : out std_logic;
    sr       : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of tick_shift is
  signal count : integer range 0 to 2 := 0;
  signal t     : std_logic;
  signal reg   : std_logic_vector(3 downto 0) := "0000";
begin
  t <= '1' when count = 2 else '0';      -- one cycle in three

  process(clk)
  begin
    if rising_edge(clk) then
      if count = 2 then
        count <= 0;
      else
        count <= count + 1;
      end if;
      if t = '1' then                     -- the clock enable
        reg <= reg(2 downto 0) & din;
      end if;
    end if;
  end process;

  tick <= t;
  sr   <= reg;
end architecture;
`,
    steps: ['din=1', 'din=1', 'din=1', 'din=0', 'din=0', 'din=0', 'din=1', 'din=1', 'din=1', 'din=1', 'din=0', 'din=1', 'din=0', 'din=0', 'din=0']
});

page('clocked', 'async-inputs', 'Inputs from outside the clock', `A flip-flop needs its input to be stable for a short time around the clock edge: the **setup time** before it and the **hold time** after it. Inside a synchronous design, timing analysis makes sure of that. A signal from outside, such as a button, a sensor or a design with another clock, can change at any moment, also right at the edge.

## Metastability

When the input changes inside that window, the flip-flop can become **metastable**: its output hangs between {'0'} and {'1'} for an unpredictable time before it falls to one side. Logic that reads it meanwhile may see a {'0'} in one place and a {'1'} in another, and the design misbehaves in ways that no simulation shows.

The cure is a **synchronizer**: two flip-flops in a row, and the rest of the design reads only the second. The first may go metastable, but it has a whole clock period to settle before the second samples it, and the chance that it has not settled by then is tiny. It shrinks exponentially with the time available, so slow designs and fast technologies are safe with two stages, and very fast designs sometimes use three.

~~~try sync_demo

The synchronized signal follows the input two clock edges later. That delay is the price of safety.

## Rules

- Synchronize every asynchronous single-bit input once, at one place, and use only the synchronized version.
- Never read the first stage.
- Never synchronize the bits of a bus one by one: they may be caught in different cycles, and the receiver sees a value that never existed. Buses cross between clock domains with a handshake or an asynchronous FIFO.

## Bouncing switches

Mechanical switches have a second problem: their contacts bounce for a few milliseconds, so one press looks like several. A **debouncer** accepts a new level only after the input has kept it for a while. Both circuits are exercises of this chapter.`);
ex('sync_demo', {
    clk: 'clk',
    code: `${H}
entity sync_demo is
  port (
    clk, async_in : in  std_logic;
    synced        : out std_logic
  );
end entity;

architecture rtl of sync_demo is
  signal s1, s2 : std_logic := '0';
begin
  process(clk)
  begin
    if rising_edge(clk) then
      s1 <= async_in;      -- may go metastable
      s2 <= s1;            -- has a whole clock period to settle
    end if;
  end process;

  synced <= s2;
end architecture;
`,
    steps: ['async_in=0', 'async_in=1', 'async_in=1', 'async_in=1', 'async_in=1', 'async_in=0', 'async_in=0', 'async_in=0', 'async_in=1', 'async_in=0', 'async_in=0', 'async_in=0']
});

/* ===================================================== 7 State machines */
page('fsm', 'fsm', 'State machines', `Many circuits must remember what happened before: a lock that waits for the right sequence of keys, a protocol that knows which part of a frame is coming, a traffic light that knows which colour is on. What they remember is their **state**, and a circuit built around a state is a **finite state machine** (FSM). It has three parts:

- the **state register**, which holds the current state;
- the **next-state logic**, which computes the next state from the current state and the inputs;
- the **output logic**, which computes the outputs.

An FSM is planned as a **state diagram**: a circle for each state, and an arrow for each transition, labelled with the input that causes it.

## States in VHDL

An enumerated type names the states, and a signal of that type is the state register:

~~~
type state_t is (zero, one, two);
signal state, next_state : state_t;
~~~

The names say what each state means; the synthesis tool chooses the bit patterns.

## One process or two

The clocked designs so far computed their next values inside the clocked process. Another common style splits the machine in two: a clocked process that only stores the state, and a combinational process that computes {next_state}. The example below uses the split style for a machine that counts the {1}s in a row of its input, up to two, and outputs {found} at two.

~~~try ones2

Both styles build the same hardware. The split one shows the next-state logic plainly as combinational logic, but it is also subject to the rules of combinational processes: the default {next_state <= state;} at the top prevents latches.

## Moore and Mealy

- In a **Moore** machine, the outputs depend on the state alone. They change only at clock edges, right after the state does.
- In a **Mealy** machine, the outputs depend on the state and the current inputs. They can react within the same clock cycle as the input, often with fewer states, but an input glitch reaches the output.

The example is a Moore machine: {found} is computed from {state} only. The next page compares the two kinds on the same task.`);
ex('ones2', {
    clk: 'clk',
    code: `${H}
entity ones2 is
  port (
    clk, reset, din : in  std_logic;
    found           : out std_logic
  );
end entity;

architecture rtl of ones2 is
  type state_t is (zero, one, two);     -- how many 1s in a row, up to two
  signal state, next_state : state_t;
begin
  -- the state register
  process(clk)
  begin
    if rising_edge(clk) then
      if reset = '1' then
        state <= zero;
      else
        state <= next_state;
      end if;
    end if;
  end process;

  -- the next-state logic
  process(all)
  begin
    next_state <= state;                -- the default: stay
    case state is
      when zero => if din = '1' then next_state <= one; end if;
      when one  => if din = '1' then next_state <= two; else next_state <= zero; end if;
      when two  => if din = '0' then next_state <= zero; end if;
    end case;
  end process;

  -- the output logic: Moore, from the state alone
  found <= '1' when state = two else '0';
end architecture;
`,
    steps: ['reset=1 din=0', 'reset=0 din=1', 'din=1', 'din=1', 'din=0', 'din=1', 'din=0', 'din=1', 'din=1', 'din=0', 'din=0']
});

page('fsm', 'fsm-design', 'Designing a state machine', `Turning a description in words into a state machine is a skill of its own. A good order of work:

1. **Find what the machine must remember.** Each state answers the question "what do I need to know about the past?". A detector for the pattern {1011} needs to know how much of the pattern it has seen: nothing, {1}, {10} or {101}, which makes four states.
2. **Draw the diagram**, and give every state an arrow for every input. The arrows that stay in the same state, or that fall back to an earlier one, are the easiest to forget, and they are where bugs live.
3. **Choose Moore or Mealy.** A Mealy machine reacts in the same cycle and often needs fewer states. Moore outputs come straight from the register: they cannot glitch, and no combinational path runs from the inputs to the outputs, which makes timing easier when the outputs leave the chip.
4. **Write the VHDL and test the corners**: a reset in every state, events that come back to back, patterns that overlap.

## The same task, both ways

The example detects two {1}s in a row, with a Mealy output and a Moore output from the same state register. Compare them in the waveform: {mealy} rises in the cycle of the second {1}, {moore} one cycle later.

~~~try mealy_moore

## Encodings and safety

With an enumerated state type, the synthesis tool chooses the encoding: binary, with as few flip-flops as possible, or **one-hot**, with one flip-flop per state, which FPGAs often prefer because the next-state logic gets simpler. Tools usually report their choice, and they can be told otherwise when it matters.

A register with more bit patterns than states can, after a disturbance such as radiation, end up in a pattern that is no state at all. Designs that must recover from that need tool-specific settings for "safe" state machines; the {when others} of a case statement alone does not guarantee it, because the synthesis tool knows that the missing patterns cannot be reached in a correct circuit.`);
ex('mealy_moore', {
    clk: 'clk',
    code: `${H}
entity two_ones is
  port (
    clk, reset, din : in  std_logic;
    mealy, moore    : out std_logic
  );
end entity;

architecture rtl of two_ones is
  type state_t is (s0, s1, s11);        -- the last bits seen: none, 1, 11
  signal state : state_t;
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if reset = '1' then
        state <= s0;
      elsif din = '1' then
        if state = s0 then
          state <= s1;
        else
          state <= s11;
        end if;
      else
        state <= s0;
      end if;
    end if;
  end process;

  mealy <= '1' when state /= s0 and din = '1' else '0';   -- state and input
  moore <= '1' when state = s11 else '0';                  -- state alone
end architecture;
`,
    steps: ['reset=1 din=0', 'reset=0 din=1', 'din=1', 'din=0', 'din=1', 'din=1', 'din=1', 'din=0', 'din=1', 'din=0', 'din=0']
});

/* ====================================== 8 Selection, loops and generate */
page('more', 'selection', 'Conditional and selected assignments', `Two concurrent statements make choices without a process.

The **conditional assignment** tries its conditions in order, like an if chain, so earlier conditions have priority:

~~~
y <= a when sel = "00" else
     b when sel = "01" else
     c;
~~~

The **selected assignment** chooses by the value of one expression, like a case statement. Its choices must cover every value, usually with {others}, and they cannot overlap, so there is no priority:

~~~
with sel select
  y <= a when "00",
       b when "01",
       c when others;
~~~

Both are shorthands: the simulator treats each as a process with an {if} or a {case} inside. For a choice by one selector value, all three forms build the same multiplexer, as the example shows; where the conditions test different signals, only the conditional form and {if} can express the priority. VHDL-2008 adds {select?}, which, like {case?}, treats {'-'} in the choices as "don't care".

~~~try mux3ways

## Which to use

- A plain multiplexer or a decoder table: the selected assignment or a {case}.
- Priority among different conditions: the conditional assignment or an {if} chain.
- Several outputs that depend on the same choice: one process with a {case}, instead of one statement per output.`);
ex('mux3ways', {
    code: `${H}
entity mux3ways is
  port (
    d          : in  std_logic_vector(3 downto 0);
    s          : in  std_logic_vector(1 downto 0);
    y1, y2, y3 : out std_logic
  );
end entity;

architecture rtl of mux3ways is
begin
  -- 1. a conditional assignment
  y1 <= d(0) when s = "00" else
        d(1) when s = "01" else
        d(2) when s = "10" else
        d(3);

  -- 2. a selected assignment
  with s select
    y2 <= d(0) when "00",
          d(1) when "01",
          d(2) when "10",
          d(3) when others;

  -- 3. a process with a case statement
  process(all)
  begin
    case s is
      when "00"   => y3 <= d(0);
      when "01"   => y3 <= d(1);
      when "10"   => y3 <= d(2);
      when others => y3 <= d(3);
    end case;
  end process;
end architecture;
`,
    steps: ['d=0101 s=00', 'd=0101 s=01', 'd=0101 s=10', 'd=0101 s=11', 'd=1100 s=00', 'd=1100 s=10', 'd=1100 s=11']
});

page('more', 'loops', 'Loops, generate and arrays', `VHDL repeats things in two ways, and they are easy to confuse.

- A **for loop** inside a process repeats sequential statements. It is part of the behavior of one process. Synthesis unrolls it into as many copies of the logic as the loop has rounds.
- A **for ... generate** outside any process repeats concurrent statements and instances. It decides how much hardware exists, before the simulation starts.

Both cost hardware for every round. A loop that adds sixteen numbers builds fifteen adders, and nothing makes it run "faster" or "slower": it is all there, all the time.

## Counting with a loop

The example counts the {1}s of a byte, the **population count**. A variable collects the count while the loop walks over {d'range}, the index range of {d}, so the same code works for any width.

~~~try popcount

## Arrays of vectors

A memory, a set of registers or the stages of a pipeline are naturally arrays whose elements are vectors. Declare the array type first, then signals or constants of it:

~~~
type word_array is array (0 to 3) of std_logic_vector(7 downto 0);
signal words : word_array;
...
words(2) <= x"5A";          -- one element, a vector
y <= words(1)(7);           -- bit 7 of element 1
~~~

An array type can also leave its range open, {array (natural range <>) of ...}, and let each signal or constant choose it. Chapter 11 builds memories from such arrays.

## exit and next

{exit} leaves a loop, {exit when x(i) = '1';} as soon as a condition holds; {next} skips the rest of the current round. In hardware, an {exit} becomes priority logic: each round only "happens" if no earlier round left the loop.`);
ex('popcount', {
    code: `${HN}
entity popcount is
  port (
    d     : in  std_logic_vector(7 downto 0);
    count : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of popcount is
begin
  process(all)
    variable n : integer range 0 to 8;
  begin
    n := 0;
    for i in d'range loop
      if d(i) = '1' then
        n := n + 1;
      end if;
    end loop;
    count <= std_logic_vector(to_unsigned(n, 4));
  end process;
end architecture;
`,
    steps: ['d=00000000', 'd=00000001', 'd=10000001', 'd=01110000', 'd=11111110', 'd=11111111', 'd=10101010']
});

/* ============================================== 9 Numbers and arithmetic */
page('numeric', 'numeric-std', 'unsigned, signed and conversions', `A {std_logic_vector} is a row of bits and nothing more: VHDL does not know whether {"1111"} means 15, minus one or four LEDs, and it refuses to add two of them. The package {numeric_std} adds two types that are numbers: {unsigned}, and {signed} in two's complement.

~~~
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
~~~

Both are arrays of {std_logic}, exactly like {std_logic_vector}, so converting between them costs nothing: the bits stay where they are and only their meaning changes.

| From | To | Write |
|---|---|---|
| {std_logic_vector} | {unsigned} or {signed} | {unsigned(v)}, {signed(v)} |
| {unsigned} or {signed} | {std_logic_vector} | {std_logic_vector(u)} |
| {unsigned} or {signed} | {integer} | {to_integer(u)} |
| {integer} | {unsigned} | {to_unsigned(i, width)} |
| {integer} | {signed} | {to_signed(i, width)} |
| {unsigned} | {signed} | {signed('0' & u)}, one bit wider |

## How wide is a result?

- {+} and {-} give a result as wide as the wider operand, so the carry is lost and the sum wraps around. To keep it, widen an operand first: {resize(unsigned(a), 9) + unsigned(b)}.
- {*} gives a result as wide as both operands together: 8 bits times 8 bits makes 16.
- An operand may be an integer: {count + 1}, {count = 9}.
- Comparisons compare values, also between different widths: {unsigned'("0011") = unsigned'("011")} is true, unlike the same comparison on {std_logic_vector}.

~~~try add_widths

## Integers

{integer} covers at least the 32-bit range; {natural} and {positive} are its subtypes from 0 and from 1 up. For synthesis, give integer signals a range, {signal count : integer range 0 to 9;}, and the tool builds just enough bits. Integers suit counters and indexes; vectors suit buses and anything whose bits matter one by one.

!> Avoid the packages {std_logic_arith}, {std_logic_unsigned} and {std_logic_signed}. They come from an old vendor library, were never part of the standard, and clash with {numeric_std}. Old code and some tutorials still use them.`);
ex('add_widths', {
    code: `${HN}
entity add_widths is
  port (
    a, b     : in  std_logic_vector(7 downto 0);
    sum8     : out std_logic_vector(7 downto 0);
    sum9     : out std_logic_vector(8 downto 0);
    a_less_b : out std_logic
  );
end entity;

architecture rtl of add_widths is
begin
  sum8     <= std_logic_vector(unsigned(a) + unsigned(b));             -- wraps around
  sum9     <= std_logic_vector(resize(unsigned(a), 9) + unsigned(b));  -- keeps the carry
  a_less_b <= '1' when unsigned(a) < unsigned(b) else '0';
end architecture;
`,
    steps: ['a=00000001 b=00000010', 'a=11111111 b=00000001', 'a=10000000 b=10000000', 'a=00001010 b=11110110', 'a=11001000 b=01100100']
});

page('numeric', 'signed', 'Signed numbers, overflow and fixed point', `In **two's complement**, the most significant bit counts negative: in 8 bits it is worth -128, so {"11111111"} is -128 + 127 = -1, and the range runs from -128 to 127. Negating a number means inverting its bits and adding one. The same adder handles signed and unsigned numbers; only the interpretation of the bits, and of the overflow, differs.

## Widening

{resize} pads an {unsigned} with zeros, but a {signed} with copies of its sign bit (**sign extension**), so that the value stays the same: -1 in 8 bits becomes -1 in 12 bits. The same bits also compare differently: as {unsigned}, {"11110000"} is 240; as {signed}, it is -16.

~~~try signed_view

## Overflow

- An **unsigned** sum overflows when the carry out of the top bit is {1}.
- A **signed** sum overflows when both operands have the same sign and the result has the other one: 100 + 100 gives -56 in 8 bits. Equivalently, the carry into the top bit differs from the carry out of it.

A design either makes the result wide enough, or detects the overflow and reacts: it can **saturate**, clamping the result to the largest or smallest value, which is what audio and video circuits usually want.

Watch the one value without a partner: -128 has no +128 in 8 bits, so negating it gives -128 again, and so does {abs}.

## Shifts

{shift_left(x, k)} and {shift_right(x, k)} shift by {k} places. For {signed}, {shift_right} copies the sign bit, so it divides by 2^k and rounds toward minus infinity: -7 shifted right by one is -4.

## Fixed point

Fractions in hardware are integers with an agreed scale. In a **Qm.n** format, a number has {m} integer bits and {n} fraction bits and stands for its integer value divided by 2^n. Q4.4 holds 0 to 15.9375 in steps of 1/16, if unsigned.

- To add two fixed-point numbers, their points must line up: same {n}, or shift one first.
- A product has the fraction bits of both operands: Q4.4 times Q4.4 is Q8.8. Taking the upper bits again divides by 2^n.
- Dropping fraction bits rounds down. To round to the nearest value, add half of the last kept bit first.`);
ex('signed_view', {
    code: `${HN}
entity signed_view is
  port (
    x            : in  std_logic_vector(7 downto 0);
    lt_u, lt_s   : out std_logic;                       -- x < 16, read both ways
    ext_u, ext_s : out std_logic_vector(11 downto 0)
  );
end entity;

architecture rtl of signed_view is
begin
  lt_u  <= '1' when unsigned(x) < 16 else '0';
  lt_s  <= '1' when signed(x) < 16 else '0';
  ext_u <= std_logic_vector(resize(unsigned(x), 12));   -- zeros in front
  ext_s <= std_logic_vector(resize(signed(x), 12));     -- copies of the sign bit
end architecture;
`,
    steps: ['x=00000101', 'x=00010000', 'x=01111111', 'x=10000000', 'x=11110000', 'x=11111111']
});

/* ===================================== 10 Types, functions and packages */
page('types', 'types', 'Types, subtypes and attributes', `VHDL is **strongly typed**. Every signal, variable and constant has a type, and values of different types never mix without an explicit conversion. That catches many mistakes early: an {unsigned} added to a {signed}, a {boolean} assigned to a {std_logic}.

## Scalar types

- **Integer** types, with a range: {integer}, {natural}, or your own {type percent is range 0 to 100;}.
- **Enumeration** types list their values by name. State types are enumerations, and so are {boolean}, which is {(false, true)}, and {std_logic}, whose values are nine characters.
- **Physical** types such as {time}, with units: {10 ns}. They belong to testbenches.
- {real}, for simulation models only: synthesis tools do not build floating-point hardware from it.

## Subtypes

A **subtype** is a type with a constraint, and it mixes freely with its base type:

~~~
subtype byte  is std_logic_vector(7 downto 0);
subtype digit is integer range 0 to 9;
~~~

Assigning 10 to a {digit} stops the simulation with an error, which turns a silent overflow into a visible one. {natural} itself is a subtype of {integer}.

## Arrays and constants

An array type is **constrained**, with a fixed range, or **unconstrained**, with {range <>}, and then every signal of the type picks its own range. {std_logic_vector} is unconstrained: {type std_logic_vector is array (natural range <>) of std_logic}, more or less. A **constant** gets its value where it is declared: {constant DEPTH : positive := 16;}.

## Attributes

| Attribute | Gives |
|---|---|
| {v'length}, {v'range} | the number of elements, the index range |
| {v'high}, {v'low}, {v'left}, {v'right} | the bounds of the range |
| {T'pos(x)}, {T'val(n)} | the position of a value in its type, the value at a position |
| {T'succ(x)}, {T'pred(x)} | the next and the previous value |
| {T'image(x)} | the value as text, for reports |
| {s'event} | true when the signal has just changed |

~~~try enum_attr

## Conversion and qualification

A **type conversion** changes the type between closely related types: {unsigned(v)}, {integer(x)}. A **qualified expression** changes nothing; it only says which type an ambiguous expression has: {unsigned'("1010")} tells that the string is an {unsigned}, where it could also be a {std_logic_vector} or a {string}.`);
ex('enum_attr', {
    code: `${HN}
entity enum_attr is
  port (
    sel   : in  std_logic_vector(1 downto 0);
    nxt   : out std_logic_vector(1 downto 0);
    is_hi : out std_logic
  );
end entity;

architecture rtl of enum_attr is
  type level_t is (off, low, mid, high);
  signal lvl, nxt_lvl : level_t;
begin
  lvl     <= level_t'val(to_integer(unsigned(sel)));          -- number to name
  nxt_lvl <= level_t'low when lvl = level_t'high else level_t'succ(lvl);
  nxt     <= std_logic_vector(to_unsigned(level_t'pos(nxt_lvl), 2));  -- name to number
  is_hi   <= '1' when lvl = level_t'high else '0';
end architecture;
`,
    steps: ['sel=00', 'sel=01', 'sel=10', 'sel=11']
});

page('types', 'packages', 'Functions and packages', `A **function** computes a value from its parameters:

~~~
function parity(v : std_logic_vector) return std_logic is
  variable p : std_logic := '0';
begin
  for i in v'range loop
    p := p xor v(i);
  end loop;
  return p;
end function;
~~~

- Parameters are constants inside the function. A parameter without a range, as here, takes the range of whatever the call passes in, and {v'range} adapts to it.
- A function may declare variables, use loops and ifs, and must end with {return}. It cannot wait and cannot assign signals: it describes combinational logic, and synthesis copies it into each place where it is called.
- Several functions may share a name if their parameter types differ: this **overloading** is how {numeric_std} gives one {+} for {unsigned} and another for {signed}.

A **procedure** is the statement version: it returns nothing, but it can have {out} parameters and, in a process, wait. Procedures are popular in testbenches. (The simulator of this book does not run procedures; GHDL and the commercial simulators do.)

## Packages

Functions that several designs need, together with constants and types, belong in a **package**. Its declaration lists what it offers; its body holds the code of its functions:

~~~
package util_pkg is
  function max(a, b : unsigned) return unsigned;
end package;

package body util_pkg is
  function max(a, b : unsigned) return unsigned is ... end function;
end package body;
~~~

A design unit that wants them says {use work.util_pkg.all;}, just as it says {use ieee.numeric_std.all;}, which is a package too. The example defines a package with a constant, a subtype and a function, and uses all three:

~~~try pkg_demo`);
ex('pkg_demo', {
    code: `${HN}
package util_pkg is
  constant WIDTH : positive := 8;
  subtype word is unsigned(WIDTH - 1 downto 0);
  function max(a, b : word) return word;
end package;

package body util_pkg is
  function max(a, b : word) return word is
  begin
    if a > b then
      return a;
    else
      return b;
    end if;
  end function;
end package body;

${HN}use work.util_pkg.all;

entity pkg_demo is
  port (
    a, b, c : in  std_logic_vector(WIDTH - 1 downto 0);
    biggest : out std_logic_vector(WIDTH - 1 downto 0)
  );
end entity;

architecture rtl of pkg_demo is
begin
  biggest <= std_logic_vector(max(max(unsigned(a), unsigned(b)), unsigned(c)));
end architecture;
`,
    steps: ['a=00000011 b=00000101 c=00000100', 'a=11111111 b=00000000 c=10000000', 'a=00010000 b=00100000 c=01000000', 'a=01111111 b=01111111 c=00000001']
});

/* ======================================================== 11 Memories */
page('mem', 'memories', 'ROMs and RAMs', `A memory is an array whose index is the address.

## ROM

A ROM is a constant array. Its contents can be written out, or computed by a function while the design is elaborated, before the simulation starts:

~~~try rom_squares

The function {make_squares} never becomes hardware: it runs once, and only its result, the table, is built.

## RAM

A RAM is an array **signal**, written in a clocked process:

~~~
process(clk)
begin
  if rising_edge(clk) then
    if we = '1' then
      ram(to_integer(unsigned(addr))) <= din;
    end if;
  end if;
end process;
~~~

How it is read decides what hardware a synthesis tool can use:

- An **asynchronous** read, {dout <= ram(to_integer(unsigned(addr)));} outside the process, follows the address at once. FPGAs build it from their lookup tables ("distributed RAM"), which suits small memories.
- A **synchronous** read assigns {dout} inside the clocked process, so the data arrives one cycle after its address. The large memory blocks of FPGAs ("block RAM") work this way, and a tool can map such a description onto them.

Synthesis tools recognize memories by these patterns; the vendors publish templates for single-port, dual-port and byte-enable memories, and code that strays from them may end up as thousands of flip-flops instead. When the same address is written and read in one cycle, a synchronous read in the same clocked process gets the old word, because the signal changes only after the process has run. This is called read-first.

~~~try ram4

The example initializes the RAM to zeros with {:= (others => (others => '0'))}: an aggregate whose elements are aggregates. FPGAs can preload memories at configuration this way; the RAMs of a chip start with whatever they happen to hold.`);
ex('rom_squares', {
    code: `${HN}
entity rom_squares is
  port (
    n  : in  std_logic_vector(3 downto 0);
    sq : out std_logic_vector(7 downto 0)
  );
end entity;

architecture rtl of rom_squares is
  type rom_t is array (0 to 15) of unsigned(7 downto 0);

  function make_squares return rom_t is
    variable r : rom_t;
  begin
    for i in 0 to 15 loop
      r(i) := to_unsigned(i * i, 8);
    end loop;
    return r;
  end function;

  constant SQUARES : rom_t := make_squares;
begin
  sq <= std_logic_vector(SQUARES(to_integer(unsigned(n))));
end architecture;
`,
    steps: ['n=0000', 'n=0001', 'n=0010', 'n=0011', 'n=0111', 'n=1010', 'n=1111']
});
ex('ram4', {
    clk: 'clk',
    code: `${HN}
entity ram4 is
  port (
    clk, we : in  std_logic;
    addr    : in  std_logic_vector(1 downto 0);
    din     : in  std_logic_vector(3 downto 0);
    dout    : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of ram4 is
  type ram_t is array (0 to 3) of std_logic_vector(3 downto 0);
  signal ram : ram_t := (others => (others => '0'));
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if we = '1' then
        ram(to_integer(unsigned(addr))) <= din;
      end if;
    end if;
  end process;

  dout <= ram(to_integer(unsigned(addr)));     -- asynchronous read
end architecture;
`,
    steps: ['we=1 addr=00 din=0011', 'we=1 addr=01 din=0101', 'we=1 addr=10 din=1001', 'we=0 addr=00 din=0000', 'we=0 addr=01', 'we=0 addr=10', 'we=0 addr=11', 'we=1 addr=01 din=1111', 'we=0 addr=01', 'we=0 addr=00']
});

page('mem', 'fifos', 'Register files and FIFOs', `Two kinds of memory appear in almost every larger design.

## Register files

A processor keeps its registers in a **register file**, a small memory with several ports: an instruction reads two operands and writes one result in the same clock cycle. In VHDL that is one array, one clocked write, and two independent reads:

~~~
process(clk)
begin
  if rising_edge(clk) then
    if we = '1' then
      regs(to_integer(unsigned(wa))) <= wd;
    end if;
  end if;
end process;

rd1 <= regs(to_integer(unsigned(ra1)));
rd2 <= regs(to_integer(unsigned(ra2)));
~~~

FPGA tools often build the second read port by keeping two copies of the memory, each with one read port; the description does not change.

## FIFOs

A **FIFO** passes data from a producer to a consumer that work at different paces, keeping the order. Inside, it is a RAM used as a **circular buffer**: a write pointer marks where the next word goes, a read pointer marks the oldest word, and both wrap around at the end of the array.

Equal pointers can mean "empty" or "full", so the FIFO needs one more piece of information. Two common answers:

- keep a **count** of the stored words, as the exercise does;
- make each pointer **one bit wider** than the address. When the pointers are equal including that extra bit, the FIFO is empty; when they differ only in the extra bit, the writer is one full lap ahead, and the FIFO is full.

A **standard** FIFO delivers a word one cycle after the read request, like a block RAM. A **first-word fall-through** FIFO shows the oldest word on its output all the time, so the read request just says "I took it".

## Across clock domains

A FIFO whose two sides run on different clocks is the standard way to move data between clock domains. Each pointer has to cross to the other side through a synchronizer, and for that it is kept in Gray code: consecutive values differ in one bit only, so even a value caught in the middle of a change is either the old pointer or the new one. That design is a classic of its own; the books in the last chapter cover it.`);

/* ====================================== 12 Register-transfer design */
page('rtl', 'fsmd', 'Datapath and controller', `Many algorithms are loops: add the numbers 1 to n, multiply by repeated addition, find a greatest common divisor by subtraction. Built as combinational logic, every round of the loop would be a copy of the hardware. **Register-transfer design** turns the loop into time instead: one set of hardware, used once per clock cycle.

The design has two parts:

- the **datapath**: registers for the variables of the algorithm, and the operators between them;
- the **controller**: a state machine that decides, in each clock cycle, which registers take which new values.

Together they form an **FSMD**, a finite state machine with datapath.

## An example: the sum of 1 to n

As software:

~~~
acc := 0;  i := n;
while i /= 0 loop
  acc := acc + i;
  i   := i - 1;
end loop;
~~~

As hardware: registers {acc} and {i}, an adder and a subtractor, and three states. In {idle}, a {start} loads the registers. In {add}, each clock cycle performs one round of the loop, until {i} is zero. In {fin}, the result is ready and {done} says so for one cycle.

~~~try sum_to_n

## The rules of register transfer

Within one state, all assignments take effect together at the clock edge that ends the cycle, and every expression reads the values from **before** it. So {acc <= acc + i; i <= i - 1;} adds the old {i}, and the order of the two lines does not matter. That is the main difference from the software version, and planning the work cycle by cycle, often with an **ASMD chart** (a flowchart with one box per state), is the main design step.

## Handshakes

A circuit that takes several cycles needs a protocol: {start} asks for a computation, {busy} or a missing {done} says it is still running, and {done} says the result is ready. The exercises of this chapter all use such a handshake; the multiplier always takes the same number of cycles, the GCD circuit a number that depends on the data.

## Time against space

The FSMD trades speed for area: one adder used n times instead of n adders. Most real designs sit somewhere between, with a few copies of the hardware working in parallel, which is the art of **pipelining** and parallel datapaths, beyond this book.`);
ex('sum_to_n', {
    clk: 'clk',
    code: `${HN}
entity sum_to_n is
  port (
    clk, reset, start : in  std_logic;
    n                 : in  std_logic_vector(3 downto 0);
    sum               : out std_logic_vector(7 downto 0);
    busy, done        : out std_logic
  );
end entity;

architecture rtl of sum_to_n is
  type state_t is (idle, add, fin);
  signal state : state_t;
  signal i     : unsigned(3 downto 0);
  signal acc   : unsigned(7 downto 0);
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if reset = '1' then
        state <= idle;
      else
        case state is
          when idle =>
            if start = '1' then
              i     <= unsigned(n);
              acc   <= (others => '0');
              state <= add;
            end if;
          when add =>
            if i = 0 then
              state <= fin;
            else
              acc <= acc + i;           -- one round of the loop per cycle
              i   <= i - 1;
            end if;
          when fin =>
            state <= idle;
        end case;
      end if;
    end if;
  end process;

  sum  <= std_logic_vector(acc);
  busy <= '1' when state = add else '0';
  done <= '1' when state = fin else '0';
end architecture;
`,
    steps: ['reset=1 start=0 n=0000', 'reset=0 start=1 n=0100', 'start=0', '', '', '', '', '', '', 'start=1 n=0011', 'start=0', '', '', '', '', '']
});

page('rtl', 'uart', 'A serial link: the UART', `A **UART** (universal asynchronous receiver-transmitter) sends bytes over a single wire, and it is still the first thing many boards use to talk to a computer. "Asynchronous" means that no clock travels with the data: both sides agree on the bit rate, the **baud rate**, and the receiver finds its timing again at the start of every byte.

## The frame

~~~
idle    start  d0  d1  d2  d3  d4  d5  d6  d7  stop   idle
 1  1     0    x   x   x   x   x   x   x   x    1     1  1
~~~

The line rests at {'1'}. A {'0'} **start bit** announces a byte, the eight data bits follow, least significant first, and a {'1'} **stop bit** ends the frame. Some links add a parity bit before the stop bit.

## Timing from the system clock

A bit lasts 1/115200 of a second at 115200 baud. The circuit makes a one-cycle tick per bit time with a counter: with a 50 MHz clock that is a tick every 50 000 000 / 115 200 ≈ 434 cycles, and the small error of the rounding does not matter over ten bits. The example divides by 5, so that the ticks fit on the screen; the generic {DIVIDE} sets it.

~~~try baud_tick

## The transmitter

The transmitter loads the ten bits of the frame into a shift register, puts its lowest bit on the line, and shifts at every tick; a counter knows when the stop bit is done. That is the exercise of this chapter.

## The receiver

The receiver has the harder job, because it must find the bits in time:

1. Pass the input through a synchronizer first: it comes from another device.
2. Use a tick 16 times faster than the bit rate (**oversampling**).
3. When the line falls to {'0'}, a start bit may begin. Wait 8 ticks to reach the middle of it and check that it is still {'0'}; a short glitch is ignored.
4. Then wait 16 ticks for each data bit, sampling in its middle, and shift the samples into a register.
5. After the eighth data bit, check the stop bit, and report the byte with a one-cycle {valid} pulse.

Sampling in the middle of each bit is what makes the link work despite small differences between the two clocks.`);
ex('baud_tick', {
    clk: 'clk',
    code: `${H}
entity baud_tick is
  generic (DIVIDE : positive := 5);     -- clock cycles per bit
  port (
    clk, reset : in  std_logic;
    tick       : out std_logic
  );
end entity;

architecture rtl of baud_tick is
  signal count : integer range 0 to DIVIDE - 1;
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if reset = '1' or count = DIVIDE - 1 then
        count <= 0;
      else
        count <= count + 1;
      end if;
    end if;
  end process;

  tick <= '1' when count = DIVIDE - 1 else '0';
end architecture;
`,
    steps: ['reset=1', 'reset=0', '', '', '', '', '', '', '', '', '', '', '', '']
});

/* ===================================================== 13 Testbenches */
page('tb', 'testbenches', 'Testbenches', `Every exercise so far had a checker that drove your design with inputs and compared its outputs. In your own projects, you write that part yourself, in VHDL: a **testbench**. It is a design with no ports that contains the design under test, drives its inputs, and checks its outputs.

The example tests the counter of chapter 6. Both are in the same code box; the testbench, the last entity, is what runs. The waveform now has a time axis, and the messages below it carry the time at which they were reported.

~~~try tb_count

## What is new

- {entity tb_counter is end entity;} A testbench has no ports: nothing is outside it.
- {clk <= not clk after 5 ns;} **after** delays an assignment. Each time the clock changes, this line plans the opposite value 5 ns later: a clock with a period of 10 ns, which runs for ever.
- The process has no sensitivity list. Instead it **waits**. {wait until rising_edge(clk);} suspends it until the next rising edge; {wait for 1 ns;} for a stretch of time; {wait;} for ever. A testbench reads like a script, from top to bottom.
- {assert condition report "text" severity error;} checks the condition. When it is false, the simulator prints the report, with the **severity** {note}, {warning}, {error} or {failure}. A failure stops the simulation at once; the other levels let it go on.
- {std.env.finish;} (VHDL-2008) ends the simulation. Without it, the clock would keep it going for ever, and the simulator here would stop it at its time limit.

Now break the counter: change {count + 1} into {count + 2} in the first entity and run again. The first assertion that fails tells what went wrong, and when.

## Testbenches are not hardware

Waits and delays describe behavior over time, not circuits: no synthesis tool turns {wait for 1 ns} into gates. That is why testbenches can use everything VHDL has, while the designs they test stick to the synthesizable part.

## after and the kinds of delay

{after} also works inside a process, and an assignment can plan several values at once: {rst <= '1', '0' after 20 ns;} raises a reset now and releases it 20 ns later.

A delay is **inertial** by default: like a real gate, it swallows pulses shorter than itself. {y <= a after 3 ns;} never passes on a 1 ns pulse of {a}. {y <= transport a after 3 ns;} passes everything, like an ideal wire. Testbenches mostly use plain {after} on stimulus, where the difference does not arise.`);
ex('tb_count', {
    tb: true,
    code: `${HN}
entity counter_en is
  port (
    clk, reset, en : in  std_logic;
    q              : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of counter_en is
  signal count : unsigned(3 downto 0);
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if reset = '1' then
        count <= (others => '0');
      elsif en = '1' then
        count <= count + 1;
      end if;
    end if;
  end process;

  q <= std_logic_vector(count);
end architecture;

${HN}
entity tb_counter is
end entity;

architecture sim of tb_counter is
  signal clk   : std_logic := '0';
  signal reset : std_logic := '1';
  signal en    : std_logic := '0';
  signal q     : std_logic_vector(3 downto 0);
begin
  clk <= not clk after 5 ns;                  -- a 100 MHz clock

  dut: entity work.counter_en
    port map (clk => clk, reset => reset, en => en, q => q);

  stimulus: process
  begin
    wait until rising_edge(clk);              -- the reset takes effect here
    reset <= '0';
    en    <= '1';
    for i in 1 to 6 loop
      wait until rising_edge(clk);
      wait for 1 ns;                          -- let the outputs settle
      assert unsigned(q) = i
        report "q is " & to_string(q) & " after " & integer'image(i) & " counts"
        severity error;
    end loop;
    report "test done";
    std.env.finish;
  end process;
end architecture;
`
});

page('tb', 'self-checking', 'Self-checking testbenches', `A testbench that only drives inputs leaves the real work to whoever stares at the waveform, every time something changes. A **self-checking** testbench decides on its own whether the design is right, so that it can run after every change and say "pass" or "fail".

## Where the expected values come from

- **Computed in the testbench**, with the operators of VHDL: the sum {i + j}, the count of ones, the parity. The testbench can use integers, loops and anything else that makes the reference obviously right.
- **A model** of a clocked design: a variable that does, at every clock edge, what the design should do, such as {expect := (expect + 1) mod 16;}.
- **A table** of known input and output pairs, for designs whose function has no simple formula.

## How many inputs?

Small combinational blocks are tested **exhaustively**: a loop over every input value. Up to some 16 input bits that takes no time, and it leaves nothing to chance. Larger designs get the cases that bugs love: zero, the largest value, the wrap from the largest back to zero, every control input in every state, a reset in the middle of work, and events that come back to back.

## When to look

In a clocked design, change the inputs away from the clock edge, and read the outputs after it: {wait until rising_edge(clk); wait for 1 ns;}, or check in the middle of the cycle with {wait until falling_edge(clk);}. A check right at the edge races with the edge itself.

## Reports that help

Put the inputs and both values into the message: {"3 + 14 gives 1, expected 17"} starts the debugging, {"wrong"} does not. Count the errors in a variable and finish with a summary, so that one look at the end tells the result.

The example tests a Gray-code converter over all eight inputs. The converter has a copy-and-paste bug: run the testbench and read what it reports, then fix the line marked in the first entity and run again.

~~~try gray_check

## The exercises

The exercises of this chapter give you a working design, and the checker keeps a few broken copies of it. Your testbench passes when it reports no error for the working design and at least one error for every broken copy. It is how real verification works: a test is only as good as the bugs it catches.`);
ex('gray_check', {
    tb: true,
    code: `${HN}
entity bin2gray is
  port (
    b : in  std_logic_vector(2 downto 0);
    g : out std_logic_vector(2 downto 0)
  );
end entity;

architecture rtl of bin2gray is
begin
  g(2) <= b(2);
  g(1) <= b(1) xor b(0);       -- the bug: this should be b(2) xor b(1)
  g(0) <= b(1) xor b(0);
end architecture;

${HN}
entity tb_gray is
end entity;

architecture sim of tb_gray is
  signal b, g : std_logic_vector(2 downto 0);
begin
  dut: entity work.bin2gray port map (b => b, g => g);

  process
    variable want   : std_logic_vector(2 downto 0);
    variable errors : natural := 0;
  begin
    for i in 0 to 7 loop
      b <= std_logic_vector(to_unsigned(i, 3));
      wait for 10 ns;
      want := b xor ('0' & b(2 downto 1));     -- the reference: b xor (b shifted right)
      if g /= want then
        errors := errors + 1;
        report "b = " & to_string(b) & ": g is " & to_string(g) & ", expected " & to_string(want)
          severity error;
      end if;
    end loop;
    report integer'image(errors) & " of 8 inputs failed";
    std.env.finish;
  end process;
end architecture;
`
});

/* ===================================================== 14 Going further */
page('next', 'board', 'A virtual FPGA board', `A waveform shows what a design does; a board lets you use it. The [virtual FPGA board](board.html) of this site runs your VHDL in the browser, on the same simulator as this book: flip its switches and press its buttons, and watch its LEDs, its four-digit display and its serial terminal answer while your design runs.

## The pins

A design connects to the board through the names of its ports:

| Pin | Port | What it does |
|---|---|---|
| {clk} | {in std_logic} | the board clock |
| {sw} | {in std_logic_vector(15 downto 0)} | 16 slide switches |
| {btn} | {in std_logic_vector(4 downto 0)} | 5 buttons: centre, up, left, right, down |
| {led} | {out std_logic_vector(15 downto 0)} | 16 LEDs |
| {seg}, {dp}, {an} | {out} | the display: segments {gfedcba}, decimal point, digit select |
| {tx}, {rx} | {out}, {in} | the serial terminal, 8 data bits and 1 stop bit |

Declare only the pins you use. A vector may be shorter than the pin, such as {led(7 downto 0)} for the eight rightmost LEDs.

## The clock

Real boards run at 50 or 100 MHz. A simulator in a browser manages a few hundred thousand clock cycles a second for a small design, so the virtual board runs at a clock that you choose, from 10 Hz to 1 MHz. Write timing with a generic:

~~~
generic (CLK_HZ : positive := 100_000_000);
...
constant TENTH : positive := CLK_HZ / 10;   -- the cycles in 0.1 s
~~~

The board fills in its own frequency when it programs the design, and the same code runs unchanged on a real board, where {CLK_HZ} keeps its default. A {BAUD} generic gets the speed of the terminal in the same way.

## On an FPGA of its own

The board can also run your design as hardware. [Inside the FPGA](board.html#fpga), below the board, builds it for VF-1, a small FPGA modelled in the page. Synthesis turns the code into logic gates and flip-flops, mapping packs the gates into 4-input lookup tables, placement and routing put those on the tiles and wires of the chip, and the result is a bitstream. Set the board to run on the FPGA and it runs that bitstream on an emulator of the chip, which reads nothing else. The page shows where each lookup table landed, how the wires run, the slowest path through the logic and the bits themselves.

Synthesis builds what the code describes, so the rules of chapter 12 apply: a latch, a signal with two drivers or a loop of unknown length stops it with a message, and so do waits and delays, which belong in testbenches.

## What to try

- The examples of the board, from Blinky and a running light to a stopwatch and a serial echo.
- Any of them on the FPGA: click a tile to see its truth table, and compare the slowest path with the 10 ns of a 100 MHz clock.
- Your PWM generator of chapter 6: the board shows how long each LED was lit, so the LEDs dim, as your eye would see them.
- Your debouncer of chapter 6, with the board's "buttons bounce" switch on.
- The UART transmitter of chapter 12, with its tick made from {CLK_HZ / BAUD}, sending text to the terminal.
- The display example at a clock of 10 Hz, to watch the four digits take turns, much too slowly to fool the eye.`);

page('next', 'simulators', 'Simulators for your computer', `Everything in this book also runs in the simulators that people use at work. One of them is free and small enough to install in a minute.

## GHDL

[GHDL](https://ghdl.github.io/ghdl/) is an open-source VHDL simulator for Linux, Windows and macOS, and it has been used to check every example and exercise of this book. With the counter of chapter 6 in {counter_en.vhd} and the testbench of chapter 13 in {tb_counter.vhd}:

~~~
ghdl -a --std=08 counter_en.vhd tb_counter.vhd
ghdl -e --std=08 tb_counter
ghdl -r --std=08 tb_counter --wave=tb_counter.ghw
~~~

The first command **analyzes** the files: it checks them and puts the design units into the library {work}, in the order given, so a design goes before its testbench. The second **elaborates** the testbench: it builds the hierarchy below it. The third **runs** it, prints the reports and assertions, and records every signal into a file.

## Waveform viewers

[GTKWave](https://gtkwave.sourceforge.net/) opens that file and shows the signals over time, with the hierarchy of the design on the side: the desktop version of the waveforms in this book.

## Other simulators

- **NVC** is another open-source VHDL simulator, fast and with good VHDL-2008 support.
- The FPGA vendors ship simulators with their tools: Vivado has one built in, and Quartus comes with an edition of Questa.
- The large commercial simulators, such as Questa and Riviera-PRO, are what companies use for big designs and mixed VHDL and Verilog.

> A good habit from the first day: a self-checking testbench for every design, run after every change, so that nobody has to stare at waveforms to know whether something broke.`);

page('next', 'reading', 'Where to read more', `This book covers the VHDL that synthesizable designs use every day. These are the books it draws on, and the ones to read next.

## The language

- **Peter J. Ashenden, The Designer's Guide to VHDL** (3rd edition, Morgan Kaufmann, 2008). The complete reference of the language, VHDL-2008 included.
- **Peter J. Ashenden and Jim Lewis, VHDL-2008: Just the New Stuff** (Morgan Kaufmann, 2008). What VHDL-2008 added, for readers who know the older versions.

## Design with VHDL

- **Volnei A. Pedroni, Circuit Design and Simulation with VHDL** (2nd edition, MIT Press, 2010). Code structure, data types, concurrent and sequential code, state machines and testbenches, with many complete circuits.
- **Pong P. Chu, RTL Hardware Design Using VHDL** (Wiley, 2006). How VHDL maps to hardware, and the register-transfer methodology of chapter 12, with the FSMD design of multipliers, a GCD circuit and a UART receiver.
- **Pong P. Chu, FPGA Prototyping by VHDL Examples** (Wiley). Complete projects for FPGA boards: UART, keyboard, mouse, VGA video and a soft processor.

## Digital design

- **Stephen Brown and Zvonko Vranesic, Fundamentals of Digital Logic with VHDL Design** (McGraw-Hill). Logic design taught together with VHDL, from gates to processors.
- **M. Morris Mano and Michael D. Ciletti, Digital Design** (Pearson). The classic introduction to logic design, with HDL examples.
- **John F. Wakerly, Digital Design: Principles and Practices** (Pearson). Logic design in depth, with a practitioner's eye for real circuits.
- **David Money Harris and Sarah L. Harris, Digital Design and Computer Architecture** (Morgan Kaufmann). From transistors to a complete processor; editions that show VHDL next to SystemVerilog exist.

## Practice

The best next step is a board. An FPGA development board costs about as much as a textbook, and every exercise here, from the PWM generator to the UART transmitter, can light LEDs or talk to a computer on it. Start from the synthesis tool of the FPGA vendor, write a testbench for each design before it goes on the board, and read the warnings of the synthesis report: latches, unused signals and missing sensitivity entries show up there, just as in this checker.`);

G.VHDLBook = { LESSONS, TRY, BLURBS };
})(typeof window !== 'undefined' ? window : globalThis);
