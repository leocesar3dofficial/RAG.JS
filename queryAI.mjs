import readline from 'readline';
import { formatDuration } from './utils.mjs';
import ollama from 'ollama';
import { getConfig } from './utilities.mjs';
import {
  available_tools,
  tools_response_format,
  retreiveFromVectorDB,
  calculator,
} from './tools.mjs';

const { mainModel, contextSize, currentTemperature } = getConfig();
const chatMessages = [];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function getToolResponse(query) {
  const toolQuery = `
  \n\nThe user query is:
  \n\n${query}
  \n\nYou have these tools at your disposal: ${JSON.stringify(available_tools)}
  \n\nAnswer in this example JSON format if you see the need to use one or more tools:
  \n\n:${JSON.stringify(tools_response_format)}
  \n\nReplace the values of the tool parameters with the provided information from the user query.
  `;

  return ollama.generate({
    model: mainModel,
    system: 'Please keep your answers as brief as possible.',
    prompt: toolQuery,
    stream: false,
    options: {
      num_ctx: contextSize,
      temperature: currentTemperature,
    },
  });
}

async function executeTools(cleanedResponse) {
  try {
    const jsonObject = JSON.parse(cleanedResponse);
    const availableFunctions = {
      retreiveFromVectorDB: retreiveFromVectorDB,
      calculator: calculator,
    };

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
    console.error(`An error occurred during tool execution: ${error}`);
    return [];
  }
}

async function generateResponse(query, toolResults) {
  const chatQuery = `
  This is our conversation so far (if any):
  \n\n${JSON.stringify(chatMessages, null, 2)}
  \n\nTool results (if any):
  \n\n${toolResults.join('\n')}
  \n\nPlease answer this question with the provided information (if any):
  \n\n${query}
  `;

  return ollama.generate({
    model: mainModel,
    system:
      'You are a helpful assistant. Only answer based on the provided information.',
    prompt: chatQuery,
    stream: true,
    options: {
      num_ctx: contextSize,
      temperature: currentTemperature,
    },
  });
}

async function handleChat() {
  rl.question('You: ', async (query) => {
    process.stdout.write('\x1Bc');

    if (query.trim().length > 2) {
      console.time('Execution Time');
      console.log(`Question:\n${query}\n`);

      chatMessages.push({ role: 'user', content: query });

      const toolsResponse = await getToolResponse(query);

      const cleanedResponse = toolsResponse.response
        .replace('```json', '')
        .replace('```', '')
        .replace(/^:/, '')
        .replace(/,\s*([\]}])/g, '$1')
        .trim();

      let toolResults = [];

      if (cleanedResponse.startsWith('[') && cleanedResponse.endsWith(']')) {
        toolResults = await executeTools(cleanedResponse);
      }

      const stream = await generateResponse(query, toolResults);

      console.log('\nAssistant:');
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

          if (chatMessages.length > 15) {
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
