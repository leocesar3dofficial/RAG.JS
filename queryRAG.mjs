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

const tools = [
  {
    description:
      'This tool is triggered if the user mentions or ask to retrieve documents.',
    function_name: 'retreiveFromVectorDB',
    parameters: [
      {
        user_query: '<user query>',
      },
    ],
  },
];

const tools_response_format = {
  tools: [
    {
      function_name: 'tool_name_example_1',
      parameters: [
        { parameter_1: 'user input 1' },
        { parameter_2: 'user input 2' },
      ],
    },
  ],
};

const chroma = new ChromaClient();
const collection = await chroma.getCollection({
  name: 'rag_collection',
});

async function retreiveFromVectorDB(query) {
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

  return jsonOutput;
}

const chatMessages = [];

async function handleChat() {
  rl.question('Please enter your question: ', async (query) => {
    process.stdout.write('\x1Bc');

    if (query.length >= 3) {
      console.time('Execution Time');
      console.log(`Question:\n${query}\n`);

      const results = retreiveFromVectorDB(query);

      // const modelQuery = `I have this information:
      // \n\n${results}
      // \n\nPlease generate a response from the provided fragments while citing the relevant fragment metadata as: (file, chunk).
      // \n\nSo my question is:
      // \n\n${query}`;

      const modelQuery = `
      This is our conversation so far:
      \n\n${JSON.stringify(chatMessages, null, 2)}
      \n\nThe user query is:
      \n\n${query}
      \n\nYou have this tools at your disposal: ${JSON.stringify(tools)}
      \n\nIf you see the need to use one or more tools answer in this example output format as JSON, otherwise answer normally:
      \n\n:${JSON.stringify(tools_response_format)}
      \n\nSo if the user invoke a tool, you must replace the values of the tool parameters with the provided information contained in the user query.
      `;

      chatMessages.push({ role: 'user', content: query });

      const stream = await ollama.generate({
        model: mainModel,
        system: 'Please keep your answer as brief as possible.',
        prompt: modelQuery,
        stream: true,
        options: {
          num_ctx: contextSize,
          temperature: currentTemperature,
        },
      });

      console.log('\nAnswer:');
      let assistantResponse = '';
      let responseCount = 0;

      for await (const chunk of stream) {
        process.stdout.write(chunk.response);
        responseCount++;

        if (responseCount < 30) {
          assistantResponse += chunk.response;
        }

        if (chunk.done) {
          chatMessages.push({
            role: 'assistant',
            content: assistantResponse,
          });

          if (chatMessages.length >= 16) {
            chatMessages.splice(0, 2);
          }

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
    handleChat();
  });
}

// Start the first query
handleChat();
