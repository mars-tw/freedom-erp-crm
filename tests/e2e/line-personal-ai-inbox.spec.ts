import {test, expect} from '@playwright/test';

async function loginFish(page: import('@playwright/test').Page) {
  // 前端 Gherkin：首頁同時顯示待處理收件匣與四象限摘要。
  await page.goto('/line-inbox-demo.html');
  await expect(page.getByRole('heading', {name: '建立家庭中台'})).toBeVisible();
  const email = `fish-${Date.now()}@example.test`;
  await page.getByLabel('管理員 Email').fill(email);
  await page.getByLabel('管理員密碼').fill('fish-demo-password');
  await page.getByLabel('管理員名稱').fill('Fish');
  await page.getByRole('button', {name: '建立 Fish 管理員'}).click();
  await expect(page.getByRole('heading', {name: '登入家庭中台'})).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('密碼').fill('fish-demo-password');
  await page.getByRole('button', {name: '登入'}).click();
  await expect(page.getByRole('heading', {name: '今天先處理真正重要的事'})).toBeVisible();
  return email;
}

test('沒有重要通知時不顯示無作用的查看收件匣按鈕', async ({page}) => {
  await loginFish(page);
  await expect(page.getByRole('heading', {name: '重要通知 · simulated'})).toBeVisible();
  await expect(page.getByRole('button', {name: '查看收件匣', exact: true})).toHaveCount(0);
});

test('首頁同時顯示待處理收件匣與四象限摘要，且可確認低信心分類', async ({page}) => {
  await loginFish(page);
  await expect(page.getByRole('heading', {name: '收件匣'})).toBeVisible();
  await expect(page.getByRole('heading', {name: '四象限摘要'})).toBeVisible();
  await expect(page.getByTestId('important-urgent-count')).toHaveText(/\d+/);
  await expect(page.getByTestId('review-count')).toHaveText(/\d+/);
  await page.getByRole('button', {name: '待處理收件匣'}).click();
  await expect(page.getByRole('heading', {name: '待處理收件匣'})).toBeVisible();
  await page.getByRole('button', {name: '確認分類'}).first().click();
  await expect(page.getByText('已確認分類')).toBeVisible();
  await page.getByRole('button', {name: '總覽'}).click();
  await expect(page.getByRole('heading', {name: '重要通知 · simulated'})).toBeVisible();
  await expect(page.locator('body')).not.toContainText('0912-345-678');
});

test('回覆草稿送出後不再顯示可重複送出的按鈕', async ({page}) => {
  await loginFish(page);
  await page.getByRole('button', {name: '待處理收件匣'}).click();
  await page.getByRole('region', {name: '收件匣'}).getByRole('button', {name: /合作夥伴 B/}).click();
  await expect(page.getByRole('button', {name: '確認送出草稿'})).toBeVisible();
  await page.getByRole('button', {name: '確認送出草稿'}).click();
  await expect(page.getByText('已逐筆送出回覆草稿。')).toBeVisible();
  await expect(page.getByRole('button', {name: '確認送出草稿'})).toHaveCount(0);
});

test('家人只能看到摘要與已核准待辦，OpenChat 草稿在驗證前不得送出', async ({page}) => {
  await loginFish(page);
  await page.getByRole('button', {name: '登出'}).click();
  await expect(page.getByRole('heading', {name: '登入家庭中台'})).toBeVisible();
  await page.getByLabel('Email').fill('family@example.test');
  await page.getByLabel('密碼').fill('family-demo-password');
  await page.getByRole('button', {name: '登入'}).click();
  await expect(page.getByRole('banner').getByText('家人檢視')).toBeVisible();
  await expect(page.getByRole('button', {name: '連接與備份', exact: true})).toHaveCount(0);
  await expect(page.getByRole('button', {name: '查看連接與備份', exact: true})).toHaveCount(0);
  await expect(page.getByText(/原始訊息.*回覆草稿.*分類操作.*已隱藏/)).toBeVisible();
  await expect(page.locator('.draft-preview')).toHaveCount(0);
  await page.getByRole('button', {name: '已核准待辦'}).click();
  await expect(page.getByText('待辦協作')).toBeVisible();
  await expect(page.getByRole('button', {name: /標記完成/ }).first()).toBeVisible();
});

test('同步中斷時顯示狀態並停用送出，恢復後顯示補同步', async ({page}) => {
  await loginFish(page);
  await page.getByRole('button', {name: '連接與備份', exact: true}).click();
  await page.getByRole('button', {name: '模擬同步中斷'}).click();
  await expect(page.getByText('離線')).toBeVisible();
  await page.getByRole('button', {name: '恢復並繼續補抓'}).click();
  await expect(page.getByRole('heading', {name: '補同步中'})).toBeVisible();
  await page.getByRole('button', {name: '繼續補抓'}).click();
  await expect(page.getByRole('banner').getByText('背景同步中')).toBeVisible();
});

test('手機寬度沒有橫向溢出且 OpenChat 送出按鈕維持 disabled', async ({page}) => {
  await page.setViewportSize({width: 320, height: 760});
  await loginFish(page);
  await page.getByRole('button', {name: '待處理收件匣'}).click();
  await page.getByRole('region', {name: '收件匣'}).getByRole('button', {name: /台南二手家具交流/}).click();
  await expect(page.getByRole('button', {name: /OpenChat.*測試限制/ })).toBeDisabled();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(overflow).toBe(true);
});

