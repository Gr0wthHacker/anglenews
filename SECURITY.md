# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in AngleCheck, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email security concerns to the repository maintainers or use GitHub's private vulnerability reporting feature.

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- We will acknowledge receipt within 48 hours
- We will provide an initial assessment within 7 days
- We will work with you to understand and resolve the issue

## Scope

The following are in scope:
- Chrome extension code (content scripts, service worker, UI)
- Backend API server
- Data handling and privacy concerns
- XSS, injection, or other OWASP Top 10 vulnerabilities

The following are out of scope:
- Third-party dependencies (report to the upstream project)
- Social engineering attacks
- Issues in development/test environments only

## Security Design

- **No article text stored server-side** beyond the processing window
- **API keys** are never sent to the client; all news API calls happen server-side
- **Content script** only activates when the user clicks the extension icon
- **No browsing history** is tracked or transmitted
- **Bias ratings** are bundled locally in the extension (no external bias API calls from client)
- **Rate limiting** is enforced server-side to prevent abuse
