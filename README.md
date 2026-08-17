# Creative Studio — SaaS Foundation

Production-ready **foundation** (not a finished app) for a multi-tenant
creative project management platform, inspired by ClickUp / Linear / Krock.

## Stack
Next.js 15 (App Router) · TypeScript · Tailwind CSS · Firebase (Auth,
Firestore, Storage) · Framer Motion · React Hook Form + Zod · Zustand ·
Lucide React

## Getting started
```bash
npm install
cp .env.local.example .env.local   # fill in your Firebase project keys
npm run dev
```

Deploy the security rules in `firebase-config/` to your Firebase project
(`firebase deploy --only firestore:rules,storage:rules`, after wiring them
into `firebase.json`).

## What's included
- Email/password auth (login, signup, forgot password, logout, protected
  routes, session persistence)
- Multi-tenant workspace creation flow (name, company, logo, slug)
- Firestore data layer for `users`, `workspaces`, `members`, `settings`,
  `activity_logs`, `notifications`
- Global app shell: collapsible sidebar, top navbar (workspace switcher,
  search, notifications, profile menu), responsive at all breakpoints
- Dashboard layout with placeholder cards (analytics, recent projects, my
  tasks, activity, quick actions, storage)
- Full CSS-variable-driven theme engine (mode, colors, radius, font, card
  style, sidebar style) editable from Settings > Theme
- Settings architecture: 11 sub-pages, all wired into routing/nav, no
  functionality yet per spec
- Reusable UI kit: Button, Input, Card, Badge, Avatar, Modal, Loader,
  EmptyState, SearchBar

## What's intentionally NOT included
Per the brief, `projects` and `tasks` collections/features are out of
scope for this foundation.

See the project structure explanation in the chat response for why each
folder exists.
