import { test, expect } from '@playwright/test';

test.describe('Controlled Input Cursor Position', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for React to hydrate and the text input section to be visible
    await page.waitForSelector('h1:has-text("Text inputs")');
  });

  test('cursor position is preserved when typing in the middle of text', async ({
    page,
  }) => {
    // The input "a" has initial value "Hello world"
    const input = page.locator('input[placeholder="Value for a"]');

    // Verify initial value
    await expect(input).toHaveValue('Hello world');

    // Focus the input
    await input.focus();

    // Set cursor position to middle of text (after "Hello", position 5)
    await input.evaluate((el: HTMLInputElement) => {
      el.setSelectionRange(5, 5);
    });

    // Verify cursor is at position 5 before typing
    const cursorPosBefore = await input.evaluate(
      (el: HTMLInputElement) => el.selectionStart
    );
    expect(cursorPosBefore).toBe(5);

    // Type a single character
    await page.keyboard.type('X');

    // Wait for React to process the state update and re-render
    // The value should now be "HelloX world"
    await expect(input).toHaveValue('HelloX world');

    // Check cursor position after typing
    // EXPECTED (correct behavior): cursor should be at position 6 (after the X)
    // ACTUAL (bug): cursor jumps to end (position 12)
    const cursorPosAfter = await input.evaluate(
      (el: HTMLInputElement) => el.selectionStart
    );

    // This assertion should FAIL initially (proving the bug exists)
    // When the bug is fixed, cursor should be at position 6
    expect(cursorPosAfter).toBe(6);
  });

  test('cursor does not jump to end when typing at beginning', async ({
    page,
  }) => {
    const input = page.locator('input[placeholder="Value for a"]');

    await expect(input).toHaveValue('Hello world');
    await input.focus();

    // Position cursor at beginning (position 0)
    await input.evaluate((el: HTMLInputElement) => {
      el.setSelectionRange(0, 0);
    });

    // Type at the beginning
    await page.keyboard.type('A');

    // Value should be "AHello world"
    await expect(input).toHaveValue('AHello world');

    // Cursor should be at position 1, NOT at the end (12)
    const cursorPos = await input.evaluate(
      (el: HTMLInputElement) => el.selectionStart
    );

    // If bug exists: cursorPos will be 12 (end of string)
    // If fixed: cursorPos will be 1
    expect(cursorPos).toBe(1);
  });

  test('cursor position is preserved when typing multiple characters', async ({
    page,
  }) => {
    const input = page.locator('input[placeholder="Value for a"]');

    await expect(input).toHaveValue('Hello world');
    await input.focus();

    // Set cursor to position 5 (after "Hello")
    await input.evaluate((el: HTMLInputElement) => {
      el.setSelectionRange(5, 5);
    });

    // Type multiple characters one by one
    await page.keyboard.type('X');
    await page.keyboard.type('Y');
    await page.keyboard.type('Z');

    // Value should be "HelloXYZ world"
    await expect(input).toHaveValue('HelloXYZ world');

    // Cursor should be at position 8 (after "HelloXYZ")
    const cursorPos = await input.evaluate(
      (el: HTMLInputElement) => el.selectionStart
    );
    expect(cursorPos).toBe(8);
  });
});
