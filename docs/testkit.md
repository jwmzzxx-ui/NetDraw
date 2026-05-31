# NetDraw Testkit

The testkit generates deterministic large-system data for the 5000-cable validation path described in the research report.

## Data Shape

`generateSyntheticNetwork()` creates:

- Six physical layers: part, breakout, interface, control, switch, ipc.
- Five network classes: AC, DC, COMM, SIGNAL, SAFETY.
- One logical cable per synthetic interface row.
- Route-node chains with `averageRouteHop` route segments per cable.
- Optional redundancy groups through `redundancyRatio`.
- Optional loop/back-edge samples through `loopRatio`.

## Benchmark Command

Run the default 5000-cable benchmark:

```powershell
npm run benchmark
```

Customize the run:

```powershell
npm run benchmark -- --cables 5000 --hops 2 --redundancy 0.1 --loops 0.02 --out output/benchmark
```

The command writes:

- `benchmark-report.json`
- `benchmark-cables.csv`
- `benchmark-cables.xlsx`

## Sample Verification Command

Run the fixed valid and abnormal sample set:

```powershell
npm run verify:samples
```

The command treats normal samples as pass-required and treats committed abnormal samples as expected failures. It currently covers parser-level invalid rows, duplicate `row_id` validation, and broken route-resource paths.
The valid sample set also includes `samples/interfaces-aliases.csv`, which verifies rule-driven name aliases before graph ID generation, and `samples/routes-geometry.csv`, which verifies optional A* route completion.

The report includes initial overview adapter time, detail expansion adapter time, export time, peak heap, overview edge count, and detail edge count.

## Current Benchmark Scope

This benchmark is implemented with Vitest/Node-compatible adapters instead of Playwright. It verifies the same projection logic used by the React workbench, but it does not measure a real browser canvas paint. Browser-level timing should be added when Playwright or an equivalent browser runner is available in the project.
