# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-06

First public release.

### Added
- Five step wizard: import, details, template, job posting, download.
- PDF import with pdf.js running in the browser, plus heuristics that sort the extracted text into
  name, contact details, summary, skills, experience, projects, education and languages.
- Parser view showing the plain text an applicant tracking system extracts from the document.
- Job posting analysis separating required from preferred terms using the posting's own headings and
  cues, with a match rate against the required set and one click to add a missing term.
- Alias collapsing, so Kubernetes and K8s count as one requirement rather than two.
- Three single column templates: Classic, Compact and Open.
- JSON export and import, carrying the photo with it.
- Optional photo, off by default, with a note on where it is and is not the local convention.
- A4 printing through the browser, which keeps a real text layer in the PDF.
- Structured data for SoftwareApplication, HowTo, FAQPage and Person, plus `llms.txt`.

### Deliberately not included
- Hidden keywords in white text, and hidden instructions aimed at AI screeners. The reasoning is in
  the README.
