# @avenire/emailer - Email Sending Service

## Overview

The `@avenire/emailer` package was designed as the centralized email sending service for the Avenire monorepo. This README details its architecture, showcasing how it provided a streamlined way to send transactional and other types of emails. The package uses **Resend** for transport and integrates with `@react-email/components` for rendering HTML templates sourced from `@avenire/emails`. This serves as a case study in architecting a modular email sending system.

## Core Functionality Demonstrated

### `Emailer` Class Design

The `Emailer` class was designed to be responsible for configuring the email transport mechanism and sending emails.

-   **Constructor (`new Emailer()`):**
    The `Emailer` instance initializes a Resend client using environment configuration (`RESEND_API_KEY`, `EMAIL_FROM`). This demonstrates a centralized and consistent email sending configuration.

-   **`send({ to, subject, html, from?, replyTo? })` Method Design:**
    This asynchronous method sends email using the configured Resend client. Parameters include recipients, subject, html body, and optional sender/reply-to overrides.

### `renderEmail(reactElement: React.ReactElement, options?: RenderOptions)` Function Design

This function demonstrates how a React element (typically an email template component from `@avenire/emails`) is converted into an HTML string. It uses the `render` function from `@react-email/components`.
-   `reactElement`: The React component representing the email template.
-   `options` (optional): Options for the rendering process, as defined by `@react-email/components`.

## Key Technologies & Design Choices

The architecture of `@avenire/emailer` showcases the use of specific technologies to achieve its goals:

-   **`resend`**: Used as the delivery provider for transactional emails.
-   **`@react-email/components`**: Utilized for its utility (`render`) in converting React components into HTML email markup, allowing for modern development practices in email design.
-   **Integration with `@avenire/emails`**: The design relies on the `@avenire/emails` app package to supply the React components for email templates, demonstrating a separation of concerns between template design and email sending logic.
-   **Shared TypeScript Configuration (`@avenire/typescript-config`)**: The use of a shared TypeScript configuration illustrates a commitment to code consistency and quality across the monorepo.

## Conceptual Design Pattern: Usage Example

The following conceptual snippet illustrates how another package (e.g., `@avenire/auth` for sending a welcome email) was intended to use the `@avenire/emailer` components:

```typescript
// Conceptual Design Pattern: Example of sending a welcome email
// import { Emailer, renderEmail } from "@avenire/emailer";
// import { WelcomeUserMessage } from "@avenire/emails"; // Template from @avenire/emails

async function sendWelcomeEmail_conceptual(userEmail: string, userName: string) {
  // In a live system, the Emailer constructor would use configured
  // SMTP details (host, port, auth) to initialize the transporter.
  // const emailer = new Emailer();

  // Render the React email template to an HTML string
  // const emailHtml = renderEmail(
  //   WelcomeUserMessage({ name: userName }) // Pass props to the template
  // );

  // The send method would then dispatch the email.
  // await emailer.send(
  //   "Avenire Platform <hello@avenire.com>",
  //   [userEmail],
  //   "Welcome to Avenire!",
  //   emailHtml
  // );
  // Actual error handling and logging would be implemented here.
}

// Conceptual invocation:
// sendWelcomeEmail_conceptual("newuser@example.com", "Jane Doe");
```
This example highlights the intended flow: instantiate an `Emailer`, render a template from `@avenire/emails` to HTML using `renderEmail`, and then use the `emailer.send` method to dispatch it.

This README provides an overview of the `@avenire/emailer` package's design, illustrating its email sending architecture, choice of technologies, and integration patterns for educational and demonstrative purposes.
