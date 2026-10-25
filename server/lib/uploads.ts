import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../env.js';
import { badRequest } from './http.js';

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const DOC_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

function storageFor(directory: string, allowed: Record<string, string>) {
  fs.mkdirSync(directory, { recursive: true });
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, directory),
    filename: (_req, file, cb) => {
      const ext = allowed[file.mimetype] ?? '';
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  });
}

export function imageUpload() {
  return multer({
    storage: storageFor(env.uploadDir, IMAGE_TYPES),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!IMAGE_TYPES[file.mimetype]) {
        cb(badRequest('Only JPEG, PNG, or WebP images are accepted.'));
        return;
      }
      cb(null, true);
    },
  });
}

export const privateDocsDir = path.resolve(process.cwd(), 'storage', 'private', 'seller-docs');

export function documentUpload() {
  return multer({
    storage: storageFor(privateDocsDir, DOC_TYPES),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!DOC_TYPES[file.mimetype]) {
        cb(badRequest('Upload a PDF, JPEG, or PNG document.'));
        return;
      }
      cb(null, true);
    },
  });
}

export function isInsidePrivateDocs(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(path.resolve(privateDocsDir) + path.sep);
}

export function extensionFor(mimetype: string): string {
  return IMAGE_TYPES[mimetype] ?? DOC_TYPES[mimetype] ?? '';
}

/**
 * MIME headers are supplied by the client. Check the file signature as well so
 * an executable or HTML document cannot be disguised as a photograph.
 */
export function hasValidFileSignature(filePath: string, kind: 'image' | 'document'): boolean {
  let header: Buffer;
  try {
    const descriptor = fs.openSync(filePath, 'r');
    header = Buffer.alloc(12);
    fs.readSync(descriptor, header, 0, header.length, 0);
    fs.closeSync(descriptor);
  } catch {
    return false;
  }

  const jpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const png =
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a;
  const webp = header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP';
  const pdf = header.subarray(0, 5).toString('ascii') === '%PDF-';

  return kind === 'image' ? jpeg || png || webp : pdf || jpeg || png;
}
