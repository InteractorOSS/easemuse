# Mobile Project Configuration

## Technology Stack

This is a mobile application project. Apply the following technology-specific guidance.

### Framework
- **React Native** with Expo

### Build Tools
- Expo CLI / EAS Build

### State Management
- **Zustand** / Redux Toolkit for client state
- **React Query** for server state

### Navigation
- React Navigation

---

## Project Structure

### React Native (Expo)
```
src/
├── app/                 # App entry, navigation setup
├── components/
│   ├── ui/              # Base components (Button, Input, Card)
│   ├── screens/         # Screen components
│   └── features/        # Feature-specific components
├── hooks/               # Custom hooks
├── navigation/          # Navigation configuration
├── services/            # API services
├── stores/              # State management
├── theme/               # Colors, fonts, spacing
├── types/               # TypeScript types
└── utils/               # Utilities
```

---

## Commands

### React Native (Expo)
```bash
# Development
npm start                # Start Metro bundler
npm run ios              # Run on iOS simulator
npm run android          # Run on Android emulator

# Testing
npm test                 # Run tests
npm run test:watch       # Watch mode

# Build
eas build --platform ios
eas build --platform android
eas build --platform all

# Submit
eas submit --platform ios
eas submit --platform android
```

---

## Component Guidelines

### React Native
```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}

export function Button({ label, onPress, variant = 'primary' }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  primary: {
    backgroundColor: '#007AFF',
  },
  secondary: {
    backgroundColor: '#E5E5EA',
  },
  pressed: {
    opacity: 0.8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    color: '#FFFFFF',
  },
});
```

---

## Navigation

### React Navigation
```tsx
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const Stack = createNativeStackNavigator<RootStackParamList>();

function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Details" component={DetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

### Type-Safe Navigation
```typescript
type RootStackParamList = {
  Home: undefined;
  Details: { id: string };
  Profile: { userId: string };
};

// Usage
navigation.navigate('Details', { id: '123' });
```

---

## Platform-Specific Code

### React Native
```tsx
import { Platform } from 'react-native';

const styles = StyleSheet.create({
  container: {
    paddingTop: Platform.select({
      ios: 20,
      android: 0,
    }),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
      },
      android: {
        elevation: 4,
      },
    }),
  },
});

// File-based: Component.ios.tsx, Component.android.tsx
```

---

## Offline Support

### Data Persistence
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

// Store data
await AsyncStorage.setItem('user', JSON.stringify(user));

// Retrieve data
const userData = await AsyncStorage.getItem('user');
const user = userData ? JSON.parse(userData) : null;
```

### Offline-First Architecture
- Cache API responses locally
- Sync when connection restored
- Show cached data immediately
- Indicate sync status to user

---

## Performance

### List Optimization
```tsx
import { FlashList } from '@shopify/flash-list';

<FlashList
  data={items}
  renderItem={({ item }) => <ItemCard item={item} />}
  estimatedItemSize={100}
  keyExtractor={(item) => item.id}
/>
```

### Image Optimization
```tsx
import { Image } from 'expo-image';

<Image
  source={{ uri: imageUrl }}
  style={styles.image}
  contentFit="cover"
  placeholder={blurhash}
  transition={200}
/>
```

### Memory Management
- Avoid inline functions in render
- Use `useMemo` and `useCallback`
- Clean up subscriptions/listeners
- Profile with Flipper/DevTools

---

## Testing

### Component Testing
```tsx
import { render, fireEvent } from '@testing-library/react-native';

describe('Button', () => {
  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button label="Press me" onPress={onPress} />
    );

    fireEvent.press(getByText('Press me'));

    expect(onPress).toHaveBeenCalled();
  });
});
```

### E2E Testing (Detox)
```javascript
describe('Login Flow', () => {
  it('should log in successfully', async () => {
    await element(by.id('email-input')).typeText('user@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();

    await expect(element(by.text('Welcome'))).toBeVisible();
  });
});
```

---

## Security

### Secure Storage
```typescript
import * as SecureStore from 'expo-secure-store';

// Store sensitive data
await SecureStore.setItemAsync('authToken', token);

// Retrieve
const token = await SecureStore.getItemAsync('authToken');
```

### Best Practices
- Never store secrets in code
- Use secure storage for tokens
- Implement certificate pinning
- Obfuscate release builds
- Validate inputs client-side AND server-side

---

## App Store Guidelines

### iOS (App Store)
- [ ] Privacy policy URL
- [ ] App tracking transparency
- [ ] In-app purchase compliance
- [ ] Data collection disclosure

### Android (Play Store)
- [ ] Privacy policy
- [ ] Data safety section
- [ ] Target SDK requirements
- [ ] Permissions justification

---

## Accessibility

### Checklist
- [ ] `accessibilityLabel` on interactive elements
- [ ] `accessibilityRole` specified
- [ ] `accessibilityHint` for complex actions
- [ ] Touch targets >= 44x44 points
- [ ] VoiceOver/TalkBack tested
- [ ] Sufficient color contrast
