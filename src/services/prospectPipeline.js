const ApolloService = require('./apollo');
const DatabaseService = require('../database/database');

class ProspectPipeline {
  constructor() {
    this.apollo = new ApolloService();
  }

  // Universal prospect collection - works for any search criteria
  async collectProspects(searchCriteria = {}) {
    console.log('🔄 Starting prospect collection pipeline...');
    console.log('🎯 Target criteria:', JSON.stringify(searchCriteria, null, 2));
    
    try {
      // Use flexible search
      const prospects = await this.apollo.findAllProspects(searchCriteria);
      
      console.log(`📊 Apollo found ${prospects.length} total prospects`);

      if (prospects.length > 0) {
        return this.processAndStoreProspects(prospects);
      } else {
        return { 
          success: true, 
          processed: 0, 
          stored: 0, 
          message: 'No prospects found matching criteria' 
        };
      }

    } catch (error) {
      console.error('Pipeline error:', error);
      return { success: false, error: error.message };
    }
  }

  // Process and store prospects in database
  async processAndStoreProspects(prospects) {
    let stored = 0;
    let skipped = 0;
    let errors = 0;

    console.log(`\n📝 Processing ${prospects.length} prospects for database storage...`);

    for (const prospect of prospects) {
      try {
        console.log(`\n🔍 Processing: ${prospect.first_name} ${prospect.last_name}`);
        
        // Skip if no name
        if (!prospect.first_name || !prospect.last_name) {
          console.log('   ⏭️ Skipped - missing name');
          skipped++;
          continue;
        }

        // Check for duplicates by email
        if (prospect.email && prospect.email !== 'email_not_unlocked@domain.com') {
          const existing = await DatabaseService.searchProspects({
            email: prospect.email
          });

          if (existing.length > 0) {
            console.log('   ⏭️ Skipped - duplicate email');
            skipped++;
            continue;
          }
        }

        // Store in database with proper data mapping
        const storedProspect = await DatabaseService.createProspect({
          firstName: prospect.first_name.trim(),
          lastName: prospect.last_name.trim(),
          title: prospect.title?.trim() || null,
          company: (prospect.organization?.name || prospect.companyInfo?.name)?.trim() || null,
          email: prospect.email && prospect.email !== 'email_not_unlocked@domain.com' ? 
                 prospect.email.trim() : null,
          phone: prospect.phone_number?.trim() || null,
          linkedinUrl: prospect.linkedin_url?.trim() || null,
          industry: (prospect.organization?.industry || prospect.companyInfo?.industry)?.trim() || null,
          location: this.formatLocation(prospect),
          apolloContactId: prospect.id, // Store the Apollo contact ID
          status: 'NEW'
        });
        
        stored++;

        console.log('   📝 Stored:', {
          name: `${storedProspect.firstName} ${storedProspect.lastName}`,
          company: storedProspect.company,
          industry: storedProspect.industry,
          hasEmail: !!storedProspect.email,
          hasLinkedIn: !!storedProspect.linkedinUrl
        });

        console.log(`   ✅ Stored successfully with ID: ${storedProspect.id}`);

      } catch (error) {
        console.error(`   ❌ Error storing prospect:`, error.message);
        errors++;
      }
    }

    const result = {
      success: true,
      processed: prospects.length,
      stored,
      skipped,
      errors
    };

    console.log('\n📊 Pipeline Results Summary:');
    console.log(`   Total processed: ${result.processed}`);
    console.log(`   Successfully stored: ${result.stored}`);
    console.log(`   Skipped (duplicates/invalid): ${result.skipped}`);
    console.log(`   Errors: ${result.errors}`);

    return result;
  }

  // Format location from prospect data
  formatLocation(prospect) {
    const city = prospect.city?.trim() || '';
    const state = prospect.state?.trim() || '';
    const country = prospect.country?.trim() || '';
    
    const parts = [city, state, country].filter(part => part && part.length > 0);
    return parts.join(', ') || null;
  }