test('家人可請求短效 Email reset 連結', async ({page}) => {
  await loginFish(page);
  await page.getByRole('button', {name: '登出'}).click();
  await page.getByRole('button', {name: '忘記密碼'}).click();
  await page.getByLabel('重設 Email').fill('family@example.test');
  await page.getByRole('button', {name: '寄出重設連結'}).click();
  await expect(page.getByRole('heading', {name: '登入家庭中台'})).toBeVisible();
  await expect(page.getByRole('status')).toContainText('15 分鐘一次性');
});

test('家人可用模擬 Email outbox token 完成密碼重設並重新登入', async ({page}) => {
  const fishEmail = await loginFish(page);
  await page.getByRole('button', {name: '登出'}).click();
  await page.getByLabel('Email').fill('family@example.test');
  await page.getByLabel('密碼').fill('family-demo-password');
  await page.getByRole('button', {name: '登入'}).click();
  await page.getByRole('button', {name: '登出'}).click();
  await page.getByRole('button', {name: '忘記密碼'}).click();
  await page.getByLabel('重設 Email').fill('family@example.test');
  await page.getByRole('button', {name: '寄出重設連結'}).click();
  await expect(page.getByRole('status')).toContainText('15 分鐘一次性');

  await page.getByLabel('Email').fill(fishEmail);
  await page.getByLabel('密碼').fill('fish-demo-password');
  await page.getByRole('button', {name: '登入'}).click();
  const outbox = await page.evaluate(async () => {
    const response = await fetch('/api/line-auth/password-reset/outbox');
    return await response.json() as {items: Array<{account_email: string; used: boolean; simulated_token?: string}>};
  });
  const token = outbox.items.find((item: {account_email: string; used: boolean}) => item.account_email === 'family@example.test' && !item.used)?.simulated_token;
  expect(token).toEqual(expect.any(String));
  if (!token) throw new Error('測試 outbox 沒有可用的家人重設 token');

  await page.getByRole('button', {name: '登出'}).click();
  await page.getByRole('button', {name: '使用重設連結'}).click();
  await page.getByLabel('重設連結 token').fill(token);
  await page.getByLabel('新密碼').fill('family-ui-new-password');
  await page.getByRole('button', {name: '完成密碼重設'}).click();
  await expect(page.getByRole('heading', {name: '登入家庭中台'})).toBeVisible();
  await expect(page.getByRole('status')).toContainText('密碼已重設');
  await page.getByLabel('Email').fill('family@example.test');
  await page.getByLabel('密碼').fill('family-ui-new-password');
  await page.getByRole('button', {name: '登入'}).click();
  await expect(page.getByRole('banner').getByText('家人檢視')).toBeVisible();
});

test('分會管理員可登入協作檢視但沒有 Fish 設定入口', async ({page}) => {
  await loginFish(page);
  await page.getByRole('button', {name: '登出'}).click();
  await page.getByLabel('Email').fill('branch-admin@example.test');
  await page.getByLabel('密碼').fill('branch-admin-demo-password');
  await page.getByRole('button', {name: '登入'}).click();
  await expect(page.getByRole('banner').getByText('分會管理員檢視')).toBeVisible();
  await expect(page.getByRole('button', {name: '連接與備份', exact: true})).toHaveCount(0);
  await page.getByRole('button', {name: '已核准待辦'}).click();
  await expect(page.getByText('待辦協作')).toBeVisible();
  await page.getByRole('button', {name: /完成/}).first().click();
  await expect(page.getByText('待辦狀態已更新。')).toBeVisible();
});

test('所有指定桌面與手機寬度沒有橫向溢出', async ({page}) => {
  for (const width of [320, 360, 390, 414, 600, 768, 820, 1024, 1180, 1440]) {
    await page.context().clearCookies();
    await page.setViewportSize({width, height: 900});
    await loginFish(page);
    await expect(page.getByRole('heading', {name: '今天先處理真正重要的事'})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `width ${width} overflow`).toBe(true);
  }
});

test('Fish 可以查看、修改與清除自己的分類偏好', async ({page}) => {
  await loginFish(page);
  await page.getByRole('button', {name: '連接與備份', exact: true}).click();
  await page.getByRole('button', {name: '查看權限邊界', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('權限邊界');
  await expect(page.getByRole('heading', {name: '分類偏好'})).toBeVisible();
  await page.getByLabel('偏好來源').selectOption('private');
  await page.getByLabel('偏好象限').selectOption('urgent_not_important');
  await page.getByRole('button', {name: '儲存分類偏好'}).click();
  await expect(page.getByRole('status')).toContainText('分類偏好已儲存');
  await expect(page.getByText('一對一 → 緊急但不重要')).toBeVisible();
  await page.getByRole('button', {name: '清除目前偏好'}).click();
  await expect(page.getByRole('status')).toContainText('分類偏好已清除');
  await expect(page.getByText('目前沒有分類偏好')).toBeVisible();
});
