import readline from 'readline';
import { formatDuration } from './utils.mjs';
import ollama from 'ollama';
import { getConfig } from './utilities.mjs';
import {
  tools,
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

async function handleChat() {
  rl.question('You: ', async (query) => {
    process.stdout.write('\x1Bc');

    if (query.length > 2) {
      console.time('Execution Time');
      console.log(`Question:\n${query}\n`);

      const toolQuery = `
      \n\nThe user query is:
      \n\n${query}
      \n\nYou have this tools at your disposal: ${JSON.stringify(tools)}
      \n\nAnswer in this example JSON format if you see the need to use one or more tools:
      \n\n:${JSON.stringify(tools_response_format)}
      \n\nSo if the user invoke a tool, you must replace the values of the tool parameters with the provided information contained in the user query.
      `;

      chatMessages.push({ role: 'user', content: query });

      const tools_response = await ollama.generate({
        model: mainModel,
        system: 'Please keep your answers as brief as possible.',
        prompt: toolQuery,
        stream: false,
        options: {
          num_ctx: contextSize,
          temperature: currentTemperature,
        },
      });

      console.log(`Tools response:\n${tools_response.response}`);
      const cleanedResponse = tools_response.response
        .replace('```json', '')
        .replace('```', '')
        .replace(/^:/, '')
        .replace(/,\s*([\]}])/g, '$1')
        .trim();

      const toolResults = [];

      if (cleanedResponse.startsWith('[') && cleanedResponse.endsWith(']')) {
        try {
          const jsonObject = JSON.parse(cleanedResponse);

          const availableFunctions = {
            retreiveFromVectorDB: retreiveFromVectorDB,
            calculator: calculator,
          };

          for (const tool of jsonObject) {
            const functionToCall = availableFunctions[tool.function_name];

            if (typeof functionToCall === 'function') {
              console.log(`Invoked tool: ${tool.function_name}`);
              toolResults.push(await functionToCall(tool.parameters));
            }
          }
        } catch (error) {
          console.log(`An error occurred: ${error}`);
        }
      }

      const chatQuery = `
      This is our conversation so far (if any):
      \n\n${JSON.stringify(chatMessages, null, 2)}
      \n\nTool results (if any):
      \n\n${toolResults}
      \n\nPlease answer this question with the provided information (if any):
      \n\n${query}
      `;

      const stream = await ollama.generate({
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
