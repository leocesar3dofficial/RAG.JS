import ollama from 'ollama';
import { ChromaClient } from 'chromadb';
import { getConfig } from './utilities.mjs';
import readline from 'readline';

console.time('Response time');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const { embedModel, mainModel } = getConfig();
const chroma = new ChromaClient();
const collection = await chroma.getCollection({
  name: 'rag_collection',
});

rl.question('Please enter your question: ', async (query) => {
  rl.close();

  if (query.length > 3) {
    console.clear();
    console.log(`Question:\n${query}`);
    console.log();

    const queryEmbed = (
      await ollama.embeddings({ model: embedModel, prompt: query })
    ).embedding;

    const relevantDocs = await collection.query({
      queryEmbeddings: [queryEmbed],
      nResults: 8,
    });

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

    const modelQuery = `I have this information:\n\n${output.trim()}\nSo my question is:\n${query}.\nPlease don't forget to cite the document name and its corresponding chunk number that you based your answer.`;

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
      'Invalid input. The input must be at least 3 characters long.'
    );
  }

  console.log('\n\n==============================');
  console.timeLog('Response time');
});
