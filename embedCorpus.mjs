import ollama from 'ollama';
import { ChromaClient } from 'chromadb';
import {
  getFileText,
  getFileList,
  getConfig,
  chunkTextBySentences,
} from './utilities.mjs';

console.time('Elapsed time');
// Clear the console for a clean start
console.clear();

// Get configuration settings
const { embedModel, corpusPath, collectionName } = getConfig();

// Initialize the Chroma client
const chroma = new ChromaClient();

// Delete any existing collection with the same name
await chroma.deleteCollection({ name: collectionName });

// Get or create a new collection with specified metadata
const collection = await chroma.getOrCreateCollection({
  name: collectionName,
  metadata: { 'hnsw:space': 'cosine' },
});

// Get the list of files from the corpus directory
const fileList = getFileList(corpusPath);
console.log(`Embedding chunks for ${fileList.length} files:`);

// Process each file asynchronously
const promises = fileList.map(async (file, fileIndex) => {
  const documentContent = getFileText(`./${file}`); // Read the file content
  let chunks = chunkTextBySentences(documentContent, 8, 1); // Split content into chunks of n sentences with one overlaping sentence

  // Process each chunk in the file
  for (const [chunkIndex, chunk] of chunks.entries()) {
    // Get the embedding for the chunk using the specified model
    const embed = (
      await ollama.embeddings({ model: embedModel, prompt: chunk })
    ).embedding;

    // Add the embedding data into the collection
    collection.add({
      ids: [`${file}_${chunkIndex}`],
      embeddings: [embed],
      documents: [chunk],
    });

    const completionPercent = (chunkIndex / chunks.length) * 100;
    console.log(`${fileIndex + 1}. ${file}: ${completionPercent.toFixed()}%`);
  }
});

// Wait for all files to be processed
await Promise.all(promises);
console.log('\nSuccessfully embedded the files into the Vector Database.');
console.timeLog('Elapsed time');
