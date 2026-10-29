import { expect, test } from '@playwright/test';

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

test('Map base layer finishes loading (MapLibre worker ships with the build)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?city=turku');

  // `data-map-ready` flips to "true" on MapLibre's `load` event, which needs the worker
  // to start and the style and first tiles to arrive. Markers alone do not prove this.
  await expect(page.locator('[data-map-ready="true"]')).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors.filter((e) => /worker/i.test(e))).toEqual([]);
});

test('BUG-10: A map that never loads shows the error banner, and Retry rebuilds it', async ({
  page,
}) => {
  test.setTimeout(60_000);

  // Break the worker so MapLibre cannot start. This failure never reaches the map's
  // own `error` event, so only the load timeout can surface it.
  const blockWorker = (route: { abort: () => Promise<void> }) => route.abort();
  await page.route('**/maplibre-gl-worker*', blockWorker);
  await page.goto('/?city=turku');

  const banner = page.getByRole('alert').filter({ hasText: /street map/i });
  await expect(banner).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('[data-map-ready="true"]')).toHaveCount(0);

  await page.unroute('**/maplibre-gl-worker*', blockWorker);
  await banner.getByRole('button', { name: 'Retry Map' }).click();

  await expect(page.locator('[data-map-ready="true"]')).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(banner).toHaveCount(0);
});

test('BUG-01: Opening a flyer and its Details drawer survives a 70s clock advance without resetting', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/?city=turku&view=list');

  const firstCardBtn = page.locator('article .card-primary-btn').first();
  await expect(firstCardBtn).toBeVisible();
  await firstCardBtn.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  const detailsBtn = dialog.getByRole('button', {
    name: 'Details',
    exact: true,
  });
  await expect(detailsBtn).toBeVisible();
  await detailsBtn.click();

  const closeDetailsBtn = dialog.getByRole('button', {
    name: 'Close details drawer',
  });
  await expect(closeDetailsBtn).toBeVisible();
  await expect(detailsBtn).toHaveAttribute('aria-expanded', 'true');

  // Advance clock 70 seconds across App.tsx's 60s tick & StoryPlayerModal's 100ms interval
  await page.clock.fastForward(70_000);

  await expect(dialog).toBeVisible();
  await expect(closeDetailsBtn).toBeVisible();
  await expect(detailsBtn).toHaveAttribute('aria-expanded', 'true');
});

test('BUG-04: Focusing a map marker preserves exact DOM node identity and focus across a 65s clock tick', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/?city=turku');

  const firstMarker = page.locator('button.maplibregl-marker').first();
  await expect(firstMarker).toBeVisible({ timeout: 15_000 });
  await firstMarker.focus();

  const tagged = await page.evaluate(() => {
    const active = document.activeElement;
    (window as unknown as { __testMarker?: Element | null }).__testMarker =
      active;
    return active?.tagName;
  });
  expect(tagged).toBe('BUTTON');

  await page.clock.fastForward(65_000);

  const preserved = await page.evaluate(() => {
    const saved = (window as unknown as { __testMarker?: Element | null })
      .__testMarker;
    return Boolean(
      saved && document.body.contains(saved) && document.activeElement === saved
    );
  });
  expect(preserved).toBe(true);
});

test('PERF-01 & PERF-02: Turku list view windows initial cards (<=40) and keeps total DOM under 3,000 nodes', async ({
  page,
}) => {
  await page.goto('/?city=turku&view=list');

  const cards = page.locator('article.pole-sticker-slap');
  await expect(cards.first()).toBeVisible();

  const initialCount = await cards.count();
  expect(initialCount).toBeGreaterThan(0);
  expect(initialCount).toBeLessThanOrEqual(40);

  // Closed drawers/modals are unmounted
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const totalDomNodes = await page.evaluate(
    () => document.querySelectorAll('*').length
  );
  expect(totalDomNodes).toBeLessThan(3000);
});

