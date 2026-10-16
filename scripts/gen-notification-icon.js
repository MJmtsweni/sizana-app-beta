const { PNG } = require('pngjs');
const fs = require('fs');

const srcPath = process.argv[2];
const outPath = process.argv[3];

const src = PNG.sync.read(fs.readFileSync(srcPath));
const out = new PNG({ width: src.width, height: src.height });

// Android status-bar notification icons must be a pure white silhouette with
// alpha transparency (the OS tints it itself) — so we discard RGB entirely
// and just carry the source alpha channel over onto solid white.
for (let i = 0; i < src.data.length; i += 4) {
  out.data[i] = 255;
  out.data[i + 1] = 255;
  out.data[i + 2] = 255;
  out.data[i + 3] = src.data[i + 3];
}

fs.writeFileSync(outPath, PNG.sync.write(out));
console.log('wrote', outPath, src.width + 'x' + src.height);
