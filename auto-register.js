const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const gen = require('../data-generator'); // Dùng data-generator từ thư mục cha

// ============== CẤU HÌNH ==============
const CONFIG = {
    URL: 'https://parkuniversity.my.site.com/ApplicationPortal/apex/ERx_Forms__PageMaker?pageId=Registration',
    PASSWORD: 'Kaih.kaih.999',
    MAIL_FILE: path.join(__dirname, 'email.txt'),
    RESULT_FILE: path.join(__dirname, 'ketqua.txt'),
    LINK_FILE: path.join(__dirname, 'link.txt'),
};

// Đảm bảo file tồn tại
if (!fs.existsSync(CONFIG.MAIL_FILE)) {
    // Nếu không có ở thư mục hiện tại, thử tìm ở thư mục cha, nếu có thì copy
    const parentMail = path.join(__dirname, '../mail.txt');
    if (fs.existsSync(parentMail)) {
        fs.copyFileSync(parentMail, CONFIG.MAIL_FILE);
    } else {
        fs.writeFileSync(CONFIG.MAIL_FILE, '', 'utf8');
    }
}
if (!fs.existsSync(CONFIG.RESULT_FILE)) {
    fs.writeFileSync(CONFIG.RESULT_FILE, '', 'utf8');
}

// ============== CẤU HÌNH CỐC CỐC ==============
const COCCOC_DEBUG_PORT = 9222;

// ============== HÀM TIỆN ÍCH ==============

function readEmails() {
    const content = fs.readFileSync(CONFIG.MAIL_FILE, 'utf-8');
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const emails = [];
    for (const line of lines) {
        if (line.startsWith('✅')) continue;
        emails.push(line);
    }
    return { emails, allLines: content.split('\n') };
}

function markEmailUsed(email) {
    const content = fs.readFileSync(CONFIG.MAIL_FILE, 'utf-8');
    const lines = content.split('\n');
    const newLines = lines.map(line => {
        if (line.trim() === email) return `✅ ${email}`;
        return line;
    });
    fs.writeFileSync(CONFIG.MAIL_FILE, newLines.join('\n'), 'utf-8');
}

function writeResult(fullName, birthDate, email, password) {
    const line = `${fullName}|${birthDate}|${email}|${password}\n`;
    fs.appendFileSync(CONFIG.RESULT_FILE, line, 'utf-8');
}

function askUser(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(question, answer => { rl.close(); resolve(answer); });
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Log URL sau mỗi bước vào link.txt
async function logPageURL(page, stepName) {
    try {
        const url = page.url();
        const timestamp = new Date().toLocaleTimeString('vi-VN');
        const logLine = `[${timestamp}] ${stepName}: ${url}\n`;
        fs.appendFileSync(CONFIG.LINK_FILE, logLine, 'utf8');
        console.log(`   🔗 URL: ${url}`);
    } catch (e) { }
}

// ============== HELPER ==============

async function waitAndFill(page, selector, value, label, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await page.waitForSelector(selector, { state: 'visible', timeout: 30000 });
            await sleep(500);
            await page.fill(selector, value);
            console.log(`   ✅ ${label}: ${value}`);
            await sleep(500);
            return;
        } catch (e) {
            console.log(`   ⚠️ Không tìm thấy field ${label} (lần ${i + 1}/${maxRetries}). Đợi thêm...`);
            await sleep(3000);
        }
    }
    console.log(`   ❌ Thất bại điền field: ${label}`);
}

