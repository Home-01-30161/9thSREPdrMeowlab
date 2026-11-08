import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import os from 'os';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const { base64, filename } = await req.json();
    if (!base64) {
      return NextResponse.json({ ok: false, error: 'No base64 image provided' }, { status: 400 });
    }

    // Strip data URL prefix (data:image/png;base64,...)
    const b64 = base64.includes(',') ? base64.split(',')[1] : base64;
    const buf = Buffer.from(b64, 'base64');

    // Save to Windows temp dir
    const safeFilename = filename || 'steg_upload.png';
    const winTmp = path.join(/*turbopackIgnore: true*/ os.tmpdir(), safeFilename);
    fs.writeFileSync(winTmp, buf);

    // Also copy to WSL /tmp/ via UNC path so the OCR skill can access it
    const wslTmp = `\\\\wsl.localhost\\Ubuntu\\tmp\\${safeFilename}`;
    try {
      fs.writeFileSync(wslTmp, buf);
    } catch (wslErr) {
      console.warn('[steg-save] WSL write failed (skill will use Windows path):', wslErr);
    }

    const wslPath = `/tmp/${safeFilename}`;
    return NextResponse.json({ ok: true, winPath: winTmp, wslPath });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}

