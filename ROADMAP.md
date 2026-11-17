# Roadmap

Stack: Electron + electron-vite, React 18, TypeScript (strict), Tailwind + shadcn/ui, accounts.json in userData (metadata only; see docs/ARCHITECTURE.md), i18next (en, pt-BR), Vitest + Playwright, electron-builder (NSIS .exe + portable zip), GitHub Actions.

| Phase | Scope | Agents | Status |
|---|---|---|---|
| 1 Feasibility | Integration study, risks, architecture (docs/FEASIBILITY.md) | main | ✅ Done |
| 2 Foundation | Scaffold, security baseline (contextIsolation, sandbox, CSP, fuses), typed IPC, lint/test/build | developer → security-reviewer, qa | ✅ Done |
| 3 Interface | Main window, sidebar, add/rename/remove account, switching, connection wizard, themes, i18n | ui-ux, qa | ✅ Done |
| 4 Core | AccountStore (JSON), SessionManager (partitions, lazy views, suspend), navigation guards | developer → security-reviewer, qa | ✅ Done (real QR login not tested) |
| 5 Quality | Tests, security review, memory checks with N accounts, error handling | qa, security-reviewer | — |
| 6 Distribution | electron-builder, Actions CI + release, README/guides en+pt-BR | developer, documentation | — |

## Architecture
```
main/      AccountStore (JSON) · SessionManager (WebContentsView per partition) · IPC handlers (zod-validated) · navigation/permission guards
preload/   contextBridge typed API (accounts.*, view.*) — no raw ipcRenderer
renderer/  React shell: Sidebar · AccountView placeholder bounds · Wizard · Settings
```
