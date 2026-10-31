import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const fixture = (name: string) => resolve('tests/fixtures', name);
const media = (page: Page) => page.locator('.local-media');
const position = (page: Page) => media(page).evaluate((element: HTMLMediaElement) => element.currentTime);

async function importMedia(page: Page, ...names: string[]) {
  await page.getByRole('button', { name: 'Add music', exact: true }).first().click();
  await page.getByLabel('Import media files').setInputFiles(names.map(fixture));
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
}

async function readProfile(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('musica-library', 1);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const transaction = database.transaction(['library', 'files'], 'readonly');
      const saved = transaction.objectStore('library').get('current');
      const keys = transaction.objectStore('files').getAllKeys();
      const files = transaction.objectStore('files').getAll();
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
      if (typeof saved.result !== 'string') throw new Error('The imported library has no saved JSON.');
      return {
        raw: saved.result,
        files: await Promise.all(
          files.result.map(async (file: { bytes: ArrayBuffer; mimeType: string }, index: number) => ({
            id: keys.result[index],
            bytes: file.bytes.byteLength,
            mimeType: file.mimeType,
            sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', file.bytes)))
              .map((byte) => byte.toString(16).padStart(2, '0'))
              .join(''),
          })),
        ),
      };
    } finally {
      database.close();
    }
  });
}

async function writeSavedJson(page: Page, raw: string) {
  await page.evaluate(async (raw) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('musica-library', 1);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('library', 'readwrite');
        transaction.objectStore('library').put(raw, 'current');
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }, raw);
}

async function holdLibraryWrite(page: Page) {
  return page.evaluateHandle(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('musica-library', 1);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    let released = false;
    let reads = 0;
    const startedAt = performance.timeOrigin + performance.now();
    const transaction = database.transaction(['library', 'files'], 'readwrite');
    const store = transaction.objectStore('library');
    const timeout = window.setTimeout(() => {
      released = true;
    }, 10_000);
    const finished = new Promise<{ startedAt: number; finishedAt: number; reads: number }>(
      (resolve, reject) => {
        transaction.oncomplete = () => {
          window.clearTimeout(timeout);
          database.close();
          resolve({ startedAt, finishedAt: performance.timeOrigin + performance.now(), reads });
        };
        transaction.onabort = () => {
          window.clearTimeout(timeout);
          database.close();
          reject(transaction.error);
        };
      },
    );
    await new Promise<void>((resolve, reject) => {
      const read = () => {
        const request = store.get('current');
        request.onsuccess = () => {
          reads += 1;
          resolve();
          if (!released) read();
        };
        request.onerror = () => reject(request.error);
      };
      read();
    });
    return { release: () => (released = true), finished };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Music, in your light.' })).toBeVisible();
});

