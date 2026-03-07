---
type: note
status: active
tags:
  - avenire
  - apollo
  - development
created: 2026-02-21
updated: 2026-02-21
source:
topic:
---
# Avenire Goals and Logs
## Summary
Avenire is an interactive reasoning-first learning system that ingests heterogeneous knowledge (text, PDFs, videos), converts it into structured semantic memory, and delivers adaptive, explorable explanations with embedded interactivity, spaced repetition, and generated visualizations.  
The core philosophy: **understanding through interaction, not passive consumption.**
Primary pillars:
1. High-fidelity ingestion → unified knowledge graph
2. Agentic reasoning harness → deep, tool-augmented answers
3. Interactive explanation layer → graphs, simulations, videos
4. Memory & retention → FSRS-powered spaced repetition
5. Fully in-browser + low-latency UI streaming

## Key Ideas
- [ ] Ingestion Pipeline
	- [ ] [[Mistral OCR]]
	- [ ] [[Cobalt Video Saver]]
	- [ ] [[Cohere Embedding]]
- [ ] Agent orchestration
	- [ ] [[Tavily]]
	- [ ] [[Introducing Sarvam Arya]]
	- [ ] RAG
	- [ ] [[Jigsaw Stack Deep Research]] Writing our own tool based on this
	- [ ] [[Bash Tool]] & [[Just Bash]] (Optional)
- [ ] Spaced Repetition
	- [ ] [[FSRS]]
	- [ ] [[FSRS Helper]]
- [ ] UI Specs
	- [ ] [[Streamdown]]
	- [ ] [[Mermaid]]
- [ ] Video Generation
	- [ ] [[Manim Web]]
	- [ ] [[Video Generation DSL]]
- [ ] Interactivity
	- [ ] Desmos API
	- [ ] Static Plot generation using Matplotlib
	- [ ] [[Interactivity DSL]]


## Details / Explanation
### 1. Ingestion Pipeline
Goal: Convert raw multimodal sources into structured, queryable semantic memory.
Flow:
```
Raw Input (PDF / Image / Video / Web)  
        ↓  
OCR / Transcript / Metadata Extraction  
        ↓  
Chunking + Semantic Cleaning  
        ↓  
Embeddings + Indexing  
        ↓  
Knowledge Store (Vector + Structured Graph)
```

Components:
- **Mistral OCR** → High-quality parsing for textbooks, notes, scanned PDFs
- **Cobalt Video Saver** → Download + segment educational videos, extract transcripts + timestamps
- **Cohere Embedding** → Dense semantic embeddings for deep retrieval and reasoning

Output:
- Unified multimodal knowledge base
- Timestamp-aware video chunks
- Concept-linked chunks (precursor to concept graph)
Future Extension:
- Concept extraction → build a prerequisite graph automatically
---
### 2. Agent Orchestration (Core Intelligence Layer)
Goal: A reasoning harness that dynamically composes tools instead of just generating text.
Architecture Concept:
```
User Query  
   ↓  
Planner LLM (decides tools & DAG)  
   ↓  
Tool Execution Graph (parallel/serial)  
   ↓  
Context Aggregation  
   ↓  
Final Reasoned Explanation
```
Components:
- **Tavily** → Real-time web search grounding
- **RAG** → Retrieval over ingested semantic memory
- **Jigsaw-style Deep Research Tool** → Multi-hop synthesis + citation-backed reasoning
- Optional:
    - Bash Tool / Just Bash → code execution for simulations, calculations, derivations

Key Principle:  
Not a simple orchestrator — a **reasoning DAG executor** similar to Sarvam Arya but customized for education-first workflows.

---
### 3. Spaced Repetition (Memory Engine)
Goal: Convert understanding into long-term retention.
Components:
- **FSRS** → Adaptive scheduling based on recall difficulty
- **FSRS Helper** → Generate cards automatically from explanations
```
Flow:

Explanation Generated  
        ↓  
Concept Extraction  
        ↓  
Flashcard Generation (Q/A, Cloze, Graph-based)  
        ↓  
FSRS Scheduling
```
Unique Edge:  
Cards are derived from _reasoning traces_, not static notes.

---
### 4. UI Specs (Explanation Surface)
Goal: Make reasoning explorable, not static.
Components:
- **Streamdown** → Progressive markdown streaming with structure
- **Mermaid** → Render concept graphs and pipelines
UX Philosophy:
- Answers unfold progressively
- Each step is expandable/collapsible
- Users can “zoom into reasoning”

---
### 5. Video Generation
Goal: Convert explanations into dynamic visual intuition.
Components:
- **Manim Web** → Programmatic mathematical animations in-browser
- **Video Generation DSL** → High-level spec language:
    ```
    animate: derivative of sin(x)  
    show: tangent line evolving  
    highlight: slope change
    ```
Purpose:  
Bridge symbolic reasoning → visual mental models.

---
### 6. Interactivity Layer (Core Differentiator)

Goal: Every explanation should be _playable_.
Components:
- **Desmos API** → Real-time interactive graphs
- **Matplotlib (static plots)** → deterministic visual snapshots
- **Interactivity DSL** → Declarative spec for simulations
Example DSL:
```
graph:  
  function: sin(x)  
  slider: amplitude [0, 5]  
  animate: true
```
This turns explanations into experiments.

---
## Suggested Development Phases
### Phase 1 — Core Intelligence
- Ingestion pipeline
- RAG + Tavily
- Planner + tool harness

### Phase 2 — Interactive Explanations
- Streamdown renderer
- Desmos + Mermaid integration
- Interactivity DSL

### Phase 3 — Memory System
- FSRS integration
- Auto card generation

### Phase 4 — Visual Intelligence
- Manim Web integration
- Video DSL execution

---
## Open Questions / Decision Logs to Add
- Should reasoning traces be fully visible or selectively abstracted?
	Visible
- Do we persist tool DAG outputs for future retrieval?
	No
- Should video generation be async background jobs or inline streaming?
	Background
