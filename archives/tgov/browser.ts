import { LaunchOptions } from "puppeteer";
import env from '../env'

export const launchOptions: LaunchOptions = {
  args: ["--disable-features=HttpsFirstBalancedModeAutoEnable"]
};

if (env.CHROMIUM_PATH) launchOptions.executablePath = env.CHROMIUM_PATH;

export default { launchOptions }
