# hello-extension

Minimal Dhara extension demonstrating the JSON-RPC 2.0 stdin/stdout protocol.

Registers two tools:
- `hello` — says hello to a name
- `echo` — echoes back a message

## Try It

```bash
# Start the extension
node examples/hello-extension/index.js
```

In another terminal:

```bash
# Initialize
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"0.1.0","capabilities":{"tools":true}},"id":1}' | nc localhost ...

# Or pipe manually:
printf '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"0.1.0","capabilities":{"tools":true}},"id":1}\n{"jsonrpc":"2.0","method":"tools/execute","params":{"toolName":"hello","input":{"name":"Dhara"}},"id":2}\n' | node examples/hello-extension/index.js
```

## Install

Copy to `~/.dhara/extensions/hello-extension/` and Dhara loads it automatically.
