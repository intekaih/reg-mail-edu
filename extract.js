const fs = require('fs');
let text;
try {
    text = fs.readFileSync('quy trinh.txt', 'utf8');
    if (text.includes('\0')) text = fs.readFileSync('quy trinh.txt', 'utf16le');
} catch (e) {
    console.error(e);
}
const lines = text.split(/\r?\n/);
const result = [];
for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith('- ') || l.startsWith('-chọn') || l.startsWith('-tích') || l.startsWith('-nhập') || l.startsWith('-xóa') || l.startsWith('truy cập')) {
        result.push(l);
        if (i + 1 < lines.length) {
            const next = lines[i + 1].trim();
            if (next.startsWith('<')) {
                const nameMatch = next.match(/name="([^"]+)"/);
                if (nameMatch) {
                    result.push('  -> Selector: [name="' + nameMatch[1] + '"]');
                } else {
                    const classMatch = next.match(/class="([^"]+)"/);
                    if (classMatch) {
                        result.push('  -> Selector: class="' + classMatch[1] + '"');
                    }
                }
            }
        }
    }
}
fs.writeFileSync('selectors.txt', result.join('\n'));
