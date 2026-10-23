
// Simple obfuscation to prevent casual modification
const SALT = 'AIRCRASHSIM2025';

export const encryptFlightData = (data) => {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    // Simple XOR with SALT
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
      const charCode = bytes[i] ^ SALT.charCodeAt(i % SALT.length);
      result += String.fromCharCode(charCode);
    }
    // Convert to Base64 to make it safe for file storage
    return 'ACS2:' + btoa(result);
  } catch (error) {
    console.error('Encryption failed:', error);
    return null;
  }
};

export const decryptFlightData = (encryptedString) => {
  try {
    // Decode Base64
    const utf8 = encryptedString.startsWith('ACS2:');
    const xorString = atob(utf8 ? encryptedString.slice(5) : encryptedString);
    let result = '';
    for (let i = 0; i < xorString.length; i++) {
      const charCode = xorString.charCodeAt(i) ^ SALT.charCodeAt(i % SALT.length);
      result += String.fromCharCode(charCode);
    }
    return JSON.parse(utf8 ? new TextDecoder().decode(Uint8Array.from(result, char => char.charCodeAt(0))) : result);
  } catch (error) {
    console.error('Decryption failed:', error);
    return null;
  }
};
