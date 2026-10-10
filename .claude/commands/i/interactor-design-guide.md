---
allowed-tools: [Read, Grep, Glob, Edit, MultiEdit, Write, TodoWrite]
description: "Apply Interactor design system to UI/UX components - ensures visual consistency with interactor-server"
---

# /interactor-design-guide - Interactor Design System Enforcement

## Purpose
Apply the Interactor design system to all UI/UX components to ensure visual and behavioral consistency with interactor-server. This command enforces design tokens, patterns, and guidelines extracted from the interactor-server codebase.

> **Scope — which design system?** This guide describes the **Interactor server** design system (blue accent `#0062ff`, compact 3–8px radii). If your project has its own design system — its own palette, spacing scale, and components — follow that instead; reach for this guide **only** when you are deliberately matching Interactor server visuals.

## Design Guide Reference
**Primary Reference**: the Interactor design-system reference, mirrored in this skill (the tokens and patterns below are the canonical copy — no machine-specific path required).

This guide contains:
- Complete color palette with CSS variables
- Typography specifications (fonts, sizes, weights)
- Component patterns (buttons, forms, navigation, messages)
- Spacing, borders, and layout standards
- Transitions and animations
- Accessibility requirements
- Component checklist

## When to Use

### Automatic Activation
This command should be referenced whenever:
- Creating new UI components
- Modifying existing UI/UX elements
- Implementing new pages or layouts
- Adding interactive elements (buttons, forms, inputs)
- Styling components or templates

### Manual Invocation
```bash
/interactor-design-guide [component-type] [--validate] [--apply] [--report]
```

## Core Design Tokens

### Colors (CSS Variables)
```css
/* Primary Accent */
--accent-500: #0062ff;        /* Main brand color */
--accent-50: #e6efff;         /* Selected states */
--accent-300: #66a1ff;        /* Hover states */

/* Backgrounds */
--background-1: #ffffff;      /* White */
--background-2: #f9fafb;      /* Light gray */
--background-4: #ecf0fe;      /* Light blue */

/* Text Colors */
--color-11: #494f5c;          /* Dark gray text */
--color-9: #8f92a1;           /* Gray text */

/* Borders */
--border-1: #d3d6da;          /* Border gray */

/* Status Colors */
--red-500: #ef4444;           /* Errors */
--green-500: #22c55e;         /* Success */
```

### Typography
```css
/* Base */
font-size: 14px;              /* Root font size */

/* Weights */
font-weight: 500;             /* Default */
font-weight: 600;             /* Inputs */
font-weight: 700;             /* Bold/Selected */
```

### Spacing
```css
/* Border Radius */
border-radius: 3px;           /* Small (nav, buttons) */
border-radius: 8px;           /* Large (core buttons) */

/* Padding */
padding: 0.5rem 1.2rem;       /* Buttons, messages */
padding: 0.625rem 1rem;       /* Navigation */

/* Margins */
margin-bottom: 16px;          /* Navigation options */
```

## Component Standards

### Buttons
```css
/* Primary Button */
background: var(--accent-500);
color: white;
border-radius: 8px;
padding: 0.5rem 1.2rem;
font-weight: 500;
transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);

/* Hover */
background: var(--accent-600);

/* Secondary Button */
background: var(--accent-50);
color: var(--accent-500);
border: 1px solid var(--accent-500);
```

### Form Inputs
```css
border: 1px solid var(--border-1);
border-radius: 4px;
padding: 0.5rem 0.75rem;
font-weight: 600;

/* Focus */
border-color: var(--accent-500);
outline: 2px solid var(--accent-100);
outline-offset: 2px;

/* Placeholder */
color: var(--placeholder-color);
```

### Navigation
```css
/* Default */
background: var(--background-1);
transition: all 150ms;

/* Hover */
background: var(--background-2);
color: rgb(107 114 128);
border-radius: 3px;

/* Selected */
background: var(--accent-50);
color: var(--accent-500);
```

## Execution Workflow

### 1. Read Design Guide
Review the Interactor design-system reference (the tokens, component standards, and checklist documented in this skill) for the complete specifications.

### 2. Analyze Target Component
- Identify component type (button, input, card, navigation, etc.)
- Determine component states (default, hover, focus, disabled, loading)
- Review required interactions and animations

### 3. Apply Design Tokens
- Use CSS variables instead of hardcoded colors
- Apply standard border radius values (3px, 4px, 8px)
- Use consistent font weights (500, 600, 700)
- Implement standard spacing (0.5rem, 1rem, 1.5rem)
- Add transitions (150ms cubic-bezier)

### 4. Implement States
- **Hover**: Background change + transition
- **Focus**: Accent-500 outline with 2px offset
- **Disabled**: Gray-300 background, 0.6 opacity, cursor not-allowed
- **Loading**: Pulse animation
- **Error**: Red-500 border/background
- **Success**: Green-500 border/background

### 5. Accessibility Check
- [ ] WCAG 2.1 AA color contrast ratios (4.5:1 minimum)
- [ ] Keyboard navigation support
- [ ] Focus indicators visible
- [ ] ARIA labels where needed
- [ ] Semantic HTML structure

