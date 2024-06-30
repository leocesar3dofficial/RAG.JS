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
  console.log();

  const queryEmbed = (
    await ollama.embeddings({ model: embedModel, prompt: query })
  ).embedding;

  // const relevantDocs = (
  //   await collection.query({ queryEmbeddings: [queryEmbed], nResults: 8 })
  // ).documents[0].join('\n\n');

  const relevantDocs = await collection.query({
    queryEmbeddings: [queryEmbed],
    nResults: 8,
  });

  // console.clear();
  // relevantDocs.metadatas[0].forEach((metadata, index) => {
  //   const fileName = metadata.file.split('/').pop(); // Extracts the file name
  //   const documentExcerpt = relevantDocs.documents[0][index];
  //   console.log(`Excerpt number ${index + 1}:`);
  //   console.log(`Metadata:`);
  //   console.log(`File: ${fileName}, chunk: ${metadata.chunk}`);
  //   console.log(`Document excerpt:`);
  //   console.log(documentExcerpt);
  //   console.log(''); // Adds an empty line for readability
  // });

  let output = 'Returned documents:\n\n';

  relevantDocs.metadatas[0].forEach((metadata, index) => {
    const fileName = metadata.file.split('/').pop(); // Extracts the file name
    const documentExcerpt = relevantDocs.documents[0][index];
    output += `Excerpt number ${
      index + 1
    }:\nMetadata:\nFile: ${fileName},\nChunk: ${
      metadata.chunk
    }\nDocument excerpt:\n${documentExcerpt}\n\n`;
  });

  console.log('==============================');
  console.log(output.trim());
  console.log('==============================');

  const modelQuery = `I have this information:\n\n${output.trim()}\nSo my question is:\n${query}.\nDon't forget to cite the document name and the chunk number that you based your answer.`;

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

console.log('\n\n==============================');
console.timeLog('Response time');
