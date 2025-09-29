
import { configDotenv } from 'dotenv';

configDotenv();

export const DOWNLOAD_PATH = process.env.DOWNLOAD_PATH ?? './downloads';
