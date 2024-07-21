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

    let output = 'Returned documents:\n\n'; // Initializing the output string for the returned documents

    // Looping through the metadata of the relevant documents and constructing the output string
    relevantDocs.metadatas[0].forEach((metadata, index) => {
      const fileName = metadata.file.split('/').pop(); // Extracting the file name from the file path
      const documentExcerpt = relevantDocs.documents[0][index]; // Getting the document excerpt
      const similarityScore = relevantDocs.distances[0][index];
      output += `Excerpt number: ${
        index + 1
      }\nMetadata:\nFile: ${fileName},\nChunk: ${
        metadata.chunk
      },\nSimilarity score: ${similarityScore.toFixed(2)}
      \nDocument excerpt:\n${documentExcerpt}\n\n`; // Adding the metadata and document excerpt to the output string
    });

    console.log('==============================');
    console.log(output.trim()); // Displaying the output string
    console.log('==============================');

    // Constructing the model query with the retrieved documents and the original query
    const modelQuery = `I have this information:\n\n${output.trim()}\nSo my question is:\n${query}.\nPlease don't forget to cite the document name and its corresponding chunk number that you based your answer.`;

    // Generating a response using the mainModel with the constructed model query and streaming the response
    const stream = await ollama.generate({
      model: mainModel,
      prompt: modelQuery,
      stream: true,
      options: { num_ctx: 4096, temperature: 0.6 }, // Setting the options for the model
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
