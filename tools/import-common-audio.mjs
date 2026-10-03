import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDirectory = process.argv[2];
if (!sourceDirectory) throw new Error('Укажите папку с MP3-файлами.');

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(projectRoot, 'audio', 'common');
await mkdir(outputDirectory, { recursive: true });

const sourceFiles = (await readdir(sourceDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.toLocaleLowerCase('en-US').endsWith('.mp3'))
  .map((entry) => entry.name);

await Promise.all(sourceFiles.map((file) => copyFile(join(sourceDirectory, file), join(outputDirectory, file))));

const audioFiles = (await readdir(outputDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.toLocaleLowerCase('en-US').endsWith('.mp3'))
  .map((entry) => basename(entry.name))
  .sort((left, right) => left.localeCompare(right, 'en'));

const manifest = `(() => {\n  'use strict';\n  window.VORDIK_COMMON_AUDIO_FILES = Object.freeze(${JSON.stringify(audioFiles, null, 2)});\n})();\n`;
await writeFile(join(projectRoot, 'audio-manifest.js'), manifest);

console.log(`Imported ${sourceFiles.length} MP3 files. Manifest contains ${audioFiles.length} files.`);
