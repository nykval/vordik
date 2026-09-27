import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 4173;
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/collections.js', ['collections.js', 'text/javascript; charset=utf-8']],
  ['/quick-pick-words.js', ['quick-pick-words.js', 'text/javascript; charset=utf-8']],
  ['/favicon.png', ['favicon.png', 'image/png']],
  ['/site.webmanifest', ['site.webmanifest', 'application/manifest+json']],
  ['/icons/home.svg', ['icons/home.svg', 'image/svg+xml']],
  ['/icons/dictionary.svg', ['icons/dictionary.svg', 'image/svg+xml']],
  ['/icons/learn.svg', ['icons/learn.svg', 'image/svg+xml']],
  ['/icons/check.svg', ['icons/check.svg', 'image/svg+xml']],
  ['/icons/close.svg', ['icons/close.svg', 'image/svg+xml']],
  ['/icons/speaker.svg', ['icons/speaker.svg', 'image/svg+xml']],
  ['/icons/speaker-compact.svg', ['icons/speaker-compact.svg', 'image/svg+xml']],
  ['/icons/speaker-user.svg', ['icons/speaker-user.svg', 'image/svg+xml']],
  ['/icons/delete.svg', ['icons/delete.svg', 'image/svg+xml']],
  ['/icons/word-card-close.svg', ['icons/word-card-close.svg', 'image/svg+xml']],
  ['/icons/word-card-delete.svg', ['icons/word-card-delete.svg', 'image/svg+xml']],
  ['/icons/trash-compact.svg', ['icons/trash-compact.svg', 'image/svg+xml']],
  ['/icons/flashcards-cover.png', ['icons/flashcards-cover.png', 'image/png']],
  ['/icons/quiz-cover.png', ['icons/quiz-cover.png', 'image/png']],
  ['/icons/typing-cover.png', ['icons/typing-cover.png', 'image/png']],
  ['/icons/timed-translation-cover.png', ['icons/timed-translation-cover.png', 'image/png']],
]);

createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = files.get(pathname);
  if (!file) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const content = await readFile(join(root, file[0]));
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(500); response.end('Could not load application');
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`Вордик: http://localhost:${port}`);
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address)) {
        console.log(`Телефон в той же сети (${name}): http://${address.address}:${port}`);
      }
    }
  }
});
