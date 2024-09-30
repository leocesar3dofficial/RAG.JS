import fs from 'fs';
import path from 'path';
import sentencize from '@stdlib/nlp-sentencize';

function getFileList(dirPath) {
  let fileList = [];

  // Check if the provided path is valid and is a directory
  if (!fs.existsSync(dirPath) || !fs.lstatSync(dirPath).isDirectory()) {
    throw new Error(`Invalid or non-directory path: ${dirPath}`);
  }

  // Recursively walk through the directory tree
  function walkDir(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    entries.forEach((entry) => {
      const fullPath = path.join(dirPath, entry.name);

      // If the entry is a file, add it to the list
      if (entry.isFile()) {
        fileList.push(fullPath);
      }
      // If the entry is a directory, recursively walk through it
      else if (entry.isDirectory()) {
        walkDir(fullPath);
      }
    });
  }

  // Start the walk
  walkDir(dirPath);

  return fileList;
}

function getFileText(filePath) {
  // Check if the provided path is valid and is a file
  if (!fs.existsSync(filePath) || !fs.lstatSync(filePath).isFile()) {
    throw new Error(`Invalid or non-file path: ${filePath}`);
  }

  // Read the file content synchronously
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return data;
  } catch (err) {
    throw err;
  }
}

function getConfig() {
  return JSON.parse(getFileText('config.json'));
}

function chunkTextBySentences(sourceText, sentencesPerChunk, overlap) {
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

function formatDuration(ns) {
  let ms = Math.floor(ns / 1000000);
  let seconds = Math.floor(ms / 1000);
  ms = ms % 1000;
  let minutes = Math.floor(seconds / 60);
  seconds = seconds % 60;
  let hours = Math.floor(minutes / 60);
  minutes = minutes % 60;

  let parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || minutes > 0 || hours > 0) parts.push(`${seconds}s`);
  parts.push(`${ms}ms`);

  return parts.join(' ');
}

function cleanToolResponse(response) {
  return response
    .replace(/\[\s*{[\s\S]*?}\s*\]/, (match) => match.trim())
    .replace('```json', '')
    .replace(/```[\s\S]*$/, '')
    .replace(/^:/, '')
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/\[:/g, '[')
    .replace(/^(?!\[\s*).*$/, '[$&]')
    .replace(/],\s*$/, ']')
    .replace(/^\[\s*\[(.*)\]\s*\]$/, '[$1]')
    .trim();
}

function cleanDBResponse(response) {
  return response
    .replace('```sql', '')
    .replace(/```[\s\S]*$/, '')
    .trim().toUpperCase();
}

function capitalizeWord(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export {
  getFileList,
  getFileText,
  getConfig,
  chunkTextBySentences,
  formatDuration,
  cleanToolResponse,
  cleanDBResponse,
  capitalizeWord,
};
