---
name: ui-design
description: Apply UI/UX patterns and design system guidelines. Use when implementing user interfaces.
---

# UI Design Skill

Apply consistent UI/UX patterns for React applications.

## When to Use

- Implementing new UI components
- Reviewing UI consistency
- Applying design system
- Accessibility improvements

## Design System Principles

### 1. Component Structure

```typescript
// Standard component structure
interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size]
      )}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading && <Spinner className="mr-2 h-4 w-4" />}
      {children}
    </button>
  );
}
```

### 2. Layout Patterns

```tsx
// Page layout
export function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
      <Footer />
    </div>
  );
}

// Card layout
export function Card({ title, children }: CardProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {title && (
        <h2 className="text-xl font-semibold mb-4">{title}</h2>
      )}
      {children}
    </div>
  );
}
```

### 3. Form Patterns

```tsx
// Form field with label and error
export function FormField({
  label,
  error,
  children,
  required,
}: FormFieldProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

// Usage
<FormField label="Email" error={errors.email} required>
  <Input
    type="email"
    {...register('email')}
    aria-invalid={!!errors.email}
  />
</FormField>
```

### 4. Loading States

```tsx
// Skeleton loader
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse bg-gray-200 rounded',
        className
      )}
    />
  );
}

// Loading state for lists
export function UserListSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center space-x-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-[200px]" />
            <Skeleton className="h-4 w-[150px]" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 5. Error States

```tsx
// Error boundary fallback
export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div className="text-center py-10">
      <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
      <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
      <p className="text-gray-600 mb-4">{error.message}</p>
      <Button onClick={resetError}>Try again</Button>
    </div>
  );
}

// Empty state
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-10">
      <Inbox className="h-12 w-12 text-gray-400 mx-auto mb-4" />
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      <p className="text-gray-600 mb-4">{description}</p>
      {action}
    </div>
  );
}
```

## Accessibility Checklist

```markdown
### Keyboard Navigation
- [ ] All interactive elements focusable
- [ ] Focus visible indicator
- [ ] Tab order logical
- [ ] Escape closes modals

### Screen Readers
- [ ] Alt text for images
- [ ] ARIA labels where needed
- [ ] Heading hierarchy correct
- [ ] Form labels associated

### Color & Contrast
- [ ] 4.5:1 contrast ratio for text
- [ ] Color not sole indicator
- [ ] Focus states visible

### Motion
- [ ] Respects prefers-reduced-motion
- [ ] Animations not disorienting
```

## Responsive Design

```tsx
// Responsive breakpoints (TailwindCSS)
// sm: 640px
// md: 768px
// lg: 1024px
// xl: 1280px
// 2xl: 1536px

// Mobile-first approach
<div className="
  grid
  grid-cols-1      // Mobile: 1 column
  sm:grid-cols-2   // Tablet: 2 columns
  lg:grid-cols-3   // Desktop: 3 columns
  gap-4
">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
```

## Common Patterns

### Modal/Dialog

```tsx
export function Modal({ open, onClose, title, children }: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
```

### Toast Notifications

```tsx
// Success toast
toast.success('Changes saved successfully');

// Error toast
toast.error('Failed to save changes');

// Custom toast
toast.custom((t) => (
  <div className="bg-white rounded-lg shadow-lg p-4">
    <p>Custom notification</p>
    <button onClick={() => toast.dismiss(t.id)}>Dismiss</button>
  </div>
));
```

### Data Tables

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Email</TableHead>
      <TableHead className="text-right">Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {users.map(user => (
      <TableRow key={user.id}>
        <TableCell>{user.name}</TableCell>
        <TableCell>{user.email}</TableCell>
        <TableCell className="text-right">
          <Button variant="ghost" size="sm">Edit</Button>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

## Output

When applying UI design:

```markdown
## UI Review

### Consistency
- [ ] Uses design system components
- [ ] Consistent spacing
- [ ] Consistent typography
- [ ] Color palette followed

### Accessibility
- [ ] WCAG 2.1 AA compliant
- [ ] Keyboard navigable
- [ ] Screen reader friendly

### Responsive
- [ ] Mobile-friendly
- [ ] Tablet-friendly
- [ ] Desktop optimized

### Performance
- [ ] Lazy loading implemented
- [ ] Images optimized
- [ ] No layout shift
```