async function waitAndSelect(page, selector, value, label, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await page.waitForSelector(selector, { state: 'visible', timeout: 20000 });
            await sleep(1000);

            // AngularJS dùng prefix "string:" cho value, thử nhiều cách
            let success = false;

            // Cách 1: selectOption bằng value gốc
            try {
                await page.selectOption(selector, value, { force: true });
                const v1 = await page.$eval(selector, el => el.value);
                if (v1 === value || v1 === `string:${value}`) {
                    success = true;
                }
            } catch (_) { }

            // Cách 2: selectOption bằng label (text hiển thị)
            if (!success) {
                try {
                    await page.selectOption(selector, { label: value }, { force: true });
                    const v2 = await page.$eval(selector, el => el.value);
                    if (v2 && v2 !== '' && v2 !== 'string:') {
                        success = true;
                    }
                } catch (_) { }
            }

            // Cách 3: selectOption bằng value có prefix string:
            if (!success) {
                try {
                    await page.selectOption(selector, `string:${value}`, { force: true });
                    const v3 = await page.$eval(selector, el => el.value);
                    if (v3 === `string:${value}`) {
                        success = true;
                    }
                } catch (_) { }
            }

            // Cách 4: Evaluate trực tiếp trên DOM + trigger AngularJS
            if (!success) {
                await page.evaluate((sel, val) => {
                    const els = document.querySelectorAll(sel);
                    for (const el of els) {
                        if (el.offsetWidth > 0 && el.offsetHeight > 0) {
                            // Tìm option có value hoặc label khớp
                            const stringVal = `string:${val}`;
                            let found = false;
                            for (const opt of el.options) {
                                if (opt.value === val || opt.value === stringVal || opt.textContent.trim() === val) {
                                    el.value = opt.value;
                                    found = true;
                                    break;
                                }
                            }

                            if (found) {
                                // Trigger AngularJS change detection
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                                el.dispatchEvent(new Event('input', { bubbles: true }));

                                // Trigger AngularJS scope
                                const scope = window.angular && angular.element(el).scope();
                                if (scope) {
                                    const ngModel = el.getAttribute('ng-model');
                                    if (ngModel) {
                                        const parts = ngModel.split('.');
                                        let obj = scope;
                                        for (let i = 0; i < parts.length - 1; i++) {
                                            obj = obj[parts[i]];
                                        }
                                        obj[parts[parts.length - 1]] = el.value;
                                        scope.$apply();
                                    }
                                }
                                return; // Done inside browser
                            }
                        }
                    }
                }, selector, value);

                await sleep(500);
                const v4 = await page.$eval(selector, el => el.value);
                if (v4 && v4 !== '' && v4 !== 'string:') {
                    success = true;
                }
            }

            if (success) {
                // Trigger thêm sự kiện để AngularJS cập nhật dependent fields
                await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    if (el) {
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.dispatchEvent(new Event('blur', { bubbles: true }));
                    }
                }, selector);
                await sleep(500);

                console.log(`   ✅ ${label}`);
                return;
            } else {
                throw new Error("Không thể set value cho dropdown");
            }
        } catch (e) {
            console.log(`   ⚠️ Lỗi chọn dropdown ${label} (lần thử ${i + 1}/${maxRetries}). Đợi thêm...`);
            await sleep(3000);
        }
    }
    console.log(`   ❌ Thất bại chọn dropdown: ${label}`);
}

// Chờ dropdown có options (AngularJS dependent fields cần thời gian load)
async function waitForDropdownOptions(page, selector, label, maxWaitMs = 30000, pollIntervalMs = 400) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
        try {
            // Evaluates in browser to find exactly the visible select and check options count
            const result = await page.evaluate((sel) => {
                const els = document.querySelectorAll(sel);
                for (const el of els) {
                    if (el.offsetWidth > 0 && el.offsetHeight > 0) {
                        return el.options ? el.options.length : 0;
                    }
                }
                return 0; // if no visible found yet, or no options
            }, selector);

            if (result > 1) {
                console.log(`   ✅ ${label}: ${result} options đã sẵn sàng`);
                return true;
            }
        } catch (_) { }
        await sleep(pollIntervalMs);
    }
    console.log(`   ⚠️ ${label}: chờ options timeout`);
    return false;
}
async function waitAndClick(page, selector, label, timeout = 30000) {
    try {
        await page.waitForSelector(selector, { state: 'visible', timeout });
        await sleep(500);
        await page.click(selector);
        console.log(`   ✅ ${label}`);
        await sleep(1500);
    } catch (e) {
        console.log(`   ⚠️ Không tìm thấy nút ${label}`);
    }
}

// ============== CHỜ NOPENCHA GIẢI CAPTCHA ==============

async function waitForCaptchaSolved(page, maxWaitMs = 120000) {
    console.log('   🤖 Đang chờ NopeCHA giải CAPTCHA tự động...');
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        try {
            const frames = page.frames();
            for (const frame of frames) {
                try {
                    const checked = await frame.$('.recaptcha-checkbox[aria-checked="true"]');
                    if (checked) {
                        console.log('   ✅ CAPTCHA đã được giải thành công!');
                        await sleep(1500);
                        return true;
                    }
                } catch (_) { }
            }
            const response = await page.$eval('#g-recaptcha-response', el => el.value).catch(() => '');
            if (response && response.length > 0) {
                console.log('   ✅ CAPTCHA đã được giải (response detected)!');
                await sleep(1500);
                return true;
            }
        } catch (_) { }

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        if (elapsed % 10 === 0 && elapsed > 0) {
            console.log(`   ⏳ Đã chờ ${elapsed}s...`);
        }
        await sleep(2000);
    }

    console.log('   ⚠️ Hết thời gian chờ CAPTCHA.');
    return false;
}

