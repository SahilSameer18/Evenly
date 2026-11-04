# Design system (v1, 2026-11-04)

The look of Evenly: a warm charcoal, dark-leaning app with one bright colour for money. This replaces the blueprint's design tokens. Contrast ratios below were measured, not estimated.

## Principles

1. **Numbers first.** The balance is the biggest thing on the screen, set in the display face.
2. **Never colour alone.** Every money amount carries a sign and a word ("+₹1,000 you lent", "−₹600 you owe"), and the hero balance carries an arrow.
3. **Calm about money.** No red alarms for owing: it is orange, and plain words do the work.
4. **Cheap to draw.** Flat translucent fills, no blur, no shadows, one static background glow. See "Performance and battery".
5. **Phone first.** Built at 375 px wide, then widened. One thumb reaches everything that matters.

## Theme

Follows the phone's setting, with a manual override (system, dark, light). Dark is what we design and judge first.

## Colour

Colours are named by role. Components use only the roles, so a theme is a swap of values.

| Role | Dark | Light | Used for |
|---|---|---|---|
| `bg` | `#0F0D0C` base, with a static warm glow `#4A3A30` at the top left | `#F4EEE6` paper | Page |
| `panel` | white at 7% over `bg` | `#FFFFFF` | Cards, rows, keypad |
| `panel-edge` | white at 12% | `#E3DAD0` | 0.5 px outline of a panel |
| `ink` | `#F5F1EC` | `#1A1613` | Main text |
| `ink-2` | `#B8AFA6` | `#6B6158` | Labels and captions |
| `hero` | white at 7% | `#1A1613` | The balance card (dark in both themes) |
| `owed` | `#D8F04A` | `#4F6B00` text, `#D8F04A` fill | Money owed to you, the Add button |
| `owe` | `#FF8F5C` | `#B53A0B` | Money you owe |
| `pending` | `#FFB547` on 12% tint | `#7A4B00` on `#FBE9C2` | Unconfirmed repayments, disputes |
| `danger` | `#FF8F5C` | `#B53A0B` | Destructive actions (with an icon and words) |
| `action` | `#F5F1EC` fill, `#1A1613` text | `#1A1613` fill, `#F5F1EC` text | The main button (a pill that contrasts with the page) |
| `on-owed` | `#1A1613` | `#1A1613` | Text and icons on a lime fill (the Add button) |

Inside the hero card (dark in both themes) the lime `#D8F04A`, secondary text `#B8AFA6` and amber `#FFB547` are used.

### Measured contrast (WCAG, minimum 4.5 for text)

| Pair | Ratio |
|---|---|
| Dark: ink on panel | 11.9 |
| Dark: ink-2 `#B8AFA6` on panel | 6.2 |
| Dark: owed on panel | 10.5 |
| Dark: owe `#FF8F5C` on panel | 6.0 |
| Dark: pending on panel | 7.6 |
| Dark: button text on action fill | 16.0 |
| Light: ink on paper | 15.6 |
| Light: ink-2 on paper / on white | 5.2 / 6.0 |
| Light: owed `#4F6B00` on white | 6.1 |
| Light: owe `#B53A0B` on paper / on white | 5.1 / 5.9 |
| Light: pending text on its tint | 6.2 |
| Hero: lime / ink-2 / amber on `#1A1613` | 14.1 / 8.3 / 10.2 |

Re-check this table whenever a colour changes.

## Typography

- **Display and numbers: Syne**, medium, with tabular figures. Used for the balance, every amount, screen titles and keypad digits.
- **Text: Plus Jakarta Sans**, regular and medium. Used for everything else.
- Two weights per face at most. Both self-hosted as `woff2`, subset to Latin plus the rupee sign, `font-display: swap`, system fonts as the fallback.
- **Scale (px):** 12 caption, 14 body, 16 row title, 20 screen title, 28 section number, 40 to 48 hero balance, 50 amount entry. Nothing below 12.
- Amounts are always whole paise formatted with `en-IN` grouping (`₹1,25,000`) and tabular figures, so columns line up.

## Spacing, shape, touch

