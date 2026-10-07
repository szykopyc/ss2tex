const { AutoTokenizer, RawImage, Tensor, VisionEncoderDecoderModel, cat } = require('@huggingface/transformers');

// Texo (https://github.com/alephpi/Texo): 20M-param formula OCR, ~80 MB, downloaded once then cached.
const MODEL = 'alephpi/FormulaNet';
const SIZE = 384;
const MEAN = 0.7931;
const STD = 0.1738;
const INK = 200;

let loading;
const load = () =>
  (loading ??= Promise.all([
    VisionEncoderDecoderModel.from_pretrained(MODEL, { dtype: 'fp32' }),
    AutoTokenizer.from_pretrained(MODEL),
  ]));

function inkBounds({ data, width, height }) {
  const min = data.reduce((a, b) => Math.min(a, b));
  const max = data.reduce((a, b) => Math.max(a, b));
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (((data[y * width + x] - min) / (max - min)) * 255 < INK) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  return x1 < 0 || max === min ? [0, 0, width - 1, height - 1] : [x0, y0, x1, y1];
}

// Ported from Texo-web (AGPL-3.0, https://github.com/alephpi/Texo-web): grey, light text flipped to dark, crop to ink, fit + pad to 384², normalize.
async function preprocess(image) {
  let img = (await RawImage.read(image)).grayscale();
  if (img.data.filter((v) => v < INK).length >= img.data.length / 2) {
    img.data.forEach((v, i) => (img.data[i] = 255 - v));
  }
  img = await img.crop(inkBounds(img));

  const scale = Math.min(SIZE / img.width, SIZE / img.height);
  const [w, h] = [Math.round(img.width * scale), Math.round(img.height * scale)];
  const [left, top] = [Math.floor((SIZE - w) / 2), Math.floor((SIZE - h) / 2)];
  img = (await img.resize(w, h)).grayscale();
  img = (await img.pad([left, SIZE - w - left, top, SIZE - h - top])).grayscale();

  const grey = new Tensor('float32', Float32Array.from(img.data, (v) => (v / 255 - MEAN) / STD), [1, 1, SIZE, SIZE]);
  return cat([grey, grey, grey], 1);
}

const ALIASES = { infin: 'infty', rarr: 'rightarrow', larr: 'leftarrow', harr: 'leftrightarrow', Rarr: 'Rightarrow', Larr: 'Leftarrow', Harr: 'Leftrightarrow', darr: 'downarrow', uarr: 'uparrow' };

// Texo emits tokenized LaTeX ("e ^ { 2 }") and wraps single lines in a one-column array.
function tidy(latex) {
  const single = latex.match(/^\\begin\{array\} \{ [lcr] \} \{ (.*) \} \\end\{array\}$/);
  if (single && !single[1].includes('\\\\')) latex = single[1];
  return latex
    .replace(/\\(infin|rarr|larr|harr|Rarr|Larr|Harr|darr|uarr)\b/g, (_, name) => `\\${ALIASES[name]}`)
    .replace(/(?<!\\)~|\\!/g, '')
    .replace(/(?<!\\)\s*([_^{}])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// `image` is a file path or a Blob of encoded image bytes.
async function toLatex(image) {
  const [model, tokenizer] = await load();
  const output = await model.generate({ inputs: await preprocess(image), max_new_tokens: 512 });
  return tidy(tokenizer.batch_decode(output, { skip_special_tokens: true })[0]);
}

module.exports = { load, tidy, toLatex };

if (require.main === module) {
  (async () => {
    for (const file of process.argv.slice(2)) console.log(file, '→', await toLatex(file));
  })();
}
