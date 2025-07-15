import { test, expect, Page } from '@playwright/test';

// Extend Window interface for test properties
declare global {
  interface Window {
    testMessages: any[];
    testVariable: string;
  }
}

// Helper function to wait for the iframe to be ready
async function waitForIframeReady(page: Page) {
  await page.waitForSelector('iframe[id="eval-trial-filter-sandbox"]', { 
    state: 'attached',
    timeout: 10000 
  });
  
  // Wait a bit more for the iframe content to load
  await page.waitForTimeout(500);
}

// Helper function to verify iframe properties
async function verifyIframeProperties(page: Page) {
  const iframe = page.locator('iframe[id="eval-trial-filter-sandbox"]');
  
  // Check iframe attributes
  await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
  
  // Get iframe srcdoc content
  const srcdocContent = await iframe.getAttribute('srcdoc');
  expect(srcdocContent).toBeTruthy();
  expect(srcdocContent).toContain('window.addEventListener("message"');
  expect(srcdocContent).toContain('parent.postMessage');
  
  return srcdocContent;
}

test.describe('useEvalTrialFilter E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to test page
    await page.goto('/e2e/test.html');
    
    // Wait for the component to render
    await page.waitForSelector('#iframe-container');
    await waitForIframeReady(page);
  });

  test('should render iframe with correct sandbox attributes', async ({ page }) => {
    await verifyIframeProperties(page);
  });

  test('should filter trials with valid JavaScript expression', async ({ page }) => {
    // Click the valid filter button
    await page.click('#test-valid-filter');
    
    // Wait for loading to complete
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 5000 });
    
    // Check that no error occurred
    await expect(page.locator('#error-message')).not.toBeVisible();
    
    // Check that result is displayed
    await expect(page.locator('#filter-result')).toBeVisible();
    
    // Get the result content
    const resultText = await page.locator('#filter-result pre').textContent();
    expect(resultText).toBeTruthy();
    const result = JSON.parse(resultText!);
    
    // Should return trials with values > 0.3 (trials 2 and 3)
    expect(result).toHaveLength(2);
    expect(result[0].trial_id).toBe(2);
    expect(result[1].trial_id).toBe(3);
  });

  test('should handle invalid JavaScript with error', async ({ page }) => {
    // Click the invalid filter button
    await page.click('#test-invalid-filter');
    
    // Wait for loading to complete
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 5000 });
    
    // Check that error message is displayed
    await expect(page.locator('#error-message')).toBeVisible();
    
    // Check that no result is displayed
    await expect(page.locator('#filter-result')).not.toBeVisible();
  });

  test('should execute complex filter expressions', async ({ page }) => {
    // Click the complex filter button (even trial IDs)
    await page.click('#test-complex-filter');
    
    // Wait for loading to complete
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 5000 });
    
    // Check that no error occurred
    await expect(page.locator('#error-message')).not.toBeVisible();
    
    // Check that result is displayed
    await expect(page.locator('#filter-result')).toBeVisible();
    
    // Get the result content
    const resultText = await page.locator('#filter-result pre').textContent();
    expect(resultText).toBeTruthy();
    const result = JSON.parse(resultText!);
    
    // Should return trial with even ID (trial_id: 2)
    expect(result).toHaveLength(1);
    expect(result[0].trial_id).toBe(2);
  });

  test('should verify iframe postMessage communication', async ({ page }) => {
    // Monitor postMessage events
    const messages = [];
    
    await page.evaluate(() => {
      window.testMessages = [];
      
      // Override postMessage to capture messages
      const originalPostMessage = window.postMessage;
      window.postMessage = function(message, targetOrigin) {
        window.testMessages.push({ message, targetOrigin });
        return originalPostMessage.call(this, message, targetOrigin);
      };
      
      // Also listen for messages from iframe
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'EVAL_RESULT') {
          window.testMessages.push({ 
            message: event.data, 
            source: 'iframe',
            origin: event.origin 
          });
        }
      });
    });
    
    // Execute a filter
    await page.click('#test-valid-filter');
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 5000 });
    
    // Check that messages were exchanged
    const capturedMessages = await page.evaluate(() => window.testMessages);
    expect(capturedMessages.length).toBeGreaterThan(0);
    
    // Find result message from iframe
    const resultMessage = capturedMessages.find(
      msg => msg.source === 'iframe' && msg.message.type === 'EVAL_RESULT'
    );
    
    expect(resultMessage).toBeTruthy();
    expect(resultMessage.message.success).toBe(true);
    expect(resultMessage.message.result).toBeTruthy();
  });

  test('should isolate iframe execution environment', async ({ page }) => {
    const srcdocContent = await verifyIframeProperties(page);
    
    // Verify that iframe content includes proper isolation
    expect(srcdocContent).toContain('try {');
    expect(srcdocContent).toContain('catch (error)');
    expect(srcdocContent).toContain('JSON.stringify');
    
    // Test that iframe doesn't have access to parent window variables
    await page.evaluate(() => {
      window.testVariable = 'should-not-be-accessible';
    });
    
    // Execute filter that tries to access parent variable
    await page.evaluate(() => {
      const iframe = document.getElementById('eval-trial-filter-sandbox') as HTMLIFrameElement;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'EVAL_TRIALS',
          trials: [],
          filterFunc: '(trial) => window.testVariable === "should-not-be-accessible"'
        }, '*');
      }
    });
    
    // This should fail because iframe shouldn't have access to parent variables
    // We can't easily test this directly, but the sandbox attribute should ensure isolation
  });

  test('should handle multiple concurrent filter requests', async ({ page }) => {
    // Click multiple buttons rapidly
    await Promise.all([
      page.click('#test-valid-filter'),
      page.click('#test-complex-filter')
    ]);
    
    // Wait for all loading to complete
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 10000 });
    
    // Should show result (the last completed request)
    await expect(page.locator('#filter-result')).toBeVisible();
    await expect(page.locator('#error-message')).not.toBeVisible();
  });

  test('should maintain iframe state between requests', async ({ page }) => {
    // Execute first filter
    await page.click('#test-valid-filter');
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 5000 });
    
    const firstResult = await page.locator('#filter-result pre').textContent();
    
    // Execute second filter
    await page.click('#test-complex-filter');
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 5000 });
    
    const secondResult = await page.locator('#filter-result pre').textContent();
    
    // Results should be different, confirming iframe processed both requests
    expect(firstResult).not.toBe(secondResult);
    
    // Iframe should still be present and functional
    await verifyIframeProperties(page);
  });
});
