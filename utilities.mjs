import fs from 'fs';
import path from 'path';
import sentencize from '@stdlib/nlp-sentencize';

export function getFileList(dirPath) {
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

export function getFileText(filePath) {
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

export function getConfig() {
  return JSON.parse(getFileText('config.json'));
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
