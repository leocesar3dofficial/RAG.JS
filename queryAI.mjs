import readline from 'readline';
import { formatDuration, cleanToolResponse } from './utils.mjs';
import ollama from 'ollama';
import { getConfig } from './utilities.mjs';
import {
  available_tools,
  tools_response_format,
  retrieveFromVectorDB,
  calculator,
  getWeather,
} from './tools.mjs';

const {
  mainModel,
  contextSize,
  currentTemperature,
  chatMaxMessages,
  assistantMaxMessageSize,
} = getConfig();

const chatMessages = [];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function getToolResponse(query) {
  const toolQuery = `
    The user query is:\n${query}\n
    You have these tools at your disposal: ${JSON.stringify(available_tools)}\n
    Answer in this example JSON format if you see the need to use one or more tools:\n${JSON.stringify(
      tools_response_format
    )}\n
    Replace the values of the tool parameters with the provided information from the user query.
  `;

  try {
    return await ollama.generate({
      model: mainModel,
      system: 'Please keep your answer as brief as possible.',
      prompt: toolQuery,
      stream: false,
      options: {
        num_ctx: contextSize,
        temperature: currentTemperature,
      },
    });
  } catch (error) {
    console.error(`Failed to generate tool response: ${error.message}`);
    return null;
  }
}

async function executeTools(cleanedResponse) {
  const toolsResponse = [];

  try {
    const jsonObject = JSON.parse(cleanedResponse);
    const availableFunctions = {
      retrieveFromVectorDB: retrieveFromVectorDB,
      calculator: calculator,
      getWeather: getWeather,
    };

    for (const tool of jsonObject) {
      const functionToCall = availableFunctions[tool.function_name];
      if (typeof functionToCall === 'function') {
        console.log(`Invoked tool: ${tool.function_name}`);
        const response = await functionToCall(tool.parameters);
        toolsResponse.push(response);
      }
    }
  } catch (error) {
    console.error(`An error occurred during tool execution: ${error.message}`);
  }

  return toolsResponse;
}

async function generateResponse(query, toolResults) {
  const chatQuery = `
    This is our conversation so far (if any):\n${JSON.stringify(
      chatMessages,
      null,
      2
    )}\n
    Tool results (if any):\n${toolResults.join('\n')}\n
    Please answer the following question considering the provided information (if any):\n${query}
  `;

  try {
    return await ollama.generate({
      model: mainModel,
      system:
        'You are a helpful assistant. Only answer based on the provided information. Please give a detailed answer.',
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
  rl.question('You: ', async (query) => {
    process.stdout.write('\x1Bc');

    if (query.trim().length > 2) {
      console.time('Execution Time');
      console.log(`Question:\n${query}\n`);

      chatMessages.push({ role: 'user', content: query });
      const toolsResponse = await getToolResponse(query);

      if (toolsResponse) {
        const cleanedResponse = cleanToolResponse(toolsResponse.response);
        const toolResults =
          cleanedResponse.startsWith('[') && cleanedResponse.endsWith(']')
            ? await executeTools(cleanedResponse)
            : [];

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

      console.log('==============================');
      console.timeEnd('Execution Time');
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
