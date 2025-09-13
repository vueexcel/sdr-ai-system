const { chromium } = require('playwright');
const DatabaseService = require('../database/database');
const OpenAI = require('openai');

class LinkedInAutomationService {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async initialize(headless = true) {
    try {
      this.browser = await chromium.launch({
        headless: headless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ]
      });

      const context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'en-US'
      });

      this.page = await context.newPage();
      
      console.log('✅ Enhanced LinkedIn automation service initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize:', error.message);
      throw error;
    }
  }

  async login(email, password) {
    try {
      await this.page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle' });
      
      await this.page.fill('#username', email);
      await this.randomWait(1000, 2000);
      
      await this.page.fill('#password', password);
      await this.randomWait(1000, 2000);
      
      await this.page.click('button[type="submit"]');
      await this.page.waitForURL('**/feed/**', { timeout: 30000 });
      
      this.isLoggedIn = true;
      console.log('✅ Successfully logged into LinkedIn');
      
      return true;
    } catch (error) {
      console.error('❌ LinkedIn login failed:', error.message);
      throw error;
    }
  }

  // View profile with enhanced error handling
  async viewProfile(linkedinUrl, prospect) {
    try {
      console.log(`👀 Viewing profile: ${linkedinUrl}`);
      
      await this.page.goto(linkedinUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      
      await this.randomWait(2000, 4000);
      
      // Human-like scrolling behavior
      await this.humanLikeScroll();
      
      const profileData = await this.extractProfileInfo();
      console.log(`   ✅ Viewed ${prospect.firstName}'s profile`);
      
      return profileData;
    } catch (error) {
      console.error(`❌ Profile viewing failed (${prospect.firstName}):`, error.message);
      return null;
    }
  }

  // Enhanced recent posts fetching
  async getRecentPosts(linkedinUrl, maxPosts = 3) {
    try {
      console.log(`📝 Fetching recent posts from: ${linkedinUrl}`);
      
      const activityUrl = linkedinUrl.replace(/\/$/, '') + '/recent-activity/all/';
      console.log(`   🌐 Opening recent activity page: ${activityUrl}`);
      
      await this.page.goto(activityUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      
      await this.randomWait(2000, 4000);
      
      const posts = await this.page.evaluate((maxPosts) => {
        try {
          const postElements = document.querySelectorAll('[data-activity-urn*="urn:li:activity"]');
          const posts = [];
          
          for (let i = 0; i < Math.min(postElements.length, maxPosts); i++) {
            const postElement = postElements[i];
            const postLink = postElement.querySelector('a[href*="/posts/"]');
            const contentElement = postElement.querySelector('.feed-shared-text');
            
            if (postLink) {
              posts.push({
                url: postLink.href,
                content: contentElement ? contentElement.textContent.trim().substring(0, 500) : '',
                timestamp: Date.now() - (i * 24 * 60 * 60 * 1000)
              });
            }
          }
          
          return posts;
        } catch (e) {
          return [];
        }
      }, maxPosts);
      
      console.log(`   ✅ Found ${posts.length} recent posts`);
      return posts.filter(post => post.content && post.content.length > 20);
      
    } catch (error) {
      console.error('❌ Failed to get recent posts:', error.message);
      return [];
    }
  }

  // AI-powered comment generation
  async generateAIComment(postContent, prospect) {
    try {
      if (!process.env.OPENAI_API_KEY) {
        console.log('⚠️ OpenAI API key not found, using template comment');
        return this.getTemplateComment(postContent, prospect);
      }

      const prompt = `Generate a professional LinkedIn comment for this post:

Post Content: "${postContent}"

Prospect Details:
- Name: ${prospect.firstName} ${prospect.lastName}
- Title: ${prospect.title || 'Professional'}
- Company: ${prospect.company || 'their company'}
- Industry: ${prospect.industry || 'their industry'}

Requirements:
- Keep it under 100 characters
- Be authentic and engaging
- Reference the post content specifically
- Sound natural and professional
- Don't be salesy or promotional
- Add value to the conversation
- Use a conversational tone

Generate only the comment text, nothing else.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 0.7
      });

      const comment = response.choices[0].message.content.trim();
      console.log(`   🤖 AI Generated comment: "${comment.substring(0, 50)}..."`);
      
      return comment;
      
    } catch (error) {
      console.error('❌ AI comment generation failed:', error.message);
      return this.getTemplateComment(postContent, prospect);
    }
  }

  // Template comments fallback
  getTemplateComment(postContent, prospect) {
    const templates = [
      `Great insights, ${prospect.firstName}! This really resonates with current trends.`,
      `Excellent point about this topic. Thanks for sharing your perspective!`,
      `This is valuable content. Appreciate you bringing this to light.`,
      `Well said! This definitely adds value to the conversation.`,
      `Interesting perspective on this. Would love to hear more of your thoughts.`
    ];
    
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
    console.log(`   📝 Template comment: "${randomTemplate}"`);
    return randomTemplate;
  }

  // Enhanced post liking
  async likePost(postUrl) {
    try {
      console.log(`   👍 Attempting to like post: ${postUrl}`);
      
      await this.page.goto(postUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });
      await this.randomWait(3000, 5000);
      
      // Scroll to ensure post content is visible
      await this.page.evaluate(() => {
        window.scrollBy(0, 400);
      });
      await this.randomWait(1500, 2500);
      
      // ✅ ENHANCED: Multiple like button selectors based on your LinkedIn button structure
      const likeSelectors = [
        // Your specific button structure with react-button classes
        'button[class*="react-button__trigger"]:has-text("Like")',
        'button[class*="react-button"][aria-label*="Like"]',
        'button[class*="react-button"]:has([data-test-reactions-icon-type="LIKE"])',
        
        // Check for already liked state (aria-pressed="true")
        'button[aria-pressed="false"][aria-label*="Like"]',
        'button[aria-pressed="true"][aria-label*="Unreact Like"]',
        
        // Generic LinkedIn like selectors
        'button[aria-label*="Like"]',
        'button[data-control-name*="like"]',
        '.social-actions-button[aria-label*="Like"]',
        'button:has-text("Like")',
        
        // Artdeco button variations
        'button.artdeco-button:has-text("Like")',
        'button.artdeco-button[aria-label*="Like"]',
        
        // Social action buttons
        '.social-actions-button[data-control-name*="like"]',
        'button[class*="social-actions-button"]:has-text("Like")'
      ];
      
      let likeButtonFound = false;
      let alreadyLiked = false;
      
      console.log(`   🔍 Searching for like button with ${likeSelectors.length} selectors...`);
      
      for (let i = 0; i < likeSelectors.length; i++) {
        const selector = likeSelectors[i];
        try {
          console.log(`   🎯 Trying selector ${i + 1}: ${selector.substring(0, 50)}...`);
          
          const likeButton = await this.page.$(selector);
          if (likeButton) {
            console.log(`   ✅ Found like button with selector: ${selector}`);
            
            // ✅ ENHANCED: Check if already liked using multiple methods
            const buttonInfo = await this.page.evaluate(button => {
              return {
                ariaPressed: button.getAttribute('aria-pressed'),
                ariaLabel: button.getAttribute('aria-label'),
                className: button.className,
                textContent: button.textContent?.trim(),
                hasActiveClass: button.classList.contains('active') || 
                              button.classList.contains('react-button--active') ||
                              button.classList.contains('liked') ||
                              button.classList.contains('social-action-button--active'),
                dataTestReaction: button.querySelector('[data-test-reactions-icon-type]')?.getAttribute('data-test-reactions-icon-type')
              };
            }, likeButton);
            
            console.log(`   🔍 Button details:`, {
              ariaPressed: buttonInfo.ariaPressed,
              ariaLabel: buttonInfo.ariaLabel?.substring(0, 30),
              hasActiveClass: buttonInfo.hasActiveClass,
              textContent: buttonInfo.textContent?.substring(0, 20)
            });
            
            // ✅ IMPROVED: Multiple ways to detect if already liked
            alreadyLiked = buttonInfo.ariaPressed === 'true' || 
                         buttonInfo.ariaLabel?.includes('Unreact') ||
                         buttonInfo.ariaLabel?.includes('Unlike') ||
                         buttonInfo.hasActiveClass ||
                         buttonInfo.textContent?.includes('Liked');
            
            if (alreadyLiked) {
              console.log('   ✅ Post already liked (detected via multiple checks)');
              return true;
            }
            
            // ✅ ENHANCED: Try multiple clicking strategies
            try {
              console.log('   🖱️ Attempting to click like button...');
              
              // Strategy 1: Wait for button to be clickable and use regular click
              await this.page.waitForSelector(selector, { state: 'visible', timeout: 3000 });
              await likeButton.click();
              likeButtonFound = true;
              console.log('   👍 Successfully clicked like button (regular click)');
              
            } catch (regularClickError) {
              try {
                // Strategy 2: Force click in case of overlay issues
                await likeButton.click({ force: true });
                likeButtonFound = true;
                console.log('   👍 Successfully clicked like button (force click)');
                
              } catch (forceClickError) {
                try {
                  // Strategy 3: JavaScript click as last resort
                  await this.page.evaluate(btn => btn.click(), likeButton);
                  likeButtonFound = true;
                  console.log('   👍 Successfully clicked like button (JavaScript click)');
                  
                } catch (jsClickError) {
                  console.log(`   ❌ All click methods failed: ${jsClickError.message}`);
                  continue; // Try next selector
                }
              }
            }
            
            // If we successfully clicked, break out of the loop
            if (likeButtonFound) {
              break;
            }
          }
        } catch (selectorError) {
          // Continue to next selector if current one fails
          continue;
        }
      }
      
      if (likeButtonFound) {
        // Wait a bit after clicking
        await this.randomWait(2000, 4000);
        
        // ✅ ENHANCED: Verify the like action was successful
        console.log('   🔍 Verifying like action...');
        
        const verificationResult = await this.page.evaluate(() => {
          // Check for various indicators that the post is now liked
          const indicators = [
            // Check for aria-pressed="true"
            document.querySelector('button[aria-pressed="true"][aria-label*="Unreact"]'),
            // Check for active classes
            document.querySelector('button[class*="react-button--active"]'),
            document.querySelector('button[class*="social-action-button--active"]'),
            // Check for "Unreact Like" text
            document.querySelector('button[aria-label*="Unreact Like"]')
          ];
          
          return indicators.some(indicator => indicator !== null);
        });
        
        if (verificationResult) {
          console.log('   ✅ Like action verified - post successfully liked!');
          return true;
        } else {
          console.log('   ⚠️ Like action verification unclear - button clicked but state unclear');
          return true; // Still return true since we clicked the button
        }
      }
      
      if (alreadyLiked) {
        console.log('   ✅ Post was already liked');
        return true; // Already liked is considered success
      }
      
      // ✅ ENHANCED: Debug information when no like button found
      console.log('   ❌ No like button found with any selector');
      
      // Debug: Show available buttons for troubleshooting
      const availableButtons = await this.page.$$eval('button', buttons => 
        buttons.map(btn => ({
          text: btn.textContent?.trim()?.substring(0, 20),
          ariaLabel: btn.getAttribute('aria-label')?.substring(0, 40),
          className: btn.className?.substring(0, 40),
          hasReactClass: btn.className?.includes('react-button'),
          hasLikeText: btn.textContent?.toLowerCase().includes('like'),
          hasLikeAriaLabel: btn.getAttribute('aria-label')?.toLowerCase().includes('like')
        })).filter(btn => 
          btn.hasLikeText || btn.hasLikeAriaLabel || btn.hasReactClass
        ).slice(0, 5)
      );
      
      if (availableButtons.length > 0) {
        console.log('   📋 Available like-related buttons found:');
        availableButtons.forEach((btn, index) => {
          console.log(`      ${index + 1}. Text: "${btn.text}" | AriaLabel: "${btn.ariaLabel}" | Class: "${btn.className}"`);
        });
      } else {
        console.log('   📋 No like-related buttons found on page');
      }
      
      return false;
      
    } catch (error) {
      console.error('❌ Failed to like post:', error.message);
      return false;
    }
  }

  // Enhanced comment posting
  async commentOnPost(postUrl, commentText) {
    try {
      await this.page.goto(postUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });
      await this.randomWait(3000, 5000);
      
      const commentButtonSelectors = [
        'button[aria-label*="Comment"]',
        'button[data-control-name*="comment"]',
        '.social-actions-button:has-text("Comment")'
      ];
      
      let commentOpened = false;
      for (const selector of commentButtonSelectors) {
        try {
          const commentButton = await this.page.$(selector);
          if (commentButton) {
            await commentButton.click();
            commentOpened = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!commentOpened) {
        console.log('   ⚠️ Could not open comment box');
        return false;
      }
      
      await this.randomWait(2000, 4000);
      
      const editorSelectors = [
        '[role="textbox"]',
        '.ql-editor',
        'div[contenteditable="true"]'
      ];
      
      let commentPosted = false;
      for (const selector of editorSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 5000 });
          await this.page.focus(selector);
          
          await this.typeWithHumanDelay(commentText);
          
          const submitSelectors = [
            'button:has-text("Post")',
            'button[data-control-name*="comment.post"]',
            'button:has-text("Comment")'
          ];
          
          for (const submitSelector of submitSelectors) {
            const submitButton = await this.page.$(submitSelector);
            if (submitButton) {
              await this.randomWait(1000, 2000);
              await submitButton.click();
              commentPosted = true;
              break;
            }
          }
          
          if (commentPosted) break;
          
        } catch (e) {
          continue;
        }
      }
      
      if (commentPosted) {
        console.log(`   💬 Comment posted: "${commentText.substring(0, 30)}..."`);
        await this.randomWait(3000, 6000);
        return true;
      } else {
        console.log('   ⚠️ Could not post comment');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Failed to comment on post:', error.message);
      return false;
    }
  }

  // ✅ ENHANCED: Connect or Follow request with comprehensive logic
  async sendConnectionOrFollowRequest(linkedinUrl, personalMessage = '') {
    try {
      console.log(`🎯 Processing profile: ${linkedinUrl}`);
      
      await this.page.goto(linkedinUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });
      
      await this.randomWait(2000, 4000);
      
      // STEP 1: Check for Connect button first (highest priority)
      const connectSelectors = [
        'button[aria-label*="Invite"][aria-label*="connect"]',
        'button[aria-label*="Invite"]',
        'button:has-text("Connect")',
        'button.artdeco-button:has-text("Connect")'
      ];
      
      console.log(`   🔍 Looking for Connect button...`);
      for (const selector of connectSelectors) {
        const connectButton = await this.page.$(selector);
        if (connectButton) {
          console.log(`   ✅ Found Connect button - sending connection request`);
          await connectButton.click();
          await this.handleConnectionDialog(personalMessage);
          return 'connection_sent';
        }
      }
      
      // STEP 2: If no Connect button, check for Follow/Unfollow
      console.log(`   🔍 No Connect button found, checking Follow status...`);
      
      // Check if already following (Unfollow button exists)
      const unfollowSelectors = [
        'button[aria-label="Unfollow"]',
        'button:has-text("Unfollow")',
        'button.follow:has-text("Unfollow")'
      ];
      
      for (const selector of unfollowSelectors) {
        const unfollowButton = await this.page.$(selector);
        if (unfollowButton) {
          console.log(`   ℹ️ Already following this prospect (Unfollow button found)`);
          return 'already_following';
        }
      }
      
      // Check for Follow button
      const followSelectors = [
        'button[aria-label="Follow"]',
        'button:has-text("Follow")',
        'button.follow:has-text("Follow")'
      ];
      
      for (const selector of followSelectors) {
        const followButton = await this.page.$(selector);
        if (followButton) {
          console.log(`   ✅ Found Follow button - following prospect`);
          await followButton.click();
          await this.randomWait(1000, 2000);
          return 'followed';
        }
      }
      
      // STEP 3: Check if already connected (Message button exists)
      const messageSelectors = [
        'button:has-text("Message")',
        'a[href*="/messaging/"]',
        'button[data-control-name="message"]'
      ];
      
      for (const selector of messageSelectors) {
        const messageButton = await this.page.$(selector);
        if (messageButton) {
          console.log(`   ℹ️ Already connected (Message button found)`);
          return 'already_connected';
        }
      }
      
      // STEP 4: No action buttons found
      console.log(`   ⚠️ No Connect, Follow, or Message buttons found`);
      
      // Debug: Show available buttons
      const availableButtons = await this.page.$$eval('button', buttons => 
        buttons.map(btn => ({
          text: btn.textContent?.trim(),
          ariaLabel: btn.getAttribute('aria-label')
        })).filter(btn => btn.text || btn.ariaLabel).slice(0, 5)
      );
      
      console.log(`   📋 Available buttons:`, availableButtons);
      return 'no_action_available';
      
    } catch (error) {
      console.error(`❌ Profile processing failed: ${error.message}`);
      return `error: ${error.message}`;
    }
  }

  // Handle connection dialog after clicking Connect
  async handleConnectionDialog(personalMessage) {
    try {
      console.log(`   📝 Looking for connection dialog...`);
      
      const dialogAppeared = await this.page.waitForSelector([
        'div[role="dialog"]',
        'button[aria-label*="Add a note"]',
        'button[aria-label*="Send invitation"]'
      ].join(', '), { timeout: 5000 });
      
      if (dialogAppeared) {
        const addNoteButton = await this.page.$('button[aria-label*="Add a note"]');
        
        if (addNoteButton && personalMessage) {
          console.log(`   📝 Adding personal message...`);
          await addNoteButton.click();
          await this.randomWait(1000, 2000);
          
          const messageBox = await this.page.waitForSelector('textarea[name="message"]', { timeout: 3000 });
          if (messageBox) {
            await messageBox.fill(personalMessage);
            await this.randomWait(1000, 2000);
          }
        }
        
        const sendButton = await this.page.$('button[aria-label*="Send invitation"], button:has-text("Send")');
        if (sendButton) {
          console.log(`   📤 Sending invitation...`);
          await sendButton.click();
          await this.randomWait(2000, 4000);
        }
      }
      
    } catch (dialogError) {
      console.log(`   ℹ️ No dialog or direct connection sent`);
    }
  }

  // ✅ ENHANCED: Complete automation workflow with all improvements
  async automateProspectEngagementWithPosts(limit = 5) {
    try {
      const prospects = await DatabaseService.searchProspects({
        hasLinkedInUrl: true,
        status: 'NEW'
      }, limit);

      console.log(`🚀 Starting enhanced engagement for ${prospects.length} prospects (limited to ${limit})`);

      let processed = 0;
      let connectionsSent = 0;
      let followed = 0;
      let alreadyConnected = 0;
      let alreadyFollowing = 0;
      let failed = 0;
      const failureReasons = [];

      for (const prospect of prospects) {
        try {
          console.log(`\n📋 Processing ${processed + 1}/${limit}: ${prospect.firstName} ${prospect.lastName}`);
          console.log(`   Company: ${prospect.company}`);
          console.log(`   LinkedIn: ${prospect.linkedinUrl}`);
          
          // Step 1: View profile
          const profileData = await this.viewProfile(prospect.linkedinUrl, prospect);
          await this.randomWait(3000, 6000);
          
          // Step 2: Get recent posts and engage
          console.log(`   📝 Fetching recent posts...`);
          const recentPosts = await this.getRecentPosts(prospect.linkedinUrl, 2);
          
          if (recentPosts.length > 0) {
            console.log(`   📝 Found ${recentPosts.length} recent posts to engage with`);
            
            for (const post of recentPosts) {
              try {
                console.log(`   🎯 Engaging with post`);
                
                const liked = await this.likePost(post.url);
                console.log(`      👍 Like result: ${liked ? 'Success' : 'Failed'}`);
                
                if (liked && post.content.length > 20) {
                  const comment = await this.generateAIComment(post.content, prospect);
                  if (comment) {
                    const commented = await this.commentOnPost(post.url, comment);
                    console.log(`      💬 Comment result: ${commented ? 'Success' : 'Failed'}`);
                  }
                }
                
                await this.randomWait(5000, 10000);
                
              } catch (postError) {
                console.error(`   ❌ Post engagement failed: ${postError.message}`);
              }
            }
          } else {
            console.log(`   ℹ️ No recent posts found for engagement`);
          }
          
          // Step 3: Handle Connect/Follow action
          await this.randomWait(5000, 10000);
          
          const personalMessage = `Hi ${prospect.firstName}, I enjoyed learning about your work at ${prospect.company}. Would love to connect!`;
          
          console.log(`   🤝 Attempting connection/follow request...`);
          const actionResult = await this.sendConnectionOrFollowRequest(
            prospect.linkedinUrl,
            personalMessage
          );
          
          // Handle different action results
          let statusUpdate = {};
          
          switch (actionResult) {
            case 'connection_sent':
              console.log(`   ✅ CONNECTION SENT: ${prospect.firstName}`);
              statusUpdate = {
                status: 'CONNECTION_SENT',
                connectionDate: new Date(),
                lastInteraction: new Date()
              };
              connectionsSent++;
              break;
              
            case 'followed':
              console.log(`   ✅ FOLLOWED: ${prospect.firstName}`);
              statusUpdate = {
                status: 'FOLLOWED',
                lastInteraction: new Date()
              };
              followed++;
              break;
              
            case 'already_connected':
              console.log(`   ℹ️ ALREADY CONNECTED: ${prospect.firstName}`);
              statusUpdate = {
                status: 'CONNECTED',
                lastInteraction: new Date(),
                linkedinConnected: true
              };
              alreadyConnected++;
              break;
              
            case 'already_following':
              console.log(`   ℹ️ ALREADY FOLLOWING: ${prospect.firstName}`);
              statusUpdate = {
                status: 'FOLLOWING',
                lastInteraction: new Date()
              };
              alreadyFollowing++;
              break;
              
            default:
              console.log(`   ❌ ACTION FAILED: ${prospect.firstName} - ${actionResult}`);
              failed++;
              failureReasons.push(`${prospect.firstName}: ${actionResult}`);
          }
          
          // Update database
          if (Object.keys(statusUpdate).length > 0) {
            await DatabaseService.updateProspectStatus(
              prospect.id,
              statusUpdate.status,
              statusUpdate
            );
          }

          processed++;
          
          if (processed >= limit) {
            console.log(`\n✅ Reached limit of ${limit} prospects`);
            break;
          }
          
          console.log(`   ⏳ Waiting before next prospect...`);
          await this.randomWait(30000, 60000);
          
        } catch (error) {
          console.error(`❌ Error processing ${prospect.firstName}:`, error.message);
          failed++;
          failureReasons.push(`${prospect.firstName}: ${error.message}`);
          processed++;
        }
      }

      // Detailed results summary
      console.log(`\n📊 Enhanced Automation Complete:`);
      console.log(`   Processed: ${processed}/${prospects.length}`);
      console.log(`   Connections Sent: ${connectionsSent}`);
      console.log(`   Followed: ${followed}`);
      console.log(`   Already Connected: ${alreadyConnected}`);
      console.log(`   Already Following: ${alreadyFollowing}`);
      console.log(`   Failed: ${failed}`);
      console.log(`   Success Rate: ${(((connectionsSent + followed + alreadyConnected + alreadyFollowing)/processed)*100).toFixed(1)}%`);
      
      if (failureReasons.length > 0) {
        console.log(`\n❌ Failure Details:`);
        failureReasons.forEach((reason, index) => {
          console.log(`   ${index + 1}. ${reason}`);
        });
      }

      return {
        processed,
        connectionsSent,
        followed,
        alreadyConnected,
        alreadyFollowing,
        failed,
        successRate: ((connectionsSent + followed + alreadyConnected + alreadyFollowing)/processed)*100,
        failureReasons
      };

    } catch (error) {
      console.error('❌ Enhanced automation failed:', error.message);
      throw error;
    }
  }

  // Utility: Human-like scrolling
  async humanLikeScroll() {
    await this.page.evaluate(() => {
      const scrollHeight = Math.floor(Math.random() * 800) + 200;
      window.scrollBy(0, scrollHeight);
    });
    await this.randomWait(1000, 3000);
    
    await this.page.evaluate(() => {
      window.scrollBy(0, -100);
    });
    await this.randomWait(500, 1500);
  }

  // Utility: Type with human-like delays
  async typeWithHumanDelay(text) {
    for (const char of text) {
      await this.page.keyboard.type(char);
      await this.randomWait(50, 150);
    }
  }

  // Extract profile information
  async extractProfileInfo() {
    try {
      const profileInfo = await this.page.evaluate(() => {
        const name = document.querySelector('h1')?.textContent?.trim();
        const title = document.querySelector('.text-body-medium')?.textContent?.trim();
        const company = document.querySelector('.pv-text-details__company')?.textContent?.trim();
        
        return { name, title, company };
      });
      
      return profileInfo;
    } catch (error) {
      return {};
    }
  }

  async randomWait(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔒 Enhanced LinkedIn automation service closed');
    }
  }
}

module.exports = LinkedInAutomationService;
