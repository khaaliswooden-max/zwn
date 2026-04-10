# Security Policy

## Supported Versions

The ZWM is currently deployed on **Solana devnet only**. No mainnet deployment exists
yet — a full security audit is required before that transition.

| Environment | Supported |
|---|---|
| Solana devnet | Yes |
| Solana mainnet | Not yet deployed |

---

## Reporting a Vulnerability

Do **not** open a public GitHub issue for security vulnerabilities.

Report privately by email:

**khaaliswooden@gmail.com**

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce (or a proof-of-concept if applicable)
- The affected component (`zuup-zwm-indexer`, a specific platform program, frontend, etc.)

You can expect an acknowledgement within **48 hours** and a resolution timeline within
**7 days** for critical issues.

---

## Secrets and Key Management

### What must never be committed

| Secret | Where it lives |
|---|---|
| `NEO4J_PASSWORD` | `zuup-zwm-indexer/.env` |
| Solana keypair (upgrade authority, admin) | Hardware wallet / local keyfile, never in repo |
| `ANTHROPIC_API_KEY` | `zwm-daily/.env` |
| Platform-specific API credentials | Per-platform `.env` |

All `.env` files are covered by `.gitignore`. Verify with `git status` before committing.
If a secret is accidentally committed, rotate it immediately and treat the old value
as compromised.

### Neo4j

- Change the default password (`neo4j`) before any shared deployment
- In production, restrict Neo4j's bolt port (7687) to localhost or a VPN — it must
  not be publicly reachable
- Use `NEO4J_AUTH` env var or AuraDB connection strings; never hardcode credentials

### Anchor upgrade authority

- The program upgrade authority keypair controls all on-chain program upgrades
- Store it in a hardware wallet (Ledger) before any mainnet deployment
- Consider transferring upgrade authority to a multisig (e.g., Squads Protocol) for
  production

---

## Solana-Specific Notes

### Program IDs

The devnet Program ID (`H1eSx6ij1Q296Tzss62AHuamn1rD4a9MkDapYu1CyvVM`) is intentionally
public — it must be known to connect to the program. This is not a secret.

Mainnet Program IDs will be different and will be published upon deployment.

### Pre-mainnet audit requirements

Before mainnet deployment, the following must be completed:

1. Full Anchor program audit covering:
   - PDA derivation and seed correctness
   - Account ownership and signer checks on every instruction
   - Integer overflow/underflow in score and amount fields
   - Re-entrancy and cross-program invocation safety
2. Penetration test of the ZWM indexer's REST API (port 3001) and GraphQL API (port 4000)
3. Review of the `X-ZWM-API-Key` authentication mechanism for the enterprise endpoints
4. Audit of ZUSDC mint/burn instruction logic (1:1 USDC collateral guarantee)

### Network exposure

The ZWM indexer services should **not** be exposed directly to the public internet:

- GraphQL API (`:4000`) — internal or VPN-only
- Enterprise REST API (`:3001`) — requires `X-ZWM-API-Key` header; rate-limit in production
- Neo4j bolt (`:7687`) — localhost or VPN only
- Platform ingest endpoints (`/zwm/ingest`) — internal service mesh only

The frontend (Next.js) is the only component intended for public internet exposure.
