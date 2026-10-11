import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('All changes saved')).toBeVisible();
});
test('edit Markdown, drag, undo, persist, export and import', async ({ page }) => {
  const card = page.getByRole('article', { name: 'THE STARTING POINT' });
  await card.dblclick();
  await page
    .getByRole('textbox', { name: 'Markdown text' })
    .fill('## A tested idea\n\n**Strong** and *curious*.\n\n<script>window.hacked=true</script>');
  await page.getByRole('button', { name: 'Save card', exact: true }).click();
  await expect(card.locator('h2')).toHaveText('A tested idea');
  await expect(card.locator('strong')).toHaveText('Strong');
  expect(await page.evaluate(() => 'hacked' in window)).toBe(false);
  const before = await card.boundingBox();
  await page.mouse.move(before!.x + 40, before!.y + 20);
  await page.mouse.down();
  await page.mouse.move(before!.x + 100, before!.y + 65, { steps: 8 });
  await page.mouse.up();
  const after = await card.boundingBox();
  expect(after!.x - before!.x).toBeCloseTo(60, 0);
  await page.getByRole('button', { name: 'Undo (Ctrl/⌘ Z)', exact: true }).click();
  expect((await card.boundingBox())!.x).toBeCloseTo(before!.x, 0);
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.reload();
  await expect(card.locator('h2')).toHaveText('A tested idea');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export board' }).click();
  const download = await downloadEvent;
  const path = await download.path();
  await page.locator('input[type=file][accept=".json"]').setInputFiles(path!);
  await expect(page.getByText('Board imported. Undo restores your previous board.')).toBeVisible();
});
test('create, connect, duplicate, resize, and delete', async ({ page }) => {
  await page.keyboard.press('t');
  await page.getByRole('textbox', { name: 'Markdown text' }).fill('# New scene');
  await page.getByRole('button', { name: 'Save card', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(5);
  await page.getByRole('button', { name: 'Duplicate card', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(6);
  await page.getByRole('button', { name: 'Delete card', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(5);
  await page.getByRole('button', { name: 'Connect cards (C)', exact: true }).click();
  await page.getByRole('article', { name: 'THE STARTING POINT' }).click();
  await page.getByRole('article', { name: 'A NOTE TO SELF' }).click();
  await expect(page.locator('.edge')).toHaveCount(4);
  await page.keyboard.press('v');
  const card = page.getByRole('article', { name: 'A NOTE TO SELF' });
  await card.click();
  const box = await card.boundingBox();
  const handle = await page.getByRole('button', { name: 'Resize card' }).boundingBox();
  await page.mouse.move(handle!.x + 6, handle!.y + 6);
  await page.mouse.down();
  await page.mouse.move(handle!.x + 60, handle!.y + 45, { steps: 6 });
  await page.mouse.up();
  expect((await card.boundingBox())!.width).toBeGreaterThan(box!.width + 40);
});
test('upload an image and reject malformed imports', async ({ page }) => {
  await page.locator('input[type=file][accept^="image/"]').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByRole('img', { name: 'pixel.png' })).toBeVisible();
  await page.locator('input[type=file][accept=".json"]').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.getByText('This is not a supported Storyboard file.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'pixel.png' })).toBeVisible();
});

test('desktop layout, zoom, and large-board culling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'test-results/storyboard-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText('83%');
  const nodes = Array.from({ length: 1500 }, (_, i) => ({
    id: `n${i}`,
    type: 'text',
    x: (i % 50) * 350,
    y: Math.floor(i / 50) * 280,
    width: 290,
    height: 230,
    content: `## Scene ${i}`,
    title: `SCENE ${i}`,
    tone: 'paper',
  }));
  const board = { version: 1, title: 'Large board', nodes, edges: [] };
  await page.locator('input[type=file][accept=".json"]').setInputFiles({
    name: 'large.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(board)),
  });
  await expect(page.getByText('1500 cards · 0 connections')).toBeVisible();
  expect(await page.getByRole('article').count()).toBeLessThan(40);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText('120%');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/storyboard-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('draw at zoom, undo, move, persist, export and delete ink', async ({ page }) => {
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Draw (P)', exact: true }).click();
  await page.getByLabel('Pen color').fill('#b52d44');
  await page.getByLabel('Pen width').selectOption('6');
  const surface = await page.getByLabel('Storyboard canvas').boundingBox();
  const x = surface!.x + 100,
    y = surface!.y + 530;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y - 40, { steps: 8 });
  await page.mouse.move(x + 100, y, { steps: 8 });
  await page.mouse.up();
  const ink = page.locator('.ink-stroke');
  await expect(ink).toHaveCount(1);
  await expect(ink).toHaveAttribute('stroke', '#b52d44');
  await expect(ink).toHaveAttribute('stroke-width', '6');
  await page.screenshot({ path: 'test-results/storyboard-drawing.png' });
  const original = await ink.getAttribute('d');
  await page.getByRole('button', { name: 'Undo (Ctrl/⌘ Z)', exact: true }).click();
  await expect(ink).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo (Ctrl/⌘ Shift Z)', exact: true }).click();
  await expect(ink).toHaveCount(1);
  await page.getByRole('button', { name: 'Select (V)', exact: true }).click();
  await page.mouse.move(x + 1, y - 1);
  await page.mouse.down();
  await page.mouse.move(x + 31, y + 19, { steps: 5 });
  await page.mouse.up();
  expect(await ink.getAttribute('d')).not.toBe(original);
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.reload();
  await expect(ink).toHaveCount(1);
  const saved = await ink.getAttribute('d');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export board' }).click();
  const path = await (await pending).path();
  await page.locator('input[type=file][accept=".json"]').setInputFiles(path!);
  await expect(ink).toHaveAttribute('d', saved!);
  const hit = await page.locator('.ink-hit').evaluate((el) => {
    const path = el as SVGPathElement;
    const p = path.getPointAtLength(1).matrixTransform(path.getScreenCTM()!);
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(hit.x, hit.y);
  await page.getByRole('button', { name: 'Delete drawing', exact: true }).click();
  await expect(ink).toHaveCount(0);
});

test('pen dots and cancelled strokes', async ({ page }) => {
  await page.keyboard.press('p');
  const canvas = await page.getByLabel('Storyboard canvas').boundingBox();
  await page.mouse.click(canvas!.x + 70, canvas!.y + 500);
  await expect(page.locator('.ink-stroke')).toHaveCount(1);
  await page.mouse.move(canvas!.x + 100, canvas!.y + 500);
  await page.mouse.down();
  await page.mouse.move(canvas!.x + 140, canvas!.y + 520);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.ink-stroke')).toHaveCount(1);
});
