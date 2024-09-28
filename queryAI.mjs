import readline from 'readline';
import ollama from 'ollama';
import { getConfig, formatDuration, cleanToolResponse } from './utilities.mjs';
import {
  available_tools,
  tools_response_format,
  retrieveFromVectorDB,
  calculator,
  getWeather,
  extractTextFromPage,
} from './tools.mjs';

const {
  mainModel,
  contextSize,
  currentTemperature,
  chatMaxMessages,
  assistantMaxMessageSize,
} = getConfig();

const chatMessages = [];

const availableFunctions = {
  retrieveFromVectorDB: retrieveFromVectorDB,
  calculator: calculator,
  getWeather: getWeather,
  extractTextFromPage: extractTextFromPage,
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function getToolResponse(query) {
  const toolQuery = `
    The response must be a JSON array.
    Do not include one function in the JSON array if you don't have the necessary parameters.
    Please create an array of JSON objects based on the following schema:
    ${JSON.stringify(tools_response_format)}
    You have these functions to invoke/call (call one or more if necessary):
    ${JSON.stringify(available_tools)}
    The user query is:
    ${query}
    Replace the values of the function parameters with the provided information from the user query.
  `;

  try {
    return await ollama.generate({
      model: mainModel,
      system: 'Please keep your answer as brief as possible. Do not add comments to your answer.',
      prompt: toolQuery,
      stream: false,
      options: {
        num_ctx: contextSize,
        temperature: currentTemperature,
        format: 'json',
      },
    });
  } catch (error) {
    console.error(`Failed to generate tool response: ${error.message}`);
    return null;
  }
}

async function executeTools(cleanedResponse) {
  try {
    let jsonObject = JSON.parse(cleanedResponse);

    if (!Array.isArray(jsonObject)) {
      jsonObject = [jsonObject];
    }

    return await Promise.all(
      jsonObject.map(async (tool) => {
        const functionToCall = availableFunctions[tool.function_name];
        if (typeof functionToCall === 'function') {
          console.log(`Invoked tool: ${tool.function_name}`);
          return await functionToCall(tool.parameters);
        }
      })
    );
  } catch (error) {
    console.error(
      `An error occurred while trying to execute the tool(s): ${error.message}`
    );
    return ['There are no returned tool results because an error occurred.'];
  }
}

async function generateResponse(query, toolResults) {
  const chatQuery = `
    This is our conversation so far (if any):
    ${JSON.stringify(chatMessages, null, 2)}
    Tool results (if any):
    ${toolResults.join('\n')}
    Please answer the following question considering only the provided tool results (if any):
    ${query}
    Do not try to answer with incomplete information.
  `;

  try {
    return await ollama.generate({
      model: mainModel,
      system:
        'Please give a complete and detailed answer. You are a data analyst specialized in extracting insights from the provided information. Use only the returned results to generate your response.',
      prompt: chatQuery,
      stream: true,
      options: {
        num_ctx: contextSize,
        temperature: currentTemperature,
      },
    });
  } catch (error) {
    console.error(`Failed to generate response: ${error.message}`);
    return null;
  }
}

async function handleChat() {
  console.log('You can use these tools:');
  Object.keys(availableFunctions).forEach((key) => {
    console.log(key);
  });
  console.log('==============================');

  rl.question('You: ', async (query) => {
    process.stdout.write('\x1Bc');

    if (query.trim().length > 2) {
      console.time('Execution Time');
      console.log(`Question:\n${query}\n`);

      chatMessages.push({ role: 'user', content: query });
      const toolsResponse = await getToolResponse(query);

      if (toolsResponse) {
        const cleanedResponse = cleanToolResponse(toolsResponse.response);
        console.log(`I've decided to use the tool(s):\n${cleanedResponse}\n`);
        const toolResults = await executeTools(cleanedResponse);
        const stream = await generateResponse(query, toolResults);

        if (stream) {
          console.log('\nAssistant:');
          let assistantResponse = '';
          let responseCount = 0;

          for await (const chunk of stream) {
            process.stdout.write(chunk.response);
            responseCount++;

            if (responseCount < assistantMaxMessageSize) {
              assistantResponse += chunk.response;
            }

            if (chunk.done) {
              chatMessages.push({
                role: 'assistant',
                content: assistantResponse,
              });

              if (chatMessages.length > chatMaxMessages) {
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
              console.log(
                'Response Time:',
                formatDuration(chunk.total_duration)
              );
            }
          }
        }
      }

      console.timeEnd('Execution Time');
      console.log('==============================');
    } else {
      console.error(
        'Invalid input. The input must be at least 3 characters long.'
      );
    }

    handleChat(); // Recursive call to handle the next query
  });
}

// Start the first query
handleChat();
