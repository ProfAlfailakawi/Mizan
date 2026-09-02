# MIZAN Quran Source Governance & Vault

## Absolute rule
Quranic text is never generated, repaired, or altered by an LLM. Production question drawing, display, alignment, and evidence must read from an institutionally approved Quran Source Vault.

## Current repository status
The repository contains **development fixtures only** so the workflow can be exercised. They are not represented as a scholarly certification, an official Mushaf release, or an approved production corpus. No checksum, council approval, or AI capability certification is fabricated.

Before production, the deploying organization must import its approved corpus and record, for each version:
- source/edition and riwaya/qira'a;
- immutable version ID and cryptographic checksum;
- reviewer/approving authority supplied by the organization;
- effective date and retirement date;
- allowed capabilities (human display, alignment, AI assistance, etc.);
- validation evidence for every AI capability claimed.

## Lifecycle
`Draft → Reviewed → Approved → Active → Retired`

Activation is a privileged scientific-governance action. Updating an active corpus creates a new version; it never mutates history. Competition sessions keep the source version that was active when their question set was committed.

## AI boundary
AI observations are advisory only. A model cannot introduce Quran text into the vault, silently correct a source, or deduct a score. A capability remains `Not certified` until the institution has supplied and approved validation evidence for the relevant riwaya and error class.
