# MIZAN R2 one-shot completion patch

This patch converts R2 readiness from the disposable `health.txt` probe to the permanent fail-closed delivery catalog `delivery/_mizan/catalog.json`.

The READY catalog is published only after all required verified datasets have been uploaded and measured below the configured safety ceiling. Required verified datasets are the six Uthmanic developer packages, Tafseer Muyassar, Ghareeb, Tajweed, exactly 604 Madinah delivery pages, and the four selected official audio sets (Hafs/Maher Al-Muaiqly, Shu'bah/Ali Al-Hudhaifi, Qalun/Ali Al-Hudhaifi, Al-Susi/Uthman Al-Siddiqi). Warsh audio is explicitly `OFFICIAL_AUDIO_UNAVAILABLE`; Al-Duri audio remains `UNVERIFIED` pending independent resolution of the official size discrepancy.

The full-ingest command is intentionally atomic at the readiness level: any missing, malformed, checksum-mismatched, quarantined, or over-budget required dataset prevents READY publication. Quran/media objects remain immutable and are resumed only when their stored SHA-256 matches exactly. A timestamped catalog snapshot is written before the mutable READY pointer.

No R2 credentials, private object URL, or secret values are added to frontend source. No deployment or upload was performed while producing this patch.

Validation performed locally on the patch:

- TypeScript check: PASS.
- Private R2 / ingest regression suite: 11 passed, 0 failed.
- Mushaf range and exact 604-page validation: PASS.
- Exact audio mapping / no cross-riwayah fallback: PASS.
- Checksum quarantine: PASS.
- Storage safety overflow rejection: PASS.
- Permanent READY catalog fail-closed behavior: PASS.
- R2 readiness bound to `delivery/_mizan/catalog.json`: PASS.
