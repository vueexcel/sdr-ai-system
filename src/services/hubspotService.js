const axios = require('axios');

class HubSpotService {
  constructor() {
    // This will read the "HUBSPOT_ACCESS_TOKEN" variable from your .env file
    this.apiKey = process.env.HUBSPOT_ACCESS_TOKEN;

    if (!this.apiKey) {
      console.warn('⚠️ HUBSPOT_ACCESS_TOKEN not found in .env file. HubSpotService will not be functional.');
    }

    // Create a pre-configured axios instance for all HubSpot API calls
    this.apiClient = axios.create({
      baseURL: 'https://api.hubapi.com/crm/v3',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Main method to find/create a contact and company, then associate them.
   * This is the primary entry point for syncing a prospect to HubSpot.
   * @param {Object} prospect - A prospect object from your system's database.
   * @param {Object} options - Configuration options
   * @returns {Promise<Object>} - The result of the upsert operation.
   */
  async upsertProspect(prospect, options = {}) {
    if (!this.apiKey) {
      return { success: false, error: 'HubSpot Access Token is not configured.' };
    }

    // ✅ REMOVED: Email validation - ALL prospects will sync now
    // No more skipping prospects based on email

    try {
      // Step 1: Find or Create the Company in HubSpot
      let hubspotCompanyId = null;
      if (prospect.company) {
        const existingCompany = await this.findCompanyByName(prospect.company);
        if (existingCompany) {
          hubspotCompanyId = existingCompany.id;
          console.log(`🏢 Found existing HubSpot company: ${prospect.company} (ID: ${hubspotCompanyId})`);
        } else {
          const newCompany = await this.createCompany(prospect);
          hubspotCompanyId = newCompany.id;
          console.log(`✅ Created new HubSpot company: ${prospect.company} (ID: ${hubspotCompanyId})`);
        }
      }

      // Step 2: Find or Create the Contact in HubSpot
      let hubspotContactId = null;
      let action = 'created';
      
      // ✅ UPDATED: Only search by email if it's NOT a dummy email
      const isDummyEmail = !prospect.email || 
        prospect.email.startsWith('dummy') || 
        prospect.email === 'email_not_unlocked@domain.com' ||
        (prospect.email.includes('dummy') && prospect.email.includes('@gmail.com'));
      
      const existingContact = (prospect.email && !isDummyEmail) 
        ? await this.findContactByEmail(prospect.email) 
        : null;
      
      if (existingContact) {
        hubspotContactId = existingContact.id;
        action = 'updated';
        await this.updateContact(hubspotContactId, prospect, options);
        console.log(`🔄 Updated existing HubSpot contact: ${prospect.firstName} ${prospect.lastName} (ID: ${hubspotContactId})`);
      } else {
        const newContact = await this.createContact(prospect, options);
        hubspotContactId = newContact.id;
        console.log(`✅ Created new HubSpot contact: ${prospect.firstName} ${prospect.lastName} (ID: ${hubspotContactId})`);
      }

      // Step 3: Associate the Contact with the Company (if both exist)
      if (hubspotContactId && hubspotCompanyId) {
        await this.associateContactToCompany(hubspotContactId, hubspotCompanyId);
        console.log(`🔗 Associated contact ${hubspotContactId} with company ${hubspotCompanyId}`);
      }

      return {
        success: true,
        action,
        contactId: hubspotContactId,
        companyId: hubspotCompanyId
      };
    } catch (error) {
      console.error('❌ HubSpot Sync Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // --- Helper Methods for Contacts ---

  async findContactByEmail(email) {
    try {
      const response = await this.apiClient.post('/objects/contacts/search', {
        filterGroups: [{
          filters: [{
            propertyName: 'email',
            operator: 'EQ',
            value: email
          }]
        }],
        properties: ['email', 'firstname', 'lastname'],
        limit: 1
      });
      return response.data.total > 0 ? response.data.results[0] : null;
    } catch (error) {
      console.error(`Error finding HubSpot contact by email ${email}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async createContact(prospect, options = {}) {
    const properties = {
      firstname: prospect.firstName,
      lastname: prospect.lastName,
      jobtitle: prospect.title,
      company: prospect.company,
      website: prospect.linkedinUrl,
      address: prospect.location,
      campaign_id: options.customFields?.campaignInstanceId,
    };

    // ✅ UPDATED: Accept ALL emails including dummy emails
    if (prospect.email) {
      properties.email = prospect.email;
    }

    const response = await this.apiClient.post('/objects/contacts', { properties });
    return response.data;
  }

  async updateContact(contactId, prospect, options = {}) {
    const properties = {
      firstname: prospect.firstName,
      lastname: prospect.lastName,
      jobtitle: prospect.title,
      company: prospect.company,
      website: prospect.linkedinUrl,
      address: prospect.location,
      campaign_id: options.customFields?.campaignInstanceId,
    };

    // ✅ UPDATED: Accept ALL emails including dummy emails
    if (prospect.email) {
      properties.email = prospect.email;
    }

    const response = await this.apiClient.patch(`/objects/contacts/${contactId}`, { properties });
    return response.data;
  }

  // --- Helper Methods for Companies ---

  async findCompanyByName(name) {
    try {
      const response = await this.apiClient.post('/objects/companies/search', {
        filterGroups: [{
          filters: [{
            propertyName: 'name',
            operator: 'EQ',
            value: name
          }]
        }],
        properties: ['name', 'domain'],
        limit: 1
      });
      return response.data.total > 0 ? response.data.results[0] : null;
    } catch (error) {
      console.error(`Error finding HubSpot company by name ${name}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async createCompany(prospect) {
    let domain = null;
    // Attempt to extract a domain from the prospect's organization website URL if available
    if (prospect.organization?.websiteUrl) {
        try {
            const url = new URL(prospect.organization.websiteUrl.startsWith('http') ? prospect.organization.websiteUrl : `https://${prospect.organization.websiteUrl}`);
            domain = url.hostname.replace('www.', '');
        } catch (e) { /* ignore invalid URLs */ }
    }

    const properties = {
      name: prospect.company,
      domain: domain,
      industry: prospect.industry,
      city: prospect.organization?.location?.split(',')[0]?.trim(),
      state: prospect.organization?.location?.split(',')[1]?.trim(),
    };
    const response = await this.apiClient.post('/objects/companies', { properties });
    return response.data;
  }

  // --- Helper Method for Associations ---

  async associateContactToCompany(contactId, companyId) {
    // In the HubSpot V3 API, the standard "Contact to Company" association type ID is 1.
    const associationTypeId = 1; 
    try {
      // The body of this PUT request is an empty array.
      await this.apiClient.put(`/objects/contacts/${contactId}/associations/company/${companyId}/${associationTypeId}`, []);
    } catch (error) {
      // HubSpot can throw a 400-level error if the association already exists.
      // We can safely ignore this specific error and consider the operation successful.
      if (error.response?.data?.message?.includes('already exists')) {
        console.log(`- Association between contact ${contactId} and company ${companyId} already exists.`);
      } else {
        // For all other errors, we should report them.
        console.error(`Error creating association:`, error.response?.data || error.message);
        throw error;
      }
    }
  }
}

module.exports = HubSpotService;
