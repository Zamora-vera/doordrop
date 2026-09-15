# Ship24Go V1.4.31 — Modern Tickets Page

## Scope

This update redesigns only the real customer route:

- `/panel/tickets`
- Component: `src/components/CustomerTickets.tsx`

The existing Ship24Go panel shell remains unchanged. The customer sidebar, header, authentication flow, route registration, API calls, ticket creation, ticket list, ticket detail, replies, and resolve action are preserved.

## What changed

- Modern SaaS-style support header.
- Mobile/PWA friendly cards and responsive ticket list.
- Dark mode compatible styling.
- Professional empty state when the customer has no tickets.
- Official support channel cards:
  - WhatsApp Customer Service: `+39 352 076 4335`
  - Facebook Global
  - Facebook Italy
  - Facebook United States
  - Facebook Spain
  - Instagram
- Removed the previous runtime DOM injection for support channels to avoid duplicate content.

## i18n

Visible UI text for the modern tickets page is routed through the existing `useI18n()` translation system in `src/lib/i18n.tsx`.

Languages included:

- Spanish
- English
- Italian
- French
- German
- Chinese

## Files changed

- `src/components/CustomerTickets.tsx`
- `src/lib/i18n.tsx`
- `src/main.tsx`
- `VERSION`
- `package.json`
- `docs/support/SHIP24GO_MODERN_TICKETS_V1_4_31.md`
