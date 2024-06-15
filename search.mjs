import ollama from 'ollama';
import { ChromaClient } from 'chromadb';
import { getConfig } from './utilities.mjs';

const { embedmodel, mainmodel } = getConfig();

const chroma = new ChromaClient();

const collection = await chroma.getCollection({
  name: 'rag_collection',
});

const query = process.argv.slice(2).join(' ');

const queryembed = (
  await ollama.embeddings({ model: embedmodel, prompt: query })
).embedding;

console.log(query);

const relevantDocs = (
  await collection.query({ queryEmbeddings: [queryembed], nResults: 8 })
).documents[0].join('\n\n');

const modelQuery = `${query} - Answer that question using the following text as a resource: ${relevantDocs}`;

const stream = await ollama.generate({
  model: mainmodel,
  prompt: modelQuery,
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.response);
}
