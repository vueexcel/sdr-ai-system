const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const prospectRoutes = require('./routes/prospects');
const emailSequenceRoutes = require('./routes/emailSequences');
const webhookRoutes = require('./routes/webhookRoutes'); // Add this line
const DatabaseService = require('./database/database');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/prospects', prospectRoutes);
app.use('/api/email-sequences', emailSequenceRoutes);
app.use('/api/webhook', webhookRoutes); // Add webhook routes

// Serve the main frontend page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const stats = await DatabaseService.getProspectStats();
    res.json({ 
      status: 'OK', 
      message: 'AI SDR System is running',
      database: 'Connected',
      totalProspects: stats.totalProspects,
      services: {
        hubspot: process.env.HUBSPOT_ACCESS_TOKEN ? 'Configured' : 'Not configured',
        webhooks: 'Active'
      }
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// API status endpoint for webhook monitoring
app.get('/api/status', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: {
      webhook: '/api/webhook/expandi-webhook',
      health: '/health',
      prospects: '/api/prospects',
      emailSequences: '/api/email-sequences'
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler for API routes
app.use('/api/*path', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await DatabaseService.disconnect();
  process.exit(0);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 AI SDR System running on port ${PORT}`);
  console.log(`💾 Using Prisma ORM with PostgreSQL`);
  console.log(`🌐 Frontend available at http://localhost:${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/api/webhook/expandi-webhook`);
  console.log(`📊 API status: http://localhost:${PORT}/api/status`);
  
  // Log environment status
  console.log('\n📋 Environment Status:');
  console.log(`   • HubSpot: ${process.env.HUBSPOT_ACCESS_TOKEN ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`   • Database: ${process.env.DATABASE_URL ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`   • Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
