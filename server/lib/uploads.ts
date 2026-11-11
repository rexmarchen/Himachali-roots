import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { env } from '../env.js';
import { badRequest } from './http.js';

const MAX_IMAGE_DIMENSION = 2000;
// Reject decompression bombs before decoding a huge canvas.
const MAX_IMAGE_PIXELS = 40_000_000;

export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const DOC_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const privateDocsDir = env.privateDocsDir;

function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Directory might already exist
  }
}

function storageFor(directory: string, allowed: Record<string, string>, prefix = '') {
  ensureDir(directory);
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, directory),
    filename: (_req, file, cb) => {
      const ext = allowed[file.mimetype] ?? (path.extname(file.originalname) || '.bin');
      const uniqueName = `${prefix}${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext.toLowerCase()}`;
      cb(null, uniqueName);
    },
  });
}

/**
 * Re-encodes an uploaded photo so stored files are not the exact bytes a client
 * supplied. This strips EXIF/GPS metadata, applies the camera orientation,
 * bounds the pixel dimensions and keeps the declared format. The input pixel
 * limit protects against decompression bombs.
 */
async function optimiseUploadedImage(file: Express.Multer.File): Promise<void> {
  const extension = path.extname(file.filename).toLowerCase();
  const format = extension === '.png' ? 'png' : extension === '.webp' ? 'webp' : 'jpeg';
  const temporaryPath = `${file.path}.optimising`;
  try {
    const base = sharp(file.path, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate()
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });
    const pipeline =
      format === 'png'
        ? base.png({ compressionLevel: 9 })
        : format === 'webp'
          ? base.webp({ quality: 82, effort: 4 })
          : base.jpeg({ quality: 85, mozjpeg: true });
    await pipeline.toFile(temporaryPath);
    fs.renameSync(temporaryPath, file.path);
    file.size = fs.statSync(file.path).size;
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // Nothing to clean up.
    }
    throw error;
  }
}

export function imageUpload() {
  const upload = multer({
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

  return {
    single(field: string) {
      const middleware = upload.single(field);
      return (req: Request, res: Response, next: NextFunction): void => {
        middleware(req, res, (error: unknown) => {
          if (error) {
            next(error);
            return;
          }
          const file = req.file;
          if (!file) {
            next();
            return;
          }
          void optimiseUploadedImage(file)
            .then(() => next())
            .catch(() => {
              try {
                fs.unlinkSync(file.path);
              } catch {
                // The temp file may already be gone.
              }
              next(badRequest('That image could not be processed. Upload a valid JPEG, PNG, or WebP file.'));
            });
        });
      };
    },
  };
}

export function documentUpload() {
  return multer({
    storage: storageFor(privateDocsDir, DOC_TYPES, 'doc_'),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!DOC_TYPES[file.mimetype]) {
        cb(badRequest('Upload a PDF, JPEG, PNG, or WebP document (up to 5 MB).'));
        return;
      }
      cb(null, true);
    },
  });
}

/**
 * Ensures a file path is strictly located within one of the designated private document directories
 * to defend against directory traversal attacks.
 */
export function isInsidePrivateDocs(filePath: string): boolean {
  if (!filePath) return false;
  const resolved = path.resolve(filePath);
  const allowedRoots = [
    path.resolve(privateDocsDir),
    path.resolve(process.cwd(), 'storage', 'private', 'seller-docs'),
    path.resolve(path.dirname(env.databasePath), 'private', 'seller-docs'),
    path.resolve('/storage/private/seller-docs'),
    path.resolve('/data/private/seller-docs'),
  ];
  return allowedRoots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
}

/**
 * Given a stored storage key or legacy file path, resolves the real file on disk if it exists.
 * Searches primary privateDocsDir, /data volume fallback, and workspace storage fallback.
 */
export function resolvePrivateDocPath(storedReference: string | null | undefined): string | null {
  if (!storedReference || typeof storedReference !== 'string') return null;
  const trimmed = storedReference.trim();
  if (!trimmed) return null;

  // 1. Direct path check if it's already a safe path that exists
  if (path.isAbsolute(trimmed) && fs.existsSync(trimmed) && isInsidePrivateDocs(trimmed)) {
    return path.resolve(trimmed);
  }

  // 2. Storage key / basename lookup
  const filename = path.basename(trimmed);
  if (!filename || filename === '.' || filename === '..') return null;

  const candidateDirs = [
    privateDocsDir,
    path.resolve(process.cwd(), 'storage', 'private', 'seller-docs'),
    path.join(path.dirname(env.databasePath), 'private', 'seller-docs'),
    '/storage/private/seller-docs',
    '/data/private/seller-docs',
  ];

  for (const dir of candidateDirs) {
    try {
      const candidate = path.join(dir, filename);
      if (fs.existsSync(candidate)) {
        return path.resolve(candidate);
      }
    } catch {
      // Continue checking next candidate
    }
  }

  return null;
}

/**
 * Safely unlinks a private document from disk by storage key or legacy path.
 */
export function deletePrivateDoc(storedReference: string | null | undefined): boolean {
  try {
    const resolved = resolvePrivateDocPath(storedReference);
    if (resolved && fs.existsSync(resolved) && isInsidePrivateDocs(resolved)) {
      fs.unlinkSync(resolved);
      return true;
    }
  } catch (error) {
    console.error('Error deleting private document:', error);
  }
  return false;
}

/**
 * Computes SHA-256 hash of a file on disk for integrity verification and deduplication.
 */
export function calculateFileSha256(filePath: string): string | null {
  try {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  } catch {
    return null;
  }
}

export function extensionFor(mimetype: string): string {
  return IMAGE_TYPES[mimetype] ?? DOC_TYPES[mimetype] ?? '';
}

/**
 * MIME headers are supplied by the client. Check the file signature (magic bytes) as well so
 * an executable or HTML document cannot be disguised as a photo or PDF.
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
  const webp =
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WEBP';
  const pdf = header.subarray(0, 5).toString('ascii') === '%PDF-';

  if (kind === 'image') {
    return jpeg || png || webp;
  }
  // Document accepts PDF, JPEG, PNG, or WebP
  return pdf || jpeg || png || webp;
}
