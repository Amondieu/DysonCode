const fs = require('fs');
const files = [
  'C:/Users/Shadow/ShadowDrive/0.1.Ai/DysonCode/dist/renderer/assets/index-7eUOG3cN.css',
  'C:/Users/Shadow/ShadowDrive/0.1.Ai/DysonCode/dist/renderer/assets/index-Pa9x7WbY.css',
];
for (const f of files) {
  try {
    const c = fs.readFileSync(f, 'utf8');
    console.log(`${f.split('/').pop()}: chat-panel-root=${c.includes('chat-panel-root')}, chat-scanlines=${c.includes('chat-scanlines')}, length=${c.length}`);
  } catch(e) {
    console.log(`${f.split('/').pop()}: NOT FOUND`);
  }
}
