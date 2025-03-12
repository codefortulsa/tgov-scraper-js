import { LaunchOptions } from "puppeteer";

// Default launch options for Puppeteer
export const launchOptions: LaunchOptions = {
  args: ["--disable-features=HttpsFirstBalancedModeAutoEnable"],
};

// Use chromium path from environment if available
if (process.env.CHROMIUM_PATH) {
  launchOptions.executablePath = process.env.CHROMIUM_PATH;
}
