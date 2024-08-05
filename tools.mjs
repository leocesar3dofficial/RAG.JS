import { ChromaClient } from 'chromadb';
import ollama from 'ollama';
import { getConfig } from './utilities.mjs';
import { evaluate } from 'mathjs';
import { capitalizeWord } from './utils.mjs';
import { load } from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';

const { embedModel, numberOfResults } = getConfig();

const available_tools = [
  {
    function_name: 'retrieveFromVectorDB',
    parameters: {
      user_query: '<query>',
    },
    description:
      'Call this tool if the user mentions or asks to retrieve or fetch information on some topic of his interest in the database.',
  },
  {
    function_name: 'calculator',
    parameters: {
      expression: '<math expression>',
    },
    description:
      'Call this tool if the user asks to calculate something. Format the values to a math expression.',
  },
  {
    function_name: 'getWeather',
    parameters: {
      city_name: '<city name>',
    },
    description:
      'Call this tool if the user asks to know the current weather or temperature in a city.',
  },
  {
    function_name: 'extractTextFromPage',
    parameters: {
      url: '<website url>',
    },
    description:
      'Call this tool if the user asks to get the text content from the provided website url.',
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
  console.log(result);
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

async function fetchPageContent(url) {
  try {
    const proxyUrl = 'http://168.63.76.32:3128';
    const proxyAgent = new HttpsProxyAgent(proxyUrl);
    const response = await fetch(url, {
      agent: proxyAgent,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });
    return await response.text();
  } catch (error) {
    console.error('Error fetching the page:', error);
    throw error;
  }
}

function formatTextFromHTML(html) {
  const document = load(html);
  document('script, style').remove();
  let text = document('body').text();
  text = text.replace(/\s+/g, ' ').trim();
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const formattedText = sentences.map((sentence) => sentence.trim()).join('\n');
  return formattedText;
}

async function extractTextFromPage({ url }) {
  try {
    const html = await fetchPageContent(url);
    let textContent = formatTextFromHTML(html);

    if (textContent === '') {
      textContent = 'The access to the page was denied!';
      console.log(textContent);
    }

    return textContent;
  } catch (error) {
    console.error('Failed to extract text content:', error);
    return null;
  }
}

export {
  available_tools,
  tools_response_format,
  retrieveFromVectorDB,
  calculator,
  getWeather,
  extractTextFromPage,
};
