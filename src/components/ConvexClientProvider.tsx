import { ReactNode } from 'react';
import { ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { useAuth } from '@clerk/clerk-react';

/**
 * Determines the Convex deployment to use.
 *
 * We perform load balancing on the frontend, by randomly selecting one of the available instances.
 * We use localStorage so that individual users stay on the same instance.
 */
function convexUrl(): string {
  // Fix: Cast `import.meta` to `any` to access `env`.
  const url = (import.meta as any).env.VITE_CONVEX_URL as string;
  if (!url) {
    throw new Error('Couldn’t find the Convex deployment URL.');
  }
  return url;
}

const convex = new ConvexReactClient(convexUrl(), { unsavedChangesWarning: false });

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    // Fix: Pass children as a prop to satisfy the component's type definition.
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}