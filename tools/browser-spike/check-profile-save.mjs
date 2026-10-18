import {chromium,webkit,expect} from '@playwright/test'
import assert from 'node:assert/strict'
import {origin,headers,button,label,accountFixture,cleanupFixtures} from './account-qa.mjs'
for(const name of ['chromium','webkit']){
 const browser=await({chromium,webkit}[name]).launch({headless:true}),fixtures=[]
 try{
  const fixture=await accountFixture(browser,`${name} profile save`,fixtures),{page,context}=fixture
  await button(page,'Изменить анкету').click();await label(page,'Имя').fill('QA persisted profile');await label(page,'Псевдоним').fill('qa_username');await label(page,'Email').fill('invalid')
  await button(page,'Сохранить').click();await expect(page.getByRole('alert')).toContainText('Проверьте Email');await expect(page.getByRole('alert')).toBeInViewport()
  await label(page,'Email').fill('');await label(page,'Телефон').fill('QA phone');await label(page,'О себе').fill('QA saved description')
  let fail=true;await page.route('**/api/v1/identity/profile',route=>fail?(fail=false,route.fulfill({status:503,contentType:'application/json',body:'{}'})):route.continue())
  await button(page,'Сохранить').click();await expect(page.getByRole('alert')).toContainText('Изменения остались в форме');await expect(page.getByRole('alert')).toBeInViewport();await expect(label(page,'Имя')).toHaveValue('QA persisted profile')
  await button(page,'Сохранить').click();await expect(page).toHaveURL(`${origin}/profile`);await expect(page.getByRole('status')).toContainText('Анкета сохранена')
  await page.reload();await expect(page.locator('.account-card')).toContainText('QA persisted profile');await expect(page.locator('.account-fields')).toContainText('qa_username');await expect(page.locator('.account-fields')).toContainText('QA phone');await expect(page.locator('.account-fields')).toContainText('QA saved description')
  const me=await(await context.request.get(`${origin}/api/v1/identity/me`,{headers})).json();assert.equal(me.account.fields.name,'QA persisted profile');assert.equal(me.account.fields.username,'qa_username');assert.equal(me.account.fields.email,'')
  await context.clearCookies();await page.reload();await expect(page.locator('.account-card')).toContainText('QA persisted profile',{timeout:30000});assert.equal((await context.request.get(`${origin}/api/v1/identity/me`,{headers})).status(),200)
  console.log(`${name}: invalid Email explanation, visible failed-save feedback, preserved draft/retry, name/username persistence with empty Email and reload, automatic recovery after cookie loss passed`)
 }finally{await cleanupFixtures(fixtures);await browser.close()}
}
