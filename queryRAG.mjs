import ollama from 'ollama';
import { ChromaClient } from 'chromadb';
import { getConfig } from './utilities.mjs';
import readline from 'readline';

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const {
  embedModel,
  mainModel,
  contextSize,
  currentTemperature,
  numberOfResults,
} = getConfig();

const chroma = new ChromaClient();
const collection = await chroma.getCollection({
  name: 'rag_collection',
});

const chatMessages = [];

async function handleQuery() {
  rl.question('Please enter your question: ', async (query) => {
    process.stdout.write('\x1Bc');

    if (query.length > 3) {
      console.time('Execution Time');
      console.log(`Question:\n${query}\n`);

      const queryEmbed = (
        await ollama.embeddings({ model: embedModel, prompt: query })
      ).embedding;

      const relevantDocs = await collection.query({
        queryEmbeddings: [queryEmbed],
        nResults: numberOfResults,
      });

      const output = relevantDocs.metadatas[0].map((metadata, index) => {
        const fileName = metadata.file.split('/').pop();
        const documentExcerpt = relevantDocs.documents[0][index];
        const similarityScore = relevantDocs.distances[0][index];

        return {
          file: fileName,
          chunk: metadata.chunk,
          relevance: `${((1 - similarityScore) * 100).toFixed(2)}%`,
          text: documentExcerpt,
        };
      });

      const jsonOutput = JSON.stringify(output, null, 2);

      // console.log('Returned documents:\n');
      // console.log(jsonOutput);
      // console.log('\nEnd of documents.');

      const modelQuery = `I have this information:
      \n\n${jsonOutput}
      \n\nPlease generate a response from the provided fragments while citing the relevant fragment metadata as: (file, chunk).
      \n\nSo my question is:
      \n\n${query}`;

      chatMessages.push({ role: 'user', content: modelQuery });

      const stream = await ollama.chat({
        model: mainModel,
        messages: chatMessages,
        stream: true,
        options: {
          num_ctx: contextSize,
          temperature: currentTemperature,
        },
      });

      console.log('\nAnswer:');
      let assistantResponse = '';

      for await (const chunk of stream) {
        process.stdout.write(chunk.message.content);
        assistantResponse += chunk.message.content;

        if (chunk.done) {
          chatMessages.push({
            role: 'assistant',
            content: assistantResponse,
          });

          console.log('\n\n==============================');
          console.log('Prompt Tokens:', chunk.prompt_eval_count);
          console.log('Response Tokens:', chunk.eval_count);
          console.log(
            'Loading the Model Time:',
            formatDuration(chunk.load_duration)
          );
          console.log(
            'Prompt Evaluation Time:',
            formatDuration(chunk.prompt_eval_duration)
          );
          console.log('Response Time:', formatDuration(chunk.total_duration));
        }
      }

      console.log('==============================');
      console.timeEnd('Execution Time');
    } else {
      console.error(
        'Invalid input. The input must be at least 3 characters long.'
      );
    }

    // Recursive call to handle next query
    handleQuery();
  });
}

// Start the first query
handleQuery();
