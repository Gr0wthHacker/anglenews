#!/usr/bin/env node
/**
 * Generates minimal valid PNG icon files for the AngleCheck extension.
 * No dependencies required — uses raw PNG binary format.
 *
 * Usage: node generate.js
 * Output: icon-16.png, icon-48.png, icon-128.png in the current directory.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// PNG CRC32 implementation
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

function createPNG(size) {
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: width, height, bit depth 8, color type 2 (RGB), compression 0, filter 0, interlace 0
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Build raw image data: each row has a filter byte (0) + RGB pixels
  const rowBytes = 1 + size * 3;
  const rawData = Buffer.alloc(rowBytes * size);

  // Colors
  const bgR = 0x3b,
    bgG = 0x82,
    bgB = 0xf6; // #3B82F6
  const fgR = 0xff,
    fgG = 0xff,
    fgB = 0xff; // white

  // Corner radius
  const radius = Math.max(1, Math.round(size * 0.125));

  // Chevron parameters
  const tipX = size * 0.35;
  const tipY = size * 0.5;
  const armTopX = size * 0.67;
  const armTopY = size * 0.2;
  const armBotX = size * 0.67;
  const armBotY = size * 0.8;
  const strokeW = Math.max(1.5, size * 0.09);

  function isInsideRoundedRect(x, y) {
    // Check if point is inside rounded rectangle
    if (x >= radius && x < size - radius) return true;
    if (y >= radius && y < size - radius) return true;
    // Check corners
    const corners = [
      [radius, radius],
      [size - radius - 1, radius],
      [radius, size - radius - 1],
      [size - radius - 1, size - radius - 1],
    ];
    for (const [cx, cy] of corners) {
      const inCornerZone =
        (x < radius || x >= size - radius) &&
        (y < radius || y >= size - radius);
      if (inCornerZone) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= radius * radius) return true;
      }
    }
    if (
      x >= radius &&
      x < size - radius &&
      y >= 0 &&
      y < size
    )
      return true;
    if (
      y >= radius &&
      y < size - radius &&
      x >= 0 &&
      x < size
    )
      return true;
    return false;
  }

  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  }

  function isOnChevron(x, y) {
    const d1 = distToSegment(x, y, tipX, tipY, armTopX, armTopY);
    const d2 = distToSegment(x, y, tipX, tipY, armBotX, armBotY);
    return Math.min(d1, d2) <= strokeW;
  }

  for (let row = 0; row < size; row++) {
    const rowOffset = row * rowBytes;
    rawData[rowOffset] = 0; // filter: none
    for (let col = 0; col < size; col++) {
      const pixOffset = rowOffset + 1 + col * 3;
      if (!isInsideRoundedRect(col, row)) {
        // Transparent not available in RGB mode, use white (or could use RGBA)
        // Actually let's just make it transparent-ish by using a neutral background
        rawData[pixOffset] = 0;
        rawData[pixOffset + 1] = 0;
        rawData[pixOffset + 2] = 0;
      } else if (isOnChevron(col + 0.5, row + 0.5)) {
        rawData[pixOffset] = fgR;
        rawData[pixOffset + 1] = fgG;
        rawData[pixOffset + 2] = fgB;
      } else {
        rawData[pixOffset] = bgR;
        rawData[pixOffset + 1] = bgG;
        rawData[pixOffset + 2] = bgB;
      }
    }
  }

  // Compress with zlib deflate
  const compressed = zlib.deflateSync(rawData);

  // Build PNG
  const ihdrChunk = makeChunk("IHDR", ihdr);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([PNG_SIGNATURE, ihdrChunk, idatChunk, iendChunk]);
}

// Use RGBA for transparency support
function createPNGWithAlpha(size) {
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowBytes = 1 + size * 4;
  const rawData = Buffer.alloc(rowBytes * size);

  const bgR = 0x3b,
    bgG = 0x82,
    bgB = 0xf6;
  const fgR = 0xff,
    fgG = 0xff,
    fgB = 0xff;

  const radius = Math.max(1, Math.round(size * 0.125));

  const tipX = size * 0.35;
  const tipY = size * 0.5;
  const armTopX = size * 0.67;
  const armTopY = size * 0.2;
  const armBotX = size * 0.67;
  const armBotY = size * 0.8;
  const strokeW = Math.max(1.5, size * 0.09);

  function isInsideRoundedRect(x, y) {
    if (x >= radius && x < size - radius && y >= 0 && y < size) return true;
    if (y >= radius && y < size - radius && x >= 0 && x < size) return true;
    // Corner checks
    const corners = [
      [radius, radius],
      [size - 1 - radius, radius],
      [radius, size - 1 - radius],
      [size - 1 - radius, size - 1 - radius],
    ];
    for (const [cx, cy] of corners) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        const inXZone = x < radius || x > size - 1 - radius;
        const inYZone = y < radius || y > size - 1 - radius;
        if (inXZone && inYZone) return true;
      }
    }
    return false;
  }

  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  }

  function chevronDist(x, y) {
    const d1 = distToSegment(x, y, tipX, tipY, armTopX, armTopY);
    const d2 = distToSegment(x, y, tipX, tipY, armBotX, armBotY);
    return Math.min(d1, d2);
  }

  for (let row = 0; row < size; row++) {
    const rowOffset = row * rowBytes;
    rawData[rowOffset] = 0; // filter: none
    for (let col = 0; col < size; col++) {
      const pixOffset = rowOffset + 1 + col * 4;
      const cx = col + 0.5;
      const cy = row + 0.5;

      if (!isInsideRoundedRect(col, row)) {
        rawData[pixOffset] = 0;
        rawData[pixOffset + 1] = 0;
        rawData[pixOffset + 2] = 0;
        rawData[pixOffset + 3] = 0; // fully transparent
      } else {
        const cd = chevronDist(cx, cy);
        if (cd <= strokeW - 0.5) {
          // Fully on chevron
          rawData[pixOffset] = fgR;
          rawData[pixOffset + 1] = fgG;
          rawData[pixOffset + 2] = fgB;
          rawData[pixOffset + 3] = 255;
        } else if (cd <= strokeW + 0.5) {
          // Anti-alias edge of chevron
          const blend = 1.0 - (cd - (strokeW - 0.5));
          rawData[pixOffset] = Math.round(fgR * blend + bgR * (1 - blend));
          rawData[pixOffset + 1] = Math.round(fgG * blend + bgG * (1 - blend));
          rawData[pixOffset + 2] = Math.round(fgB * blend + bgB * (1 - blend));
          rawData[pixOffset + 3] = 255;
        } else {
          rawData[pixOffset] = bgR;
          rawData[pixOffset + 1] = bgG;
          rawData[pixOffset + 2] = bgB;
          rawData[pixOffset + 3] = 255;
        }
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);

  const ihdrChunk = makeChunk("IHDR", ihdr);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([PNG_SIGNATURE, ihdrChunk, idatChunk, iendChunk]);
}

const outDir = __dirname;
const sizes = [16, 48, 128];

for (const size of sizes) {
  const png = createPNGWithAlpha(size);
  const filePath = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Created ${filePath} (${png.length} bytes)`);
}

console.log("Done! All icons generated.");