- 8-point grid (4 for tight pairs). Screen gutter 16.
- Radius: 22 hero and panels, 16 rows, 14 keys, full pills for buttons and chips.
- Panel edge is a 0.5 px line, not a shadow.
- Every tap target is at least 44 px (keys 48, nav items 44, the Add button 44 to 50). Safe-area padding at the top and bottom.

## Money display rules

| Case | Shown as |
|---|---|
| Someone owes you | Arrow up-right, `owed` colour, "Bob owes you" |
| You owe someone | Arrow down-left, `owe` colour, "You owe Bob" |
| Settled | Check mark, `ink-2`, "All settled up" |
| An expense row | Your net effect: `+₹1,000 you lent` or `−₹600 you owe` |
| Pending repayment | `pending` chip with a clock icon and "to confirm" |
| Reversed expense | Struck through, `ink-2`, a "Reversed" chip |
| Disputed expense | `pending` chip with an alert icon and "Disputed" |

## Components (built once, reused)

Button (action, quiet, destructive), Chip (pending, disputed, reversed), Panel, Row, MoneyText (sign, colour, words, tabular figures), Avatar (initials), Field (label, input, error), Segmented (Shared / Personal), Keypad, Sheet (bottom sheet), Toast (with undo), EmptyState, ErrorState (with request id), Skeleton (static), BottomNav, Sidebar (desktop).

## Layout

Desktop is the responsive extension of the phone design: same colours, type and components, different layout.

| | Phone (under 768 px) | Desktop (768 px and up) |
|---|---|---|
| Navigation | Floating bottom bar (Home, Spend, Add, Settle); Add is a lime circle in the middle | Slim left sidebar (Home, Spend, Settle, Settings) with the lime Add button at the top |
| Overview | One column | Balance card on the left, recent activity on the right |
| Expenses | List, tap for a full detail screen | List and detail side by side: select a row and its split breakdown and history appear beside it |
| Settle | One column, pending confirmations first | Suggested payment and pending confirmations next to the repayment history |
| Add expense | Bottom sheet with a big keypad | Side panel with a normal keyboard: the amount is a text field and the keypad is dropped |
| Width | Full width | Content capped at about 960 px and centred |

- **Keyboard:** everything works by keyboard with a visible focus ring, and the amount field accepts typing and paste.
- **Hover** states exist but nothing depends on hover, because touch laptops are the same app.
- **Tablets** use the desktop layout, with the sidebar collapsed to icons.
- The performance rules below apply equally on desktop: no blur, and no extra sections just because there is room.

## Motion

- Only `transform` and `opacity`, 120 to 200 ms, ease-out.
- Nothing loops. Skeletons are static blocks that fade in and out once when data arrives.
- `prefers-reduced-motion` removes all motion except instant state changes.

## Performance and battery (rules, not wishes)

| Drain | Rule |
|---|---|
| Network | One balances request per screen. No polling and no sockets. Refresh on open, after your own actions and on pull-down. 25 rows per page. Retries back off and stop after three. |
| Blur and glass | No `backdrop-filter`. Glass is a flat translucent fill with a 0.5 px edge. |
| Gradients and shadows | One static background glow for the page. No gradients on cards, no box shadows. |
| Animation | See Motion. No continuous animation anywhere. |
| Screen | Dark is near-black `#0F0D0C`, not grey, so OLED screens use less power. |
| JavaScript | Route-based code splitting, lists load on scroll, the React Compiler stays on, no chart library until Part 3. |
| Fonts and icons | At most two font files. Icons are inline SVG, never an icon font. |

Budgets, measured before the MVP gate: initial JavaScript under 150 KB gzipped, main thread idle when nothing is happening, Lighthouse performance 90 or more on a mid-range Android profile, and one before-and-after check in Chrome's Performance panel on a real phone.

## Accessibility

- 4.5:1 contrast for text (tables above), 3:1 for large text and icons.
- Visible focus ring (2 px `owed` outline) on every control, logical tab order on desktop.
- Every input has a label. Errors are text next to the field, not colour alone.
- Icon-only buttons have an accessible name.
- Screen readers read amounts as words ("1,250 rupees, you lent").

## Not in v1

Charts and category breakdowns (Part 3), the AI screens, budgets, receipts.
