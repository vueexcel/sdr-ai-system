const axios = require('axios');
const OpenAI = require('openai');
const { PrismaClient } = require('@prisma/client');
const ExpandiService = require('./expandiService');
const ApolloEnrichmentService = require('./apolloEnrichmentService');
const HubSpotService = require('./hubspotService');

class ApolloService {
  constructor() {
    this.apiKey = process.env.APOLLO_API_KEY;
    this.baseURL = 'https://api.apollo.io/api/v1';
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.prisma = new PrismaClient();
    
    this.expandiService = new ExpandiService();
    // NEW: Initialize ApolloEnrichmentService
    this.apolloEnrichmentService = new ApolloEnrichmentService(); 
    this.hubspotService = new HubSpotService(); 
  }

  // ENHANCED: Save prospects with auto-assignment to Expandi campaign
  async saveProspectsToDatabase(prospects, options = {}) {
    try {
      console.log(`💾 Saving ${prospects.length} prospects to database...`);
      
      let savedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      let savedProspectsForExpandi = [];
      let savedProspectsForCrm = [];

      for (const prospect of prospects) {
        try {
          if (!prospect.first_name && !prospect.last_name) {
            skippedCount++; continue;
          }

          let organizationId = null;
          if (prospect.organization?.name) {
            let domain = null;
            if (prospect.organization.website_url) {
              try {
                const url = new URL(prospect.organization.website_url.startsWith('http') ? prospect.organization.website_url : `https://${prospect.organization.website_url}`);
                domain = url.hostname.replace('www.', '');
              } catch (e) { domain = prospect.organization.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'; }
            } else { domain = prospect.organization.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'; }
            
            const organizationData = {
              name: prospect.organization.name, domain: domain, industry: prospect.organization.industry || null,
              employeesCount: prospect.organization.estimated_num_employees || null,
              location: prospect.organization.city ? `${prospect.organization.city}, ${prospect.organization.state || ''}`.trim().replace(/,$/, '') : null,
              linkedinUrl: prospect.organization.linkedin_url || null, websiteUrl: prospect.organization.website_url || null,
              revenue: prospect.organization.estimated_revenue_printed || null,
            };
            const organization = await this.prisma.organization.upsert({
              where: { domain: domain }, update: { ...organizationData, updatedAt: new Date() }, create: organizationData
            });
            organizationId = organization.id;
          }

          const prospectData = {
            firstName: prospect.first_name || '', lastName: prospect.last_name || '', title: prospect.title || null,
            company: prospect.organization?.name || null, email: prospect.email || null, phone: prospect.phone_number || null,
            linkedinUrl: prospect.linkedin_url || null, industry: prospect.organization?.industry || null,
            location: prospect.city ? `${prospect.city}, ${prospect.state || ''}`.trim().replace(/,$/, '') : null,
            apolloContactId: prospect.id?.toString() || null, organizationId: organizationId, status: 'NEW', updatedAt: new Date()
          };

          let whereClause = null; let isUpdate = false; let existingInternalProspect = null; 
          if (prospectData.apolloContactId) { existingInternalProspect = await this.prisma.prospect.findUnique({ where: { apolloContactId: prospectData.apolloContactId } }); }
          if (!existingInternalProspect && prospect.linkedin_url) { existingInternalProspect = await this.prisma.prospect.findUnique({ where: { linkedinUrl: prospect.linkedin_url } }); }
          if (existingInternalProspect) { whereClause = { id: existingInternalProspect.id }; isUpdate = true; }
          
          let result;
          if (isUpdate && whereClause) {
            result = await this.prisma.prospect.update({ where: whereClause, data: prospectData });
            updatedCount++;
          } else {
            result = await this.prisma.prospect.create({ data: prospectData });
            savedCount++;
          }
          
          if (result.linkedinUrl) {
            savedProspectsForExpandi.push({ id: result.id, linkedinUrl: result.linkedinUrl, firstName: result.firstName, company: result.company, email: result.email });
          }
          savedProspectsForCrm.push(result);

          const contactMethods = [];
          if (result.email && result.email !== 'email_not_unlocked@domain.com') contactMethods.push(`📧 ${result.email}`);
          if (result.linkedinUrl) contactMethods.push(`🔗 LinkedIn`);
          if (result.phone) contactMethods.push(`📞 Phone`);
          const contactInfo = contactMethods.length > 0 ? ` (${contactMethods.join(', ')})` : ' (No direct contact info found)';

          if (isUpdate) console.log(`🔄 Updated prospect: ${result.firstName} ${result.lastName}${contactInfo}`);
          else console.log(`✅ Saved NEW prospect: ${result.firstName} ${result.lastName}${contactInfo}`);

        } catch (error) {
          console.error(`❌ Error saving prospect ${prospect.first_name || 'N/A'}:`, error.message);
          skippedCount++; continue;
        }
      }

      console.log(`✅ Database save complete: Saved: ${savedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}`);
      
      let expandiResult = null;
      if (options.assignToExpandi && savedProspectsForExpandi.length > 0) {
        expandiResult = await this.expandiService.assignProspectsBatch(savedProspectsForExpandi, options.customFields || {}, options.campaignInstanceId);
      }
      
      return { saved: savedCount, updated: updatedCount, skipped: skippedCount, expandiResult: expandiResult, savedProspectsForCrm: savedProspectsForCrm };
    } catch (error) {
      console.error('❌ Database save error:', error);
      return { saved: 0, updated: 0, skipped: 0, error: error.message };
    }
  }

  // This should be a pure search function. The main workflow handles saving.
  async searchProspectsFromString(inputString, options = {}) {
    try {
      const searchCriteria = await this.parseSearchString(inputString);
      const finalCriteria = { ...searchCriteria, page: options.page || 1, limit: options.limit || 25, maxCompanies: options.maxCompanies || 5 };
      console.log('🎯 Executing search with parsed criteria...');
      const prospects = await this.findAllProspects(finalCriteria);
      return { originalInput: inputString, parsedCriteria: searchCriteria, prospects: prospects, totalFound: prospects.length };
    } catch (error) {
      console.error('❌ Search from string error:', error);
      return { originalInput: inputString, parsedCriteria: null, prospects: [], totalFound: 0, error: error.message };
    }
  }


  // NEW: Method to assign existing prospects from database to Expandi campaign
  async assignProspectsToExpandi(status = 'NEW', limit = 10, customFields = {}, campaignInstanceId = null) {
    try {
      console.log(`🚀 Assigning prospects with status '${status}' to Expandi campaign...`);
      
      const result = await this.expandiService.assignProspectsFromDatabase(
        status, 
        limit, 
        customFields, 
        campaignInstanceId
      );
      
      console.log(`✅ Expandi assignment complete: ${result.successful} successful, ${result.failed} failed`);
      return result;
      
    } catch (error) {
      console.error('❌ Error assigning prospects to Expandi:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Keep all your existing methods unchanged...
  async getAllProspects(limit = 20) {
    try {
      const prospects = await this.prisma.prospect.findMany({
        include: {
          organization: true
        },
        orderBy: {
          updatedAt: 'desc'
        },
        take: limit
      });
      
      console.log(`\n📋 DATABASE CONTENTS - Found ${prospects.length} prospects:`);
      console.log('='.repeat(80));
      
      let withEmail = 0;
      let withLinkedIn = 0;
      let withPhone = 0;
      let inCampaign = 0; // NEW: Track prospects in campaign
      
      prospects.forEach((p, index) => {
        console.log(`${index + 1}. ${p.firstName} ${p.lastName}`);
        console.log(`   Status: ${p.status} | Company: ${p.company || 'Unknown'}`);
        
        // Show contact methods
        const contactMethods = [];
        if (p.email) {
          contactMethods.push(`📧 ${p.email}`);
          withEmail++;
        }
        if (p.linkedinUrl) {
          contactMethods.push(`🔗 LinkedIn`);
          withLinkedIn++;
        }
        if (p.phone) {
          contactMethods.push(`📞 ${p.phone}`);
          withPhone++;
        }
        
        // NEW: Show campaign status
        if (p.status === 'IN_CAMPAIGN') {
          inCampaign++;
          contactMethods.push(`🚀 In Campaign`);
        }
        
        console.log(`   Contact: ${contactMethods.length > 0 ? contactMethods.join(', ') : 'No contact info'}`);
        console.log(`   Created: ${p.createdAt.toISOString()}`);
        console.log('   ---');
      });
      
      console.log(`\n📊 Contact Methods Summary:`);
      console.log(`   📧 Email: ${withEmail} prospects`);
      console.log(`   🔗 LinkedIn: ${withLinkedIn} prospects`);
      console.log(`   📞 Phone: ${withPhone} prospects`);
      console.log(`   🚀 In Campaign: ${inCampaign} prospects`); // NEW
      
      return prospects;
    } catch (error) {
      console.error('❌ Error fetching prospects:', error);
      return [];
    }
  }

  // Keep your existing helper methods unchanged...
  async parseSearchString(inputString) {
    // Your OpenAI parsing logic here...
    try {
      console.log('🤖 Parsing input with OpenAI:', inputString);
      const prompt = `
Extract search criteria from this text and return ONLY a valid JSON object. Use simple, broad Apollo.io compatible values:
LOCATION FORMATS (use simple names): "san francisco", "california", "new york", "united states"
INDUSTRY FORMATS (use broad categories): "software", "technology", "healthcare", "manufacturing", "financial services", "marketing"
JOB TITLES (use common variations): "marketing manager", "sales manager", "software engineer", "cto"
{
  "jobTitles": ["simple job titles"], "industries": ["broad industry categories"], "locations": ["simple location names"],
  "companySizes": ["ranges like '1,10', '11,50', '51,200'"], "keywords": ["simple keywords"],
  "targetCompany": "company name if searching for specific company, or null", "seniorityLevel": "broad level: manager, director, senior"
}
EXAMPLES:
- "marketing employees at Google" → targetCompany: "Google"
- "sales managers in California" → targetCompany: null
Keep it SIMPLE and BROAD to get results.
Text: "${inputString}"
`;
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 400
      });
      const parsedData = JSON.parse(response.choices[0].message.content.trim());
      if (!parsedData.companySizes || parsedData.companySizes.length === 0) {
        parsedData.companySizes = ['1,10', '11,50', '51,200', '201,500', '501,1000'];
      }
      console.log('✅ Parsed search criteria:', JSON.stringify(parsedData, null, 2));
      return parsedData;
    } catch (error) {
      console.error('❌ OpenAI parsing error:', error.message);
      return { jobTitles: [inputString] }; // Fallback to using the whole string as a job title
    }
  }

  // Keep all your existing search methods unchanged...
  async findProspectsAtCompany(companyName, jobTitles = [], options = {}) {
    try {
      console.log(`🎯 Searching prospects at ${companyName}`);
      const params = new URLSearchParams();
      params.append('organization_names[]', companyName);
      if (jobTitles && jobTitles.length > 0) {
        jobTitles.forEach(title => params.append('person_titles[]', title));
      }
      if (options.seniorityLevel) params.append('person_seniority_levels[]', options.seniorityLevel);
      params.append('per_page', options.limit || 25);
      const url = `${this.baseURL}/mixed_people/search?${params.toString()}`;
      const response = await axios.post(url, {}, {
        headers: {
          'x-api-key': this.apiKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      });
      console.log(`👥 Found ${response.data.people?.length || 0} prospects at ${companyName}`);
      return response.data.people || [];
    } catch (error) {
      console.error(`❌ Error searching ${companyName}:`, error.response?.data || error.message);
      return [];
    }
  }

  async findProspects(searchCriteria) {
    try {
      const params = new URLSearchParams();
      if (searchCriteria.jobTitles) searchCriteria.jobTitles.forEach(t => params.append('person_titles[]', t));
      if (searchCriteria.locations && searchCriteria.locations.length > 0) {
        searchCriteria.locations.forEach(l => params.append('person_locations[]', l.toLowerCase()));
      } else { params.append('person_locations[]', 'united states'); }
      if (searchCriteria.companySizes && searchCriteria.companySizes.length > 0) {
        searchCriteria.companySizes.forEach(s => params.append('organization_num_employees_ranges[]', s));
      } else { ['1,10', '11,50', '51,200', '201,500'].forEach(s => params.append('organization_num_employees_ranges[]', s)); }
      if (searchCriteria.seniorityLevel) { params.append('person_seniority_levels[]', searchCriteria.seniorityLevel); }

      params.append('page', searchCriteria.page || 1);
      params.append('per_page', searchCriteria.limit || 25);
      
      const url = `${this.baseURL}/mixed_people/search?${params.toString()}`;
      console.log(`🔍 Apollo URL: ${url}`);
      
      const response = await axios.post(url, {}, {
        headers: { 'x-api-key': this.apiKey, 'Accept': 'application/json', 'Content-Type': 'application/json' }
      });
      console.log(`🎯 Found ${response.data.people?.length || 0} prospects`);
      return response.data.people || [];
    } catch (error) {
      console.error('❌ Apollo Prospect Search Error:', error.response?.data || error.message);
      return [];
    }
  }

  async findCompanies(searchCriteria) {
    try {
      const requestBody = {
        page: searchCriteria.page || 1,
        per_page: searchCriteria.limit || 10
      };
      // Locations - simplified format
      if (searchCriteria.locations && searchCriteria.locations.length > 0) {
        requestBody.organization_locations = searchCriteria.locations.map(loc => loc.toLowerCase());
      }
      // Industries - optional
      if (searchCriteria.industries && searchCriteria.industries.length > 0) {
        requestBody.organization_industries = searchCriteria.industries;
      }
      // Company sizes - always include defaults - UPDATED
      if (searchCriteria.companySizes && searchCriteria.companySizes.length > 0) {
        requestBody.organization_num_employees_ranges = searchCriteria.companySizes;
      } else {
        requestBody.organization_num_employees_ranges = ['1,10', '11,50', '51,200', '201,500'];
      }
      console.log('🔍 Company search request:', JSON.stringify(requestBody, null, 2));
      const response = await axios.post(`${this.baseURL}/organizations/search`, requestBody, {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        }
      });
      const companies = response.data.organizations || [];
      console.log(`🏢 Found ${companies.length} companies`);
      if (companies.length > 0) {
        console.log(`📋 Sample company: ${companies[0].name} - ${companies[0].industry}`);
      }
      return companies;
    } catch (error) {
      console.error('❌ Apollo Company Search Error:', error.response?.data || error.message);
      return [];
    }
  }

  async findAllProspects(searchCriteria) {
    console.log('🎯 Starting progressive prospect search...');
    let allProspects = [];
    try {
      if (searchCriteria.targetCompany) {
        console.log(`🏢 Company-specific search: ${searchCriteria.targetCompany}`);
        const companyProspects = await this.findProspectsAtCompany(
          searchCriteria.targetCompany, searchCriteria.jobTitles,
          { seniorityLevel: searchCriteria.seniorityLevel, limit: searchCriteria.limit }
        );
        if (companyProspects.length > 0) return companyProspects;
      }
      console.log('\n📋 Strategy 1: Broad Search (Job Title + Location only)');
      const broadCriteria = {
        jobTitles: searchCriteria.jobTitles, locations: searchCriteria.locations,
        companySizes: searchCriteria.companySizes || ['1,10', '11,50', '51,200', '201,500'],
        page: searchCriteria.page, limit: searchCriteria.limit
      };
      const broadProspects = await this.findProspects(broadCriteria);
      if (broadProspects.length > 0) {
        allProspects.push(...broadProspects);
        console.log(`✅ Broad search: ${broadProspects.length} prospects`);
        return this.removeDuplicates(allProspects);
      }
      console.log('\n📋 Strategy 2: Very Broad Search (Job Title only)');
      const veryBroadCriteria = {
        jobTitles: searchCriteria.jobTitles,
        companySizes: ['1,10', '11,50', '51,200', '201,500', '501,1000'],
        page: searchCriteria.page, limit: searchCriteria.limit
      };
      const veryBroadProspects = await this.findProspects(veryBroadCriteria);
      if (veryBroadProspects.length > 0) {
        allProspects.push(...veryBroadProspects);
        console.log(`✅ Very broad search: ${veryBroadProspects.length} prospects`);
      }
      if (allProspects.length === 0) {
        console.log('\n📋 Strategy 3: Company Search');
        const companies = await this.findCompanies(searchCriteria);
        if (companies.length > 0) {
          const companyProspects = await this.getProspectsFromCompanies(companies, {
            jobTitles: searchCriteria.jobTitles, maxCompanies: 3, perCompanyLimit: 5
          });
          allProspects.push(...companyProspects);
        }
      }
      const uniqueProspects = this.removeDuplicates(allProspects);
      console.log(`\n🎉 Total unique prospects found: ${uniqueProspects.length}`);
      return uniqueProspects;
    } catch (error) {
      console.error('❌ Progressive search error:', error);
      return allProspects;
    }
  }

  async getProspectsFromCompanies(companies, prospectCriteria = {}) {
    const allProspects = [];
    for (const company of companies.slice(0, prospectCriteria.maxCompanies || 3)) {
      try {
        const params = new URLSearchParams();
        if (company.primary_domain) {
          params.append('organization_domains[]', company.primary_domain);
        } else if (company.name) {
          params.append('organization_names[]', company.name);
        }
        if (prospectCriteria.jobTitles && prospectCriteria.jobTitles.length > 0) {
          prospectCriteria.jobTitles.forEach(title => {
            params.append('person_titles[]', title);
          });
        }
        params.append('per_page', prospectCriteria.perCompanyLimit || '5');
        const url = `${this.baseURL}/mixed_people/search?${params.toString()}`;
        console.log(`🔍 Searching prospects at ${company.name}`);
        const response = await axios.post(url, {}, {
          headers: {
            'x-api-key': this.apiKey,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          }
        });
        const prospects = response.data.people || [];
        allProspects.push(...prospects);
        console.log(`👥 Found ${prospects.length} prospects at ${company.name}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Error searching ${company.name}:`, error.response?.data || error.message);
        continue;
      }
    }
    return allProspects;
  }

  removeDuplicates(prospects) {
    const uniqueProspects = [];
    const seenIdentifiers = new Set();
    for (const prospect of prospects) {
      const identifier = [
        prospect.first_name || '',
        prospect.last_name || '',
        prospect.email || 'no-email',
        prospect.organization?.name || 'no-company'
      ].join('|').toLowerCase();
      if (!seenIdentifiers.has(identifier)) {
        seenIdentifiers.add(identifier);
        uniqueProspects.push(prospect);
      }
    }
    return uniqueProspects;
  }

  async ultraSimpleTest() {
    try {
      console.log('🔧 Running ultra-simple test...');
      const params = new URLSearchParams();
      params.append('person_titles[]', 'manager');
      params.append('person_locations[]', 'united states');
      params.append('organization_num_employees_ranges[]', '51,200');
      params.append('per_page', '5');
      const url = `${this.baseURL}/mixed_people/search?${params.toString()}`;
      console.log(`🔍 Test URL: ${url}`);
      const response = await axios.post(url, {}, {
        headers: {
          'x-api-key': this.apiKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      });
      console.log(`✅ Ultra-simple test: ${response.data.people?.length || 0} prospects`);
      if (response.data.people && response.data.people.length > 0) {
        const sample = response.data.people[0];
        console.log(`📋 Sample: ${sample.first_name} ${sample.last_name} - ${sample.title}`);
        console.log(`📍 Location: ${sample.city}, ${sample.state}`);
        console.log(`🏢 Company: ${sample.organization?.name}`);
      }
      return response.data.people || [];
    } catch (error) {
      console.error('❌ Ultra-simple test error:', error.response?.data || error.message);
      return [];
    }
  }

   async searchAndEnrichAndAssign(inputString, options = {}) {
    try {
      console.log('✨ Starting search, enrichment, and assignment flow...');
    
      const searchResult = await this.searchProspectsFromString(inputString, {
        limit: options.limit,
        page: options.page,
        maxCompanies: options.maxCompanies
      });
    
      let prospectsFromApolloSearch = searchResult.prospects;
      let dbResult = null;
      let expandiResult = null;
      let enrichedApolloProspects = [];
    
      if (prospectsFromApolloSearch && prospectsFromApolloSearch.length > 0) {
        console.log(`Found ${prospectsFromApolloSearch.length} prospects. Proceeding to processing...`);
      
        // ✅ STEP 1: Run enrichment if enabled
        if (options.revealPersonalEmails || options.revealPhoneNumber) {
          console.log('🔍 Enrichment enabled - running Apollo enrichment...');
          enrichedApolloProspects = await this.apolloEnrichmentService.bulkEnrichPeople(
            prospectsFromApolloSearch, 
            options.revealPersonalEmails || false,
            options.revealPhoneNumber || false,
            options.webhookUrl || null
          );
        } else {
          console.log('⏩ Enrichment disabled - skipping Apollo enrichment');
          enrichedApolloProspects = [];
        }
      
        // ✅ STEP 2: Map enrichment data
        const enrichedMap = new Map();
        if (enrichedApolloProspects.length > 0) {
          enrichedApolloProspects.forEach(ep => {
            if (ep.id) enrichedMap.set(ep.id, ep);
          });
        }
      
        // ✅ STEP 3: Always assign emails (real or dummy) to ALL prospects
        const prospectsToSaveToDatabase = prospectsFromApolloSearch.map(originalProspect => {
          const enrichedData = enrichedMap.get(originalProspect.id);
          let finalEmail = null;
        
          // First, try to use enriched email if it's valid
          if (enrichedData && enrichedData.email && 
              enrichedData.email !== 'email_not_unlocked@domain.com' &&
              enrichedData.email !== '' && 
              enrichedData.email !== null) {
            finalEmail = enrichedData.email;
            console.log(`✅ Using enriched email for ${originalProspect.first_name} ${originalProspect.last_name}: ${finalEmail}`);
          }
        
          // If no valid enriched email, create dummy email
          if (!finalEmail) {
            const firstName = (originalProspect.first_name || 'First').replace(/\s+/g, '').replace(/[^a-zA-Z]/g, '');
            const lastName = (originalProspect.last_name || 'Last').replace(/\s+/g, '').replace(/[^a-zA-Z]/g, '');
            finalEmail = `dummy${firstName}${lastName}@gmail.com`.toLowerCase();
            
            console.log(`📧 Assigning dummy email for ${originalProspect.first_name} ${originalProspect.last_name}: ${finalEmail}`);
          }
        
          return { 
            ...originalProspect, 
            email: finalEmail,
            phone_number: enrichedData?.phone_number || originalProspect.phone_number 
          };
        });
      
        // Continue with rest of your existing logic...
        if (options.saveToDatabase !== false) {
          const saveOptions = {
            assignToExpandi: options.assignToExpandi || false,
            campaignInstanceId: options.campaignInstanceId,
            customFields: options.customFields || {}
          };
          dbResult = await this.saveProspectsToDatabase(prospectsToSaveToDatabase, saveOptions);
          expandiResult = dbResult?.expandiResult;
        
          if (options.assignToHubSpot && dbResult.savedProspectsForCrm && dbResult.savedProspectsForCrm.length > 0) {
            console.log(`🏢 HubSpot: Syncing ${dbResult.savedProspectsForCrm.length} prospects to HubSpot...`);
            for (const prospect of dbResult.savedProspectsForCrm) {
              await this.hubspotService.upsertProspect(prospect, options);
            }
            console.log('✅ HubSpot sync complete.');
          }
        }
      }
    
      return {
        originalInput: inputString,
        parsedCriteria: searchResult.parsedCriteria,
        prospects: prospectsFromApolloSearch,
        enrichedCount: enrichedApolloProspects.length,
        databaseResult: dbResult,
        expandiResult: expandiResult
      };
    
    } catch (error) {
      console.error('❌ Error in search, enrich, and assign flow:', error);
      return { success: false, error: error.message, originalInput: inputString, prospects: [], enrichedCount: 0 };
    }
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }
}

module.exports = ApolloService;
