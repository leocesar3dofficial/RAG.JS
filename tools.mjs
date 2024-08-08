import { ChromaClient } from 'chromadb';
import ollama from 'ollama';
import { getConfig, capitalizeWord } from './utilities.mjs';
import { evaluate } from 'mathjs';
import { load } from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';

const { embedModel, numberOfResults } = getConfig();

const available_tools = [
  {
    function_name: 'retrieveFromVectorDB',
    parameters: {
      user_query: '<user_query>',
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
  if (user_query === undefined || user_query.length < 3) {
    return 'The parameter user_query is malformed.';
  }

  try {
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

    const metadata = { tool_results_from: 'retrieveFromVectorDB' };
    output.unshift(metadata);
    const jsonOutput = JSON.stringify(output, null, 2);

    return jsonOutput;
  } catch (error) {
    console.error('Error in retrieveFromVectorDB:', error.message);
    return `Error: Unable to retrieve data due to ${error.message}`;
  }
}

async function calculator({ expression }) {
  try {
    const result = `Calculator result: ${expression} = ${evaluate(expression)}`;
    console.log(result);
    return result;
  } catch {
    console.error('Error in evaluating expression:', error.message);
    return `Error: Unable to evaluate expression "${expression}"`;
  }
}

async function getWeather({ city_name }) {
  if (city_name === undefined || city_name.length < 3) {
    return 'The parameter city_name is malformed.';
  }

  try {
    city_name = capitalizeWord(city_name);
    const response = await fetch(`https://wttr.in/${city_name}?format=j1`);

    if (!response.ok) {
      throw new Error(`Failed to fetch weather data: ${response.statusText}`);
    }

    const data = await response.json();

    const formattedResult = `The current weather in ${city_name} is:
  Temperature: ${data['current_condition'][0]['temp_C']}°C
  Clouds: ${data['current_condition'][0]['cloudcover']}% 
  Humidity: ${data['current_condition'][0]['humidity']}% 
  Observation time: ${data['current_condition'][0]['observation_time']}
  Preciptation: ${data['current_condition'][0]['precipMM']}mm
  Pressure: ${data['current_condition'][0]['pressure']}mb
  UV index: ${data['current_condition'][0]['uvIndex']}
  Visibility: ${data['current_condition'][0]['visibility']}%
  Description: ${data['current_condition'][0]['weatherDesc'][0]['value']}. 
  `;

    return formattedResult;
  } catch (error) {
    console.error('Unable to retrieve weather data due to:', error.message);
    return `Error. Unable to retrieve weather data due to: ${error.message}`;
  }
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
    console.error('Error fetching the page:', error.message);
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

    textContent =
      textContent === ''
        ? "The website didn't return any content. Possibly denied."
        : `Returned content from the website:
        ${textContent}`;

    return textContent;
  } catch (error) {
    console.error('Failed to extract text content:', error.message);
    return `Failed to extract text content: ${error.message}`;
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
