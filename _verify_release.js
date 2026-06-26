const fs = require('fs');
const f = 'C:/Users/Shadow/ShadowDrive/0.1.Ai/DysonCode/release/win-unpacked/resources/app/dist/renderer/assets/index-7eUOG3cN.css';
const c = fs.readFileSync(f, 'utf8');
console.log('Release CSS chat-panel-root:', c.includes('chat-panel-root'));
console.log('Release CSS chat-scanlines:', c.includes('chat-scanlines'));

// Also verify index.html
const h = fs.readFileSync('C:/Users/Shadow/ShadowDrive/0.1.Ai/DysonCode/release/win-unpacked/resources/app/dist/renderer/index.html', 'utf8');
console.log('index.html has 7eUOG3cN:', h.includes('7eUOG3cN'));
console.log('index.html has BAOHLNTD:', h.includes('BAOHLNTD'));
