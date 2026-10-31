import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('real on-device Whisper can cancel, retry and export recognized speech with timing', async ({
  page,
  context,
  browser,
}, testInfo) => {
  const file = resolve(process.env.MUSICA_SPEECH_FIXTURE || '.artifacts/fixtures/jfk.wav');
  let audio: Buffer;
  try {
    audio = await readFile(file);
  } catch {
    throw new Error(
      'Download the speech fixture with python3 tests/fixtures/download_speech.py, or set MUSICA_SPEECH_FIXTURE to the documented JFK WAV.',
    );
  }
  expect(createHash('sha256').update(audio).digest('hex')).toBe(
    'aa81c2552465568567e670f3823117e633900d16bd6202346a72f3c8464c74c8',
  );
  const errors: string[] = [];
  const consoleMessages: string[] = [];
  const network: { method: string; url: string }[] = [];
  const workers = new Set<string>();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      consoleMessages.push(`${message.type()}: ${message.text()}`);
  });
  page.on('worker', (worker) => {
    workers.add(worker.url());
    worker.on('close', () => workers.delete(worker.url()));
  });
  context.on('request', (request) => {
    const url = new URL(request.url());
    url.search = '';
    url.hash = '';
    network.push({ method: request.method(), url: url.href });
  });
  const started = Date.now();
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add music', exact: true }).first().click();
    await page
      .getByLabel('Import media files')
      .setInputFiles({ name: 'jfk.wav', mimeType: 'audio/wav', buffer: audio });
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Add lyrics', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Transcribe on device', exact: true })).toBeDisabled();
    await page.getByLabel('I have permission to transcribe this file.').check();
    const startedWorker = page.waitForEvent('worker', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Transcribe on device', exact: true }).click();
    await startedWorker;
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Transcribe on device', exact: true })).toBeEnabled();
    await expect.poll(() => workers.size).toBe(0);
    await expect(page.locator('.lyric-line')).toHaveCount(0);

    await page.getByRole('button', { name: 'Transcribe on device', exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('.lyrics-window') !== null ||
        document.querySelector('.lyric-tools [role="alert"]') !== null,
      undefined,
      { timeout: 840_000 },
    );
    await expect(
      page.locator('.lyric-tools [role="alert"]'),
      'The actual model/runtime must download and infer successfully.',
    ).toHaveCount(0);
    await expect(page.getByText('ESTIMATED TRANSCRIPT', { exact: true })).toBeVisible();
    await expect.poll(() => workers.size).toBe(0);
    const recognized = (await page.locator('.lyric-line').allTextContents()).join(' ');
    expect(recognized.toLowerCase()).toContain('fellow americans');
    expect(recognized.toLowerCase()).toContain('your country');
    const modelRequests = network.filter((request) =>
      request.url.includes('/onnx-community/whisper-tiny.en/resolve/'),
    );
    expect(modelRequests.length).toBeGreaterThan(0);
    expect(
      modelRequests.every((request) =>
        request.url.includes('/resolve/2575352d61be1bf7225cf8f8b268a4678025fc58/'),
      ),
      'Model weights, tokenizer discovery and processor assets must use the same immutable revision.',
    ).toBe(true);
    expect(
      network.filter((request) => !['GET', 'HEAD'].includes(request.method)),
      'The transcription journey must not upload the audio.',
    ).toEqual([]);

    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloaded;
    const exportedPath = await download.path();
    if (!exportedPath) throw new Error('The recognized words did not export.');
    const exported = await readFile(exportedPath, 'utf8');
    const cues = [...exported.matchAll(/^\[(\d+):(\d+\.\d+)\](.+)$/gm)].map((match) => ({
      start: Number(match[1]) * 60 + Number(match[2]),
      text: match[3]!.trim(),
    }));
    expect(cues.length).toBeGreaterThan(0);
    expect(cues.every((cue) => Number.isFinite(cue.start) && cue.start >= 0 && cue.start < 11)).toBe(true);
    expect(cues.every((cue, index) => index === 0 || cue.start > cues[index - 1]!.start)).toBe(true);
    await testInfo.attach('recognized-speech', { body: exported, contentType: 'text/plain' });
    await page.getByRole('button', { name: 'Close lyric settings' }).click();
    const lastCue = cues.at(-1);
    if (!lastCue) throw new Error('No timed speech cue was recognized.');
    await page.getByRole('button', { name: lastCue.text, exact: true }).click();
    await expect
      .poll(() => page.locator('audio').evaluate((element: HTMLAudioElement) => element.currentTime))
      .toBeCloseTo(lastCue.start, 1);
    await expect(page.getByRole('button', { name: lastCue.text, exact: true })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await page.reload();
    await expect(page.getByText('ESTIMATED TRANSCRIPT', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    expect(errors).toEqual([]);
  } finally {
    await testInfo.attach('transcription-observations', {
      body: JSON.stringify(
        {
          browserVersion: browser.version(),
          nodeVersion: process.version,
          elapsedSeconds: (Date.now() - started) / 1000,
          errors,
          consoleMessages,
          network,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    const screenshot = testInfo.outputPath('transcription-state.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach('transcription-state', { path: screenshot, contentType: 'image/png' });
  }
});
