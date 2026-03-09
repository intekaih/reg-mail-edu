/**
 * Script debug: mở URL form bị lỗi (Bước 5 & 6), chờ load rồi kiểm tra các selector
 * và ghi kết quả ra debug-step5-6.txt.
 *
 * Cách chạy:
 * 1. Chạy start-coccoc.bat (Cốc Cốc đang bật với remote debugging).
 * 2. (Tùy chọn) Chạy auto-register.js và dừng khi đã tới trang Education (sau Bước 4).
 * 3. node debug-form-urls.js
 *    Hoặc: node debug-form-urls.js "https://parkuniversity.my.site.com/..."
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COCCOC_DEBUG_PORT = 9222;
const DEFAULT_URL = 'https://parkuniversity.my.site.com/ApplicationPortal/ERx_Forms__PageMaker?pageId=Domestic_Educational_History&type=000';
const OUT_FILE = path.join(__dirname, 'debug-step5-6.txt');

async function main() {
    const url = process.argv[2] || DEFAULT_URL;
    const lines = [];
    lines.push('=== Debug form Step 5 & 6 ===');
    lines.push('URL: ' + url);
    lines.push('Thoi gian: ' + new Date().toISOString());
    lines.push('');

    let browser;
    try {
        browser = await chromium.connectOverCDP('http://localhost:' + COCCOC_DEBUG_PORT);
    } catch (e) {
        console.error('Khong ket noi duoc Coc Coc. Chay start-coccoc.bat truoc.');
        process.exit(1);
    }

    const ctx = browser.contexts()[0] || await browser.newContext();
    const page = ctx.pages()[0] || await ctx.newPage();

    try {
        console.log('Dang mo URL...');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(8000);

        lines.push('--- Kiem tra selector BUOC 5 (Education) ---');
        const step5Selectors = [
            'select[name^="Didyougraduate__c"]',
            'input.elcn-query-input',
            '.slds-pill__label',
            '.slds-pill.requiredBar',
            'select[name^="Areyoucurrentlyenrolled__c"]',
            'input[name^="EnrollmentrxRx__GPA__c"]'
        ];
        for (const sel of step5Selectors) {
            const el = await page.$(sel);
            let visible = false;
            if (el) {
                try {
                    visible = await page.evaluate(function(e) { return e && e.offsetParent !== null && e.offsetWidth > 0; }, el);
                } catch (_) {}
            }
            lines.push('  ' + sel);
            lines.push('    ton tai: ' + !!el + ', visible: ' + visible);
        }

        lines.push('');
        lines.push('--- Kiem tra selector BUOC 6 (Funding) ---');
        const step6Selectors = [
            'select[name^="DependentofaFederalEmployee__c"]',
            'input[aria-label*="Private Loan"]',
            'input[aria-label*="fund your education"]',
            'select[name^="SponsorsMilitaryService__c"]',
            'select[name^="CurrentlyEmployed__c"]'
        ];
        for (const sel of step6Selectors) {
            const el = await page.$(sel);
            let visible = false;
            if (el) {
                try {
                    visible = await page.evaluate(function(e) { return e && e.offsetParent !== null && e.offsetWidth > 0; }, el);
                } catch (_) {}
            }
            lines.push('  ' + sel);
            lines.push('    ton tai: ' + !!el + ', visible: ' + visible);
        }

        lines.push('');
        lines.push('--- Nut tren trang ---');
        const saveBtn = await page.$('button:has-text("Save & Continue")');
        const submitBtn = await page.$('button:has-text("Submit Your Application")');
        lines.push('  button Save & Continue: ' + !!saveBtn);
        lines.push('  button Submit Your Application: ' + !!submitBtn);

        fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
        console.log('Da ghi ket qua ra:', OUT_FILE);
    } catch (e) {
        lines.push('Loi: ' + e.message);
        fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
        console.error(e);
    } finally {
        await browser.close();
    }
}

main();
