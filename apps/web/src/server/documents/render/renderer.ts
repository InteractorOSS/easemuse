// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { existsSync } from 'node:fs';

/** Turns a URL into PDF bytes. Injected so tests and other engines can stand in for Chromium. */
export type PdfRenderer = (url: string) => Promise<Uint8Array>;

export interface ChromiumOptions {
  /** A Chromium or Chrome binary; defaults to the one Playwright installed. */
  executablePath?: string | undefined;
  timeoutMs?: number;
}

/** Path of the Chromium Playwright would launch, if it is installed. */
export async function findChromium(): Promise<string | null> {
  const { chromium } = await import('playwright-core');
  const path = chromium.executablePath();
  return path && existsSync(path) ? path : null;
}

/**
 * Headless Chromium renderer (ADR-011): opens the print route, waits for the page and fonts to
 * settle, and prints an A4 PDF with backgrounds. A new browser per document keeps jobs independent.
 */
export function createChromiumRenderer(options: ChromiumOptions = {}): PdfRenderer {
  return async (url) => {
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({
      ...(options.executablePath ? { executablePath: options.executablePath } : {}),
      args: ['--no-sandbox'],
    });
    try {
      const page = await browser.newPage();
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: options.timeoutMs ?? 30_000,
      });
      if (response && !response.ok())
        throw new Error(`The print page answered ${response.status()}`);
      await page.evaluate(() => document.fonts.ready);
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
      });
      return new Uint8Array(pdf);
    } finally {
      await browser.close();
    }
  };
}
