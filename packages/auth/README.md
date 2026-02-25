# @avenire/auth - Authentication Package

## Overview

The `@avenire/auth` package was designed to provide a comprehensive authentication solution for the Avenire monorepo. This README details its architecture, showcasing how it leveraged the `better-auth` library to offer a wide range of authentication methods and user management features. It demonstrates how this package was intended to integrate with other Avenire services, such as `@avenire/database` for data persistence and `@avenire/emailer` for transactional email communication, providing a case study in building a modular authentication system.

## Core Features Demonstrated

This package illustrates the design and implementation of several key authentication features:

### Authentication Methods

-   **Email & Password:** Demonstrates secure user registration and login using email and password, including mandatory email verification to ensure user validity.
-   **Social Logins:** Showcases integration with providers like Google and GitHub, allowing users to sign up or log in using their existing social accounts. (Actual integration would require obtaining API keys and configuring OAuth credentials with these providers).
-   **Passkeys (WebAuthn):** Illustrates passwordless authentication using WebAuthn, demonstrating how users could log in with biometric data or hardware security keys for enhanced security. (This would typically require configuration of trusted origins and relying party identifiers).

### Session Management

The package architecture shows how user sessions could be handled, likely utilizing JWTs (JSON Web Tokens) managed by `better-auth`. It also suggests how session data might be stored or cached in a secondary storage solution like Redis for quick retrieval and validation in a production environment (requiring a Redis instance and connection details).

### User Account Management

-   **Account Creation:** Demonstrates how new user sign-ups could be handled, including the creation of associated user settings in the database.
-   **Account Deletion:** Shows functionality for users to delete their accounts, typically involving a verification step via email.
-   **Account Linking:** Illustrates support for linking multiple authentication methods (e.g., Google, GitHub) to a single user account.

### Email Integration

The design shows how `@avenire/auth` leverages `@avenire/emailer`, which renders templates from `@avenire/emails`, to send transactional emails such as welcome emails, verification links, password reset emails, and account deletion confirmations.

### Database Integration

This package demonstrates integration with `@avenire/database` (which utilizes Drizzle ORM), using the `drizzleAdapter` from `better-auth` to interact with the database for storing user credentials, sessions, and related account information. It also shows how user settings could be automatically created in the database upon a new user's sign-up.

### Secondary Storage (Conceptual)

The use of Redis as a secondary storage solution is conceptualized for caching session information, storing temporary tokens, or managing other short-lived authentication-related data to improve performance and scalability.

## Architectural Insights via Key Files & Modules

Examining these files offers understanding of the authentication system's structure:

-   **`server.ts`**: This file is central to the backend authentication logic. It demonstrates how a `better-auth` instance would be configured, including authentication plugins (Email/Password, Google, GitHub, Passkeys), the `drizzleAdapter` for database interaction, email sending logic via `@avenire/emailer`, and the conceptual setup for social media providers. It exports the configured `auth` object, designed to handle API requests.

-   **`client.ts`**: Illustrates the client-side interface for React applications. It exports `createAuthClient`, which in turn provides React hooks like `useSession` (to access session state) and functions for UI interactions such as `signIn`, `signOut`, and passkey registration/authentication flows.

-   **`middleware.ts`**: Contains the design for a Next.js middleware (`authMiddleware`). This middleware's purpose was to protect routes by verifying the user's session status, redirecting or allowing access accordingly.

-   **`components/`**: This directory showcases pre-built React UI components that exemplify how authentication features could be rapidly integrated into front-end applications. These include:
    -   `login.tsx`: A component demonstrating a user login form.
    -   `register.tsx`: A component demonstrating a user registration form.
    -   `change-password.tsx`: A component demonstrating a form for users to change their password.
    -   `icons.tsx`: Contains icon components, likely used within the auth UI elements, showcasing how visual elements can be organized.

## Architectural Implementation Notes

### Backend Logic (`server.ts`)

The `server.ts` file's configuration of the `auth` object from `better-auth` is key to understanding the backend. This object was intended to be used for creating API route handlers that process all authentication requests (login, logout, OAuth callbacks, etc.).

### Frontend Integration (`client.ts` & `components/`)

The `client.ts` module and the UI components in `components/` demonstrate how a React-based frontend could interact with the authentication system. `createAuthClient` provides hooks and functions for managing session state and triggering auth flows, while the components offer examples of auth-related UI elements.

### Middleware for Route Protection (`middleware.ts`)

The `authMiddleware` in `middleware.ts` illustrates a common pattern for protecting application routes in a Next.js environment. Its design shows how to intercept requests, check authentication status, and manage access control.

## Note on `index.ts`

The `package.json` for `@avenire/auth` may specify `index.ts` as its main module entry point. However, based on the available file structure, the primary functionalities are exposed through `server.ts` (for backend setup) and `client.ts` (for frontend integration). For architectural study, these files are the most relevant.

This README provides an overview of the `@avenire/auth` package's design, illustrating how its authentication mechanisms, integrations, and UI components were architected within the Avenire project for educational and demonstrative purposes.
