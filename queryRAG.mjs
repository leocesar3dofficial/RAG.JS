import ollama from 'ollama';
import { ChromaClient } from 'chromadb';
import { getConfig } from './utilities.mjs';
import readline from 'readline';

console.time('Response time'); // Starting a timer to measure the response time

const rl = readline.createInterface({
  input: process.stdin, // Setting the input to the standard input (keyboard)
  output: process.stdout, // Setting the output to the standard output (console)
});

const { embedModel, mainModel } = getConfig(); // Destructuring to get embedModel and mainModel from the configuration file
const chroma = new ChromaClient();
const collection = await chroma.getCollection({
  name: 'rag_collection', // Getting the collection named 'rag_collection' from the Chroma database
});

rl.question('Please enter your question: ', async (query) => {
  rl.close(); // Closing the readline interface after getting the input

  if (query.length > 3) {
    // Checking if the input query is more than 3 characters long
    console.clear(); // Clearing the console
    console.log(`Question:\n${query}`); // Displaying the question
    console.log();

    // Getting the embedding for the query using the embedModel
    const queryEmbed = (
      await ollama.embeddings({ model: embedModel, prompt: query })
    ).embedding;

    // Querying the collection to get the relevant documents based on the query embedding
    const relevantDocs = await collection.query({
      queryEmbeddings: [queryEmbed],
      nResults: 8, // Number of results to retrieve
    });

    const output = relevantDocs.metadatas[0].map((metadata, index) => {
      const fileName = metadata.file.split('/').pop(); // Extracting the file name from the file path
      const documentExcerpt = relevantDocs.documents[0][index]; // Getting the document excerpt
      const similarityScore = relevantDocs.distances[0][index];

      return {
        excerptNumber: index + 1,
        metadata: {
          file: fileName,
          chunk: metadata.chunk,
          similarityScore: `${((1 - similarityScore) * 100).toFixed(2)}%`,
        },
        documentExcerpt: documentExcerpt,
      };
    });

    // Convert the array of objects to a JSON string
    const jsonOutput = JSON.stringify(output, null, 2); // The second parameter (null) is for the replacer function, and the third (2) is for pretty-printing with 2 spaces

    console.log('Returned documents:\n');
    console.log(jsonOutput); // Displaying the output string
    console.log('\nEnd of documents.');

    // Constructing the model query with the retrieved documents and the original query
    const modelQuery = `I have this information, ordered from the most relevant to the least relevant excerpts, based on their Similarity score (higher percentage is better):
    \n\n${jsonOutput}
    \n\nSo my question is:
    \n\n${query}.
    \n\nPlease don't forget to cite, for each argument, the file and chunk.`;

    // Generating a response using the mainModel with the constructed model query and streaming the response
    const stream = await ollama.generate({
      model: mainModel,
      prompt: modelQuery,
      stream: true,
      options: { num_ctx: 8192, temperature: 0.6 }, // Setting the options for the model
    });

    console.log('\nAnswer:');

    // Looping through the chunks of the streamed response and writing them to the console
    for await (const chunk of stream) {
      process.stdout.write(chunk.response);
    }
  } else {
    console.error(
      'Invalid input. The input must be at least 3 characters long.' // Error message for invalid input
    );
  }

  console.log('\n\n==============================');
  console.timeLog('Response time'); // Logging the elapsed time
});
