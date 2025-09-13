// services/hubspotEmail.js
const axios = require('axios');

class HubSpotEmailService {
  constructor() {
    this.baseURL = 'https://api.hubapi.com';
    this.accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
    
    if (!this.accessToken) {
      throw new Error('HUBSPOT_ACCESS_TOKEN is required in environment variables');
    }

    // Create axios instance with default config
    this.apiClient = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Find HubSpot contact by email
   * @param {string} email - Contact email address
   * @returns {Object|null} Contact object or null if not found
   */
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
   * Update HubSpot contact with email action
   * @param {string} contactId - HubSpot contact ID
   * @param {string} emailAction - Email action performed
   * @param {Object} contactData - Additional contact data from webhook
   * @returns {Object} Updated contact data
   */
  async updateEmailAction(contactId, emailAction, contactData = {}) {
    try {
      console.log(`📧 Updating email action for contact ${contactId}: ${emailAction}`);

      const updateData = {
        properties: {
          // Your custom "Email Actions" property (use the internal name from HubSpot)
          email_actions: emailAction,
          
          // Additional tracking fields
          last_email_action: emailAction,
          last_email_action_date: new Date().toISOString(),
          
          // Update lead status based on action
          leadstatus: this.getLeadStatusFromEmailAction(emailAction),
          
          // LinkedIn interaction if applicable
          linkedin_interaction: this.getLinkedInInteraction(emailAction),
          
          // Update last activity date
          notes_last_contacted: new Date().toISOString()
        }
      };

      // Add optional contact data updates
      if (contactData.first_name) updateData.properties.firstname = contactData.first_name;
      if (contactData.last_name) updateData.properties.lastname = contactData.last_name;
      if (contactData.company) updateData.properties.company = contactData.company;
      if (contactData.job_title) updateData.properties.jobtitle = contactData.job_title;

      const response = await this.apiClient.patch(
        `/crm/v3/objects/contacts/${contactId}`,
        updateData
      );

      console.log(`✅ HubSpot contact ${contactId} updated successfully with action: ${emailAction}`);
      return response.data;

    } catch (error) {
      console.error('❌ Error updating HubSpot contact:', error.response?.data || error.message);
      throw new Error(`Failed to update contact: ${error.message}`);
    }
  }

  /**
   * Update multiple contacts with email actions (batch processing)
   * @param {Array} updates - Array of {contactId, emailAction, contactData}
   * @returns {Array} Results of batch updates
   */
  async updateMultipleEmailActions(updates) {
    try {
      console.log(`🔄 Processing batch update for ${updates.length} contacts`);
      
      const results = [];
      
      // Process updates in parallel (be careful with rate limits)
      const promises = updates.map(async (update) => {
        try {
          const result = await this.updateEmailAction(
            update.contactId,
            update.emailAction,
            update.contactData
          );
          return { success: true, contactId: update.contactId, result };
        } catch (error) {
          return { success: false, contactId: update.contactId, error: error.message };
        }
      });

      const batchResults = await Promise.all(promises);
      
      const successful = batchResults.filter(r => r.success).length;
      const failed = batchResults.filter(r => !r.success).length;
      
      console.log(`✅ Batch update completed: ${successful} successful, ${failed} failed`);
      
      return batchResults;
    } catch (error) {
      console.error('Error in batch update:', error);
      throw error;
    }
  }

  /**
   * Get email action history for a contact
   * @param {string} contactId - HubSpot contact ID
   * @returns {Object} Contact with email action history
   */
  async getEmailActionHistory(contactId) {
    try {
      const response = await this.apiClient.get(
        `/crm/v3/objects/contacts/${contactId}`,
        {
          params: {
            properties: [
              'email',
              'email_actions',
              'last_email_action',
              'last_email_action_date',
              'leadstatus',
              'linkedin_interaction'
            ]
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error getting email action history:', error);
      throw new Error(`Failed to get history: ${error.message}`);
    }
  }

  /**
   * Map email actions to lead status
   * @param {string} emailAction - Email action performed
   * @returns {string} Corresponding lead status
   */
  getLeadStatusFromEmailAction(emailAction) {
    const statusMap = {
      'Email sent': 'Attempted Contact',
      'Email opened': 'Engaged',
      'Email replied': 'Engaged',
      'Email bounced': 'Lost - Bad Contact Info',
      'Email sequence active': 'In Sequence',
      'Email clicked': 'Engaged',
      'Email unsubscribed': 'Lost - Unsubscribed'
    };
    
    return statusMap[emailAction] || 'Attempted Contact';
  }

  /**
   * Map email actions to LinkedIn interaction
   * @param {string} emailAction - Email action performed
   * @returns {string} Corresponding LinkedIn interaction
   */
  getLinkedInInteraction(emailAction) {
    const interactionMap = {
      'Email sent': 'Message Sent',
      'Email opened': 'Message Opened',
      'Email replied': 'Message Replied',
      'Email clicked': 'Link Clicked',
      'Email sequence active': 'Follow-up Sequence'
    };
    
    return interactionMap[emailAction] || 'Email Interaction';
  }

  /**
   * Create a new contact with email action
   * @param {Object} contactData - Contact data including email
   * @param {string} emailAction - Initial email action
   * @returns {Object} Created contact data
   */
  async createContactWithEmailAction(contactData, emailAction) {
    try {
      console.log(`➕ Creating new contact with email action: ${contactData.email}`);

      const createData = {
        properties: {
          email: contactData.email,
          firstname: contactData.first_name || '',
          lastname: contactData.last_name || '',
          company: contactData.company || '',
          jobtitle: contactData.job_title || '',
          
          // Email action properties
          email_actions: emailAction,
          last_email_action: emailAction,
          last_email_action_date: new Date().toISOString(),
          leadstatus: this.getLeadStatusFromEmailAction(emailAction),
          linkedin_interaction: this.getLinkedInInteraction(emailAction)
        }
      };

      const response = await this.apiClient.post('/crm/v3/objects/contacts', createData);
      
      console.log(`✅ Created new contact: ${response.data.id} - ${contactData.email}`);
      return response.data;

    } catch (error) {
      console.error('Error creating contact:', error.response?.data || error.message);
      throw new Error(`Failed to create contact: ${error.message}`);
    }
  }

  /**
   * Get all available email action values
   * @returns {Array} List of possible email actions
   */
  getAvailableEmailActions() {
    return [
      'Email sent',
      'Email opened',
      'Email replied',
      'Email bounced',
      'Email clicked',
      'Email unsubscribed',
      'Email sequence active'
    ];
  }

  /**
   * Validate email action
   * @param {string} emailAction - Email action to validate
   * @returns {boolean} Whether the action is valid
   */
  isValidEmailAction(emailAction) {
    return this.getAvailableEmailActions().includes(emailAction);
  }
}

module.exports = new HubSpotEmailService();
