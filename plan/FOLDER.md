Evenly/
├─
├─ .gitignore
├─ README.md
├─ docs/
│  ├─ PRD.md  PLAN.md  LEDGER.md  SECURITY.md  RUNBOOK.md  DEVLOG.md
│  └─ ADR/  001-money.md  002-database.md  003-tenancy.md
├─ e2e/                          # Playwright (added in Phase 2.5)
├─ server/                       # Express, JavaScript (ES modules)
│  ├─ package.json  jsconfig.json  eslint.config.js  vitest.config.js
│  ├─ .env  .env.example
│  ├─ prisma/
│  │  ├─ schema.prisma  seed.js
│  │  └─ migrations/             # includes the raw-SQL CHECK + trigger migrations
│  └─ src/
│     ├─ app.js                  # builds the Express app (no listen)
│     ├─ server.js               # listen only
│     ├─ config/env.js           # Zod-validated env
│     ├─ ledger/                 # PURE money logic, JSDoc-typed, no outside imports
│     │  ├─ index.js  money.js  split.js  balances.js  suggest.js  refund.js
│     │  └─ __tests__/           # vectors, unit, property tests
│     ├─ middleware/             # requestId, auth, membership, validate, errors, rateLimit
│     ├─ shared/                 # errors, response envelope, logger, db client
│     ├─ modules/
│     │  ├─ auth/  households/  expenses/  settlements/  ai/ (Part 4)
│     │  └─ each: *.routes.js  *.controller.js  *.service.js
│     │           *.repository.js  *.validation.js  *.test.js
│     └─ test/                   # DB reset helper, factories
└─ client/                       # React + TypeScript + Vite + Tailwind
   ├─ package.json  vite.config.ts  tsconfig.json  index.html  .env.example
   └─ src/
      ├─ main.tsx  App.tsx
      ├─ lib/                    # api client, money display helpers
      ├─ features/               # auth, household, expenses, settlements
      ├─ components/  pages/  hooks/  styles/








      Evenly/
