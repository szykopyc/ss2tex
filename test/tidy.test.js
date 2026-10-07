const assert = require('node:assert');
const { tidy } = require('../src/ocr');

assert.equal(
  tidy('\\begin{array} { r } { \\int _ { 0 } ^ { \\infin } e ^ { - x ^ { 2 } } ~ d x = \\frac { \\sqrt { \\pi } } { 2 } } \\end{array}'),
  '\\int_{0}^{\\infty}e^{- x^{2}}d x = \\frac{\\sqrt{\\pi}}{2}',
);
assert.equal(
  tidy('\\begin{array} { r } { a } \\\\ { b } \\end{array}'),
  '\\begin{array}{r}{a}\\\\ {b}\\end{array}',
);
assert.equal(tidy('\\text { for all } x'), '\\text{for all}x');
assert.equal(tidy('a \\ { b } \\infinity'), 'a \\ {b}\\infinity');
console.log('ok');
