import config from './config.json' assert { type: 'json' };
import sentencize from '@stdlib/nlp-sentencize';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export function getConfig() {
  return config;
}

export function readText(filename) {
  // Get the directory name of the current module
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Construct the file path
  const filePath = path.join(__dirname, filename);
  console.log(filePath);

  // Read the file content synchronously
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return data;
  } catch (err) {
    throw err;
  }
}

export function chunkTextBySentences(sourceText, sentencesPerChunk, overlap) {
  if (sentencesPerChunk < 2) {
    throw new Error('The number of sentences per chunk must be 2 or more.');
  }

  if (overlap < 0 || overlap >= sentencesPerChunk - 1) {
    throw new Error(
      'Overlap must be 0 or more and less than the number of sentences per chunk.'
    );
  }

  const sentences = sentencize(sourceText);

  if (!sentences) {
    console.log('Nothing to chunk');
    return [];
  }

  const chunks = [];
  let i = 0;

  while (i < sentences.length) {
    let end = Math.min(i + sentencesPerChunk, sentences.length);
    let chunk = sentences.slice(i, end).join(' ');

    if (overlap > 0 && i > 1) {
      const overlapStart = Math.max(0, i - overlap);
      const overlapEnd = i;
      const overlapChunk = sentences.slice(overlapStart, overlapEnd).join(' ');
      chunk = overlapChunk + ' ' + chunk;
    }

    chunks.push(chunk.trim());

    i += sentencesPerChunk;
  }

  return chunks;
}
