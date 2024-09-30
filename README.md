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
 node queryAI.mjs
```
Beyond the possibility of querying the vector database.You also can use several tools:

- Calculator,
- Query the contents of a given URL.
- Get the current weather from a city name.

### 4. Query the relational database with the LLM

```bash
 node queryDBNL.mjs
```

The LLM receives the database schema and the user can ask questions based on the available tables.

