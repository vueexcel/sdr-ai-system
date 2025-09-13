// Utility functions for the AI SDR system

class Utils {
  // Format phone numbers
  static formatPhoneNumber(phone) {
    if (!phone) return null;
    
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Format US phone numbers
    if (digits.length === 10) {
      return `+1-${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits.slice(0,1)}-${digits.slice(1,4)}-${digits.slice(4,7)}-${digits.slice(7)}`;
    }
    
    return phone; // Return original if can't format
  }

  // Clean and format names
  static formatName(firstName, lastName) {
    const cleanFirst = firstName?.trim().replace(/[^\w\s-']/g, '') || '';
    const cleanLast = lastName?.trim().replace(/[^\w\s-']/g, '') || '';
    
    return {
      firstName: cleanFirst,
      lastName: cleanLast,
      fullName: `${cleanFirst} ${cleanLast}`.trim()
    };
  }

  // Validate email
  static isValidEmail(email) {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Extract company domain from email
  static extractDomain(email) {
    if (!email || !this.isValidEmail(email)) return null;
    return email.split('@')[1].toLowerCase();
  }

  // Generate random delay for rate limiting
  static randomDelay(min = 1000, max = 3000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  // Format location string
  static formatLocation(city, state, country = 'US') {
    const parts = [city, state, country === 'US' ? null : country].filter(Boolean);
    return parts.join(', ');
  }

  // Log with timestamp
  static log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }
}

module.exports = Utils;
