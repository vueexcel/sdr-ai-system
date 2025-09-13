const axios = require('axios');

class ApolloEnrichmentService {
  constructor() {
    this.apiKey = process.env.APOLLO_API_KEY;
    this.baseURL = 'https://api.apollo.io/api/v1';
  }

  /**
   * Enriches a single prospect's data using Apollo's People Enrich endpoint.
   */
  async enrichPerson(
    prospect,
    revealPersonalEmails = false,
    revealPhoneNumber = false,
    webhookUrl = null
  ) {
    try {
      const logName = `${prospect.first_name || 'N/A'} ${prospect.last_name || 'N/A'}`;
      console.log(`🔎 Enriching prospect: ${logName}`);

      const requestBody = {
        reveal_personal_emails: revealPersonalEmails,
        reveal_phone_number: revealPhoneNumber
      };

      if (revealPhoneNumber && webhookUrl) {
        requestBody.webhook_url = webhookUrl;
      }

      if (prospect.id) {
        requestBody.id = prospect.id;
      } else if (prospect.linkedin_url) {
        requestBody.linkedin_url = prospect.linkedin_url;
      } else if (prospect.email && prospect.email !== 'email_not_unlocked@domain.com') {
        requestBody.email = prospect.email;
      } else {
        requestBody.first_name = prospect.first_name;
        requestBody.last_name = prospect.last_name;
        requestBody.organization_name = prospect.organization?.name;
      }

      const response = await axios.post(`${this.baseURL}/people/enrich`, requestBody, {
        headers: {
          'X-Api-Key': this.apiKey,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      const enrichedPerson = response.data.person;

      if (enrichedPerson) {
        // Show email status instead of full debug data
        const emailStatus = enrichedPerson.email_status || 'not_provided';
        const hasEmail = enrichedPerson.email || (enrichedPerson.personal_emails && enrichedPerson.personal_emails.length > 0);
        
        if (hasEmail) {
          console.log(`✅ Enriched ${logName} - Email: Available (${emailStatus})`);
        } else {
          console.log(`ℹ️ Enriched ${logName} - Email: ${emailStatus}`);
        }
        
        return enrichedPerson;
      } else {
        console.warn(`⚠️ No enrichment found for prospect: ${logName}`);
        return null;
      }
    } catch (error) {
      const logName = `${prospect.first_name || 'N/A'} ${prospect.last_name || 'N/A'}`;
      console.error(`❌ Error enriching prospect ${logName}:`, error.response?.data?.error || error.message);
      return null;
    }
  }

  /**
   * Bulk enriches multiple prospects by calling enrichPerson for each.
   */
  async bulkEnrichPeople(
    prospects,
    revealPersonalEmails = false,
    revealPhoneNumber = false,
    webhookUrl = null
  ) {
    console.log(`🚀 Starting bulk enrichment for ${prospects.length} prospects...`);
    const enrichedResults = [];
    
    for (const prospect of prospects) {
      try {
        const enriched = await this.enrichPerson(
          prospect,
          revealPersonalEmails,
          revealPhoneNumber,
          webhookUrl
        );
        
        if (enriched) {
          enrichedResults.push(enriched);
        }
        
        // Add delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Failed to enrich prospect:`, error.message);
        continue;
      }
    }
    
    console.log(`✅ Bulk enrichment complete. ${enrichedResults.length} prospects successfully enriched.`);
    return enrichedResults;
  }
}

module.exports = ApolloEnrichmentService;
