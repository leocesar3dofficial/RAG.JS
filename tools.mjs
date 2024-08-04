import { ChromaClient } from 'chromadb';
import ollama from 'ollama';
import { getConfig } from './utilities.mjs';
import { evaluate } from 'mathjs';
import { capitalizeWord } from './utils.mjs';

const { embedModel, numberOfResults } = getConfig();

const available_tools = [
  {
    function_name: 'retrieveFromVectorDB',
    parameters: {
      user_query: '<query>',
    },
    description:
      'Invoke this tool if the user mentions or ask to retrieve information on some topic of interest.',
  },
  {
    function_name: 'calculator',
    parameters: {
      expression: '<math expression>',
    },
    description:
      'Invoke this tool if the user ask to calculate something. Format the values to a math expression.',
  },
  {
    function_name: 'getWeather',
    parameters: {
      city_name: '<city name>',
    },
    description:
      'Invoke this tool if the user ask to know the current weather or temperature in a city.',
  },
];

const tools_response_format = [
  {
    function_name: 'tool_1',
    parameters: { parameter_1: 'user input 1', parameter_2: 'user input 2' },
  },
  {
    function_name: 'tool_2',
    parameters: { parameter_1: 'user input 1', parameter_2: 'user input 2' },
  },
];

async function retrieveFromVectorDB({ user_query }) {
  const chroma = new ChromaClient();
  const collection = await chroma.getCollection({
    name: 'rag_collection',
  });

  const queryEmbed = (
    await ollama.embeddings({ model: embedModel, prompt: user_query })
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

  return jsonOutput;
}

async function calculator({ expression }) {
  const result = `Calculator: ${expression} = ${evaluate(expression)}`;
  return result;
}

async function getWeather({ city_name }) {
  city_name = capitalizeWord(city_name);
  const response = await fetch(`https://wttr.in/${city_name}?format=j1`);

  if (!response.ok) {
    throw new Error(`Failed to fetch weather data: ${response.statusText}`);
  }

  const data = await response.json();

  const formattedResult = `The current weather in ${city_name} is:\n
  Temperature: ${data['current_condition'][0]['temp_C']}°C\n
  Clouds: ${data['current_condition'][0]['cloudcover']}%\n 
  Humidity: ${data['current_condition'][0]['humidity']}%\n 
  Observation time: ${data['current_condition'][0]['observation_time']}\n 
  Preciptation: ${data['current_condition'][0]['precipMM']}mm\n 
  Pressure: ${data['current_condition'][0]['pressure']}mb\n 
  UV index: ${data['current_condition'][0]['uvIndex']}\n 
  Visibility: ${data['current_condition'][0]['visibility']}%\n 
  Description: ${data['current_condition'][0]['weatherDesc'][0]['value']}. 
  `;

  return formattedResult;
}

export {
  available_tools,
  tools_response_format,
  retrieveFromVectorDB,
  calculator,
  getWeather,
};
