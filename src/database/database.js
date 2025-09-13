const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class DatabaseService {
  // Prospect operations
  static async createProspect(data) {
    try {
      const prospect = await prisma.prospect.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          title: data.title,
          company: data.company,
          email: data.email,
          phone: data.phone,
          linkedinUrl: data.linkedinUrl,
          industry: data.industry,
          location: data.location,
          status: data.status || 'NEW'
        },
        include: {
          organization: true
        }
      });
      return prospect;
    } catch (error) {
      console.error('Create prospect error:', error);
      throw error;
    }
  }

  static async getProspectsByStatus(status, limit = 25) {
    try {
      const prospects = await prisma.prospect.findMany({
        where: { status },
        include: {
          organization: true
        },
        take: limit,
        orderBy: { createdAt: 'desc' }
      });
      return prospects;
    } catch (error) {
      console.error('Get prospects error:', error);
      throw error;
    }
  }

  static async updateProspectStatus(id, status, additionalData = {}) {
    try {
      const prospect = await prisma.prospect.update({
        where: { id: parseInt(id) },
        data: {
          status,
          lastInteraction: new Date(),
          updatedAt: new Date(),
          ...additionalData
        },
        include: {
          organization: true
        }
      });
      return prospect;
    } catch (error) {
      console.error('Update prospect status error:', error);
      throw error;
    }
  }

  static async addConversationMessage(prospectId, message) {
    try {
      // Get current conversation history
      const prospect = await prisma.prospect.findUnique({
        where: { id: parseInt(prospectId) },
        select: { conversationHistory: true, responseCount: true }
      });

      const currentHistory = Array.isArray(prospect.conversationHistory) 
        ? prospect.conversationHistory 
        : [];
      
      const newMessage = {
        ...message,
        timestamp: new Date().toISOString()
      };

      const updatedHistory = [...currentHistory, newMessage];
      
      // Update response count if message from prospect
      const responseIncrement = message.sender === 'prospect' ? 1 : 0;

      const updatedProspect = await prisma.prospect.update({
        where: { id: parseInt(prospectId) },
        data: {
          conversationHistory: updatedHistory,
          responseCount: prospect.responseCount + responseIncrement,
          lastInteraction: new Date()
        },
        include: {
          organization: true
        }
      });

      return updatedProspect;
    } catch (error) {
      console.error('Add conversation message error:', error);
      throw error;
    }
  }

  static async getProspectsNeedingFollowUp() {
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const prospects = await prisma.prospect.findMany({
        where: {
          status: 'MESSAGED',
          lastInteraction: {
            lt: threeDaysAgo
          }
        },
        include: {
          organization: true
        }
      });
      return prospects;
    } catch (error) {
      console.error('Get follow-up prospects error:', error);
      throw error;
    }
  }

  static async searchProspects(filters) {
    try {
      const where = {};
      
      if (filters.company) {
        where.company = {
          contains: filters.company,
          mode: 'insensitive'
        };
      }
      
      if (filters.industry) {
        where.industry = filters.industry;
      }
      
      if (filters.status) {
        where.status = filters.status;
      }
      
      if (filters.hasEmail) {
        where.email = {
          not: null
        };
      }

      const prospects = await prisma.prospect.findMany({
        where,
        include: {
          organization: true
        },
        orderBy: { createdAt: 'desc' }
      });
      
      return prospects;
    } catch (error) {
      console.error('Search prospects error:', error);
      throw error;
    }
  }

  // Organization operations
  static async createOrganization(data) {
    try {
      const organization = await prisma.organization.create({
        data: {
          name: data.name,
          domain: data.domain,
          industry: data.industry,
          employeesCount: data.employeesCount,
          location: data.location,
          linkedinUrl: data.linkedinUrl,
          websiteUrl: data.websiteUrl,
          revenue: data.revenue
        }
      });
      return organization;
    } catch (error) {
      console.error('Create organization error:', error);
      throw error;
    }
  }

  static async findOrganizationByDomain(domain) {
    try {
      const organization = await prisma.organization.findUnique({
        where: { domain },
        include: {
          prospects: true
        }
      });
      return organization;
    } catch (error) {
      console.error('Find organization error:', error);
      throw error;
    }
  }

  static async getProspectById(id) {
    try {
      const prospect = await prisma.prospect.findUnique({
        where: { id: parseInt(id) },
        include: {
          organization: true
        }
      });
      return prospect;
    } catch (error) {
      console.error('Get prospect by ID error:', error);
      throw error;
    }
  }

  // Analytics
  static async getProspectStats() {
    try {
      const stats = await prisma.prospect.groupBy({
        by: ['status'],
        _count: {
          status: true
        }
      });

      const totalProspects = await prisma.prospect.count();
      
      const responseRate = await prisma.prospect.aggregate({
        _avg: {
          responseCount: true
        },
        where: {
          responseCount: {
            gt: 0
          }
        }
      });

      return {
        totalProspects,
        statusBreakdown: stats,
        avgResponseRate: responseRate._avg.responseCount || 0
      };
    } catch (error) {
      console.error('Get prospect stats error:', error);
      throw error;
    }
  }

  // Cleanup
  static async disconnect() {
    await prisma.$disconnect();
  }

  static async getProspectsForLinkedInAutomation(status = 'NEW', limit = 10) {
  try {
    const prospects = await prisma.prospect.findMany({
      where: {
        status: status,
        linkedinUrl: {
          not: null
        }
      },
      take: limit,
      orderBy: { createdAt: 'desc' }
    });
    return prospects;
  } catch (error) {
    console.error('Get LinkedIn prospects error:', error);
    throw error;
  }
}

// Update connection status
static async updateConnectionStatus(prospectId, status, additionalData = {}) {
  try {
    const prospect = await prisma.prospect.update({
      where: { id: parseInt(prospectId) },
      data: {
        status,
        linkedinConnected: status === 'CONNECTED',
        connectionDate: status === 'CONNECTION_SENT' ? new Date() : undefined,
        lastInteraction: new Date(),
        ...additionalData
      }
    });
    return prospect;
  } catch (error) {
    console.error('Update connection status error:', error);
    throw error;
  }
}
}

module.exports = DatabaseService;
