const fs = require('fs');
const c = fs.readFileSync('C:/Users/Shadow/ShadowDrive/0.1.Ai/DysonCode/index.css.bak', 'utf8');
console.log('Has chat-panel-root:', c.includes('chat-panel-root'));
console.log('Length:', c.length, 'chars');
console.log('Lines:', c.split('\n').length);
console.log('Has LAYOUT STABILITY:', c.includes('LAYOUT STABILITY'));
console.log('Last 100 chars:', JSON.stringify(c.slice(-100)));
