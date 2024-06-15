import ollama from 'ollama';
import { ChromaClient } from 'chromadb';
import { readText, getConfig, chunkTextBySentences } from './utilities.mjs';

const chroma = new ChromaClient();

await chroma.deleteCollection({ name: 'rag_collection' });

const collection = await chroma.getOrCreateCollection({
  name: 'rag_collection',
  metadata: { 'hnsw:space': 'cosine' },
});

const { embedmodel } = getConfig();
console.log(`Embedding chunks.`);
const text = readText('corpus.txt');
const chunks = chunkTextBySentences(text, 4, 1);

for await (const [index, chunk] of chunks.entries()) {
  const embed = (await ollama.embeddings({ model: embedmodel, prompt: chunk }))
    .embedding;

  await collection.add({
    ids: [String(index)],
    embeddings: [embed],
    documents: [chunk],
  });

  process.stdout.write('.');
}
