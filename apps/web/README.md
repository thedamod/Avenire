# Web Application (apps/web)

## Overview

The `apps/web` application serves as a demonstration of a feature-rich Next.js platform, originally conceived for learning, research, and interactive experiences. It showcases the capabilities of Next.js with the App Router and how Turbopack could be utilized for an enhanced development workflow, aiming for fast refresh rates and build times. This README details its architecture and the functionalities it was designed to exhibit.

## Key Features Demonstrated

This application was built to showcase a variety of features, including:

-   **User Authentication**: Illustrates a robust user authentication system with login, registration, and password management, powered by the `@avenire/auth` package. This demonstrates how secure access and user identity could be managed.
-   **Dashboard**: Features a user dashboard design, prominently using components like the `course-card` to show how relevant information could be displayed to a user.
-   **Advanced Chat Interface**: Presents a sophisticated chat interface design, demonstrating support for:
    -   Markdown and KaTeX for rich text formatting and mathematical notations.
    -   File attachments and multimodal input capabilities.
    -   An AI-powered "deep research" feature to exemplify enhanced information gathering.
    -   Integration with the Desmos graphing calculator.
-   **User Settings**: Includes a dedicated section to show how users could manage their preferences and application settings.
-   **File Uploading**: Demonstrates seamless file uploading functionality using `@uploadthing/react`.
-   **Theming**: Exhibits support for multiple themes (e.g., dark/light mode) as managed by `next-themes`.

## Tech Stack

The application's architecture is based on a modern and powerful tech stack:

-   **Next.js (App Router)**: For server-side rendering, routing, and overall application structure.
-   **React**: For building dynamic and interactive user interfaces.
-   **TypeScript**: For static typing, improving code quality and maintainability.
-   **TailwindCSS**: A utility-first CSS framework for rapid UI development.
-   **Zustand**: For lightweight and flexible state management.
-   **`@avenire/ui`**: A shared UI component library for a consistent look and feel.

## Project Structure

The `apps/web` directory is organized as follows:

-   `src/app/`: Contains all the pages and API routes, following Next.js App Router conventions. Key subdirectories include:
    -   `(auth)`: Routes related to user authentication.
    -   `(chat)`: Routes and components for the chat interface.
    -   `(dashboard)`: Routes and components for the user dashboard.
-   `src/components/`: Houses reusable React components used throughout the application.
-   `src/lib/`: Contains utility functions and helper modules.
-   `src/actions/`: Includes server-side actions, typically used for form submissions and data mutations.
-   `src/stores/`: Zustand state management stores are defined here.
-   `public/`: Stores static assets like images, fonts, etc.

## Configuration

Key configuration files for the application:

-   `next.config.ts`: Next.js specific configurations, including plugin settings and build options.
-   `postcss.config.mjs`: Configuration for PostCSS.
-   `src/app/globals.css`: Tailwind v4 imports, theme tokens, and global styles.

This README provides a comprehensive overview of the `apps/web` application's design and architecture, intended for study and understanding of its construction.
