import { test, expect, type Page } from '@playwright/test';

async function openScanner(page: Page) {
  await page.route('https://mock-api.test/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/inventory') return route.fulfill({ json: { items: [], groups: [] } });
    if (path === '/locations')
      return route.fulfill({ json: { locations: [{ locationId: 'pantry', name: 'Pantry' }] } });
    if (path === '/inventory/barcode-lookup')
      return route.fulfill({
        json: { found: true, product: { name: 'Scanned product', category: 'Groceries' } },
      });
    if (path === '/inventory/search') return route.fulfill({ json: { items: [], count: 0 } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/');
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await page.getByRole('heading', { name: 'Inventory', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Barcode Scan' }).click();
}

async function installCamera(page: Page, barcode = true) {
  await page.addInitScript(
    ({ barcode }) => {
      const state = {
        tracks: [] as MediaStreamTrack[],
        constraints: [] as MediaStreamConstraints[],
      };
      Object.assign(window, { testCamera: state });
      Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
        value: async () => [
          { kind: 'videoinput', deviceId: 'rear', label: 'Back camera' },
          { kind: 'videoinput', deviceId: 'macro', label: 'Macro camera' },
        ],
      });
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: async (constraints: MediaStreamConstraints) => {
          state.constraints.push(constraints);
          const canvas = document.createElement('canvas');
          canvas.width = 1280;
          canvas.height = 720;
          const ctx = canvas.getContext('2d')!;
          const draw = () => {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, 1280, 720);
            if (!barcode) return;
            // EAN-13 5901234123457, including guard bars and the first-digit parity.
            const L = [
              '0001101',
              '0011001',
              '0010011',
              '0111101',
              '0100011',
              '0110001',
              '0101111',
              '0111011',
              '0110111',
              '0001011',
            ];
            const G = [
              '0100111',
              '0110011',
              '0011011',
              '0100001',
              '0011101',
              '0111001',
              '0000101',
              '0010001',
              '0001001',
              '0010111',
            ];
            const R = L.map((entry) =>
              entry
                .split('')
                .map((bit) => (bit === '0' ? '1' : '0'))
                .join(''),
            );
            const left = '901234'
              .split('')
              .map((digit, i) => ('LGGLLG'[i] === 'L' ? L : G)[Number(digit)])
              .join('');
            const right = '123457'
              .split('')
              .map((digit) => R[Number(digit)])
              .join('');
            const bars = `101${left}01010${right}101`;
            ctx.fillStyle = 'black';
            bars.split('').forEach((bit, index) => {
              if (bit === '1') ctx.fillRect(260 + index * 8, 190, 8, 320);
            });
          };
          draw();
          const timer = setInterval(draw, 40);
          const stream = canvas.captureStream(25);
          for (const track of stream.getTracks()) {
            state.tracks.push(track);
            const stop = track.stop.bind(track);
            track.stop = () => {
              clearInterval(timer);
              stop();
            };
          }
          return stream;
        },
      });
    },
    { barcode },
  );
}

test('real decoder reads EAN-13 from a camera stream, locks macro camera and releases tracks', async ({
  page,
}) => {
  await installCamera(page);
  await openScanner(page);
  await expect(page.getByRole('heading', { name: 'Add Item', exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByLabel('Barcode', { exact: true })).toHaveValue('5901234123457');
  await expect(page.getByLabel('Product Name')).toHaveValue('Scanned product');
  const camera = await page.evaluate(() => {
    const state = (
      window as unknown as {
        testCamera: { tracks: MediaStreamTrack[]; constraints: MediaStreamConstraints[] };
      }
    ).testCamera;
    return {
      stopped: state.tracks.every((track) => track.readyState === 'ended'),
      constraints: state.constraints,
    };
  });
  expect(camera.stopped).toBe(true);
  expect(camera.constraints.some((entry) => JSON.stringify(entry).includes('macro'))).toBe(true);
});

test('closing and reopening the scanner releases camera streams', async ({ page }) => {
  await installCamera(page, false);
  await openScanner(page);
  await expect(page.getByTestId('video-container').locator('video')).toBeVisible();
  await page.getByRole('button', { name: 'Close barcode scanner' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { testCamera: { tracks: MediaStreamTrack[] } }
        ).testCamera.tracks.every((track) => track.readyState === 'ended'),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Barcode Scan' }).click();
  await expect(page.getByTestId('video-container').locator('video')).toBeVisible();
  await page.getByRole('button', { name: 'Close barcode scanner' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { testCamera: { tracks: MediaStreamTrack[] } }
        ).testCamera.tracks.every((track) => track.readyState === 'ended'),
      ),
    )
    .toBe(true);
});

for (const error of ['NotAllowedError', 'NotFoundError']) {
  test(`${error} has a working manual barcode fallback`, async ({ page }) => {
    await page.addInitScript((name) => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: async () => {
          throw new DOMException('Camera unavailable', name);
        },
      });
    }, error);
    await openScanner(page);
    await expect(
      page.getByText(
        error === 'NotAllowedError'
          ? 'Camera permission was denied.'
          : 'Camera is not available on this device.',
      ),
    ).toBeVisible();
    await page.getByRole('textbox', { name: 'Manual barcode entry' }).fill('5901234123457');
    await page.getByRole('button', { name: 'Look Up', exact: true }).click();
    await expect(page.getByLabel('Barcode', { exact: true })).toHaveValue('5901234123457');
  });
}

test('scan timeout releases the camera, retries, and offers manual entry', async ({ page }) => {
  test.setTimeout(45000);
  await installCamera(page, false);
  await openScanner(page);
  await expect(page.getByTestId('timeout-prompt')).toBeVisible({ timeout: 35000 });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { testCamera: { tracks: MediaStreamTrack[] } }
        ).testCamera.tracks.every((track) => track.readyState === 'ended'),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByTestId('video-container').locator('video')).toBeVisible();
  await page.getByRole('button', { name: 'Close barcode scanner' }).click();
  await expect(page.getByTestId('barcode-scanner-overlay')).toHaveCount(0);
});

test('manual entry after scan timeout opens the add-item form', async ({ page }) => {
  test.setTimeout(45000);
  await installCamera(page, false);
  await openScanner(page);
  await expect(page.getByTestId('timeout-prompt')).toBeVisible({ timeout: 35000 });
  await page.getByRole('button', { name: 'Enter Manually', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add Item', exact: true })).toBeVisible();
  await expect(page.getByLabel('Product Name')).toHaveValue('');
});
