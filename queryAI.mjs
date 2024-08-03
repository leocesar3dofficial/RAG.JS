import readline from 'readline';
import { formatDuration } from './utils.mjs';
import ollama from 'ollama';
import { getConfig } from './utilities.mjs';
import {
  tools,
  tools_response_format,
  retreiveFromVectorDB,
  calculator
} from './tools.mjs';

const { mainModel, contextSize, currentTemperature } = getConfig();
const chatMessages = [];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function handleChat() {
  rl.question('Please enter your question: ', async (query) => {
    process.stdout.write('\x1Bc');

    if (query.length >= 3) {
      console.time('Execution Time');
      console.log(`Question:\n${query}\n`);

      // const ragQuery = `I have this information:
      // \n\nThe user question is:
      // \n\n${query}
      // \n\nPlease generate a response from the provided fragments bellow while citing the relevant metadata as: (file, chunk).
      // \n\n${result}
      // `;

      const toolQuery = `
      \n\nThe user query is:
      \n\n${query}
      \n\nYou have this tools at your disposal: ${JSON.stringify(tools)}
      \n\nIf you see the need to use one or more tools answer in this example output format as JSON, otherwise answer normally:
      \n\n:${JSON.stringify(tools_response_format)}
      \n\nSo if the user invoke a tool, you must replace the values of the tool parameters with the provided information contained in the user query.
      `;

      chatMessages.push({ role: 'user', content: query });

      const tools_response = await ollama.generate({
        model: mainModel,
        system: 'Please keep your answer as brief as possible.',
        prompt: toolQuery,
        stream: false,
        options: {
          num_ctx: contextSize,
          temperature: currentTemperature
        }
      });

      const cleanedResponse = tools_response.response
        .replace('```json', '')
        .replace('```', '')
        .replace(/^:/, '')
        .replace(/,\s*([\]}])/g, '$1')
        .trim();

      let jsonObject = [];

      try {
        jsonObject = JSON.parse(cleanedResponse);
      } catch (error) {
        console.error('Invalid JSON string:', error.message);
        jsonObject = [];
      }

      const availableFunctions = {
        retreiveFromVectorDB: retreiveFromVectorDB,
        calculator: calculator
      };

      let toolResults = [];

      for (const tool of jsonObject) {
        const functionToCall = availableFunctions[tool.function_name];
        console.log(tool.function_name);
        toolResults.push(await functionToCall(tool.parameters));
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
        system: 'Please give thorough and detailed answers.',
        prompt: chatQuery,
        stream: true,
        options: {
          num_ctx: contextSize,
          temperature: currentTemperature
        }
      });

      console.log('\nAnswer:');
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
            content: assistantResponse
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
