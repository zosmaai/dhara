# Security Policy

## Reporting a Vulnerability

Dhara is security-sensitive software — it executes arbitrary code on your machine.
We take security seriously.

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, email us at **security@zosma.ai** with:

- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Any potential mitigations you've identified

You should receive a response within 48 hours. If you don't, follow up.

## Scope

Security reports are welcome for:

- Sandbox bypass (capability enforcement, path traversal, command injection)
- Extension isolation failures
- Session data exposure
- Authentication/token leakage
- Supply chain attacks

## Out of Scope

- LLM prompt injection (this is a feature of the system, not a vulnerability)
- DoS through large inputs (resource limits are a separate concern)
- Vulnerabilities in third-party LLM providers (report to them directly)

## Recognition

We maintain a security hall of fame for verified reports. Contributors who report
valid issues will be acknowledged (with permission).
