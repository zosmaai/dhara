#!/usr/bin/env bash
# Dhara test extension — echo tool
# A minimal JSON-RPC extension that proves the protocol works.
# Handles: initialize, tools/execute, shutdown

set -e

EXTENSION_NAME="echo-tool"
EXTENSION_VERSION="1.0.0"

while IFS= read -r line; do
  # echo the request to stderr so we can see what's happening
  # (stderr is for debug, stdout is for JSON-RPC)
  
  # Parse the method and id using basic shell JSON parsing
  method=$(echo "$line" | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    console.log(d.method || '');
  " 2>/dev/null || echo "")
  
  msg_id=$(echo "$line" | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    if (d.id !== undefined) console.log(d.id);
  " 2>/dev/null || echo "null")

  case "$method" in
    "initialize")
      cat <<-ENDRESPONSE
{"jsonrpc":"2.0","result":{"protocolVersion":"0.1.0","name":"${EXTENSION_NAME}","version":"${EXTENSION_VERSION}","tools":[{"name":"echo","description":"Echo back the input","parameters":{"type":"object","properties":{"message":{"type":"string"}},"required":["message"]},"capabilities":[]}]},"id":${msg_id}}
ENDRESPONSE
      ;;
      
    "tools/execute")
      # Echo back the input message
      message=$(echo "$line" | node -e "
        const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
        console.log(d.params.input.message || 'no message');
      " 2>/dev/null || echo "parse error")
      
      cat <<-ENDRESPONSE
{"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"echo: ${message}"}]},"id":${msg_id}}
ENDRESPONSE
      ;;
      
    "shutdown")
      cat <<-ENDRESPONSE
{"jsonrpc":"2.0","result":{"status":"ok"},"id":${msg_id}}
ENDRESPONSE
      exit 0
      ;;
      
    "")
      # It's a response from the core being echoed back to us, or parse error
      # Just ignore
      ;;
  esac
done

exit 0
