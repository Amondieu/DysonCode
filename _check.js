var fs = require('fs');
var buf = fs.readFileSync('dist/renderer/assets/index-Dq2YoLTe.js');
var s = buf.toString();
console.log('has scrollTop:', s.indexOf('scrollTop') >= 0);
console.log('has scrollHeight:', s.indexOf('scrollHeight') >= 0);
console.log('has scrollIntoView:', s.indexOf('scrollIntoView') >= 0);
console.log('length:', buf.length);
