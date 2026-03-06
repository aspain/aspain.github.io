#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT_DIR = process.cwd();
const ROUTES_DIR = path.join(ROOT_DIR, 'public', 'data', 'routes');
const TRAVEL_IMAGES_DIR = path.join(ROOT_DIR, 'public', 'images', 'travels');

const JPEG_MARKERS_WITHOUT_LENGTH = new Set([
  0x01,
  0xd0,
  0xd1,
  0xd2,
  0xd3,
  0xd4,
  0xd5,
  0xd6,
  0xd7,
  0xd8,
  0xd9
]);

function isCoordinatePair(value) {
  return (
    Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === 'number'
    && typeof value[1] === 'number'
  );
}

function sanitizeCoordinates(value) {
  if (isCoordinatePair(value)) {
    return value.slice(0, 2);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeCoordinates(entry));
  }

  return value;
}

function sanitizeGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') return null;

  if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
    return {
      type: 'GeometryCollection',
      geometries: geometry.geometries
        .map((entry) => sanitizeGeometry(entry))
        .filter(Boolean)
    };
  }

  if (!('coordinates' in geometry)) {
    return { type: geometry.type };
  }

  return {
    type: geometry.type,
    coordinates: sanitizeCoordinates(geometry.coordinates)
  };
}

function sanitizeRoutePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;

  if (payload.type === 'FeatureCollection' && Array.isArray(payload.features)) {
    return {
      type: 'FeatureCollection',
      features: payload.features
        .map((feature) => sanitizeRoutePayload(feature))
        .filter(Boolean)
    };
  }

  if (payload.type === 'Feature') {
    const geometry = sanitizeGeometry(payload.geometry);
    if (!geometry) return null;
    return {
      type: 'Feature',
      geometry
    };
  }

  return sanitizeGeometry(payload);
}

function shouldStripJpegSegment(marker) {
  return marker === 0xe1 || marker === 0xed || marker === 0xfe;
}

function stripJpegMetadata(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('Unsupported JPEG payload');
  }

  const output = [buffer.subarray(0, 2)];
  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      throw new Error(`Invalid JPEG marker at offset ${offset}`);
    }

    let markerOffset = offset + 1;
    while (markerOffset < buffer.length && buffer[markerOffset] === 0xff) {
      markerOffset += 1;
    }

    if (markerOffset >= buffer.length) {
      throw new Error('Truncated JPEG marker');
    }

    const marker = buffer[markerOffset];

    if (marker === 0xda) {
      output.push(buffer.subarray(offset));
      break;
    }

    if (JPEG_MARKERS_WITHOUT_LENGTH.has(marker)) {
      output.push(buffer.subarray(offset, markerOffset + 1));
      offset = markerOffset + 1;
      continue;
    }

    if (markerOffset + 2 >= buffer.length) {
      throw new Error('Truncated JPEG segment length');
    }

    const length = buffer.readUInt16BE(markerOffset + 1);
    const segmentEnd = markerOffset + 1 + length;
    if (segmentEnd > buffer.length) {
      throw new Error('Truncated JPEG segment payload');
    }

    if (!shouldStripJpegSegment(marker)) {
      output.push(buffer.subarray(offset, segmentEnd));
    }

    offset = segmentEnd;
  }

  return Buffer.concat(output);
}

async function walkFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const resolved = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(resolved));
    } else if (entry.isFile()) {
      files.push(resolved);
    }
  }

  return files;
}

async function sanitizeRouteFiles() {
  const routeFiles = (await readdir(ROUTES_DIR))
    .filter((name) => name.endsWith('.geojson'))
    .map((name) => path.join(ROUTES_DIR, name));

  let changed = 0;

  for (const routeFile of routeFiles) {
    const current = await readFile(routeFile, 'utf8');
    const payload = JSON.parse(current);
    const sanitized = `${JSON.stringify(sanitizeRoutePayload(payload))}\n`;
    if (sanitized !== current) {
      await writeFile(routeFile, sanitized, 'utf8');
      changed += 1;
    }
  }

  return { total: routeFiles.length, changed };
}

async function sanitizeTravelJpegs() {
  const imageFiles = (await walkFiles(TRAVEL_IMAGES_DIR))
    .filter((filePath) => /\.(jpe?g)$/i.test(filePath));

  let changed = 0;

  for (const imageFile of imageFiles) {
    const current = await readFile(imageFile);
    const stripped = stripJpegMetadata(current);
    if (!current.equals(stripped)) {
      await writeFile(imageFile, stripped);
      changed += 1;
    }
  }

  return { total: imageFiles.length, changed };
}

async function main() {
  const routes = await sanitizeRouteFiles();
  const images = await sanitizeTravelJpegs();

  process.stdout.write(
    `Sanitized ${routes.changed}/${routes.total} route files and ${images.changed}/${images.total} JPEGs.\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
