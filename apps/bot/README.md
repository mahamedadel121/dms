# @dms/bot - Telegram bot for drivers (WP3)

grammY bot with a DB-persisted conversation state machine (`bot_sessions`), Egyptian Arabic messages
(`src/messages.ts`), onboarding by `request_contact`, the full expense request flow, "My requests",
corrections, and the `telegram.send` job handler that delivers notifications.

## Run

- Real bot: set `BOT_TOKEN` (and `BOT_MODE=polling|webhook`, `BOT_WEBHOOK_URL`, `BOT_WEBHOOK_SECRET`, `BOT_WEBHOOK_PORT`), then `pnpm --filter @dms/bot start`.
  Without a token the process exits (D40).
- Tests (never call Telegram): `pnpm --filter @dms/bot exec vitest run`

## Driver simulator (demo without a Telegram token)

```
pnpm db:up
pnpm bot:sim            # same as: pnpm --filter @dms/bot sim   (or BOT_SIMULATOR=1 pnpm --filter @dms/bot start)
```

Open http://127.0.0.1:3010 (binds to 127.0.0.1 only; override the port with `BOT_SIMULATOR_PORT`).
Pick a seeded driver (DRV001..DRV010), press `/start`, share the contact with the button, then type text,
tap the inline and reply-keyboard buttons, and attach photos/PDFs with the paperclip. Everything goes
through the same bot code and the same database as the real bot, so a submitted request is a real
request: it shows up in the approvers' queue in the web app, and notifications to the driver (correction
requests, vehicle-change decisions) appear in the chat within ~2 seconds. Useful demo drivers:
DRV001 (vehicle 2157), DRV007 (stopped vehicle - request is blocked), DRV008 (under maintenance).
"إعادة ضبط" unlinks the simulated account and clears the chat so onboarding can be replayed;
"تجربة انتحال" shares someone else's contact to show the refusal.

## Layout

- `src/flow.ts` state machine (pure of grammY, talks through `Out`), `src/bot.ts` grammY wiring (session load/save,
  per-user serialisation, `update_id` de-duplication, rate limit 20 updates / 10 s), `src/jobs.ts` `telegram.send`.
- `src/testing/harness.ts` fake updates + captured outgoing calls (API transformer); `src/simulator/` the web simulator.
