# Offline & Edge

The local runtime persists state locally and the critical UX continues when cloud sync is disabled. Cloud synchronization is gated by real Firebase authentication.

Production competition-day target architecture:
1. Clients use an on-site edge service as the primary low-latency endpoint.
2. Critical domain events receive unique IDs and idempotency keys.
3. Events sync to cloud asynchronously.
4. Conflicts in sensitive entities are never resolved with blind last-write-wins.
5. AI, notifications, broadcast and analytics are non-critical subsystems; their failure does not stop judging.
6. Edge primary/standby, UPS and restore runbooks must be tested at the venue before launch.
