// navigator.clipboard is undefined outside secure contexts, e.g. plain HTTP on a LAN address.
export function copyText(text: string): Promise<void> {
  return navigator.clipboard
    ? navigator.clipboard.writeText(text)
    : Promise.reject(new Error("Clipboard unavailable"));
}
