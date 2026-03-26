<p align="center">
<img height=80 src="https://github.com/thedamod/Avenire/blob/main/apps/web/public/branding/avenire-logo-full.png?raw=true">
</p>

# Avenire: Illuminate Your Learning & Research Journey

Welcome to Avenire, a project showcasing the architecture and features of a platform designed to revolutionize how one might learn, conduct research, and create compelling educational content. Its mission was to empower users—students, educators, researchers, or lifelong learners—with intelligent, AI-driven tools to transform complex information into profound understanding. This repository serves as a look into Avenire's design and implementation.

Avenire was conceived around the synergy of human intellect and artificial intelligence, aiming for an intuitive, supportive, and powerful platform experience. This codebase reflects that design philosophy.

## What's Inside This Monorepo?

This Avenire project is organized as a **Turborepo** monorepo. This structure was chosen to manage its applications and shared packages efficiently, ensuring consistency and accelerating development. Here's an overview of its components:

### Applications (`apps/`)

These are demonstrative applications showcasing how the Avenire vision could be realized:

-   **`web`**: The `web` application, built with Next.js, demonstrates how a user might interact with Apollo (the platform's AI assistant), engage with courses, and manage a dashboard. It showcases features like an advanced chat interface, user authentication, and file uploading, illustrating a suite of tools designed for deep learning and research.
    *   [Learn more about the design of `apps/web`](apps/web/README.md)

-   **`emails`**: This application manages email templates using React Email. It demonstrates how communications—from welcome messages to important notifications—could be handled in a clear, consistent, and engaging manner.
    *   [Learn more about the design of `apps/emails`](apps/emails/README.md)

### Core Packages (`packages/`)

These packages represent the foundational building blocks and shared logic designed for the Avenire platform:

-   **`@avenire/ai`**: This package was the engine for **Apollo**, Avenire's primary AI assistant. It's designed to manage various language models, employ sophisticated prompting strategies, and equip an AI with advanced tools like deep research capabilities and automated course generation.
    *   [Dive into the architecture of `@avenire/ai`](packages/ai/README.md)

-   **`@avenire/auth`**: Designed to provide robust and flexible authentication. It demonstrates support for email/password, social logins (Google, GitHub), and modern passkey (WebAuthn) authentication, showing how user accounts could be secured and made accessible.
    *   [Explore the design of `@avenire/auth`](packages/auth/README.md)

-   **`@avenire/database`**: The conceptual data backbone, designed with Drizzle ORM and PostgreSQL. It shows how user information, chat histories, course content, and application settings could be securely stored, ensuring data integrity and fast access.
    *   [Understand the structure of `@avenire/database`](packages/database/README.md)

-   **`@avenire/emailer`**: This package handles the reliable delivery of transactional emails. It illustrates how account verifications and notifications could be managed.
    *   [Discover the design of `@avenire/emailer`](packages/emailer/README.md)

-   **`@avenire/storage`**: Manages file uploads, powered by UploadThing. This demonstrates how users could enrich learning materials, research documents, and collaborative efforts with various media types.
    *   [Check out the architecture of `@avenire/storage`](packages/storage/README.md)

-   **`@avenire/ui`**: The source of Avenire's consistent user interface design. Built using the Shadcn UI methodology, it provides a comprehensive set of accessible and customizable components, illustrating how Avenire aimed for a pleasant user experience.
    *   [See the component design of `@avenire/ui`](packages/ui/README.md)

-   **`@avenire/typescript-config`**: Contains shared TypeScript configurations, demonstrating a commitment to code consistency and quality across the monorepo.

## Exploring the Architecture

This repository is primarily intended for those interested in understanding the architecture and implementation details of a complex, AI-driven web application. You are encouraged to:

-   **Browse the code:** Explore how different features are implemented across the applications and packages.
-   **Study the interactions:** See how various components and services are designed to work together.
-   **Refer to package READMEs:** Each package has its own README detailing its specific role, key modules, and design choices. These are valuable resources for a deeper architectural understanding.

While the code is available for review, please note the licensing terms below. Direct setup and execution of the project may require significant configuration of environment variables and external service integrations, which are not detailed here as the project is for demonstrative purposes.

## Key Technologies Used

Avenire was designed and built with a modern, powerful, and scalable technology stack:

-   **TypeScript**: For robust static typing and improved code quality.
-   **Next.js (App Router)**: For our primary web application, enabling server-side rendering, advanced routing, and a great developer experience.
-   **Turborepo**: For efficient monorepo management, build caching, and task orchestration.
-   **React**: For building dynamic and interactive user interfaces.
-   **Drizzle ORM & PostgreSQL**: For our database layer, providing type-safe database access.
-   **AI / Machine Learning**:
    -   Vercel AI SDK: For integrating and managing AI model interactions.
    -   Various model providers (Google Gemini/Gemma, OpenRouter, Groq) to power Apollo.
-   **Tailwind CSS**: For utility-first CSS styling, enabling rapid UI development.
-   **Shadcn UI**: Methodology for building our component library, based on Radix UI primitives.
-   **Resend**: For sending transactional emails.
-   **UploadThing**: For handling file uploads.
-   **pnpm**: As the package manager used across this monorepo.

## License

© 2024 The Avenire Project Developers. All Rights Reserved.

The Avenire project source code is made available for educational and demonstrative purposes. Please see the [LICENSE](LICENSE) file for detailed terms and conditions regarding its use.

---

Thank you for your interest in Avenire. We're thrilled to have you join us on this journey to reshape the future of learning and research!
