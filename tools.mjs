import { ChromaClient } from 'chromadb';
import ollama from 'ollama';
import { getConfig } from './utilities.mjs';

const { embedModel, numberOfResults } = getConfig();

const tools = [
  {
    function_name: 'retreiveFromVectorDB',
    parameters: {
      user_query: '<user query>'
    },
    description:
      'This tool is triggered if the user mentions or ask to retrieve documents.'
  },
  {
    function_name: 'calculator',
    parameters: {
      expression: '<user math expression>'
    },
    description:
      'This tool is triggered if the user ask to calculate some form of math expression.'
  }
];

const tools_response_format = [
  {
    function_name: 'tool_name_example_1',
    parameters: { parameter_1: 'user input 1', parameter_2: 'user input 2' }
  }
];

async function retreiveFromVectorDB({ user_query }) {
  const chroma = new ChromaClient();
  const collection = await chroma.getCollection({
    name: 'rag_collection'
  });

  const queryEmbed = (
    await ollama.embeddings({ model: embedModel, prompt: user_query })
  ).embedding;

  const relevantDocs = await collection.query({
    queryEmbeddings: [queryEmbed],
    nResults: numberOfResults
  });

  const output = relevantDocs.metadatas[0].map((metadata, index) => {
    const fileName = metadata.file.split('/').pop();
    const documentExcerpt = relevantDocs.documents[0][index];
    const similarityScore = relevantDocs.distances[0][index];

    return {
      file: fileName,
      chunk: metadata.chunk,
      relevance: `${((1 - similarityScore) * 100).toFixed(2)}%`,
      text: documentExcerpt
    };
  });

  const jsonOutput = JSON.stringify(output, null, 2);

  // console.log('Returned documents:\n');
  // console.log(jsonOutput);
  // console.log('\nEnd of documents.');

  return jsonOutput;
}

function calculator({ expression }) {
  console.log('Expression: ' + expression);
  return 'The result of the calculation is: 42';
}

export { tools, tools_response_format, retreiveFromVectorDB, calculator };
