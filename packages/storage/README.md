# @avenire/storage - Demonstrating File Upload Integration

This README details the architecture of the `@avenire/storage` package, designed to showcase how file uploading capabilities were integrated into the Avenire ecosystem. It illustrates the use of the **UploadThing** service for managing file uploads, aiming for a smooth and efficient process. This package serves as a case study in integrating a third-party file management service into a modern web application.

The goal was to abstract the complexities of file handling, allowing developers to focus on application features rather than the underlying storage mechanisms.

## Core Functionality Demonstrated (Powered by UploadThing)

`@avenire/storage` was architected to provide both server-side control and client-side ease of use for file uploads:

### Server-Side Design (`index.ts`)

This file demonstrates the server-side setup for defining *what* could be uploaded and *how* it would be processed:

-   **`createUploadthing()` (aliased as `storage`):** This function is central to the server setup. It acts as a factory for defining different types of "uploadables" (referred to as "file routes").
-   **`FileRouter` and `createRouteHandler`:**
    -   A `FileRouter` serves as a blueprint for file uploads. It shows how to define various "endpoints," each specifying rules like file types (e.g., images, PDFs, videos), size limits, and even what actions could be triggered after an upload is complete (like logging metadata or updating a database).
    -   `createRouteHandler` then takes the `FileRouter` and demonstrates the creation of Next.js API route handlers (`GET`, `POST`) to make the defined file routes accessible from the client-side.
    
    *Note: For this server-side logic to function in a live environment, it would typically require API keys (e.g., `UPLOADTHING_SECRET`, `UPLOADTHING_APP_ID`) from the UploadThing service to be configured as environment variables.*

### Client-Side Integration Design (`client.ts`)

To illustrate easy integration of file uploads into React applications, `client.ts` re-exports components and hooks from the `@uploadthing/react` library. This demonstrates access to:

-   **`<UploadButton />`**: A simple, ready-to-use button component.
-   **`<UploadDropzone />`**: A more interactive component supporting drag-and-drop.
-   **`useUploadThing` Hook**: For more custom UI implementations, this hook shows how to access the core uploading logic.

These tools were chosen to exemplify how developers could quickly add powerful file upload capabilities.

### Next.js SSR Support Design (`ssr.ts`)

For Next.js applications (like `apps/web`), `ssr.ts` exports a `StorageSSRPlugin`. This illustrates a helper to ensure UploadThing could work smoothly with server-side rendering, providing a consistent user experience.

## Intended Role in the Avenire Platform

File management was envisioned as a cornerstone of a rich, interactive learning environment within Avenire. The `@avenire/storage` package demonstrates how users could have been empowered to:

-   Attach files to chat messages.
-   Upload materials for AI processing.
-   Add resources to courses.
-   Personalize their experience (e.g., avatars).

This design aimed to make content interaction versatile and straightforward, contributing to Avenire's vision of an empowering educational platform.

## Architectural Insights via Key Files

-   **`index.ts`**: Illustrates the server-side configuration (like `createUploadthing`) and exports necessary types and functions for defining file routes.
-   **`client.ts`**: Shows how client-side components and hooks from `@uploadthing/react` can be re-exported for easy integration into UI.
-   **`ssr.ts`**: Demonstrates the provision of a `StorageSSRPlugin` for seamless operation within Next.js server-side rendered applications.

## Illustrative Architectural Snippets

The following snippets are conceptual and illustrate the intended design patterns for integrating UploadThing. They are not runnable as-is and would require a proper UploadThing setup, including API keys, in a live environment.

### Defining a File Route (API Side - Conceptual)

This shows how a file like `apps/web/src/app/api/uploadthing/core.ts` might be structured:

```typescript
// // Example: apps/web/src/app/api/uploadthing/core.ts (Conceptual)
// import { storage, createRouteHandler, type FileRouter } from "@avenire/storage";
//
// // Alias for brevity
// const f = storage;
//
// // Define application's file routing configuration
// export const ourFileRouter = {
//   // Example: An endpoint for image uploads, max 4MB
//   imageUploader: f({ image: { maxFileSize: "4MB" } })
//     // Optional: Define what happens after a successful upload
//     .onUploadComplete(async ({ metadata, file }) => {
//       // console.log("Upload complete! User ID:", metadata.userId); 
//       // console.log("File URL:", file.url);
//       // Logic to save file URL to database would go here
//     }),
//
//   // Example: An endpoint for PDF documents, max 16MB
//   pdfUploader: f({ pdf: { maxFileSize: "16MB" } })
//     .onUploadComplete(async ({ metadata, file }) => {
//       // console.log(`PDF "${file.name}" uploaded successfully!`);
//     }),
//
// } satisfies FileRouter;
//
// export type OurFileRouter = typeof ourFileRouter;
//
// // Export the route handler generated by UploadThing
// export const { GET, POST } = createRouteHandler({
//   router: ourFileRouter,
//   // config: ({ req }) => ({ userId: getCurrentUserId(req) }) // Example metadata
// });
```

### Using the Upload Component (Client Side - Conceptual)

This illustrates how an upload button might be used in a React component:

```typescript
// // Example: In a React component (e.g., in apps/web) (Conceptual)
// import { UploadButton } from "@avenire/storage/client";
// import type { OurFileRouter } from "@/app/api/uploadthing/core"; // Adjust path
//
// export function MyAwesomeUploader_Conceptual() {
//   return (
//     <div>
//       <p>Conceptual Uploader</p>
//       <UploadButton<OurFileRouter>
//         endpoint="imageUploader" // Must match a key in 'ourFileRouter'
//         onClientUploadComplete={(res) => {
//           // 'res' would contain an array of uploaded file objects
//           // console.log("Files successfully uploaded (conceptual): ", res);
//           // if (res && res.length > 0) {
//           //   alert(`Conceptual Upload complete! File URL: ${res[0].url}`);
//           // }
//         }}
//         onUploadError={(error: Error) => {
//           // alert(`Conceptual Error: ${error.message}`);
//         }}
//       />
//     </div>
//   );
// }
```
These snippets are for understanding the intended API and component usage within the Avenire architecture.

This README provides an overview of the `@avenire/storage` package's design, illustrating its file upload integration strategy using UploadThing for educational and demonstrative purposes.
