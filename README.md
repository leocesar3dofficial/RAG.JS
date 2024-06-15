# RAG.JS

Retrieval-Augmented Generation (RAG), JavaScript project.

## How-to

Ollama and Chroma DB must be running.

### 1. Place corpus.txt besides the other files

This file contains the text to be embedded.

### 2. Process the embeddings

```bash
 node import.mjs
```

### 3. Query the vector database and let the LLM generate the answer

```bash
 node search.mjs <your query/question>
```