test('UI-01 & UI-04: Mobile 375x812 viewport has zero overlapped chrome controls and single map attribution', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?city=turku&view=list');

  const cards = page.locator('article.pole-sticker-slap');
  await expect(cards.first()).toBeVisible();

  const searchBtnBox = await page
    .getByRole('button', { name: 'Toggle search input' })
    .boundingBox();
  const cityBtnBox = await page
    .getByRole('button', { name: /Switch city/i })
    .boundingBox();
  const sortNearestBox = await page
    .getByRole('button', { name: /Nearest/i })
    .boundingBox();
  const dockBox = await page
    .getByRole('complementary', { name: 'Map and Pole quick actions' })
    .boundingBox();

  expect(searchBtnBox).not.toBeNull();
  expect(cityBtnBox).not.toBeNull();
  expect(sortNearestBox).not.toBeNull();
  expect(dockBox).not.toBeNull();

  if (searchBtnBox && cityBtnBox && sortNearestBox && dockBox) {
    expect(boxesOverlap(searchBtnBox, cityBtnBox)).toBe(false);
    expect(boxesOverlap(sortNearestBox, searchBtnBox)).toBe(false);
    expect(boxesOverlap(sortNearestBox, cityBtnBox)).toBe(false);
    expect(boxesOverlap(sortNearestBox, dockBox)).toBe(false);
  }

  // Open City Switcher and verify it stays inside viewport and clear of bottom dock
  await page.getByRole('button', { name: /Switch city/i }).click();
  const cityNav = page.getByRole('navigation', { name: 'City Switcher' });
  await expect(cityNav).toBeVisible();
  const cityNavBox = await cityNav.boundingBox();
  expect(cityNavBox).not.toBeNull();
  if (cityNavBox && dockBox) {
    expect(cityNavBox.x).toBeGreaterThanOrEqual(0);
    expect(cityNavBox.x + cityNavBox.width).toBeLessThanOrEqual(375.5);
    expect(boxesOverlap(cityNavBox, dockBox)).toBe(false);
  }

  // The bottom dock must not cover the list view's data credit
  await page.keyboard.press('Escape');
  const footerBox = await page.locator('footer').boundingBox();
  expect(footerBox).not.toBeNull();
  if (footerBox && dockBox) {
    expect(boxesOverlap(footerBox, dockBox)).toBe(false);
  }

  // Switch to map view and verify custom list footer is hidden so only MapLibre attribution shows
  await page.goto('/?city=turku');
  const attrib = page.locator('.maplibregl-ctrl-attrib');
  await expect(attrib).toHaveCount(1);
  await expect(page.locator('footer')).toHaveCount(0);

  // ...and the dock must not cover the map's attribution either
  const attribBox = await attrib.boundingBox();
  const mapDockBox = await page
    .getByRole('complementary', { name: 'Map and Pole quick actions' })
    .boundingBox();
  expect(attribBox).not.toBeNull();
  expect(mapDockBox).not.toBeNull();
  if (attribBox && mapDockBox) {
    expect(boxesOverlap(attribBox, mapDockBox)).toBe(false);
  }
});

test('BUG-02 & BUG-03: Helsinki calendar has upcoming counts next week and Weekend filter yields events', async ({
  page,
}) => {
  await page.goto('/?city=helsinki&view=list');
  await expect(page.locator('article.pole-sticker-slap').first()).toBeVisible({
    timeout: 15_000,
  });

  // Open Month Calendar and verify multiple future days beyond 48h have events
  await page.getByRole('button', { name: 'Open Month Calendar' }).click();
  const calDialog = page.getByRole('dialog', { name: /Date Slap Calendar/i });
  await expect(calDialog).toBeVisible();

  const daysWithEvents = await calDialog
    .locator('button[aria-label*="events"], button[aria-label*="1 event"]')
    .count();
  await calDialog.getByRole('button', { name: 'Next month' }).click();
  const nextMonthDaysWithEvents = await calDialog
    .locator('button[aria-label*="events"], button[aria-label*="1 event"]')
    .count();

  expect(daysWithEvents + nextMonthDaysWithEvents).toBeGreaterThanOrEqual(10);

  await calDialog.getByRole('button', { name: 'Close calendar' }).click();
  await expect(calDialog).toHaveCount(0);

  // Activate Weekend filter and confirm Helsinki shows weekend events
  await page.getByRole('button', { name: 'Toggle sticker filters' }).click();
  await page.getByRole('button', { name: /Weekend/i }).click();
  await expect(page.locator('article.pole-sticker-slap').first()).toBeVisible();
});

test('BUG-11: Popovers close on Escape (restoring trigger focus) and on outside pointerdown', async ({
  page,
}) => {
  await page.goto('/?city=turku&view=list');
  await expect(page.locator('article.pole-sticker-slap').first()).toBeVisible();

  const searchBtn = page.getByRole('button', { name: 'Toggle search input' });
  await searchBtn.click();
  const searchInput = page.getByRole('searchbox', {
    name: 'Search events in Turku',
  });
  await expect(searchInput).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(searchInput).toHaveCount(0);
  await expect(searchBtn).toBeFocused();

  // Open City Switcher and click outside to dismiss
  await page.getByRole('button', { name: /Switch city/i }).click();
  const cityNav = page.getByRole('navigation', { name: 'City Switcher' });
  await expect(cityNav).toBeVisible();

  await page.mouse.click(180, 760);
  await expect(cityNav).toHaveCount(0);
});
