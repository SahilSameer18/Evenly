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
│       ├── 005-cookie-session-auth.md       # Rotating refresh tokens in HTTP-only cookies
│       └── 006-expense-lifecycle.md         # Edit / reverse / refund / dispute: locking, creator-only, positive refunds
│
├── e2e/                                     # Playwright end-to-end test suite
│   ├── package.json
│   ├── playwright.config.js
│   └── tests/
│       ├── user-journey.spec.js             # 2-user flow: signup, invite, expense, settle, reverse
│       └── tenancy-isolation.spec.js        # Probing cross-household IDs returns 404
│
├── server/                                  # Express Backend (Node.js ES modules)
│   ├── .env
│   ├── .env.example
│   ├── package.json                         # "type": "module", dependencies & scripts
│   ├── jsconfig.json                        # tsc --checkJs config for JSDoc type checking
│   ├── eslint.config.js                     # ESLint flat config + restricted imports on ledger/
│   ├── vitest.config.js                     # Runs src/test/setup.js first; one worker, one test file at a time (they share one test DB)
│   ├── prisma7.config.ts                    # Prisma 7 CLI configuration
│   │
│   ├── prisma/
│   │   ├── schema.prisma                    # Data models (User, Household, Expense, Split, etc.)
│   │   ├── seed.js                          # Seeds a demo household with sample transactions
│   │   └── migrations/                      # Versioned migrations
│   │       ├── 20261102080203_init/
│   │       │   └── migration.sql
│   │       ├── 20261102090000_checks_and_triggers/
│   │       │   └── migration.sql            # Raw SQL: CHECK constraints, deferred split-sum trigger, append-only audit trigger
│   │       └── 20261102101224_refresh_tokens/
│   │           └── migration.sql            # RefreshToken table
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
│       │   ├── errors.js                    # LedgerError with stable codes
│       │   ├── types.js                     # (planned) JSDoc typedefs (Expense, Split, Settlement, NetBalances)
│       │   └── __tests__/
│       │       ├── money.test.js            # Input validation, decimals, whitespace, commas
│       │       ├── split.test.js            # Test vectors 1, 2, 3, 13; hash tie-break spreads the extra paisa
│       │       ├── balances.test.js         # Test vectors 4-12, 14 (balances, suggestions, refunds)
│       │       └── ledger.property.test.js  # fast-check (10,000 runs: sum=0, split diff <= 1)
│       │
│       ├── middlewares/                     # (built: requestLogger, errorHandler, validate, authenticate)
│       │   ├── requestLogger.js             # Request id (X-Request-Id) + Pino HTTP logging, no headers logged
│       │   ├── authenticate.js              # Access token verification & req.user attachment
│       │   ├── householdMembership.js       # Scopes :householdId; returns 404 for non-members
│       │   ├── validate.js                  # Zod validation middleware for body, params, query -> req.valid
│       │   ├── idempotency.js               # Requires and validates the Idempotency-Key header (sets req.idempotencyKey)
│       │   ├── rateLimiter.js               # Rate limiting (built for auth; expenses and AI endpoints later)
│       │   ├── csrfGuard.js                 # Custom header + Origin check for cookie endpoints
│       │   ├── errorHandler.js              # notFound + central error mapping with consistent error envelope
│       │   └── __tests__/
│       │
│       ├── lib/
│       │   ├── prisma.js                    # PrismaClient singleton (Neon adapter)
│       │   ├── logger.js                    # Base structured logger (Pino)
│       │   ├── tenant.js                    # scoped(householdId): repositories cannot run without it
│       │   ├── password.js                  # Argon2id hash / verify
│       │   ├── tokens.js                    # Access JWT (jose) + opaque refresh token generation / hashing
│       │   └── __tests__/
│       │
│       ├── utils/
│       │   ├── errors.js                    # AppError and subclasses with stable codes
│       │   ├── response.js                  # Standard success { data, meta } envelope helper (optional extra meta, e.g. pagination)
│       │   ├── canonicalHash.js             # Key-order-independent JSON + SHA-256, for idempotency request hashes
│       │   └── cursor.js                    # Opaque pagination cursor encode / decode
│       │
│       ├── modules/                         # Vertical Feature Slices
│       │   ├── auth/
│       │   │   ├── auth.routes.js
│       │   │   ├── auth.controller.js
│       │   │   ├── auth.service.js          # Sessions, refresh token family rotation & revocation
│       │   │   ├── auth.repository.js
│       │   │   ├── auth.validation.js       # Register, login, refresh Zod schemas
│       │   │   └── __tests__/                   # register, login, sessions (fake repository) + .db variants (real test DB)
│       │   │
│       │   ├── users/
│       │   │   ├── users.routes.js              # GET /users/me
│       │   │   ├── users.controller.js
│       │   │   ├── users.repository.js
│       │   │   └── __tests__/
│       │   │
│       │   ├── households/
│       │   │   ├── household.routes.js      # household router + invitationRouter (/invitations/accept)
│       │   │   ├── household.controller.js
│       │   │   ├── household.service.js     # Roles, single-use invitations (7-day expiry), leave rules
│       │   │   ├── household.repository.js  # Every scoped function starts with scoped(householdId)
│       │   │   ├── household.validation.js
│       │   │   └── __tests__/               # repository scoping, create/list/get, settings, invitations, leave, authorization suite
│       │   │
│       │   ├── expenses/
│       │   │   ├── expense.routes.js
│       │   │   ├── expense.controller.js
│       │   │   ├── expense.service.js       # Create (idempotent), edit, reverse, refund, dispute, history; who may do what
│       │   │   ├── expense.repository.js    # Tenant-scoped; row lock before every change; one transaction for expense + splits + audit
│       │   │   ├── expense.validation.js    # Union on type (shared / personal / on_behalf), split union, edit, refund, reason, list query
│       │   │   └── __tests__/                   # (built) repository tenant-scoping test
│       │   │
│       │   ├── settlements/
│       │   │   ├── settlement.routes.js
│       │   │   ├── settlement.controller.js
│       │   │   ├── settlement.service.js    # Repayment confirmation lifecycle & runtime check
│       │   │   ├── settlement.repository.js
│       │   │   ├── settlement.validation.js
│       │   │   └── __tests__/
│       │   │
│       │   └── ai/                          # Part 4 (AI Behind a Strict Trust Boundary)
│       │       ├── ai.routes.js
│       │       ├── ai.controller.js
│       │       ├── ai.service.js            # Gemini API caller (Drafts only, no ledger write access)
│       │       ├── ai.validation.js         # Zod schema for structured AI draft outputs
│       │       └── __tests__/               # Golden test set (Hinglish, ambiguous, adversarial)
│       │
│       └── test/                            # Integration testing infrastructure
│           ├── setup.js                     # Points the app at TEST_DATABASE_URL; test JWT secret
│           ├── db-helper.js                 # resetDb() truncate helper; refuses to run on the dev database
│           ├── fakeTokenStore.js            # In-memory RefreshToken table for tests that mock the repository
│           └── factories.js                 # makeUser (with token), makeHousehold, addMember, addExpense, addRepayment
│
└── client/                                  # Mobile-First React PWA (Vite + Tailwind)
    ├── .env
    ├── .env.example
    ├── package.json
    ├── vite.config.js                       # React + Tailwind + VitePWA; @ledger alias -> ../server/src/ledger
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
        ├── main.jsx                         # App bootstrap & service worker registration
        ├── App.jsx                          # Router, TanStack Query client, AuthProvider
        │
        │
        ├── lib/
        │   ├── money.js                     # formatMoney (display only) & toMinor parser
        │   └── date.js                      # Household timezone date helpers & relative time
        │
        ├── features/                        # Domain UI Features
        │   ├── auth/
        │   │   ├── api/authApi.js
        │   │   ├── hooks/useAuth.js
        │   │   ├── components/LoginForm.jsx
        │   │   └── components/RegisterForm.jsx
        │   │
        │   ├── household/
        │   │   ├── api/householdApi.js
        │   │   ├── hooks/useHousehold.js
        │   │   ├── components/HouseholdSwitcher.jsx
        │   │   ├── components/InviteMemberModal.jsx
        │   │   └── components/MemberList.jsx
        │   │
        │   ├── expenses/
        │   │   ├── api/expenseApi.js
        │   │   ├── hooks/useExpenses.js
        │   │   ├── hooks/useExpenseMutations.js
        │   │   ├── components/ExpenseCard.jsx
        │   │   ├── components/ExpenseDetailModal.jsx
        │   │   ├── components/AddExpenseBottomSheet.jsx
        │   │   ├── components/SplitEditor.jsx       # Live split preview (Equal, exact, %, weights)
        │   │   └── components/NumericKeypad.jsx     # Thumb-reach mobile keypad
        │   │
        │   ├── settlements/
        │   │   ├── api/settlementApi.js
        │   │   ├── hooks/useBalances.js
        │   │   ├── hooks/useSettlements.js
        │   │   ├── components/BalanceSummaryCard.jsx
        │   │   ├── components/RecordRepaymentSheet.jsx
        │   │   ├── components/PendingConfirmationsList.jsx
        │   │   └── components/UpiPayButton.jsx      # upi://pay deep links
        │   │
        │   └── ai-assistant/                # Part 4
        │       ├── api/aiApi.js
        │       ├── components/QuickAddBar.jsx       # Natural language input bar
        │       ├── components/ReceiptUploader.jsx   # Camera/file receipt capture
        │       └── components/DraftReviewModal.jsx  # Human review modal before saving
        │
        ├── components/                      # Reusable Shared UI Components
        │   ├── layout/
        │   │   ├── AppLayout.jsx            # Bottom nav (mobile) / sidebar (desktop)
        │   │   ├── BottomNav.jsx            # Home, Expenses, Settle, AI + Floating Add
        │   │   ├── Header.jsx
        │   │   └── OfflineBanner.jsx        # Explains offline staleness to users
        │   └── ui/                          # Atoms & design system components
        │       ├── Button.jsx
        │       ├── Input.jsx
        │       ├── Modal.jsx
        │       ├── BottomSheet.jsx
        │       ├── Skeleton.jsx
        │       ├── Badge.jsx
        │       └── Toast.jsx
        │
        ├── pages/
        │   ├── LoginPage.jsx
        │   ├── RegisterPage.jsx
        │   ├── AcceptInvitePage.jsx
        │   ├── OverviewPage.jsx             # Spending summary, net balance, recent items
        │   ├── ExpensesPage.jsx             # Infinite scroll list with filters & search
        │   ├── SettlePage.jsx               # Who owes whom & one-tap confirmation
        │   ├── SettingsPage.jsx             # Household configuration, members & sessions
        │   └── NotFoundPage.jsx
        │
        ├── hooks/
        │   ├── useNetworkStatus.js          # Online/offline detector
        │   └── useIdempotencyKey.js         # Generates UUID when transaction forms open
        │
        └── styles/
            └── index.css                    # Tailwind directives, tabular numerals, safe-areas
            
            