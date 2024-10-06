import readline from 'readline';
import ollama from 'ollama';
import { getConfig, formatDuration } from './utilities.mjs';
import { queryDB } from './tools.mjs';
import { cleanDBResponse } from './utilities.mjs'

const {
  mainModel,
  sqlModel,
  contextSize,
  currentTemperature,
  chatMaxMessages,
  assistantMaxMessageSize,
} = getConfig();

const chatMessages = [];

const databaseSchema = await queryDB(
  `
    SELECT
      table_name,
      column_name
    FROM
      information_schema.columns
    WHERE
      table_schema = 'public'
    ORDER BY table_name;
  `
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function getToolResponse(query) {
  const toolQuery = `
    The response must be a Postgresql SQL query.
    Please create a Postgresql SQL query based on the following database schema:
    ${JSON.stringify(databaseSchema)}
    The user query is:
    ${query}
    Transform the user query in a Postgresql SQL query based on the provided database schema.
    Prioritize the use of case insensitive SQL queries using the ILIKE operator.
    Limit the returned records to 100.
  `;

  try {
    return await ollama.generate({
      model: sqlModel,
      system: 'Please keep your answer as brief as possible. Do not add comments to your answer.',
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

async function generateResponse(query, toolResult) {
  const chatQuery = `
    This is our conversation so far:
    ${JSON.stringify(chatMessages, null, 2)}
    This is the user question:
    ${query}
    Database result based on the user question:
    ${JSON.stringify(toolResult)}
    The database result are already displayed to the user, so you don't need to repeat it in your answer.
    Do not answer with your internal knowledge.
  `;

  try {
    return await ollama.generate({
      model: mainModel,
      system: 'The database results are always related to the user question.',
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
      const toolResponse = await getToolResponse(query);

      if (toolResponse) {
        const cleanedResponse = cleanDBResponse(toolResponse.response);
        console.log(`Database SQL query:\n${cleanedResponse}\n`);
        const toolResult = await queryDB(cleanedResponse);
        console.log(`Returned results from the database:`);

        if (Array.isArray(toolResult)) {
          toolResult.forEach((row, index) => {
            console.log(`${index + 1}. ${JSON.stringify(row)
              .replace(/\{|\}|"/g, '')
              .replace(/,/g, ', ')
              .replace(/:/g, ': ')
              .replace(/(\b[a-z])/g, char => char.toUpperCase())}`);
          });
        } else {
          console.log("Error in the SQL expression.");
        }

        const stream = await generateResponse(query, toolResult);

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
