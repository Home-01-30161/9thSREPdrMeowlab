import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

// ~6 MB decoded — enough for any screenshot but prevents memory-DoS via huge bodies.
const MAX_UTF8_BASE64_LENGTH = 8 * 1024 * 1024;
// UNC writes into WSL can hang on slow/unavailable SMB; cap the wait.
const WSL_WRITE_TIMEOUT_MS = 5_000;

/**
 * Only accept real images (content sniffing), never trust the client-sent name.
 * The server generates the filename so:
 *  - no path traversal / arbitrary file write (Windows tmp or WSL tmp)
 *  - no control characters can be smuggled into the path string that the
 *    front-end later interpolates into agent prompts
 */
function sniffImageExtension(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { base64, filename } = await req.json();

    if (typeof base64 !== 'string' || base64.length === 0) {
      return NextResponse.json({ ok: false, error: 'No base64 image provided' }, { status: 400 });
    }
    if (base64.length > MAX_UTF8_BASE64_LENGTH) {
      return NextResponse.json({ ok: false, error: 'Image too large' }, { status: 413 });
    }
    if (typeof filename !== 'undefined' && typeof filename !== 'string') {
      return NextResponse.json({ ok: false, error: 'Invalid filename' }, { status: 400 });
    }

    // Strip data URL prefix (data:image/png;base64,...)
    const b64 = base64.includes(',') ? base64.split(',')[1] : base64;
    if (!b64) {
      return NextResponse.json({ ok: false, error: 'No base64 image provided' }, { status: 400 });
    }
    const buf = Buffer.from(b64, 'base64');
    if (buf.length === 0) {
      return NextResponse.json({ ok: false, error: 'Invalid base64 image data' }, { status: 400 });
    }

    const ext = sniffImageExtension(buf);
    if (!ext) {
      return NextResponse.json({ ok: false, error: 'Unsupported image type (PNG, JPG, WEBP only)' }, { status: 415 });
    }

    // Server-generated name — the (attacker-controlled) client filename is
    // deliberately discarded after validation.
    const safeFilename = `report_evidence_${randomUUID()}.${ext}`;
    const winTmp = path.join(os.tmpdir(), safeFilename);
    await fs.writeFile(winTmp, buf);

    // Best-effort copy to WSL /tmp/ so the OCR skill can access it.
    // Disable with STEG_SAVE_WSL=0; distro name configurable via STEG_SAVE_WSL_DISTRO.
    let savedPath = winTmp;
    if (process.env.STEG_SAVE_WSL !== '0') {
      const distro = process.env.STEG_SAVE_WSL_DISTRO || 'Ubuntu';
      try {
        await fs.writeFile(`\\\\wsl.localhost\\${distro}\\tmp\\${safeFilename}`, buf, {
          signal: AbortSignal.timeout(WSL_WRITE_TIMEOUT_MS),
        });
        savedPath = `/tmp/${safeFilename}`;
      } catch (wslErr) {
        console.warn('[steg-save] WSL write failed (skill will use Windows path)');
      }
    }

    return NextResponse.json({ ok: true, path: savedPath, filename: safeFilename });
  } catch (err) {
    // Generic error to the client — details go to the server log only.
    console.error('[steg-save] failed:', err);
    return NextResponse.json({ ok: false, error: 'Could not save image' }, { status: 400 });
  }
}
