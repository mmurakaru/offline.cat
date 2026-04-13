# CLAUDE.md

## Code Conventions

### Name every useEffect

Always pass a named function to `useEffect` instead of an anonymous arrow function. The name should describe what the effect does, so the data flow of a component is readable by scanning function names alone - without reading the effect bodies.

```tsx
// Good
useEffect(function connectToWebSocket() {
  // ...
}, [url]);

// Bad
useEffect(() => {
  // ...
}, [url]);
```
