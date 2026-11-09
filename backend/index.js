import express from 'express';
import { createHostedApp } from './src/hosted-app.js';

// Vercel uses this exported app; the local server still starts from src/server.js.
export default createHostedApp({ app: express() });
