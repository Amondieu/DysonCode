const fs = require('fs');
const path = 'C:/Users/Shadow/ShadowDrive/0.1.Ai/DysonCode/src/renderer/components/DysonFrameModulator.css';
let c = fs.readFileSync(path, 'utf8');
const fix = '\n/* === FORCED DARK OVERRIDE === */\n.dyson-modulator-wrapper, .dyson-frame-modulator, .dyson-frame-btn { background: transparent !important; background-color: transparent !important; }\n.dyson-frame-btn { appearance: none; -webkit-appearance: none; border: 1px solid rgba(255,255,255,0.1) !important; color: inherit !important; }\n.dyson-modulator-wrapper { overflow: hidden; max-width: 100%; }\n';
fs.writeFileSync(path, c + fix);
console.log('CSS patched successfully');
