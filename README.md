# RAG.JS

![RAG](/2024-06-17%20RAG.png)

_Retrieval-Augmented Generation (RAG), JavaScript project._

## How-to

- Ollama and Chroma DB must be running.
- Change the embed or the answer model in the config.json file.

### 1. Place corpus \*.txt files in the ./corpus directory

This directory holds the text files to be embedded.

### 2. Process the embeddings

```bash
 node embedCorpus.mjs
```

### 3. Query the vector database and let the LLM generate the answer

```bash
 node queryRAG.mjs
```
