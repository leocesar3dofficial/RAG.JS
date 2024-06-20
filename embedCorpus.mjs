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

let chunks = [];

fileList.forEach((file, index) => {
  console.log(`${index + 1}: ${file}`);
  const documentContent = getFileText(`./${file}`);
  const sentences = chunkTextBySentences(documentContent, 4, 1);
  chunks.push(...sentences);
});

for (const [index, chunk] of chunks.entries()) {
  const embed = (await ollama.embeddings({ model: embedModel, prompt: chunk }))
    .embedding;

  await collection.add({
    ids: [String(index)],
    embeddings: [embed],
    documents: [chunk],
  });

  process.stdout.write('.');
}

console.log('\nSuccessfully embedded the files in the Vector Database.');
