# Localization

Architecture is RTL/LTR from the start. Arabic and English are the current operational UI languages. The type/config layer is ready for additional locale dictionaries.

Production locale work must cover:
- language dictionaries instead of hard-coded component strings;
- timezone-aware exact dates;
- local number/date formats;
- longer French/Turkish labels and Urdu/Persian RTL testing;
- terminology overrides per competition (committee/panel, branch/category, prompt/opening).
