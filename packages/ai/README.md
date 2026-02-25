# @avenire/ai - AI Functionality Package

## Overview

The `@avenire/ai` package was designed as the central hub for all Artificial Intelligence (AI) functionalities within the Avenire platform. This README details its architecture, showcasing how the AI persona "Fermion" was conceptualized, how a suite of language models was intended to be managed, and how the AI would be equipped with tools for in-depth research, mathematical graphing, and automated course generation. This package demonstrates the design of a core AI engine for other applications in the Avenire ecosystem.

## Core Features Demonstrated

### AI Persona "Fermion"

Fermion was the designated AI persona for the Avenire platform. The design characterized Fermion as an eccentric yet helpful assistant, particularly adept at providing clear explanations and generating code. Fermion's core behavior and instructions were primarily defined by the `ATLAS_PROMPT` system prompt, illustrating how a consistent AI personality could be established.

### Language Model Management

The package demonstrates a system for managing access to various language models through a custom AI model provider named `fermion` (defined in `models/index.ts`). This provider was designed to abstract and manage access to different underlying language models, optimizing for various tasks:

-   **`fermion-sprint`**: Showcasing a model optimized for speed and quick responses.
-   **`fermion-core`**: Representing a balanced model for general tasks.
-   **`fermion-apex`**: Illustrating the integration of a powerful model for complex reasoning.
-   **`fermion-reasoning`**: Demonstrating a model specialized for logical reasoning.
-   **`fermion-reasoning-lite`**: A lighter version of `fermion-reasoning` for resource-conscious reasoning tasks.

These abstracted models were intended to leverage several underlying services (such as those from Google, OpenRouter, and Groq). Accessing these services in a live environment would typically require API keys and specific environment configurations, managed externally to this codebase.

### Tools

Fermion was designed to be equipped with a set of tools to enhance its capabilities. This package demonstrates the implementation of such tools:

-   **`deepResearch`**: This tool was designed to enable Fermion to autonomously conduct comprehensive research. It illustrates how an AI could:
    -   Search the web for relevant information (conceptually using a service like Linkup).
    -   Extract detailed content from sources (conceptually using a service like Tavily).
    -   Analyze and synthesize the gathered information into a coherent research report.
    The `deepResearch` process was designed to stream its progress and would typically be invoked when the AI received the `DEEP_RESEARCH_PROMPT`.

-   **`graphTool`**: This tool demonstrates how LaTeX mathematical expressions could be visualized, likely for generating visual representations of equations for display on a frontend interface.

-   **`search` & `extract`**: These are foundational functions primarily designed for the `deepResearch` tool, showcasing how web searching (e.g., via Linkup SDK) and content extraction (e.g., via Tavily API) could be integrated.

### Course Generation

The package includes functionalities demonstrating automated course creation:

-   **`OUTLINE_GEN_PROMPT`**: A specialized prompt designed to instruct an AI to generate a structured outline for a new course.
-   **`COURSE_GEN_PROMPT`**: This prompt, when provided with a course outline, was designed to direct an AI to generate detailed course content, with output typically structured in JSON format (including lectures, quizzes, etc.).

### Vercel AI SDK

`@avenire/ai` makes extensive use of and re-exports the `ai` package (Vercel AI SDK). This demonstrates how the SDK could be used to integrate and manage AI model interactions, streaming, and tool usage within the application's architecture.

## Architectural Insights via Key Modules & Files

Understanding the structure of this package provides insight into its design:

-   `index.ts`: Serves as the main entry point, illustrating how key functionalities could be re-exported for consumption by other applications.
-   `models/index.ts`: Defines the custom `fermion` provider and shows how various abstracted AI models (e.g., `fermion-sprint`, `fermion-core`) could be configured.
-   `prompts/`: This directory houses various system prompts that demonstrate how an AI's behavior and task-specific instructions could be defined.
    -   `chat.ts`: Contains prompts related to general chat interactions, including `ATLAS_PROMPT` and `DEEP_RESEARCH_PROMPT`.
    -   `course_gen.ts`: Contains prompts like `OUTLINE_GEN_PROMPT` and `COURSE_GEN_PROMPT` for course generation.
-   `tools/`: Contains the implementation of tools available to the AI, showcasing how such tools can be structured.
    -   `deepResearch.ts`: Implements the `deepResearch` tool.
    -   `graph.ts`: Implements the `graphTool`.
    -   `search.ts`: Implements the `search` and `extract` functionalities.
-   `utils.ts`: Provides utility functions, such as message sanitization, demonstrating considerations for data integrity and security.

## Note on Dependencies and Environment

While this package demonstrates a sophisticated AI system, it's important to note that its full functionality in a live environment would depend on several external dependencies and correctly configured API keys for various AI services (e.g., Google, OpenRouter, Groq, Tavily, Linkup). These specifics are beyond the demonstrative scope of this README. Key dependencies used in the design included `@ai-sdk/*` libraries, the Vercel `ai` SDK, `@tavily/core`, `linkup-sdk`, and `zod` for schema validation.

This README provides an overview of the `@avenire/ai` package's design, illustrating how its AI functionalities, persona, and tool integrations were architected within the Avenire project.
