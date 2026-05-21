# Token Migration Map — Old @a64core/shared → Slate

## Colors

| Old | New | Notes |
|-----|-----|-------|
| theme.colors.textPrimary | theme.colors.text.primary | ink |
| theme.colors.textSecondary | theme.colors.text.secondary | slate |
| theme.colors.textDisabled | theme.colors.text.tertiary | |
| theme.colors.background | theme.colors.surface.canvas | linen |
| theme.colors.surface | theme.colors.surface.raised | linenSoft |
| theme.colors.primary[500] | theme.colors.accent.sage | main brand CTA |
| theme.colors.primary[700] | theme.colors.accent.sageDeep | |
| theme.colors.primary[600] | theme.colors.accent.sageDeep | |
| theme.colors.primary[400] | theme.colors.accent.sage | |
| theme.colors.primary[300] | theme.colors.accent.sageSoft | |
| theme.colors.primary[200] | theme.colors.accent.sageSoft | |
| theme.colors.primary[100] | theme.colors.accent.sageSoft | |
| theme.colors.primary[50] | theme.colors.accent.sageSoft | |
| theme.colors.primary[800] | theme.colors.accent.sageDeep | |
| theme.colors.primary[900] | theme.colors.accent.sageDeep | |
| theme.colors.neutral[50] | theme.colors.surface.canvas | very light bg |
| theme.colors.neutral[100] | theme.colors.surface.raised | card bg |
| theme.colors.neutral[200] | theme.colors.surface.sunken | well/input bg |
| theme.colors.neutral[300] | theme.colors.border.subtle | dividers |
| theme.colors.neutral[400] | theme.colors.border.default | borders |
| theme.colors.neutral[500] | theme.colors.text.tertiary | disabled |
| theme.colors.neutral[600] | theme.colors.text.secondary | captions |
| theme.colors.neutral[700] | theme.colors.text.secondary | |
| theme.colors.error | theme.colors.status.danger | |
| theme.colors.errorBg | theme.colors.status.danger | no bg tints in Slate |
| theme.colors.success | theme.colors.status.success | |
| theme.colors.successBg | theme.colors.accent.sageSoft | |
| theme.colors.warning | theme.colors.status.warning | |
| theme.colors.warningBg | theme.colors.status.warning | |
| theme.colors.info | theme.colors.status.info | |
| theme.colors.infoBg | theme.colors.surface.sunken | muted info bg |

## Spacing

| Old | New | Value |
|-----|-----|-------|
| theme.spacing.xs | theme.space['1'] | 4px |
| theme.spacing.sm | theme.space['2'] | 8px |
| theme.spacing.md | theme.space['4'] | 16px |
| theme.spacing.lg | theme.space['6'] | 24px |
| theme.spacing.xl | theme.space['8'] | 32px |
| theme.spacing['2xl'] | theme.space['12'] | 48px |
| theme.spacing['3xl'] | theme.space['16'] | 64px |

## Typography — Font sizes

| Old | New | Value |
|-----|-----|-------|
| theme.typography.fontSize.xs | theme.fontSizes.caption | 13px |
| theme.typography.fontSize.sm | theme.fontSizes.bodySm | 14px |
| theme.typography.fontSize.base | theme.fontSizes.bodyMd | 16px |
| theme.typography.fontSize.md | theme.fontSizes.bodyMd | 16px |
| theme.typography.fontSize.lg | theme.fontSizes.bodyLg | 18px |
| theme.typography.fontSize.xl | theme.fontSizes.h4 | 18px |
| theme.typography.fontSize['2xl'] | theme.fontSizes.h2 | 24px |
| theme.typography.fontSize['3xl'] | theme.fontSizes.h1 | 32px |
| theme.typography.fontSize['4xl'] | theme.fontSizes.displaySm | 36px |

## Typography — Font weights

| Old | New |
|-----|-----|
| theme.typography.fontWeight.regular | theme.fontWeights.regular |
| theme.typography.fontWeight.normal | theme.fontWeights.regular |
| theme.typography.fontWeight.medium | theme.fontWeights.medium |
| theme.typography.fontWeight.semibold | theme.fontWeights.semibold |
| theme.typography.fontWeight.bold | theme.fontWeights.bold |

## Typography — Font families

| Old | New |
|-----|-----|
| theme.typography.fontFamily.primary | theme.fonts.body |
| theme.typography.fontFamily.mono | theme.fonts.mono |
| theme.typography.fontFamily.body | theme.fonts.body |

## Typography — Line heights

| Old | New |
|-----|-----|
| theme.typography.lineHeight.normal | theme.lineHeights.base |
| theme.typography.lineHeight.tight | theme.lineHeights.snug |
| theme.typography.lineHeight.relaxed | theme.lineHeights.loose |

## Shape

| Old | New |
|-----|-----|
| theme.borderRadius.none | theme.radii.none |
| theme.borderRadius.sm | theme.radii.sm |
| theme.borderRadius.md | theme.radii.md |
| theme.borderRadius.lg | theme.radii.lg |
| theme.borderRadius.xl | theme.radii.xl |
| theme.borderRadius.full | theme.radii.pill |
| theme.shadows.sm | theme.shadows.sm |
| theme.shadows.md | theme.shadows.md |
| theme.shadows.lg | theme.shadows.lg |
| theme.shadows.xl | theme.shadows.md (downgrade — xl not in Slate) |

## Z-indices

| Old | New |
|-----|-----|
| theme.zIndex.base | theme.zIndices.base |
| theme.zIndex.dropdown | theme.zIndices.dropdown |
| theme.zIndex.sticky | theme.zIndices.sticky |
| theme.zIndex.modal | theme.zIndices.modal |
| theme.zIndex.popover | theme.zIndices.popover |
| theme.zIndex.tooltip | theme.zIndices.tooltip |
