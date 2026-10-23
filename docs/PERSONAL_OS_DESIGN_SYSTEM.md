# Personal OS design system

The central entry point is `app/src/design-system/index.ts`. Components consume
semantic theme roles through `usePersonalOSTheme`; raw colours live in
`tokens/brand.ts`. `theme/types.ts` defines the contract and `theme/createTheme.ts`
resolves stable light/dark objects. Missing system appearance defaults to light.
No provider, dependency, native bridge or persistence is required.

## Approved palette and provenance

The light palette is approved for this milestone. Deep slate `#4B6C83`, sage-teal
`#8EB5AE` and apricot `#F9A466` are representative sampled anchors from the approved
production-study rendering. They are not exact flat colours from a clean source
icon: that asset is not yet in the repository. They are retained as raw primitives,
not automatically used as text or surface colours. Earlier terracotta `#C96D58`
is not part of the active brand.

| Semantic colour role | Light | Dark compatibility |
| --- | --- | --- |
| background | #F8F8F6 | #121416 |
| navigationSurface | #F8F8F6 | #1C2023 |
| cardStandard | #E8F0EF | #1C2023 |
| cardAttention | #FEEDE0 | #1C2023 |
| textPrimary | #273746 | #F5F7F8 |
| textSecondary | #667482 | #B8BEC3 |
| textSecondaryOnSurface | #566570 | #B8BEC3 |
| action | #273746 | #245C6A |
| borderSubtle | #DCE2E6 | #1C2023 |
| borderControl | #566570 | #B8BEC3 |

`textSecondary` is for the app/navigation background. Card descriptions and form
placeholders use `textSecondaryOnSurface`. `borderControl` reuses an approved
foreground colour; `borderSubtle` is reserved for decorative separators and must
never be an interactive control's sole boundary. The subtle role is available
without adding new dividers to existing layouts.

## Cards and existing semantics

`AppCard` defaults to `standard`. Pass `variant="attention"` only when existing UI
semantics call for it:

- Today NOW/TODAY priorities.
- Prescription load errors, pending cleanup and missing legacy details.
- Medication legacy details-needed state.
- Prescription records whose existing expiry calculation returns expired or
  expiring-soon. This uses expiry state explicitly, not the presence of any badge.

Ask, Capture and Settings navigation placeholders, Library entries, ordinary
medication/prescription records and editor cards use the standard variant.
Stock values do not introduce a new attention classification. Badges,
labels, checkmarks and accessibility states/actions remain independently meaningful.
Card styling does not change domain rules. The shell placeholders and Settings
return path are described in [MVP navigation](MVP_SPEC.md#mvp-core-navigation);
they do not implement the underlying features.

## Geometry and accessibility

Existing spacing and typography tokens remain unchanged. `tokens/radius.ts`
centralises the existing 4-point badge radius, 6–24-point measured card bounds and
zero-radius unmeasured fallback. Golden geometry and 44-point minimum touch areas
are retained. Text scaling is not disabled or capped.

Light foreground/surface pairs are covered by contrast tests: body text targets
at least 4.5:1 and control boundaries at least 3:1. Muted secondary text on warm
white is close to the threshold (about 4.50:1), so it must not be reused on tinted
cards. Colour is supplementary to visible labels and VoiceOver semantics.

Dark mode is compatibility-only: existing neutral surfaces/text and petrol action
text are preserved exactly. Attention and standard cards share the existing dark
surface. The pre-existing low contrast of petrol actions in dark mode remains a
known limitation; this milestone does not infer or redesign a dark palette.
The status bar follows the same resolved theme as the screens.

## Validation and deferred work

Automated coverage includes semantic card variants, theme fallback, approved light
contrast pairs, measured card geometry, navigation and existing medication and
prescription behaviour. Run Jest, TypeScript, ESLint, changed-file Prettier checks
and `git diff --check`.

Manual iOS checks remain necessary for large Dynamic Type, VoiceOver focus and
custom actions, small-screen wrapping, input boundaries, light/dark transitions,
and native dialogs/protected viewing. Native launch-screen appearance is unchanged.
The AppIcon catalogue and native files remain untouched. Normal/dark/tinted icon
installation awaits a clean square source asset in a separate icon-only step.

## Shell headings at accessibility text sizes

Ask, Capture and Settings retain the unchanged `screenTitle` token and uncapped
text scaling. Their heading rows use the text's natural width. When a single
scaled word exceeds the available viewport, the row scrolls horizontally instead
of breaking the word, reducing the font or adding an ellipsis. A caption using
existing tokens explains the sideways gesture only when measured content
actually overflows. Each destination starts its heading at the leading edge.
The rest of the screen continues to scroll vertically. The accessibility tree
retains the complete heading text with its header role.

This is a layout tradeoff: at the largest text size a wide heading cannot be seen
all at once on a small display. Its full content remains reachable by scrolling;
no characters are discarded. Actual VoiceOver navigation and focus require manual
observation in addition to the automated checks.

### Separate existing issue: tab labels at largest text size

The existing four equal-width bottom tabs split labels such as Today, Capture and
Library within words at 375-point width and Accessibility XXXL. They remain
operable, but readability needs a separately scoped adaptive-navigation review.
PR #3 does not change the tab bar, its typography or its scaling behavior.
