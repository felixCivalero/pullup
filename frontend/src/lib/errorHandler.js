// frontend/src/lib/errorHandler.js
// Centralized helpers for API + network error handling

export function isNetworkError(error) {
  if (!error) return false;
  return (
    error instanceof TypeError ||
    error.message?.includes("Failed to fetch") ||
    error.message?.includes("NetworkError")
  );
}

export async function parseApiError(res) {
  if (!res) return null;
  try {
    const data = await res.json();
    return data?.error || data?.message || null;
  } catch {
    return null;
  }
}

export async function handleApiError(res, showToast, fallbackMessage) {
  const msg = await parseApiError(res);
  const message =
    msg || fallbackMessage || "Something went wrong. Please try again.";
  if (showToast) showToast(message, "error");
}

export function handleNetworkError(error, showToast, fallbackMessage) {
  console.error(error);
  const message =
    fallbackMessage ||
    "Network error. Please check your connection and try again.";
  if (showToast) showToast(message, "error");
}
