# MIZAN Protocol 1.0

MIZAN Protocol is a portable evidence package for independent verification of a competition snapshot without depending on the MIZAN UI.

The package binds competition identity, Competition Genome/policy hash, rule-set hash, result Merkle root where generated, integrity-envelope hashes, scientific evidence graph hash, audit head, Quran-source references, and package hash. A production package may additionally carry an institutional Ed25519 signature from the server trust signer.

The protocol deliberately does **not** claim that a rule is religiously or scientifically correct. It proves which approved/versioned material and operational evidence were used. It also does not make unpublished participant information public; selective result proofs can expose only the result being verified.

Public verification accepts exported JSON and validates supported package/proof structures locally. Institutional signature verification requires the configured server trust key.
