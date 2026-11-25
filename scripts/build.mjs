import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const watch = process.argv.includes('--watch');

await rm('dist', { recursive: true, force: true });
await mkdir('dist/icons', { recursive: true });
await cp('public', 'dist', { recursive: true });

// Generate simple placeholder PNG icons (indigo rounded-ish square with a white "field" bar).
function crc32(buf) {
  let c, crc = ~0;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = size * 0.18;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const cx = Math.min(x, size - 1 - x), cy = Math.min(y, size - 1 - y);
      const inside = !(cx < r && cy < r && (r - cx) ** 2 + (r - cy) ** 2 > r * r);
      const bar = x > size * 0.2 && x < size * 0.8 && y > size * 0.42 && y < size * 0.58;
      const [R, G, B] = bar ? [255, 255, 255] : [79, 70, 229];
      raw.set(inside ? [R, G, B, 255] : [0, 0, 0, 0], i);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
for (const s of [16, 48, 128]) writeFileSync(`dist/icons/${s}.png`, png(s));

const opts = {
  entryPoints: {
    background: 'src/background/index.ts',
    content: 'src/content/index.ts',
    options: 'src/options/main.ts',
    popup: 'src/popup/main.ts',
  },
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  target: 'chrome110',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log('watching… (re-run `npm run dev` after editing public/ files)');
} else {
  await build(opts);
}
