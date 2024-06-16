import ollama from 'ollama';
import { ChromaClient } from 'chromadb';
import {
  getFileText,
  getFileList,
  getConfig,
  chunkTextBySentences,
} from './utilities.mjs';

console.clear();
const { embedModel, corpusPath, collectionName } = getConfig();
const corpusDirectory = corpusPath;
const chroma = new ChromaClient();

await chroma.deleteCollection({ name: collectionName });

const collection = await chroma.getOrCreateCollection({
  name: collectionName,
  metadata: { 'hnsw:space': 'cosine' },
});

const fileList = getFileList(corpusDirectory);
console.log(`Embedding chunks for ${fileList.length} files:`);

let text = '';
let chunks = '';

for (let i = 0; i < fileList.length; i++) {
  console.log(`${i + 1}: ${fileList[i]}`);
  text += getFileText(`./${fileList[i]}`);
}

chunks = chunkTextBySentences(text, 4, 1);

for (const [index, chunk] of chunks.entries()) {
  const embed = (await ollama.embeddings({ model: embedModel, prompt: chunk }))
    .embedding;

  await collection.upsert({
    ids: [String(index)],
    embeddings: [embed],
    documents: [chunk],
  });

  process.stdout.write('.');
}

console.log('\nSuccessfully embedded the files in the Vector Database.');
