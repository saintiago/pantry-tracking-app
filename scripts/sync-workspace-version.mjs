import fs from 'node:fs';

const frontend = JSON.parse(fs.readFileSync('frontend/package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
lock.packages.frontend.version = frontend.version;
fs.writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
