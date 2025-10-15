// Stub for server-only database modules
// This prevents Vite from bundling database connection code into the client bundle
throw new Error('Server-only module imported in client code. Use apiClient instead.');
