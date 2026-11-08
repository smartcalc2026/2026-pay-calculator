const { test, expect } = require('playwright/test');

const won = value => `${value.toLocaleString('en-US')}원`;

test('smoke page calculates 4,000,000 won gross salary', async ({ page }) => {
  await page.goto('/salary/smoke.html');
  await expect.poll(() => page.locator('body').getAttribute('data-smoke-net'), { timeout: 8_000 }).toBe('3,395,760원');
  await expect(page.locator('body')).toHaveAttribute('data-smoke-error', '');
});

test('uses current Korea month and keeps withholding fixed at 100 percent', async ({ page }) => {
  await page.goto('/salary/');
  const expectedMonth = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    return `${parts.find(part => part.type === 'year').value}-${parts.find(part => part.type === 'month').value}`;
  });
  await expect(page.locator('#month')).toHaveAttribute('type', 'hidden');
  await expect(page.locator('#month')).toHaveValue(expectedMonth);
  await expect(page.locator('input[name="withholding"]')).toHaveAttribute('type', 'hidden');
  await expect(page.locator('input[name="withholding"]')).toHaveValue('1');
  await expect(page.locator('select[name="withholding"], input[name="withholding"]:not([type="hidden"])')).toHaveCount(0);
});

test('clears a previous result as soon as the user edits an input', async ({ page }) => {
  await page.goto('/salary/');
  await page.locator('#gross-mode').selectOption('monthly');
  await page.locator('#gross').fill('2000000');
  await page.getByRole('button', { name: '실수령액 계산하기' }).click();
  await expect(page.locator('#result')).toBeVisible();
  await page.locator('#gross').fill('0');
  await expect(page.locator('#result')).toBeHidden();
  await page.getByRole('button', { name: '실수령액 계산하기' }).click();
  await expect(page.locator('#error')).toContainText('월 총급여액은 0원보다 큰 정수로 입력하세요.');
  await expect(page.locator('#result')).toBeHidden();
});

test('advanced insurance fields validate their period-specific limits when enabled', async ({ page }) => {
  await page.route('**/data/app-config.js', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('enableAdvancedInsuranceInput: false', 'enableAdvancedInsuranceInput: true');
    await route.fulfill({ response, body });
  });
  await page.goto('/salary/');
  const advanced = page.locator('#advanced-insurance');
  await expect(advanced).toBeVisible();
  await page.locator('#gross-mode').selectOption('monthly');
  await page.locator('#gross').fill('4000000');
  const month = Number((await page.locator('#month').inputValue()).slice(5, 7));
  const pensionMax = month < 7 ? 6370000 : 6590000;
  await page.locator('#pension-mode').selectOption('manual');
  await expect(page.locator('#pension-base-manual')).toBeEnabled();
  await page.locator('#pension-base-manual').fill(String(pensionMax + 1));
  await page.getByRole('button', { name: '실수령액 계산하기' }).click();
  await expect(page.locator('#error')).toContainText(`${pensionMax.toLocaleString('en-US')}원 사이의 정수`);
  await expect(page.locator('#result')).toBeHidden();

  await page.locator('#pension-base-manual').fill(String(pensionMax));
  await page.getByRole('button', { name: '실수령액 계산하기' }).click();
  await expect(page.locator('#result')).toBeVisible();
});

test('ignores a calculation response made stale by a newer input', async ({ page }) => {
  await page.route('**/data/income-tax-2026.js', async route => {
    await new Promise(resolve => setTimeout(resolve, 700));
    await route.continue();
  });
  await page.goto('/salary/');
  await page.locator('#gross-mode').selectOption('monthly');
  await page.locator('#gross').fill('2000000');
  await page.getByRole('button', { name: '실수령액 계산하기' }).click();
  await page.locator('#gross').fill('2500000');
  await page.waitForTimeout(1200);
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#error')).toBeHidden();
});

