require('dotenv').config();
const DatabaseService = require('./src/database/database');

async function checkDatabase() {
  try {
    console.log('🔍 Checking database connection and data...');
    
    // Test connection and get stats
    const stats = await DatabaseService.getProspectStats();
    console.log(`✅ Database connected successfully!`);
    console.log(`📊 Total prospects in database: ${stats.totalProspects}`);
    
    if (stats.statusBreakdown.length > 0) {
      console.log('\n📈 Status breakdown:');
      stats.statusBreakdown.forEach(stat => {
        console.log(`   ${stat.status}: ${stat._count.status} prospects`);
      });
    }
    
    // Get recent prospects
    if (stats.totalProspects > 0) {
      console.log('\n👥 Recent prospects in database:');
      const recentProspects = await DatabaseService.getProspectsByStatus('NEW', 5);
      
      if (recentProspects.length > 0) {
        recentProspects.forEach((prospect, index) => {
          console.log(`${index + 1}. ${prospect.firstName} ${prospect.lastName}`);
          console.log(`   Company: ${prospect.company || 'N/A'}`);
          console.log(`   Title: ${prospect.title || 'N/A'}`);
          console.log(`   Email: ${prospect.email || 'N/A'}`);
          console.log(`   LinkedIn: ${prospect.linkedinUrl ? '✅' : '❌'}`);
          console.log(`   Status: ${prospect.status}`);
          console.log('');
        });
      } else {
        console.log('   No NEW prospects found');
      }
    } else {
      console.log('\n💡 Database is empty - no prospects stored yet');
      console.log('   This is normal if you haven\'t run the pipeline yet');
    }
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
    console.error('   Make sure your .env file has correct DATABASE_URL');
    console.error('   Run: npx prisma migrate dev');
  } finally {
    await DatabaseService.disconnect();
  }
}

checkDatabase();
