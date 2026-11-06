# Security Policy

## Supported version

The active development line is the v1 Beta branch. Security fixes should be applied to the active release line.

## Reporting a vulnerability

Please do not publish exploit details, credentials, personal data or an unpatched vulnerability in a public issue.

Contact the repository maintainer privately through GitHub's private vulnerability reporting feature when available, or another private channel already established with the maintainer. Include:
- A concise description of the affected component.
- The impact and conditions required to reproduce it.
- A minimal proof of concept that does not access other users' data.
- Any suggested mitigation.

Allow time for investigation and a fix before public disclosure.

## Security-sensitive areas

Nally handles Telegram identities, user-specific files, memories, schedules, webhook requests and external network content. Changes in these areas must preserve:
- User and conversation isolation.
- Workspace path containment and symlink protections.
- Webhook secret validation and private service binding.
- Strict tool argument validation and bounded execution.
- Safe handling of untrusted retrieved content.
- Secret redaction and least-privilege configuration.

Never commit tokens, API keys, database URLs, private user data or production logs containing secrets.
