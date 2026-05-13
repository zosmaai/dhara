# @zosmaai/dhara-extension

TypeScript SDK for building Dhara extensions.

Handles the JSON-RPC 2.0 stdin/stdout protocol so you focus on your tool logic.

## Quick Start

```typescript
import { createExtension } from "@zosmaai/dhara-extension";

const ext = createExtension({
  name: "my-extension",
  version: "1.0.0",
  tools: [
    {
      descriptor: {
        name: "hello",
        description: "Say hello to someone",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name to greet" },
          },
          required: ["name"],
        },
      },
      handler: async (input) => ({
        content: [{ type: "text", text: `Hello, ${input.name ?? "world"}!` }],
      }),
    },
  ],
});

ext.run();
```

## Development

```bash
npm run build     # Compile TypeScript
npm run check     # Type-check only
npm test          # Run tests
```
