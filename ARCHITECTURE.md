# MIZAN System Architecture

## Architecture Overview

```
[ Clients: JudgeOS / Kiosk / Admin / Participant / Broadcast ]
                        │
                        ▼ (HTTPS / WSS / REST)
       [ MIZAN Gateway / Express API Layer ]
                        │
    ┌───────────────────┼───────────────────┐
    ▼                   ▼                   ▼
[ Queue & Flow ]  [ FairDraw Engine ]  [ Scoring Engine ]
    │                   │                   │
    └───────────────────┼───────────────────┘
                        ▼
         [ Verified Quran Vault (SHA256) ]
                        │
                        ▼
      [ Cryptographic Audit Trail (Append-Only) ]
```

## Resilience & Fault Isolation
- **Edge Continuity**: If the cloud or internet connection drops, on-site judging, audio recording metadata, and local queue sync persist locally.
- **Silent AI Decoupling**: AI serves solely as an integrity advisor; core judging and scoring proceed uninterrupted even during total AI service outages.
- **Human Authority**: Human judges alone determine scores. No AI deduction is ever applied automatically.