  // Predefined search templates for common use cases
  getSearchTemplate(templateName) {
    const templates = {
      // Legal professionals
      legalPartners: {
        jobTitles: ['Partner', 'Managing Partner', 'Senior Partner', 'Attorney', 'Lawyer'],
        industries: ['Legal Services', 'Law Practice', 'Legal'],
        companySizes: ['11,50', '51,200', '201,500'],
        locations: ['United States']
      },

      // Technology executives  
      techExecutives: {
        jobTitles: ['CEO', 'CTO', 'VP Engineering', 'Engineering Manager', 'Technical Director'],
        industries: ['Information Technology and Services', 'Computer Software', 'Internet'],
        companySizes: ['11,50', '51,200', '201,500'],
        locations: ['United States']
      },

      // Sales leaders
      salesLeaders: {
        jobTitles: ['VP Sales', 'Sales Director', 'Head of Sales', 'Sales Manager', 'Chief Revenue Officer'],
        industries: ['Software', 'Technology', 'SaaS'],
        seniorityLevel: 'senior',
        companySizes: ['51,200', '201,500', '501,1000'],
        locations: ['United States']
      },

      // Marketing executives
      marketingExecutives: {
        jobTitles: ['CMO', 'VP Marketing', 'Marketing Director', 'Head of Marketing'],
        industries: ['Marketing', 'Advertising', 'Digital Marketing'],
        companySizes: ['51,200', '201,500'],
        locations: ['United States']
      },

      // Healthcare professionals
      healthcareProfessionals: {
        jobTitles: ['Doctor', 'Physician', 'Medical Director', 'Healthcare Administrator'],
        industries: ['Healthcare', 'Medical Practice', 'Hospital'],
        companySizes: ['11,50', '51,200', '201,500'],
        locations: ['United States']
      },

      // Financial advisors
      financialAdvisors: {
        jobTitles: ['Financial Advisor', 'Wealth Manager', 'Investment Advisor', 'Portfolio Manager'],
        industries: ['Financial Services', 'Investment Management', 'Banking'],
        companySizes: ['11,50', '51,200'],
        locations: ['United States']
      },

      // Web Developers (NEW TEMPLATE)
      webDevelopers: {
        jobTitles: ['Full Stack Developer', 'Frontend Developer', 'Backend Developer', 'Software Engineer', 'Web Developer'],
        keywords: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'Python', 'HTML', 'CSS'],
        industries: ['Computer Software', 'Information Technology and Services', 'Internet'],
        companySizes: ['11,50', '51,200', '201,500'],
        locations: ['United States', 'Canada', 'United Kingdom']
      },

      // Czech Republic Developers (NEW TEMPLATE) 
      czechDevelopers: {
        jobTitles: ['Full Stack Developer', 'Software Engineer', 'Frontend Developer', 'Backend Developer', 'Web Developer'],
        keywords: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'Python'],
        industries: ['Computer Software', 'Information Technology and Services', 'Internet'],
        locations: ['Czech Republic', 'Prague', 'Czechia'],
        companySizes: ['11,50', '51,200']
      }
    };

    return templates[templateName] || null;
  }

  // Get search criteria for specific use case
  getCzechDeveloperCriteria() {
    return {
      jobTitles: [
        'Full Stack Developer',
        'Software Engineer', 
        'Full Stack Engineer',
        'Web Developer',
        'Frontend Developer',
        'Backend Developer'
      ],
      locations: ['Czech Republic', 'Prague', 'Czechia'],
      keywords: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'Python', 'Angular', 'Vue.js'],
      industries: ['Computer Software', 'Information Technology and Services', 'Internet']
    };
  }

  // Helper method for quick Czech developer search
  async findCzechDevelopers(limit = 10) {
    console.log('🔍 Quick search: Czech Republic Full Stack Developers');
    
    const criteria = this.getCzechDeveloperCriteria();
    const result = await this.collectProspects(criteria);
    
    if (result.success && result.stored > 0) {
      const prospects = await DatabaseService.getProspectsByStatus('NEW', limit);
      return {
        success: true,
        count: prospects.length,
        prospects: prospects
      };
    }
    
    return result;
  }

  // Helper method for any country developers
  async findDevelopersByCountry(country, jobTypes = ['Full Stack Developer'], limit = 10) {
    console.log(`🔍 Searching for developers in: ${country}`);
    
    const criteria = {
      jobTitles: jobTypes,
      locations: [country],
      keywords: ['JavaScript', 'React', 'Node.js', 'TypeScript'],
      industries: ['Computer Software', 'Information Technology and Services']
    };
    
    const result = await this.collectProspects(criteria);
    
    if (result.success && result.stored > 0) {
      const prospects = await DatabaseService.getProspectsByStatus('NEW', limit);
      return {
        success: true,
        count: prospects.length,
        prospects: prospects
      };
    }
    
    return result;
  }
}

module.exports = ProspectPipeline;