test('a peer selection survives an actual track ending queued behind a real storage transaction', async ({
  page,
  context,
}, testInfo) => {
  await importMedia(page, 'tone-a.wav', 'tone-b.wav', 'backdrop.webm');
  const peer = await context.newPage();
  await peer.goto('/');
  await expect(peer.getByRole('heading', { name: 'tone-a', exact: true })).toBeVisible();
  const retired = await media(page).elementHandle();
  if (!retired) throw new Error('The original track has no media element.');
  const naturalEnding = await retired.evaluateHandle((element: HTMLMediaElement) => {
    const observation: { ended: null | { trusted: boolean; position: number; at: number; source: string } } =
      {
        ended: null,
      };
    element.addEventListener(
      'ended',
      (event) => {
        observation.ended = {
          trusted: event.isTrusted,
          position: element.currentTime,
          at: performance.timeOrigin + performance.now(),
          source: element.currentSrc,
        };
      },
      { once: true },
    );
    return observation;
  });
  const peerSelection = await peer
    .getByRole('button', { name: 'Select tone-b', exact: true })
    .evaluateHandle((button) => {
      const observation: { click: null | { trusted: boolean; at: number } } = { click: null };
      button.addEventListener(
        'click',
        (event) => {
          observation.click = {
            trusted: event.isTrusted,
            at: performance.timeOrigin + performance.now(),
          };
        },
        { once: true, capture: true },
      );
      return observation;
    });
  await page.bringToFront();
  const seek = page.getByRole('slider', { name: 'Seek', exact: true });
  const bounds = await seek.boundingBox();
  if (!bounds) throw new Error('The real seek control has no visible bounds.');
  await seek.click({ position: { x: bounds.width * 0.4, y: bounds.height / 2 } });
  const startPosition = await position(page);
  expect(startPosition).toBeGreaterThan(3);
  expect(startPosition).toBeLessThan(4);
  const hold = await holdLibraryWrite(page);
  let contention;
  try {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => position(page), { intervals: [25] }).toBeGreaterThan(startPosition + 0.1);
    const positionBeforeClick = await position(page);
    await peer.bringToFront();
    await peer.getByRole('button', { name: 'Select tone-b', exact: true }).click();
    await expect(peer.getByRole('heading', { name: 'tone-a', exact: true })).toBeVisible();
    await expect
      .poll(() => naturalEnding.evaluate((observation) => observation.ended), { intervals: [25] })
      .not.toBeNull();
    const ending = await naturalEnding.evaluate((observation) => observation.ended);
    const click = await peerSelection.evaluate((observation) => observation.click);
    if (!click || !ending) throw new Error('The real peer click and natural ending must both be observed.');
    contention = { positionBeforeClick, click, ending };
    expect(click.trusted).toBe(true);
    expect(ending.trusted).toBe(true);
    expect(ending.position).toBeCloseTo(8, 1);
    expect(click.at).toBeLessThan(ending.at);
  } finally {
    const transaction = await hold.evaluate(async (hold) => {
      hold.release();
      return await hold.finished;
    });
    await testInfo.attach('real-storage-contention', {
      body: JSON.stringify({ ...contention, transaction }, null, 2),
      contentType: 'application/json',
    });
    await hold.dispose();
    if (contention) {
      expect(contention.click.at).toBeGreaterThanOrEqual(transaction.startedAt);
      expect(contention.ending.at).toBeLessThan(transaction.finishedAt);
    }
  }
  for (const window of [page, peer]) {
    await expect(window.getByRole('heading', { name: 'tone-b', exact: true })).toBeVisible();
    await expect(media(window)).toHaveCount(1);
  }
  await expect.poll(() => position(peer)).toBeGreaterThan(0.3);
  await expect.poll(() => media(page).evaluate((element: HTMLMediaElement) => element.paused)).toBe(true);
  expect(
    await retired.evaluate((element: HTMLMediaElement) => ({
      paused: element.paused,
      connected: element.isConnected,
      source: element.getAttribute('src'),
    })),
  ).toEqual({ paused: true, connected: false, source: null });
  await page.waitForTimeout(400);
  for (const window of [page, peer]) {
    await expect(window.getByRole('heading', { name: 'tone-b', exact: true })).toBeVisible();
  }
  const saved = JSON.parse((await readProfile(page)).raw) as {
    activeId: string;
    tracks: { id: string; title: string }[];
  };
  expect(saved.tracks.find((track) => track.id === saved.activeId)?.title).toBe('tone-b');
  await peer.getByRole('button', { name: 'Pause', exact: true }).click();
  await peerSelection.dispose();
  await naturalEnding.dispose();
  await retired.dispose();
});

for (const field of ['repeat', 'theme', 'font', 'motion'] as const) {
  test(`restoring an array-valued ${field} reports invalid settings without changing saved media`, async ({
    page,
  }, testInfo) => {
    await importMedia(page, 'tone-a.wav');
    const original = await readProfile(page);
    const originalBytes = await readFile(fixture('tone-a.wav'));
    expect(original.files).toHaveLength(1);
    expect(original.files[0]?.sha256).toBe(createHash('sha256').update(originalBytes).digest('hex'));
    const corrupted = JSON.parse(original.raw) as {
      repeat: unknown;
      appearance: Record<string, unknown>;
    };
    if (field === 'repeat') corrupted.repeat = [corrupted.repeat];
    else corrupted.appearance[field] = [corrupted.appearance[field]];
    const raw = JSON.stringify(corrupted);
    await writeSavedJson(page, raw);
    await page.reload();
    const errorText =
      field === 'repeat'
        ? 'The saved library has an unsupported format.'
        : 'The saved appearance settings are invalid.';
    const errorNotice = page.getByRole('status').filter({ hasText: errorText });
    await expect(errorNotice).toHaveText(errorText);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
    const rejected = await readProfile(page);
    expect(rejected.raw).toBe(raw);
    expect(rejected.files).toEqual(original.files);
    await testInfo.attach('preserved-profile', {
      body: JSON.stringify(
        { field, files: rejected.files, savedJsonUnchanged: rejected.raw === raw },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    await writeSavedJson(page, original.raw);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'tone-a', exact: true })).toBeVisible();
    await expect(errorNotice).toHaveCount(0);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => position(page)).toBeGreaterThan(0.3);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    expect((await readProfile(page)).files).toEqual(original.files);
  });
}
