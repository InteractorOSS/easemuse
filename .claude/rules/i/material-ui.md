# Material UI Design Rules

These rules apply **ONLY** when the project uses Material UI (MUI) as the design system.

---

## Applicability

Apply these rules when:
- `@mui/material` is in `package.json`
- Components import from `@mui/material` or `@mui/icons-material`
- The project explicitly states it uses Material UI/MUI

---

## Navigation Layout Requirements

### Global Navigation Bar (AppBar/Header)

| Element | Position | Required |
|---------|----------|----------|
| Logo/Brand | Left | Yes |
| Navigation Items | Center/Left | As needed |
| **Profile** | **Far Right** | **Yes** |

```jsx
// Correct - Profile on far right
<AppBar>
  <Toolbar>
    <Logo />
    <NavItems />
    <Box sx={{ flexGrow: 1 }} />  {/* Spacer pushes profile right */}
    <ProfileMenu />  {/* Always rightmost */}
  </Toolbar>
</AppBar>
```

### Left Navigation Bar (Drawer/Sidebar)

| Element | Position | Required |
|---------|----------|----------|
| Navigation Items | Top/Middle | As needed |
| **"Share Feedback"** | **Bottom** | **Yes** |

```jsx
// Correct - Share Feedback at bottom of left nav
<Drawer>
  <List>
    {/* Main navigation items */}
    <ListItem>Dashboard</ListItem>
    <ListItem>Settings</ListItem>
    {/* ... other items ... */}
  </List>

  <Box sx={{ flexGrow: 1 }} />  {/* Spacer pushes feedback to bottom */}

  {/* Always at bottom */}
  <List>
    <ListItem button>
      <ListItemIcon><FeedbackIcon /></ListItemIcon>
      <ListItemText primary="Share Feedback" />
    </ListItem>
  </List>
</Drawer>
```

---

## Implementation Checklist

When implementing navigation with Material UI:

- [ ] Profile/Avatar component is positioned at far right of AppBar
- [ ] `flexGrow: 1` spacer used before Profile in AppBar
- [ ] "Share Feedback" link exists in left navigation
- [ ] "Share Feedback" is positioned at the bottom of the Drawer
- [ ] `flexGrow: 1` spacer used before "Share Feedback" in Drawer

---

## Validation

Before completing any MUI navigation implementation, verify:

1. **AppBar**: Profile menu/avatar is the rightmost element
2. **Drawer**: "Share Feedback" is visible at the bottom without scrolling (if nav fits viewport)

```bash
# Visual check points
- Top-right corner: User profile/avatar
- Bottom-left corner (in nav): "Share Feedback"
```
