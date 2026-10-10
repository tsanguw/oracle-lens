# Security policy

Oracle Lens is a free, non-commercial fan project: a read-only stats site over public data, with no accounts and no user data stored. That keeps the attack surface small, but reports are still welcome.

## Reporting a vulnerability

Please report privately. Do not open a public issue for a security problem.

1. Go to the repository's [Security tab](https://github.com/tsanguw/oracle-lens/security).
2. Choose **Report a vulnerability** ([direct link](https://github.com/tsanguw/oracle-lens/security/advisories/new)).
3. Describe what you found, how to reproduce it, and what it affects.

This is a personal project, so there is no service-level agreement. I aim to acknowledge a report within a week and to fix real problems promptly, and I will credit you in the fix if you want that.

## What is in scope

- The live site at [oracle-lens.pages.dev](https://oracle-lens.pages.dev) and its API
- The code in this repository, including the sync and the GitHub Actions workflows
- Anything that exposes a secret, a private address, or data that should not be public

## What is out of scope

- The services this project runs on (Cloudflare, Render, Neon, GitHub) and the data providers (Leaguepedia, Riot Games): report those to the owners
- Denial of service, load testing and scraping. The API runs on a free tier and is rate limited, so please do not stress it
- Missing hardening that has no demonstrated impact, and findings from automated scanners with no proof of exploitation
- Social engineering and physical attacks

## How the project handles security

The README's [Security section](README.md#security) describes what is in place: parameterised queries, rate limiting, an enforced content security policy, a secret scan on every push, and read-only workflow permissions.

If you find a secret in this repository or its history, please report it privately as above so it can be rotated before anything else is done.
