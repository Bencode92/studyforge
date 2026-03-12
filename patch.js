// FIX: This file patches the UTF-8 encoding issue
// Load this AFTER the main index.html script

// Override ghGet with proper UTF-8 decoding
const _origGhGet = ghGet;
ghGet = async function(p) {
  try {
    const d = await ghRead(p);
    // Proper UTF-8 decode from base64
    const binaryStr = atob(d.content);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const text = new TextDecoder('utf-8').decode(bytes);
    return { content: JSON.parse(text), sha: d.sha };
  } catch { return null; }
};
