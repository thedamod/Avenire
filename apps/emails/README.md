# Email Application (`apps/emails`)

## Overview and Purpose

This application demonstrates how email templates were managed within the Avenire platform, utilizing [`react-email`](https://react.email/) for creating maintainable and dynamic email designs. It showcases a structured approach to organizing and rendering email templates intended for various user communication scenarios.

The primary purpose of this module was to provide a centralized system for designing and building the HTML for emails, which would then be used by a separate email sending service (like `@avenire/emailer`).

## Demonstrated Email Templates

The following email template designs are available within this application, illustrating the types of communications handled:

-   `WelcomeUser`: For greeting new users upon registration.
-   `EmailVerification`: For sending email verification links.
-   `AccountDeletion`: For confirming account deletion requests.
-   `ChangePassword`: For notifications related to password changes.

## Design and Architecture

This application is structured to allow developers to build email templates as React components. The `.react-email/` subdirectory contains a development environment provided by `react-email` which allows for live previewing and building of these templates.

The core idea demonstrated is the separation of email design (React components) from the email sending logic. The output of this application (built HTML templates) would be consumed by another service responsible for the actual email dispatch.

## Key Technologies Demonstrated

The design and functionality of this email template management system showcase the use of:

-   **React (`react`)**: For building email templates as components.
-   **React Email (`react-email`)**: The framework used for creating, previewing, and building email templates.

## TypeScript Configuration

The project's TypeScript setup is governed by the shared configuration from `@avenire/typescript-config`, ensuring consistency with the rest of the Avenire monorepo.

This README provides an overview of the `apps/emails` application's design, illustrating how email templating was approached within the Avenire project.
