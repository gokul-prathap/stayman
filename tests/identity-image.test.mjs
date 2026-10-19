import test from 'node:test';
import assert from 'node:assert/strict';
import { cropPixels, compressIdentityImage, TARGET_IMAGE_BYTES, rotateIdentityPhoto, normalizeQuarterTurns } from '../src/features/rooms/utils/identityImage.js';

test('maps normalized crop to source pixels and rejects out-of-bounds selections', () => {
  assert.deepEqual(cropPixels(2000, 1000, { x: 0.1, y: 0.2, width: 0.5, height: 0.6 }),
    { x: 200, y: 200, width: 1000, height: 600 });
  assert.throws(() => cropPixels(2000, 1000, { x: 0.8, y: 0, width: 0.5, height: 1 }));
  assert.throws(() => cropPixels(2000, 1000, { x: NaN, y: 0, width: 1, height: 1 }));
});

async function withBrowserMock(sizes, action) {
  const previousDocument = globalThis.document, previousBitmap = globalThis.createImageBitmap;
  const calls = [], draws = [], canvases = [], rotations = [], translations = [];
  let closed = false;
  globalThis.createImageBitmap = async () => ({ width: 4000, height: 2000, close: () => { closed = true; } });
  globalThis.document = { createElement: () => {
    const canvas = { width: 0, height: 0, getContext: () => ({
      fillRect() {}, drawImage(...args) { draws.push(args.slice(1)); },
      rotate(angle) { rotations.push(angle); },translate(x,y) { translations.push([x,y]); },
    }), toBlob(callback, type, quality) {
      calls.push(quality);
      callback(new Blob([new Uint8Array(sizes[Math.min(calls.length - 1, sizes.length - 1)])], { type }));
    } };
    canvases.push(canvas); return canvas;
  } };
  try { await action({ calls, draws, canvases, rotations, translations, isClosed: () => closed }); }
  finally {
    globalThis.document = previousDocument; globalThis.createImageBitmap = previousBitmap;
  }
}
const file = { type: 'image/jpeg', size: 1000 };

test('compresses the selected area, retains aspect ratio and closes the bitmap', async () => {
  await withBrowserMock([200 * 1024], async ({ draws, canvases, calls, isClosed }) => {
    const blob = await compressIdentityImage(file, { x: 0.25, y: 0, width: 0.5, height: 1 });
    assert.ok(blob.size <= TARGET_IMAGE_BYTES);
    assert.equal(blob.type, 'image/jpeg');
    assert.deepEqual(draws[0], [1000, 0, 2000, 2000, 0, 0, 1500, 1500]);
    assert.equal(canvases.length, 1); assert.deepEqual(calls, [0.76]); assert.ok(isClosed());
  });
});

test('tries stronger quality before reducing document resolution', async () => {
  await withBrowserMock([800 * 1024, 600 * 1024, 400 * 1024], async ({ calls, canvases }) => {
    assert.equal((await compressIdentityImage(file)).size, 400 * 1024);
    assert.deepEqual(calls, [0.76, 0.66, 0.56]); assert.equal(canvases.length, 1);
  });
});

test('keeps a readable-size fallback within bucket limit, rejects results over it', async () => {
  await withBrowserMock([700 * 1024], async ({ canvases }) => {
    assert.equal((await compressIdentityImage(file)).size, 700 * 1024);
    assert.deepEqual(canvases.map(canvas => canvas.width), [1500, 1250, 1000]);
  });
  await withBrowserMock([1100 * 1024], async ({ isClosed }) => {
    await assert.rejects(compressIdentityImage(file), /below 1 MB/); assert.ok(isClosed());
  });
});

test('rejects unsupported and oversized files before decoding', async () => {
  await assert.rejects(compressIdentityImage({ type: 'application/pdf', size: 10 }), /JPEG/);
  await assert.rejects(compressIdentityImage({ type: 'image/png', size: 11 * 1024 * 1024 }), /10 MB/);
});
test('normalizes left/right rotation and avoids recompressing a full turn',async()=>{
  assert.equal(normalizeQuarterTurns(-1),3);assert.equal(normalizeQuarterTurns(5),1);
  assert.throws(()=>normalizeQuarterTurns(.5));
  assert.equal(await rotateIdentityPhoto(file,4),file);
});
test('quarter turns swap output dimensions and preserve rotation in the image pixels',async()=>{
  await withBrowserMock([1000],async({canvases,rotations,translations,draws,isClosed})=>{
    const photo=await rotateIdentityPhoto(file,1);
    assert.equal(photo.type,'image/png');
    assert.equal(canvases[0].width,1100);assert.equal(canvases[0].height,2200);
    assert.deepEqual(rotations,[Math.PI/2]);assert.deepEqual(translations,[[550,1100]]);
    assert.deepEqual(draws,[[-1100,-550,2200,1100]]);assert.equal(isClosed(),true);
  });
});
test('half turns retain the landscape dimensions and rotate from the source',async()=>{
  await withBrowserMock([1000],async({canvases,rotations})=>{
    await rotateIdentityPhoto(file,2);
    assert.equal(canvases[0].width,2200);assert.equal(canvases[0].height,1100);assert.deepEqual(rotations,[Math.PI]);
  });
});
