# Demo Smoke Checklist

Last updated: 2026-05-01

## Smoke Path

- [ ] Dashboard route opens locally.
- [ ] Metro situation map renders at least one spatial layer.
- [ ] Trend/anomaly chart renders with non-empty data or a clear empty state.
- [ ] Taipei vs Metro comparison card renders with the selected metric.
- [ ] AI decision card returns either a structured summary or a visible fallback.
- [ ] City switch changes all relevant components.
- [ ] Source/fallback state is visible to the presenter.
- [ ] The 5-minute demo script can be completed without switching to slides.

## Failure Rule

If one component blocks the demo, remove or hide that component and keep the other completed components stable. Do not add unreviewed dependencies to rescue a demo failure.