// ============== CÁC BƯỚC TỰ ĐỘNG ==============

async function step1_Registration(page, email, fullNameObj, phone) {
    console.log('\n📝 BƯỚC 1: Registration...');
    console.log('   🌐 Truy cập trang đăng ký...');
    await page.goto(CONFIG.URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('   ⏳ Chờ form load...');
    await page.waitForSelector('input[name^="FirstName"]', { state: 'visible', timeout: 30000 });
    await sleep(2000);

    // Scroll đến CAPTCHA và tự click vào ô checkbox
    console.log('\n   🔒 Đang xử lý CAPTCHA...');
    await page.evaluate(() => {
        const recaptcha = document.querySelector('.g-recaptcha, [data-sitekey], iframe[src*="recaptcha"]');
        if (recaptcha) recaptcha.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await sleep(2000);

    // Tự click vào ô reCAPTCHA checkbox trong iframe
    try {
        const recaptchaFrame = page.frames().find(f => f.url().includes('recaptcha/api2/anchor'));
        if (recaptchaFrame) {
            console.log('   🖱️ Tìm thấy iframe reCAPTCHA, đang click vào ô checkbox...');
            await recaptchaFrame.waitForSelector('.recaptcha-checkbox-border', { state: 'visible', timeout: 10000 });
            await recaptchaFrame.click('.recaptcha-checkbox-border');
            console.log('   ✅ Đã click vào ô CAPTCHA');
            await sleep(3000);
        } else {
            // Fallback: thử click qua selector trên page chính
            console.log('   🖱️ Thử click CAPTCHA qua page chính...');
            try {
                const iframeEl = await page.$('iframe[src*="recaptcha/api2/anchor"]');
                if (iframeEl) {
                    const frame = await iframeEl.contentFrame();
                    if (frame) {
                        await frame.waitForSelector('.recaptcha-checkbox-border', { state: 'visible', timeout: 10000 });
                        await frame.click('.recaptcha-checkbox-border');
                        console.log('   ✅ Đã click vào ô CAPTCHA (fallback)');
                        await sleep(3000);
                    }
                }
            } catch (e2) {
                console.log('   ⚠️ Không click được CAPTCHA tự động');
            }
        }
    } catch (e) {
        console.log('   ⚠️ Lỗi khi click CAPTCHA:', e.message);
    }

    // Đợi NopeCHA giải CAPTCHA (tối đa 120s)
    console.log('   🤖 Chờ NopeCHA giải CAPTCHA tự động (tối đa 2 phút)...');
    const captchaSolved = await waitForCaptchaSolved(page, 120000);
    if (!captchaSolved) {
        console.log('   ⏸️ NopeCHA chưa giải được. Vui lòng giải thủ công!');
        await askUser('   Nhấn ENTER sau khi đã giải CAPTCHA... ');
    } else {
        console.log('   ✅ Đã xử lý xong CAPTCHA.');
    }

    // Điền thông tin
    await waitAndFill(page, 'input[name^="FirstName"]', fullNameObj.firstName, 'First Name');
    await waitAndFill(page, 'input[name^="LastName"]', fullNameObj.lastName, 'Last Name');
    await waitAndFill(page, 'input[name^="Email"]', email, 'Email');
    await waitAndFill(page, 'input[name^="MobilePhone"]', phone, 'Phone');
    await waitAndFill(page, 'input[type="password"][placeholder*="Create"]', CONFIG.PASSWORD, 'Password');
    await waitAndFill(page, 'input[type="password"][placeholder*="Confirm"]', CONFIG.PASSWORD, 'Confirm Password');
    await waitAndSelect(page, 'select[name="Location__c600daa4237"]', 'Online', 'Location: Online');

    // Tích ô None of the above
    try {
        await page.evaluate(() => {
            // Tìm tất cả các ô checkbox của câu hỏi Describe you
            const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"][aria-label*="Which of the following describes you"]'));
            // Tìm ô chứa chữ "Value None"
            const targetInput = checkboxes.find(el => el.getAttribute('aria-label').includes('Value None'));
            if (targetInput) {
                targetInput.click();
            } else {
                // Fallback: tìm qua thẻ span có text "None of the above" rồi click thẻ input liên quan
                const spans = Array.from(document.querySelectorAll('span'));
                const targetSpan = spans.find(s => s.textContent.includes('None of the above'));
                if (targetSpan && targetSpan.previousElementSibling) {
                    targetSpan.previousElementSibling.click();
                } else if (targetSpan) {
                    targetSpan.click();
                }
            }
        });
        console.log('   ✅ Đã tích: None of the above');
    } catch (e) {
        console.log('   ⚠️ Không tích được "None of the above"');
    }

    // Submit
    console.log('   ⏳ Chờ 5 giây trước khi ấn Submit...');
    await sleep(5000);
    await waitAndClick(page, 'button:has-text("Submit")', 'Nút Submit');
    console.log('   ⏳ Chờ load màn hình tiếp theo...');
    await sleep(5000);
}

async function step2_StartApplication(page) {
    console.log('\n📝 BƯỚC 2: Start Application...');
    // Chờ tối đa 60s cho trang load sau submit
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            console.log(`   ⏳ Chờ nút Start your Application xuất hiện (lần ${attempt}/3)...`);
            await page.waitForSelector('a.button[href*="My_Profile"], a:has-text("Start your Application")', { state: 'visible', timeout: 30000 });
            console.log('   ✅ Đã tải trang Start Application');
            await sleep(2000);
            await page.click('a.button[href*="My_Profile"], a:has-text("Start your Application")');
            console.log('   ✅ Đã click Start your Application');

            // Chờ load form bước 3
            console.log('   ⏳ Chờ load màn hình tiếp theo...');
            await sleep(8000);
            return;
        } catch (e) {
            console.log(`   ⚠️ Chưa thấy nút (lần ${attempt}/3). Đợi thêm...`);
            await sleep(5000);
        }
    }
    console.log('   ❌ Không thấy nút Start your Application sau 3 lần thử');
}

async function step3_ProgramInfo(page) {
    console.log('\n📝 BƯỚC 3: Program & Term Info...');
    try {
        await page.waitForSelector('select[name^="MilitaryService__c"], input[name^="MilitaryService__c"]', { state: 'visible', timeout: 60000 });
        console.log('   ✅ Đã tải form BƯỚC 3');
        await sleep(500);

        await waitAndSelect(page, 'select[name^="MilitaryService__c"]', 'No', 'Military: No');
        await waitAndSelect(page, 'select[name^="CitizenshipStatus__c"]', 'US Citizen', 'Citizenship: US Citizen');

        // Dependent: StudentType phụ thuộc Citizenship
        await waitForDropdownOptions(page, 'select[name^="StudentType__c"]', 'Student Type', 20000, 300);
        await waitAndSelect(page, 'select[name^="StudentType__c"]', '0011N00001GsdxRQAR', 'Student Type: Undergraduate');

        // Dependent: Location phụ thuộc StudentType (dùng name^= vì suffix thay đổi theo phiên)
        await waitForDropdownOptions(page, 'select[name^="Location__c"]', 'Location', 20000, 300);
        await waitAndSelect(page, 'select[name^="Location__c"]', '0011N00001djSu9QAE', 'Location: Online & Campus Centers');

        await waitAndSelect(page, 'select[name^="CampusCenterLocationPL__c"]', 'Online', 'Campus: Online');

        // Dependent: ProgramType phụ thuộc Location
        await waitForDropdownOptions(page, 'select[name^="ProgramType__c"]', 'Program Type', 20000, 300);
        await waitAndSelect(page, 'select[name^="ProgramType__c"]', '0011N00001GsdzmQAB', 'Program Type: Certificate');

        // Dependent: CampusProgram phụ thuộc ProgramType
        await waitForDropdownOptions(page, 'select[name^="CampusProgram__c"]', 'Program', 20000, 300);
        await waitAndSelect(page, 'select[name^="CampusProgram__c"]', 'a1i6O000004BKmhQAG', 'Program: Certificate in Cybersecurity');

        await waitForDropdownOptions(page, 'select[name^="Term__c"]', 'Term', 20000, 300);
        await waitAndSelect(page, 'select[name^="Term__c"]', 'a0CUl00000dCdPUMA0', 'Term: Fall 2026');

        await waitAndClick(page, 'button:has-text("Save & Continue")', 'Save & Continue');
        console.log('   ⏳ Chờ load màn hình tiếp theo...');
        await sleep(5000);
    } catch (e) {
        console.log('   ⚠️ Không thấy form Step 3 hoặc lỗi timeouts');
    }
}

async function step4_PersonalInfo(page, addressInfo, ssn, birthDate) {
    console.log('\n📝 BƯỚC 4: Personal Info & Address...');
    try {
        await page.waitForSelector('select[name^="OtherCountry__c"], input[name^="OtherCountry__c"]', { state: 'visible', timeout: 60000 });
        console.log('   ✅ Đã tải form BƯỚC 4');
        await sleep(2000);

        await waitAndSelect(page, 'select[name^="OtherCountry__c"]', 'United States', 'Country: US');
        await waitAndFill(page, 'input[name^="OtherAddressLine1__c"]', addressInfo.street, 'Address');
        await waitAndFill(page, 'input[name^="OtherCity__c"]', addressInfo.city, 'City');
        await waitAndSelect(page, 'select[name^="OtherStatePL__c"]', addressInfo.state, `State: ${addressInfo.state}`);

        // Zip Code
        try {
            await waitAndFill(page, 'input[name^="OtherZipCode__c"]', addressInfo.zip || '90210', 'Zip Code');
        } catch(e) { }

        await waitAndSelect(page, 'select[name^="IsthisAddressyourMailingAddress__c"]', 'Yes', 'Is Mailing: Yes');

        // SSN - dùng placeholder="XXX-XX-XXXX" vì id/name suffix thay đổi mỗi lần render
        try {
            await page.waitForSelector('input[placeholder="XXX-XX-XXXX"]', { state: 'visible', timeout: 20000 });
            await sleep(500);
            await page.fill('input[placeholder="XXX-XX-XXXX"]', ssn);
            console.log(`   ✅ SSN: ${ssn}`);
        } catch (e) {
            // Fallback: dùng aria-label
            try {
                await page.fill('input[aria-label*="Social Security Number"]', ssn);
                console.log(`   ✅ SSN (fallback): ${ssn}`);
            } catch (e2) {
                console.log('   ⚠️ Không điền được SSN - FIELD BẮT BUỘC!');
            }
        }
        await sleep(500);

        // Birth Date - dùng placeholder
        try {
            await page.waitForSelector('input[placeholder="MM/DD/YYYY"]', { state: 'visible', timeout: 10000 });
            await page.fill('input[placeholder="MM/DD/YYYY"]', birthDate);
            console.log(`   ✅ Birth Date: ${birthDate}`);
        } catch (e) {
            await waitAndFill(page, 'input[name^="Birthdate"]', birthDate, 'Birth Date');
        }
        // Đóng date picker bằng Escape
        await page.keyboard.press('Escape');
        await sleep(500);

        await waitAndSelect(page, 'select[name^="hed__Country_of_Origin__c"]', 'United States of America', 'Country of Origin: US');

        // Checkbox White (Ethnicity) - dùng aria-label chính xác từ quy trình
        try {
            await page.evaluate(() => {
                const checkboxes = document.querySelectorAll('input[type="checkbox"]');
                for (const cb of checkboxes) {
                    const label = cb.getAttribute('aria-label') || '';
                    if (label.includes('Value WH') || label.includes('White')) {
                        cb.click();
                        return true;
                    }
                }
                return false;
            });
            console.log('   ✅ Đã tích chọn White');
        } catch (e) {
            console.log('   ⚠️ Không tích được White');
        }

        await waitAndSelect(page, 'select[name^="HispanicorLatino__c"]', 'Y', 'Hispanic: Latino');
        await waitAndSelect(page, 'select[name^="hed__Gender__c"]', 'F', 'Gender: Female/Woman');

        await waitAndClick(page, 'button:has-text("Save & Continue")', 'Save & Continue');
        console.log('   ⏳ Chờ load màn hình tiếp theo...');
        await sleep(5000);
    } catch (e) {
        console.log('   ⚠️ Không thấy form Step 4 hoặc lỗi timeouts');
    }
}

async function step5_Education(page) {
    console.log('\n📝 BƯỚC 5: Education History...');
    try {
        // Chờ form Education thực sự load: ưu tiên field đặc trưng của bước 5 (tránh nhầm với nút chung)
        const formSelectors = [
            'select[name^="Didyougraduate__c"]',
            'input.elcn-query-input',
            '.slds-pill__label',
            '.slds-pill.requiredBar'
        ];
        let formReady = false;
        for (const sel of formSelectors) {
            try {
                await page.waitForSelector(sel, { state: 'visible', timeout: 25000 });
                formReady = true;
                break;
            } catch (_) {
                continue;
            }
        }
        if (!formReady) {
            console.log('   ⚠️ Không thấy form Step 5 hoặc lỗi timeouts');
            return;
        }
        await sleep(2000);
        console.log('   ✅ Đã tải form BƯỚC 5');

        const isInput = await page.$('input.elcn-query-input');
        if (isInput) {
            // Có khung search
            for (let attempt = 1; attempt <= 3; attempt++) {
                await page.fill('input.elcn-query-input', 'Horace Mann School');
                await sleep(2000);
                const res = await page.$('.list-group-item');
                if (res) {
                    await res.click();
                    console.log('   ✅ Đã chọn trường');
                    break;
                }
            }
        } else {
            console.log('   ✅ Đã có sẵn trường');
        }

        await sleep(1000);
        await waitAndSelect(page, 'select[name^="Didyougraduate__c"]', 'No', 'Graduated: No');
        await waitAndSelect(page, 'select[name^="Areyoucurrentlyenrolled__c"]', 'No', 'Currently Enrolled: No');
        await waitAndFill(page, 'input[name^="EnrollmentrxRx__GPA__c"]', '4', 'GPA');
        await waitAndSelect(page, 'select[name^="CompleteGEDHiSetTASCorEquivalent__c"]', 'No', 'GED: No');
        await waitAndSelect(page, 'select[name^="DualCreditEnrollmentCompletion__c"]', 'No', 'Dual Credit: No');

        try {
            await waitAndSelect(page, 'select[name^="PreviousCollegeUniversityExperience__c"]', 'No', 'Prev College: No');
        } catch (e) { }

        await waitAndClick(page, 'button:has-text("Save & Continue")', 'Save & Continue');
        console.log('   ⏳ Chờ load màn hình tiếp theo...');
        await sleep(5000); // 1st
    } catch (e) {
        console.log('   ⚠️ Không thấy form Step 5 hoặc lỗi timeouts');
    }
}

async function step6_FundingAndWork(page) {
    console.log('\n📝 BƯỚC 6: Funding & Work Info...');

    try {
        // Chờ form Funding xuất hiện (timeout ngắn để không block 60s khi đang ở trang Education)
        const fundingFormSelector = 'select[name^="DependentofaFederalEmployee__c"], input[aria-label*="Private Loan"], input[aria-label*="fund your education"]';
        let hasForm = false;
        try {
            await page.waitForSelector(fundingFormSelector, { state: 'visible', timeout: 25000 });
            hasForm = true;
        } catch (_) {
            const any = await page.$('select[name^="DependentofaFederalEmployee__c"], input[aria-label*="Private Loan"]');
            if (any) hasForm = true;
        }
        if (!hasForm) {
            console.log('   ⏩ Bỏ qua BƯỚC 6 (không có field tương ứng – có thể đang ở trang Education)');
            return;
        }
        await sleep(2000);
        console.log('   ✅ Đã tải form BƯỚC 6');

        // Tích Private Loan(s)
        try {
            const privateLoan = await page.$('input[aria-label*="Private Loan"], input[aria-label*="fund your education"]');
            if (privateLoan) {
                await privateLoan.click();
                console.log('   ✅ Đã tích: Private Loan(s)');
            } else {
                await page.evaluate(() => {
                    const spans = Array.from(document.querySelectorAll('span'));
                    const target = spans.find(s => s.textContent.trim() === 'Private Loan(s)');
                    if (target && target.previousElementSibling) {
                        target.previousElementSibling.click();
                    }
                });
                console.log('   ✅ Đã tích: Private Loan(s) (fallback)');
            }
        } catch (e) {
            console.log('   ⚠️ Không tích được Private Loan(s)');
        }

        // Federal Employee: dùng name^= hoặc aria-label phòng name động
        const federalSel = 'select[name^="DependentofaFederalEmployee__c"]';
        const federalAria = 'select[aria-label*="federal employee"], select[aria-label*="dependent of a federal"]';
        try {
            await waitAndSelect(page, federalSel, 'No', 'Federal Employee: No');
        } catch (e1) {
            try {
                await waitAndSelect(page, federalAria, 'No', 'Federal Employee: No (aria)');
            } catch (e2) {
                console.log('   ⚠️ Không chọn được Federal Employee');
            }
        }
        await waitAndSelect(page, 'select[name^="SponsorsMilitaryService__c"]', 'No', 'Sponsor Military: No');
        await waitAndSelect(page, 'select[name^="CurrentlyEmployed__c"]', 'No', 'Currently Employed: No');

        await waitAndClick(page, 'button:has-text("Save & Continue")', 'Save & Continue');
        await sleep(5000);
    } catch (e) {
        console.log('   ⚠️ Không thấy form Step 6 hoặc lỗi:', e.message);
    }
}

async function step7_FamilyInfo(page) {
    console.log('\n📝 BƯỚC 7: Family Info...');

    try {
        await page.waitForSelector('button:has-text("Save & Continue"), button:has-text("Submit Your Application")', { state: 'visible', timeout: 60000 });
        await sleep(2000);
        const hasForm = await page.$('select[name^="Dideitherparentattendcollege__c"]');
        if (!hasForm) {
            console.log('   ⏩ Bỏ qua BƯỚC 7 (không có field tương ứng)');
            return;
        }
        console.log('   ✅ Đã tải form BƯỚC 7');

        await waitAndSelect(page, 'select[name^="Dideitherparentattendcollege__c"]', 'No', 'Parent Attend College: No');
        await waitAndSelect(page, 'select[name^="FamilywParkDegree__c"]', 'No', 'Family Park Degree: No');
        await waitAndSelect(page, 'select[name^="Convictedofafelony__c"]', 'No', 'Convicted Felony: No');

        await waitAndClick(page, 'button:has-text("Save & Continue")', 'Save & Continue');
        await sleep(5000);
    } catch (e) {
        console.log('   ⚠️ Không thấy form Step 7 hoặc lỗi:', e.message);
    }
}

async function step8_TermsAndSubmit(page) {
    console.log('\n📝 BƯỚC 8: Terms & Submit...');

    try {
        await page.waitForSelector('button:has-text("Save & Continue"), button:has-text("Submit Your Application")', { state: 'visible', timeout: 60000 });
        await sleep(2000);
        // Tích Terms & Conditions
        const hasForm = await page.$('input[name^="TermsandConditionsAgreement__c"]');
        if (!hasForm) {
            console.log('   ⏩ Bỏ qua Terms (không có checkbox)');
        } else {
            try {
                await page.click('input[name^="TermsandConditionsAgreement__c"]');
                console.log('   ✅ Đã tích Terms & Conditions');
            } catch (e) {
                console.log('   ⚠️ Không tích được Terms & Conditions');
            }
            await waitAndClick(page, 'button:has-text("Save & Continue")', 'Save & Continue');
            await sleep(5000);
        }

        // Submit Your Application (nút cuối cùng)
        try {
            await waitAndClick(page, 'button:has-text("Submit Your Application")', 'Submit Your Application', 30000);
            await sleep(5000);
            console.log('   ✅ Đã submit application!');
        } catch (e) {
            // Fallback nếu nút có text khác
            try {
                await waitAndClick(page, 'button:has-text("Save & Continue")', 'Final Save & Continue');
                await sleep(5000);
            } catch (e2) {
                console.log('   ⚠️ Không tìm thấy nút submit cuối cùng');
            }
        }

    } catch (e) {
        console.log('   ⚠️ Không thấy form Step 8 hoặc lỗi:', e.message);
    }
}

// ============== XÓA DỮ LIỆU TRÌNH DUYỆT ==============

async function clearBrowserData(browser) {
    console.log('🧹 Xóa dữ liệu trình duyệt...');
    try {
        const context = browser.contexts()[0];
        const pages = context.pages();

        // Đóng tất cả tab thừa
        for (let i = pages.length - 1; i > 0; i--) {
            try { await pages[i].close(); await sleep(300); } catch (_) { }
        }

        const activePage = context.pages()[0];
        if (!activePage) return;

        console.log('   🌐 Truy cập trang xóa dữ liệu...');
        await activePage.goto('coccoc://settings/clearBrowserData', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(3000);

        try {
            const deleteBtn = activePage.locator('#deleteButton');
            await deleteBtn.waitFor({ state: 'visible', timeout: 10000 });
            await deleteBtn.click();
            await sleep(5000);
            console.log('   ✅ Xóa dữ liệu hoàn tất!');
        } catch (btnErr) {
            console.log('   🔄 Thử fallback bằng keyboard...');
            // Tab 6 times then Enter
            for (let i = 0; i < 6; i++) {
                await activePage.keyboard.press('Tab');
                await sleep(200);
            }
            await activePage.keyboard.press('Enter');
            await sleep(5000);
        }
    } catch (e) {
        console.log('   ⚠️ Lỗi xóa dữ liệu:', e.message);
    }
}

// ============== CHƯƠNG TRÌNH CHÍNH ==============

async function processOneEmail(browser, email, index, total) {
    console.log('\n' + '='.repeat(60));
    console.log(`🔄 Xử lý email ${index + 1}/${total}: ${email}`);
    console.log('='.repeat(60));

    const context = browser.contexts()[0];
    const page = await context.newPage();

    const fullNameObj = gen.generateFullName();
    const phone = gen.generatePhoneUS();
    const birthDate = gen.generateBirthDate();
    const addressInfo = { street: gen.generateStreetAddress(), city: gen.generateCity(), state: gen.generateState(), zip: gen.generateZipCode(), county: 'Los Angeles' };
    const ssn = gen.generateSSN();

    try {
        // Ghi header vào link.txt cho email này
        fs.appendFileSync(CONFIG.LINK_FILE, `\n=== ${email} (${new Date().toLocaleString('vi-VN')}) ===\n`, 'utf8');

        await step1_Registration(page, email, fullNameObj, phone);
        await logPageURL(page, 'Sau Bước 1 - Registration');

        await step2_StartApplication(page);
        await logPageURL(page, 'Sau Bước 2 - Start Application');

        await step3_ProgramInfo(page);
        await logPageURL(page, 'Sau Bước 3 - Program Info');

        await step4_PersonalInfo(page, addressInfo, ssn, birthDate);
        await logPageURL(page, 'Sau Bước 4 - Personal Info');

        await step5_Education(page);
        await logPageURL(page, 'Sau Bước 5 - Education');

        await step6_FundingAndWork(page);
        await logPageURL(page, 'Sau Bước 6 - Funding & Work');

        await step7_FamilyInfo(page);
        await logPageURL(page, 'Sau Bước 7 - Family Info');

        await step8_TermsAndSubmit(page);
        await logPageURL(page, 'Sau Bước 8 - Submit');

        markEmailUsed(email);
        const fullName = `${fullNameObj.firstName} ${fullNameObj.lastName}`;
        writeResult(fullName, birthDate, email, CONFIG.PASSWORD);

        console.log(`\n✅ Hoàn tất đăng ký cho: ${email}`);
        console.log('📝 Đã ghi vào ketqua.txt & mail.txt');
    } catch (error) {
        console.error(`\n❌ Lỗi khi xử lý ${email}:`, error.message);
    } finally {
        await page.close();
    }
}

async function main() {
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║   Park University Auto Registration Tool  ║');
    console.log('║   Sử dụng Cốc Cốc + NopeCHA               ║');
    console.log('╚═══════════════════════════════════════════╝');

    let browser;
    try {
        browser = await chromium.connectOverCDP(`http://localhost:${COCCOC_DEBUG_PORT}`);
        console.log('   ✅ Kết nối Cốc Cốc thành công!');
    } catch (e) {
        console.log('   ❌ Không thể kết nối Cốc Cốc!');
        console.log('   👉 Hãy chạy start-coccoc.bat trước rồi thử lại.');
        return;
    }

    const { emails } = readEmails();
    if (emails.length === 0) {
        console.log('\n❌ Không có email nào chưa sử dụng trong email.txt!');
        return;
    }

    let running = true;
    while (running) {
        const { emails: freshEmails } = readEmails();

        console.log('\n┌─────────────────────────────────────┐');
        console.log('│          CHỌN CHẾ ĐỘ CHẠY          │');
        console.log('├─────────────────────────────────────┤');
        console.log(`│  📧 Email còn lại: ${String(freshEmails.length).padEnd(16)}│`);
        console.log('├─────────────────────────────────────┤');
        console.log('│  1. Chạy 1 lần (1 email)           │');
        console.log('│  2. Chạy nhiều lần (nhập số lượng) │');
        console.log('│  0. Thoát                          │');
        console.log('└─────────────────────────────────────┘');

        const choice = await askUser('\nChọn chế độ: ');

        switch (choice) {
            case '1': {
                if (freshEmails.length === 0) break;
                await processOneEmail(browser, freshEmails[0], 0, 1);
                await clearBrowserData(browser);
                break;
            }
            case '2': {
                if (freshEmails.length === 0) break;
                const countStr = await askUser(`Nhập số lần chạy: `);
                const count = parseInt(countStr);
                if (isNaN(count) || count <= 0) break;

                const runCount = Math.min(count, freshEmails.length);
                for (let i = 0; i < runCount; i++) {
                    const { emails: cur } = readEmails();
                    if (cur.length === 0) break;
                    await processOneEmail(browser, cur[0], i, runCount);
                    if (i < runCount - 1) {
                        await clearBrowserData(browser);
                        await sleep(3000);
                    }
                }
                await clearBrowserData(browser);
                break;
            }
            case '0': running = false; break;
        }
    }
}

main().catch(console.error);
