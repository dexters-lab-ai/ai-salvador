import React, { ReactNode } from 'react';
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
  const url = import.meta.env.VITE_CONVEX_URL;
  if (!url) {
    throw new Error('Couldn\'t find the Convex deployment URL. Make sure VITE_CONVEX_URL is set in your .env file.');
  }
  return url;
}

// Create a single Convex client instance
let convexClient: ConvexReactClient | null = null;

const getConvexClient = (): ConvexReactClient => {
  if (!convexClient) {
    convexClient = new ConvexReactClient(convexUrl(), { 
      unsavedChangesWarning: false 
    });
  }
  return convexClient;
};

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  // Ensure we're in the browser before rendering the provider
  if (typeof window === 'undefined') {
    return <>{children}</>;
  }

  const convex = getConvexClient();

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}