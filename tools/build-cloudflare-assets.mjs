import { cp, copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputRoot = join(projectRoot, '.cloudflare-public');
const files = [
  'index.html',
  'styles.css',
  'app.js',
  'travel-words.js',
  'money-words.js',
  'food-words.js',
  'word-catalog.js',
  'audio-manifest.js',
  'collections.js',
  'quick-pick-words.js',
  'site.webmanifest',
  'favicon.png',
  'favicon.svg',
];

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await Promise.all(files.map((file) => copyFile(join(projectRoot, file), join(outputRoot, file))));
await Promise.all(['icons', 'images', 'fonts', 'audio', 'data'].map(async (directory) => {
  if (directory === 'data') {
    const dataOutput = join(outputRoot, directory);
    await mkdir(dataOutput, { recursive: true });
    await Promise.all([
      'oxford_5000_cefr_ru.csv',
      'food_restaurant_words_cefr_ru.csv',
      'money_words_cefr_ru.csv',
      'travel_words_cefr_ru.csv',
    ].map((file) => copyFile(join(projectRoot, directory, file), join(dataOutput, file))));
    return;
  }
  await cp(join(projectRoot, directory), join(outputRoot, directory), { recursive: true });
}));

console.log(`Cloudflare assets prepared in ${outputRoot}`);
