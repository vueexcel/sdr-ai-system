// services/hubspotEmail.js
const axios = require('axios');

class HubSpotEmailService {
  constructor() {
    this.baseURL = 'https://api.hubapi.com';
    this.accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
    
    if (!this.accessToken) {
      throw new Error('HUBSPOT_ACCESS_TOKEN is required in environment variables');
    }

    this.apiClient = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async findContactByEmail(email) {
    try {
      console.log(`🔍 Searching for contact: ${email}`);
      
      const response = await this.apiClient.post('/crm/v3/objects/contacts/search', {
        filterGroups: [{
          filters: [{
            propertyName: 'email',
            operator: 'EQ',
            value: email
          }]
        }]
      });

      const contact = response.data.results[0] || null;
      
      if (contact) {
        console.log(`✅ Found contact: ${contact.id} - ${email}`);
      } else {
        console.log(`❌ Contact not found: ${email}`);
      }

      return contact;
    } catch (error) {
      console.error('Error finding HubSpot contact:', error.response?.data || error.message);
      throw new Error(`Failed to find contact: ${error.message}`);
    }
  }

  /**
   * Update ONLY the email_actions property - nothing else
   */
  async updateEmailAction(contactId, emailAction, contactData = {}) {
    try {
      console.log(`📧 Updating email action for contact ${contactId}: ${emailAction}`);

      // ONLY update email_actions - nothing else
      const updateData = {
        properties: {
          "email_actions": emailAction
        }
      };

      console.log('📤 Sending to HubSpot:', JSON.stringify(updateData, null, 2));

      const response = await this.apiClient.patch(
        `/crm/v3/objects/contacts/${contactId}`,
        updateData
      );

      console.log(`✅ HubSpot contact ${contactId} updated successfully with: ${emailAction}`);
      return response.data;

    } catch (error) {
      console.error('❌ HubSpot API Error Details:');
      console.error('Status:', error.response?.status);
      console.error('Response:', JSON.stringify(error.response?.data, null, 2));
      throw new Error(`Failed to update contact: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = new HubSpotEmailService();