test('default salary result, detail toggle, and deduction amounts', async ({ page }) => {
  await page.goto('/salary/');
  await page.locator('#gross-mode').selectOption('monthly');
  await page.locator('#gross').fill('4000000');
  await page.getByRole('button', { name: '실수령액 계산하기' }).click();
  await expect(page.locator('#net')).toHaveText('3,395,760원');
  await expect(page.locator('#summary')).toContainText('공제합계');
  await expect(page.locator('#summary')).toContainText('604,240원');

  const detail = page.locator('#detail');
  const toggle = page.locator('#toggle-detail');
  await expect(detail).toBeHidden();
  await toggle.click();
  await expect(detail).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const expected = { 국민연금: 190000, 건강보험: 143800, 장기요양보험: 18890, 고용보험: 36000, 근로소득세: 195960, 지방소득세: 19590 };
  for (const [label, amount] of Object.entries(expected)) {
    const row = detail.locator('tr').filter({ has: page.getByText(label, { exact: true }) });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(won(amount));
  }
  await toggle.click();
  await expect(detail).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('annual salary input converts correctly with severance separate or included', async ({ page }) => {
  await page.goto('/salary/');
  await page.locator('#gross-mode').selectOption('annual');
  await page.locator('#severance-mode').selectOption('separate');
  await page.locator('#gross').fill('48000000');
  await page.getByRole('button', { name: '실수령액 계산하기' }).click();
  await expect(page.locator('#net')).toHaveText('3,395,760원');

  await page.locator('#severance-mode').selectOption('included');
  await page.locator('#gross').fill('52000000');
  await page.getByRole('button', { name: '실수령액 계산하기' }).click();
  await expect(page.locator('#net')).toHaveText('3,395,760원');
});

test('amount reading updates while typing and replaces conversion notice', async ({ page }) => {
  await page.goto('/salary/');
  const gross = page.locator('#gross');
  const amountReading = page.locator('#gross-input-group .amount-readable');
  const conversionNotice = page.locator('#salary-conversion-notice');

  await gross.fill('4');
  await expect(amountReading).toHaveText('4원');
  await gross.fill('4166666');
  await expect(amountReading).toHaveText('416만 6,666원');

  await gross.fill('30000000');
  await page.locator('#gross-mode').selectOption('monthly');
  await expect(gross).toHaveValue('2,500,000');
  await expect(conversionNotice).toHaveText('연봉을 월 급여로 환산했습니다.');
  await expect(amountReading).toBeHidden();

  await gross.fill('2000000');
  await expect(conversionNotice).toBeHidden();
  await expect(amountReading).toHaveText('200만 원');

  await page.locator('.mode-tabs label').filter({ hasText: '연봉 역산' }).click();
  const targetReading = page.locator('#target-input-group .amount-readable');
  await page.locator('#target-net').fill('2000000');
  await expect(targetReading).toHaveText('200만 원');
});

test('reverse calculation finds the minimum annual salary for the target', async ({ page }) => {
  await page.goto('/salary/');
  await page.locator('.mode-tabs label').filter({ hasText: '연봉 역산' }).click();
  await expect(page.locator('#gross-input-group')).toBeHidden();
  await expect(page.locator('#severance-fieldset')).toBeHidden();
  await expect(page.locator('#target-input-group')).toBeVisible();
  await expect(page.getByRole('button', { name: '필요 연봉 계산하기' })).toBeVisible();

  const submit = page.getByRole('button', { name: '필요 연봉 계산하기' });
  await submit.click();
  await expect(page.locator('#error')).toContainText('목표 월 실수령액은 0원보다 큰 정수로 입력하세요.');
  await page.locator('#target-net').fill('0');
  await submit.click();
  await expect(page.locator('#error')).toContainText('목표 월 실수령액은 0원보다 큰 정수로 입력하세요.');

  await page.locator('#target-net').fill('3000000');
  await submit.click();
  await expect(page.locator('#net')).toHaveText('3,000,000원');
  await expect(page.locator('#summary')).toContainText('41,662,560원');
  await expect(page.locator('#summary')).toContainText('3,471,880원');
  await expect(page.locator('#reverse-result-note')).toContainText('최소 연봉');

  await page.locator('.mode-tabs label').filter({ hasText: '월 실수령액' }).click();
  await page.locator('#gross-mode').selectOption('annual');
  await page.locator('#severance-mode').selectOption('separate');
  await page.locator('#gross').fill('41662559');
  await page.getByRole('button', { name: '실수령액 계산하기' }).click();
  await expect(page.locator('#net')).toHaveText('2,999,999원');
});

test('reverse calculation reports targets beyond its supported range', async ({ page }) => {
  await page.goto('/salary/');
  await page.locator('.mode-tabs label').filter({ hasText: '연봉 역산' }).click();
  await page.locator('#target-net').fill('999999999');
  await page.getByRole('button', { name: '필요 연봉 계산하기' }).click();
  await expect(page.locator('#error')).toContainText('현재 계산 가능 범위를 초과합니다');
  await expect(page.locator('#result')).toBeHidden();
});

test('validation messages for zero gross, excessive nontaxable pay, and children', async ({ page }) => {
  await page.goto('/salary/');
  await page.locator('#gross-mode').selectOption('monthly');
  const submit = page.getByRole('button', { name: '실수령액 계산하기' });
  await page.locator('#gross').fill('0');
  await submit.click();
  await expect(page.locator('#error')).toContainText('월 총급여액은 0원보다 큰 정수로 입력하세요.');

  await page.locator('#gross').fill('1000000');
  await page.locator('#nontax').fill('1000001');
  await submit.click();
  await expect(page.locator('#error')).toContainText('비과세액은 총급여액보다 클 수 없습니다.');

  await page.locator('#nontax').fill('0');
  await page.locator('#dependents').fill('1');
  await page.locator('#children').fill('2');
  await submit.click();
  await expect(page.locator('#error')).toHaveText('8~20세 자녀 수는 공제대상가족 수를 초과할 수 없습니다.');
});

for (const width of [375, 320]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/salary/');
    await page.locator('#gross-mode').selectOption('monthly');
    await page.locator('#gross').fill('4000000');
    await page.getByRole('button', { name: '실수령액 계산하기' }).click();
    await expect(page.locator('#net')).toHaveText('3,395,760원');
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(width);
    expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(width);
  });

  test(`reverse calculation fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/salary/');
    await page.locator('.mode-tabs label').filter({ hasText: '연봉 역산' }).click();
    await page.locator('#target-net').fill('3000000');
    await page.getByRole('button', { name: '필요 연봉 계산하기' }).click();
    await expect(page.locator('#net')).toHaveText('3,000,000원');
    await page.locator('#toggle-detail').click();
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, table: document.querySelector('.detail-table').getBoundingClientRect().width, detail: document.querySelector('#detail').getBoundingClientRect().width }));
    expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(width);
    expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(width);
    expect(dimensions.table, JSON.stringify(dimensions)).toBe(dimensions.detail);
  });
}
