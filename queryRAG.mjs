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

  // Create an array to hold the formatted time parts
  let parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || minutes > 0 || hours > 0) parts.push(`${seconds}s`);
  parts.push(`${ms}ms`);

  return parts.join(' ');
}

// Setup input (keyboard) and output (console)
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Get configuration values
const {
  embedModel,
  mainModel,
  contextSize,
  currentTemperature,
  numberOfResults,
} = getConfig();

// Get Chroma DB collection
const chroma = new ChromaClient();
const collection = await chroma.getCollection({
  name: 'rag_collection',
});

// Ask question
rl.question('Please enter your question: ', async (query) => {
  rl.close();
  process.stdout.write('\x1Bc'); // Clear the console

  if (query.length > 3) {
    // Starting a timer to measure the response time
    console.time('Execution Time');
    console.log(`Question:\n${query}`); // Displaying the question
    console.log();

    // Getting the embedding for the query using the embedModel
    const queryEmbed = (
      await ollama.embeddings({ model: embedModel, prompt: query })
    ).embedding;

    // Querying the collection to get the relevant documents based on the query embedding
    const relevantDocs = await collection.query({
      queryEmbeddings: [queryEmbed],
      nResults: numberOfResults,
    });

    const output = relevantDocs.metadatas[0].map((metadata, index) => {
      const fileName = metadata.file.split('/').pop();
      const documentExcerpt = relevantDocs.documents[0][index];
      const similarityScore = relevantDocs.distances[0][index];

      return {
        excerpt: index + 1,
        metadata: {
          file: fileName,
          chunk: metadata.chunk,
          similarityScore: `${((1 - similarityScore) * 100).toFixed(2)}%`,
        },
        content: documentExcerpt,
      };
    });

    // The second parameter (null) is for the replacer function, and the third (2) is for pretty-printing with 2 spaces
    const jsonOutput = JSON.stringify(output, null, 2);

    console.log('Returned documents:\n');
    console.log(jsonOutput);
    console.log('\nEnd of documents.');

    // Construct the model query with the retrieved documents and the original query
    const modelQuery = `I have this information:
    \n\n${jsonOutput}
    \n\nSo my question is:
    \n\n${query}.
    \n\nPlease generate a detailed response exhausting every possible insight from the provided content while citing the relevant content as: (filename.extension, chunk).`;

    // Generate a response using the mainModel with the constructed model query and streaming the response
    const stream = await ollama.generate({
      model: mainModel,
      prompt: modelQuery,
      stream: true,
      options: {
        num_ctx: contextSize,
        temperature: currentTemperature,
      },
    });

    console.log('\nAnswer:');

    // Loop through the chunks of the streamed response and write them to the console
    for await (const chunk of stream) {
      process.stdout.write(chunk.response);

      if (chunk.done) {
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
  } else {
    console.error(
      'Invalid input. The input must be at least 3 characters long.'
    );
  }

  console.log('==============================');
  console.timeLog('Execution Time');
});
