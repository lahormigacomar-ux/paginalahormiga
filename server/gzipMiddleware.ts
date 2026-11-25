import type { Request, Response, NextFunction } from 'express';
import zlib from 'zlib';

const COMPRESSIBLE_RE = /json|javascript|ecmascript|text\/|xml|svg/i;
const MIN_COMPRESS_BYTES = 1024;

/**
 * Lightweight zero-dependency Gzip compression middleware using Node built-in zlib.
 * Shrinks large JSON payloads (e.g. 3.4 MB partes_diarios -> ~280 KB) and JS/CSS bundles by 75-92%.
 */
export function gzipMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  if (!/\bgzip\b/i.test(acceptEncoding)) {
    next();
    return;
  }

  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);

  let chunks: Buffer[] | null = [];
  let passthrough = false;

  const shouldCompress = (): boolean => {
    if (res.statusCode < 200 || res.statusCode >= 300 || res.statusCode === 204 || res.statusCode === 206) {
      return false;
    }
    if (res.getHeader('Content-Encoding')) {
      return false;
    }
    const contentType = String(res.getHeader('Content-Type') || '');
    if (!COMPRESSIBLE_RE.test(contentType)) {
      return false;
    }
    // Skip Server-Sent Events streams
    if (/text\/event-stream/i.test(contentType)) {
      return false;
    }
    return true;
  };

  res.write = function (chunk: any, encoding?: any, cb?: any): boolean {
    if (passthrough) {
      return origWrite(chunk, encoding, cb);
    }
    if (!shouldCompress()) {
      passthrough = true;
      chunks = null;
      return origWrite(chunk, encoding, cb);
    }
    if (chunk !== undefined && chunk !== null) {
      const buf = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(String(chunk), typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8');
      chunks?.push(buf);
    }
    if (typeof encoding === 'function') {
      encoding();
    } else if (typeof cb === 'function') {
      cb();
    }
    return true;
  } as any;

  res.end = function (chunk?: any, encoding?: any, cb?: any): Response {
    if (typeof chunk === 'function') {
      cb = chunk;
      chunk = undefined;
      encoding = undefined;
    } else if (typeof encoding === 'function') {
      cb = encoding;
      encoding = undefined;
    }

    if (passthrough) {
      return origEnd(chunk, encoding, cb);
    }

    if (chunk !== undefined && chunk !== null) {
      const buf = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(String(chunk), typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8');
      chunks?.push(buf);
    }

    const body = chunks && chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);
    chunks = null;

    if (!shouldCompress() || body.length < MIN_COMPRESS_BYTES || res.headersSent) {
      return origEnd(body.length > 0 ? body : undefined, cb);
    }

    zlib.gzip(body, { level: zlib.constants.Z_DEFAULT_COMPRESSION }, (err, compressed) => {
      if (err || !compressed || compressed.length >= body.length || res.headersSent) {
        origEnd(body, cb);
        return;
      }
      res.setHeader('Content-Encoding', 'gzip');
      const existingVary = String(res.getHeader('Vary') || '');
      if (!/accept-encoding/i.test(existingVary)) {
        res.setHeader('Vary', existingVary ? `${existingVary}, Accept-Encoding` : 'Accept-Encoding');
      }
      res.setHeader('Content-Length', String(compressed.length));
      origEnd(compressed, cb);
    });

    return res;
  } as any;

  next();
}
