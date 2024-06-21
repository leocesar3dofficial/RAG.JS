import ollama from 'ollama';
import { ChromaClient } from 'chromadb';
import { getConfig } from './utilities.mjs';

console.time('Response time');

const { embedModel, mainModel } = getConfig();
const chroma = new ChromaClient();
const collection = await chroma.getCollection({
  name: 'rag_collection',
});

const query = process.argv.slice(2).join(' ');

if (query.length > 3) {
  console.clear();
  console.log(`Question:\n${query}`);

  const queryEmbed = (
    await ollama.embeddings({ model: embedModel, prompt: query })
  ).embedding;

  const relevantDocs = (
    await collection.query({ queryEmbeddings: [queryEmbed], nResults: 16 })
  ).documents[0].join('\n\n');

  const modelQuery = `I have this information:\n${relevantDocs}\nSo my question is:\n${query}`;

  const stream = await ollama.generate({
    model: mainModel,
    prompt: modelQuery,
    stream: true,
    options: { num_ctx: 4096, temperature: 0.6 },
  });

  console.log('\nAnswer:');

  for await (const chunk of stream) {
    process.stdout.write(chunk.response);
  }
} else {
  console.error(
    'Invalid input. Use this pattern: node queryRAG.mjs <your question>.\nThe input must be at least 3 characters long.'
  );
}

console.log();
console.timeLog('Response time');
