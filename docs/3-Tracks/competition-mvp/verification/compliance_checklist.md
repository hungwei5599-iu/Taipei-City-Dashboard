# Compliance Checklist

Last updated: 2026-05-01

## Competition Compliance

- [ ] Work starts from the official fork.
- [ ] Demo runs locally and does not require external deployment.
- [ ] At least four dual-city components are present.
- [ ] At least one Mapbox spatial layer is present.
- [ ] Taipei / Metro-Taipei switching changes data and text.
- [ ] Data sources are open, documented, and traceable.
- [ ] Charts use ApexCharts only.
- [ ] AI uses `llama3.3-ffm-70b-16k-chat` through TWCC proxy only.
- [ ] Frontend does not call AI providers directly.
- [ ] API keys are environment-managed and not committed.
- [ ] No unapproved npm or Go package is added.
- [ ] Commit history reflects real verifiable units.

## PM Signoff

- [ ] The dashboard can be explained without slides.
- [ ] AI is explanatory and removable.
- [ ] Each AI claim points to data evidence.
- [ ] The implementation can be split into a future official PR.
