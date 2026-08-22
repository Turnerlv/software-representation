const mod = 'fs';
const fs = require(mod);

const engine = 'ejs';
const renderer = require(engine).__express;

async function loadDynamic() {
  const lib = await import('path');
  const custom = await import('./custom-' + engine + '.js');
}
