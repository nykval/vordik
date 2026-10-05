import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = await readFile(join(projectRoot, 'word-catalog.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: 'word-catalog.js' });

const words = [...new Set((sandbox.window.VORDIK_WORD_CATALOG ?? [])
  .map((entry) => String(entry?.word ?? '').trim().toLocaleLowerCase('en-US').replace(/^to\s+/, ''))
  .filter((word) => /^[a-z]+(?:['-][a-z]+)*$/.test(word)))]
  .sort((left, right) => left.localeCompare(right, 'en'));

const output = `// Generated from word-catalog.js. Do not edit by hand.\nexport const WORD_GAME_WORDS = new Set(${JSON.stringify(words)});\n`;
await writeFile(join(projectRoot, 'cloudflare', 'word-game-dictionary.mjs'), output);
console.log(`Prepared ${words.length} words for the multiplayer word chain.`);