### 6. Validate Implementation
Compare against design guide checklist:
- [ ] Colors: CSS variables from palette
- [ ] Typography: 14px base, weights 500/600/700
- [ ] Spacing: Consistent margins and padding
- [ ] Borders: Radius 3-8px, color --border-1
- [ ] Buttons: 8px radius, accent-500 background
- [ ] Icons: 40px navigation, 20px inline (Heroicons)
- [ ] Transitions: 150ms cubic-bezier
- [ ] All interactive states implemented
- [ ] Accessibility requirements met

## Arguments

### `[component-type]` (Optional)
Specify the type of component being created/modified:
- `button` - Button components
- `input` - Form input fields
- `navigation` - Navigation menus and options
- `card` - Card/container components
- `message` - Toast/notification messages
- `toggle` - Toggle switches
- `checkbox` - Checkbox inputs
- `modal` - Modal dialogs
- `table` - Data tables

### `--validate` (Flag)
Validate existing components against design guide:
- Scan for hardcoded colors (should use CSS variables)
- Check border radius consistency
- Verify font weight usage
- Identify missing interactive states
- Report accessibility issues

### `--apply` (Flag)
Automatically apply design system to components:
- Replace hardcoded colors with CSS variables
- Standardize border radius values
- Fix font weights to standard values
- Add missing interactive states
- Implement standard transitions

### `--report` (Flag)
Generate design compliance report:
- List compliant components
- Identify non-compliant components
- Suggest fixes for violations
- Provide implementation examples

## Examples

### Create New Button
```bash
/interactor-design-guide button --apply
```
Creates a button component with:
- `accent-500` background
- White text
- 8px border radius
- Standard padding and transitions
- All interactive states (hover, focus, disabled)

### Validate Existing Form
```bash
/interactor-design-guide input --validate
```
Validates form inputs against:
- Correct border styles and colors
- Proper font weights
- Focus state implementation
- Placeholder color usage

### Apply Design to Navigation
```bash
/interactor-design-guide navigation --apply
```
Applies navigation patterns:
- Selected state styling (accent-50 background)
- Hover state (background-2)
- Icon color filters
- Smooth transitions

### Full Compliance Report
```bash
/interactor-design-guide --report
```
Generates report covering:
- Color palette compliance
- Typography consistency
- Component state completeness
- Accessibility status

## Integration with Existing Commands

### Works with /sc:implement
When implementing new features with UI components:
```bash
/sc:implement "user dashboard" --persona-frontend
/interactor-design-guide --apply
```

### Works with /sc:design
When designing UI components:
```bash
/sc:design "notification system" --type component
/interactor-design-guide --validate
```

### Works with /sc:improve
When improving existing UI:
```bash
/sc:improve @components/Button.tsx --focus quality
/interactor-design-guide button --apply
```

## Common Patterns

### Pattern 1: New Component Creation
1. Read design guide for component type
2. Extract relevant design tokens
3. Implement component with tokens
4. Add all interactive states
5. Test accessibility
6. Validate against checklist

### Pattern 2: Existing Component Update
1. Scan component for design violations
2. Identify hardcoded values
3. Replace with CSS variables
4. Add missing states
5. Fix accessibility issues
6. Validate compliance

### Pattern 3: Design System Audit
1. Scan all UI components
2. Generate compliance report
3. Prioritize fixes by impact
4. Apply fixes systematically
5. Re-validate after changes

## Best Practices

### Always
✅ Use CSS variables from color palette
✅ Apply standard border radius values (3px, 4px, 8px)
✅ Implement all interactive states
✅ Add 150ms transitions
✅ Test keyboard navigation
✅ Verify color contrast ratios
✅ Use semantic HTML
✅ Include ARIA labels

### Never
❌ Hardcode hex colors
❌ Use custom border radius values
❌ Skip hover/focus/disabled states
❌ Use transitions > 400ms
❌ Forget loading states
❌ Ignore accessibility
❌ Mix inconsistent font weights

## Troubleshooting

### Issue: Colors don't match
**Solution**: Ensure CSS variables are imported from `colors.css` and used instead of hardcoded values.

### Issue: Transitions feel slow
**Solution**: Use standard 150ms transition with cubic-bezier(0.4, 0, 0.2, 1) timing function.

### Issue: Focus states not visible
**Solution**: Apply 2px outline with accent-500 color and 2px offset.

### Issue: Component looks different on hover
**Solution**: Ensure hover state uses background-2 or accent-300 depending on context.

## Design System Files

### Reference Files
The canonical source for these tokens lives in the interactor-server UI assets (the
`assets/css/` stylesheets — `colors.css`, `core_components.css`, `root.css` — and the
`tailwind.config.js`). Consult them in a checkout of interactor-server when you need
the upstream source of truth; the tokens and patterns in this skill mirror them.

### Design Guide
- **Complete Guide**: the Interactor design-system reference mirrored in this skill (sections above).

## Notes

- This guide should be applied **proactively** whenever creating or modifying UI/UX
- Design consistency is a **non-negotiable quality requirement**
- All new components must pass the design checklist before completion

---

**Quick Reference**: Use the `interactor-design-guide` step before implementing any UI/UX to ensure consistency with interactor-server design system.