├── .gitignore
├── README.md
│
├── docs/                                    # Architecture & engineering documentation
│   ├── PRD.md                               # Product requirements, personas, MVP scope, non-goals
│   ├── PLAN.md                              # 8-part roadmap and execution phases
│   ├── LEDGER.md                            # Formulas, largest-remainder algorithm, invariants I1–I7
│   ├── SECURITY.md                          # Threat model, tenancy, auth cookies, CSRF, IDOR defense
│   ├── RUNBOOK.md                           # Deployment, migrations, backup & restore drill procedures
│   ├── DEVLOG.md                            # Weekly developer log (done, blocked, next)
│   ├── AI_DESIGN.md                         # Gemini boundaries, prompt templates, rate limits, schemas
│   └── ADR/                                 # Architecture Decision Records
│       ├── 001-money-representation.md      # Why integer paise & string parsing over floats
│       ├── 002-database-selection.md        # Why PostgreSQL (Neon) + Prisma over MongoDB
│       ├── 003-tenancy-and-authz.md         # householdId scoping & the 404 security rule
│       ├── 004-idempotency-strategy.md      # Idempotency-Key header & unique DB constraints
│       └── 005-cookie-session-auth.md       # Rotating refresh tokens in HTTP-only cookies
│
├── e2e/                                     # Playwright end-to-end test suite
│   ├── package.json
│   ├── playwright.config.ts
│   └── tests/
│       ├── user-journey.spec.ts             # 2-user flow: signup, invite, expense, settle, reverse
│       └── tenancy-isolation.spec.ts        # Probing cross-household IDs returns 404
│
├── server/                                  # Express Backend (Node.js ES modules)
│   ├── .env
│   ├── .env.example
│   ├── package.json                         # "type": "module", dependencies & scripts
│   ├── jsconfig.json                        # tsc --checkJs config for JSDoc type checking
│   ├── eslint.config.js                     # ESLint flat config + restricted imports on ledger/
│   ├── vitest.config.js                     # Test config with 100% branch coverage gate on ledger/
│   ├── prisma7.config.ts                    # Prisma 7 CLI configuration
│   │
│   ├── prisma/
│   │   ├── schema.prisma                    # Data models (User, Household, Expense, Split, etc.)
│   │   ├── seed.js                          # Seeds a demo household with sample transactions
│   │   └── migrations/                      # Versioned migrations
│   │       ├── 20261031000000_init/
│   │       │   └── migration.sql
│   │       └── 20261031000001_checks_and_triggers/
│   │           └── migration.sql            # Raw SQL: CHECK constraints & deferred sum trigger
│   │
│   └── src/
│       ├── app.js                           # Express app factory (middleware + routes, NO listen)
│       ├── server.js                        # Server entry point (starts HTTP listener)
│       │
│       ├── config/
│       │   ├── env.js                       # Zod-validated environment config (fails fast on startup)
│       │   └── constants.js                 # Categories, split types, settlement statuses, error codes
│       │
│       ├── ledger/                          # PURE MONEY ENGINE (Zero external dependencies)
│       │   ├── index.js                     # Public barrel export
│       │   ├── money.js                     # toMinor (string parsing) & formatMoney (display only)
│       │   ├── split.js                     # splitEqual, splitByBasisPoints, splitExact, splitByWeights
│       │   ├── balances.js                  # calculateMemberBalances (asserts sum = 0)
│       │   ├── suggest.js                   # suggestSettlements (greedy transfer planning)
│       │   ├── refund.js                    # calculateRefundShares (pro-rata distribution)
│       │   ├── types.js                     # JSDoc typedefs (Expense, Split, Settlement, NetBalances)
│       │   └── __tests__/
│       │       ├── money.test.js            # Input validation, decimals, whitespace, commas
│       │       ├── split.test.js            # Test vectors 1, 2, 3, 13
│       │       ├── balances.test.js         # Test vectors 4, 5, 6, 7, 8, 10, 11, 14
│       │       ├── suggest.test.js          # Test vectors 9, 12
│       │       └── ledger.property.test.js  # fast-check (10,000 runs: sum=0, split diff <= 1)
│       │
│       ├── middleware/
│       │   ├── requestId.js                 # Attaches unique UUID trace to every request
│       │   ├── logger.js                    # Pino HTTP request logging
│       │   ├── authenticate.js              # Access token verification & req.user attachment
│       │   ├── householdMembership.js       # Scopes :householdId; returns 404 for non-members
│       │   ├── validate.js                  # Zod validation middleware for body, params, query
│       │   ├── idempotency.js               # Enforces Idempotency-Key & prevents double-writes
│       │   ├── rateLimiter.js               # Rate limiting for auth, expenses, and AI endpoints
│       │   └── errorHandler.js              # Central error mapping with consistent error envelope
│       │
│       ├── shared/
│       │   ├── db.js                        # PrismaClient singleton instance
│       │   ├── errors.js                    # Domain errors (NotFoundError, ConflictError, etc.)
│       │   ├── response.js                  # Standard success { data, meta } envelope helper
│       │   ├── logger.js                    # Base structured logger (Pino)
│       │   └── tokens.js                    # Password hashing (Argon2id) & JWT generation/rotation
│       │
│       ├── modules/                         # Vertical Feature Slices
│       │   ├── auth/
│       │   │   ├── auth.routes.js
│       │   │   ├── auth.controller.js
│       │   │   ├── auth.service.js          # Sessions, refresh token family rotation & revocation
│       │   │   ├── auth.repository.js
│       │   │   ├── auth.validation.js       # Register, login, refresh Zod schemas
│       │   │   └── auth.test.js
│       │   │
│       │   ├── households/
│       │   │   ├── household.routes.js
│       │   │   ├── household.controller.js
│       │   │   ├── household.service.js     # Single-use invitation tokens (7-day expiry)
│       │   │   ├── household.repository.js
│       │   │   ├── household.validation.js
│       │   │   └── household.test.js
│       │   │
│       │   ├── expenses/
│       │   │   ├── expense.routes.js
│       │   │   ├── expense.controller.js
│       │   │   ├── expense.service.js       # Transaction: expense + splits + audit log
│       │   │   ├── expense.repository.js    # Strict householdId tenant filtering
│       │   │   ├── expense.validation.js    # Discriminated union split schemas
│       │   │   └── expense.test.js
│       │   │
│       │   ├── settlements/
│       │   │   ├── settlement.routes.js
│       │   │   ├── settlement.controller.js
│       │   │   ├── settlement.service.js    # Repayment confirmation lifecycle & runtime check
│       │   │   ├── settlement.repository.js
│       │   │   ├── settlement.validation.js
│       │   │   └── settlement.test.js
│       │   │
│       │   └── ai/                          # Part 4 (AI Behind a Strict Trust Boundary)
│       │       ├── ai.routes.js
│       │       ├── ai.controller.js
│       │       ├── ai.service.js            # Gemini API caller (Drafts only, no ledger write access)
│       │       ├── ai.validation.js         # Zod schema for structured AI draft outputs
│       │       └── ai.test.js               # Golden test set (Hinglish, ambiguous, adversarial)
│       │
│       └── test/                            # Integration testing infrastructure
│           ├── setup.js                     # Test environment hooks
│           ├── db-helper.js                 # Transaction rollback / truncate helper
│           └── factories.js                 # User, Household, Expense test object factories
│
└── client/                                  # Mobile-First React PWA (Vite + TypeScript + Tailwind)
    ├── .env
    ├── .env.example
    ├── package.json
    ├── vite.config.ts                       # React + VitePWA plugins
    ├── tsconfig.json
    ├── tailwind.config.js                   # Color tokens: Navy, Emerald, Caution, Danger
    ├── index.html
    │
    ├── public/
    │   ├── favicon.svg
    │   ├── apple-touch-icon.png
    │   ├── pwa-192.png
    │   ├── pwa-512.png
    │   └── pwa-maskable-512.png
    │
    └── src/
        ├── main.tsx                         # App bootstrap & service worker registration
        ├── App.tsx                          # Router, TanStack Query client, AuthProvider
        │
        ├── types/                           # Shared frontend TypeScript interfaces
        │   ├── models.ts                    # User, Household, Expense, Split, Settlement
        │   └── api.ts                       # ApiResponse<T>, ApiError, Pagination
        │
        ├── lib/
        │   ├── api.ts                       # Typed fetch wrapper with cookie refresh & error handling
        │   ├── money.ts                     # formatMoney (display only) & toMinor parser
        │   └── date.ts                      # Household timezone date helpers & relative time
        │
        ├── features/                        # Domain UI Features
        │   ├── auth/
        │   │   ├── api/authApi.ts
        │   │   ├── hooks/useAuth.ts
        │   │   ├── components/LoginForm.tsx
        │   │   └── components/RegisterForm.tsx
        │   │
        │   ├── household/
        │   │   ├── api/householdApi.ts
        │   │   ├── hooks/useHousehold.ts
        │   │   ├── components/HouseholdSwitcher.tsx
        │   │   ├── components/InviteMemberModal.tsx
        │   │   └── components/MemberList.tsx
        │   │
        │   ├── expenses/
        │   │   ├── api/expenseApi.ts
        │   │   ├── hooks/useExpenses.ts
        │   │   ├── hooks/useExpenseMutations.ts
        │   │   ├── components/ExpenseCard.tsx
        │   │   ├── components/ExpenseDetailModal.tsx
        │   │   ├── components/AddExpenseBottomSheet.tsx
        │   │   ├── components/SplitEditor.tsx       # Live split preview (Equal, exact, %, weights)
        │   │   └── components/NumericKeypad.tsx     # Thumb-reach mobile keypad
        │   │
        │   ├── settlements/
        │   │   ├── api/settlementApi.ts
        │   │   ├── hooks/useBalances.ts
        │   │   ├── hooks/useSettlements.ts
        │   │   ├── components/BalanceSummaryCard.tsx
        │   │   ├── components/RecordRepaymentSheet.tsx
        │   │   ├── components/PendingConfirmationsList.tsx
        │   │   └── components/UpiPayButton.tsx      # upi://pay deep links
        │   │
        │   └── ai-assistant/                # Part 4
        │       ├── api/aiApi.ts
        │       ├── components/QuickAddBar.tsx       # Natural language input bar
        │       ├── components/ReceiptUploader.tsx   # Camera/file receipt capture
        │       └── components/DraftReviewModal.tsx  # Human review modal before saving
        │
        ├── components/                      # Reusable Shared UI Components
        │   ├── layout/
        │   │   ├── AppLayout.tsx            # Bottom nav (mobile) / sidebar (desktop)
        │   │   ├── BottomNav.tsx            # Home, Expenses, Settle, AI + Floating Add
        │   │   ├── Header.tsx
        │   │   └── OfflineBanner.tsx        # Explains offline staleness to users
        │   └── ui/                          # Atoms & design system components
        │       ├── Button.tsx
        │       ├── Input.tsx
        │       ├── Modal.tsx
        │       ├── BottomSheet.tsx
        │       ├── Skeleton.tsx
        │       ├── Badge.tsx
        │       └── Toast.tsx
        │
        ├── pages/
        │   ├── LoginPage.tsx
        │   ├── RegisterPage.tsx
        │   ├── AcceptInvitePage.tsx
        │   ├── OverviewPage.tsx             # Spending summary, net balance, recent items
        │   ├── ExpensesPage.tsx             # Infinite scroll list with filters & search
        │   ├── SettlePage.tsx               # Who owes whom & one-tap confirmation
        │   ├── SettingsPage.tsx             # Household configuration, members & sessions
        │   └── NotFoundPage.tsx
        │
        ├── hooks/
        │   ├── useNetworkStatus.ts          # Online/offline detector
        │   └── useIdempotencyKey.ts         # Generates UUID when transaction forms open
        │
        └── styles/
            └── index.css                    # Tailwind directives, tabular numerals, safe-areas
            