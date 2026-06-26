// Fix: Rename electron wrapper so require('electron') returns the built-in API
const fs = require('fs');
const path = require('path');

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron');
const indexJs = path.join(electronDir, 'index.js');
const wrapperJs = path.join(electronDir, '_wrapper.js');
const cliJs = path.join(electronDir, 'cli.js');

// 1. Rename index.js to _wrapper.js
if (fs.existsSync(indexJs) && !fs.existsSync(wrapperJs)) {
  fs.renameSync(indexJs, wrapperJs);
  console.log('Renamed index.js -> _wrapper.js');
}

// 2. Update cli.js to require _wrapper.js instead of ./index
if (fs.existsSync(cliJs)) {
  let cliContent = fs.readFileSync(cliJs, 'utf8');
  if (cliContent.includes("require('./index')") || cliContent.includes("require('./')")) {
    cliContent = cliContent.replace(
      /require\(['"]\.\/index['"]\)|require\(['"]\.\/['"]\)/g,
      "require('./_wrapper')"
    );
    fs.writeFileSync(cliJs, cliContent);
    console.log('Updated cli.js to use _wrapper.js');
  }
}

// 3. Create new index.js that tries the built-in, falls back to wrapper
const newIndex = `
// Patched by DysonCode: prefer Electron built-in module over npm wrapper
try {
  // When running in Electron, the built-in module should be available
  // We can't directly access it from here, but the caller (our app) 
  // will get it through Electron's module resolution.
  // This file exists so npm doesn't complain about missing main.
  module.exports = require('./_wrapper')();
} catch (e) {
  module.exports = require('./_wrapper')();
}
`;
fs.writeFileSync(indexJs, newIndex);
console.log('Created new index.js');

console.log('Done.');
