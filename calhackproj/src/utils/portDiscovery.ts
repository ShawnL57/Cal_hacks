// Global port configuration
const MUSE_API_PORTS = [5000, 5001, 5002, 5003, 5004, 5005];

let cachedPort: number | null = null;

/**
 * Discover which port the Muse API is running on
 * Caches the result for performance
 */
export async function discoverMusePort(): Promise<number | null> {
  // Return cached port if available
  if (cachedPort !== null) {
    try {
      const response = await fetch(`http://localhost:${cachedPort}/api/metrics`);
      if (response.ok) return cachedPort;
    } catch {
      // Cached port failed, rediscover
      cachedPort = null;
    }
  }

  // Try all ports
  for (const port of MUSE_API_PORTS) {
    try {
      const response = await fetch(`http://localhost:${port}/api/metrics`);
      if (response.ok) {
        console.log(`✅ Found Muse API on port ${port}`);
        cachedPort = port;
        return port;
      }
    } catch {
      // Port not available, try next
    }
  }

  return null;
}

/**
 * Fetch Muse metrics with automatic port discovery
 */
export async function fetchMuseMetrics() {
  const port = await discoverMusePort();
  if (!port) {
    throw new Error('Muse API not found on any port');
  }

  const response = await fetch(`http://localhost:${port}/api/metrics`);
  if (!response.ok) {
    throw new Error('Failed to fetch metrics');
  }

  return response.json();
}

/**
 * Make a request to the Muse API with automatic port discovery
 */
export async function museApiRequest(endpoint: string, options?: RequestInit) {
  const port = await discoverMusePort();
  if (!port) {
    throw new Error('Muse API not found on any port');
  }

  const url = `http://localhost:${port}${endpoint}`;
  return fetch(url, options);
}
